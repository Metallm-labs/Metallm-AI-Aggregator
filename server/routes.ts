import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { readFileSync } from "fs";
import { resolve } from "path";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./integrations/auth";
import { api } from "@shared/routes";
import { sendMessageSchema } from "@shared/schema";
import { z } from "zod";
import {
  DEFAULT_MODELS,
  DEFAULT_MAIN_MODEL_ID,
  callModel,
  callModelStream,
  callGemini,
  analyzeAndRoute,
  type ModelConfig,
  type WebSource,
  type TokenUsage,
} from "./openrouter";

// In-memory model config store
let currentModels: ModelConfig[] = [...DEFAULT_MODELS];
let currentMainModelId: string = DEFAULT_MAIN_MODEL_ID;

// Helper: get main model config
function getMainModel(): ModelConfig {
  return currentModels.find(m => m.id === currentMainModelId) || currentModels[0];
}

interface UserAttachmentMeta {
  name: string;
  type: string;
  size: number;
  isImage: boolean;
  previewDataUrl?: string;
  fullDataUrl?: string;
}

type RuntimeMode = "single" | "direct" | "multi" | "debate";

interface HistoryMessage {
  id: number;
  role: string;
  content: string;
  modelName: string | null;
  metadata?: any;
}

const CONTEXT_HISTORY_LIMIT = 10;
const OTHER_MODEL_SUMMARY_LIMIT = 700;
const METALLM_DOC_PATH = resolve(process.cwd(), "metallm.md");
const METALLM_DOC_FALLBACK = `# Metallm AI Aggregator
Metallm is a multi-model AI chat platform where users can switch between single routing, direct model chat, multi-model comparison, and debate mode in one conversation.

Core behavior:
- Users can switch modes and models without creating a new chat.
- Responses from multiple models can exist in one shared conversation timeline.
- File/image attachments can appear as extracted context on user turns.
- The active model must identify itself correctly and must not impersonate other models.
`;

function loadMetallmPlatformGuide(): string {
  try {
    const raw = readFileSync(METALLM_DOC_PATH, "utf8").trim();
    return raw || METALLM_DOC_FALLBACK;
  } catch {
    return METALLM_DOC_FALLBACK;
  }
}

const METALLM_PLATFORM_GUIDE = loadMetallmPlatformGuide();

function sanitizeAttachmentContext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 80_000);
}

function sanitizeAttachments(value: unknown): UserAttachmentMeta[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const obj = item as Partial<UserAttachmentMeta> | null | undefined;
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.name !== "string" || !obj.name.trim()) return null;
      if (typeof obj.type !== "string") return null;
      if (typeof obj.size !== "number" || !Number.isFinite(obj.size) || obj.size < 0) return null;
      if (typeof obj.isImage !== "boolean") return null;
      const previewDataUrl =
        typeof obj.previewDataUrl === "string" && obj.previewDataUrl.length <= 20_000
          ? obj.previewDataUrl
          : undefined;
      const fullDataUrl =
        typeof obj.fullDataUrl === "string" && obj.fullDataUrl.length <= 6_000_000
          ? obj.fullDataUrl
          : undefined;
      return {
        name: obj.name.slice(0, 300),
        type: obj.type.slice(0, 120),
        size: Math.round(obj.size),
        isImage: obj.isImage,
        previewDataUrl,
        fullDataUrl,
      } as UserAttachmentMeta;
    })
    .filter((x): x is UserAttachmentMeta => !!x)
    .slice(0, 12);
}

function normalizeMessageContent(content: string): string {
  return content.replace(/^\[[^\]]+\]:\s*/, "").trim();
}

function getAttachmentContextFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const context = (metadata as any).attachmentContext;
  if (typeof context !== "string") return "";
  const trimmed = context.trim();
  if (!trimmed) return "";
  return `\n\n[Attached files context]\n${trimmed}`;
}

function buildContextMessagesForModel(
  history: HistoryMessage[],
  activeModelName: string
): Array<{ role: "user" | "assistant"; content: string }> {
  const contextMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of history.slice(-CONTEXT_HISTORY_LIMIT)) {
    const clean = normalizeMessageContent(message.content);
    if (!clean) continue;

    if (message.role === "user") {
      const userAttachmentContext = getAttachmentContextFromMetadata(message.metadata);
      contextMessages.push({ role: "user", content: `${clean}${userAttachmentContext}` });
      continue;
    }

    if (message.role !== "assistant") continue;

    if (message.modelName && message.modelName !== activeModelName) {
      contextMessages.push({
        role: "user",
        content:
          `[System note: A different AI model "${message.modelName}" answered earlier in this same chat. ` +
          `This is context only, not your own prior response.]\n\n` +
          `${message.modelName}'s reply: ${clean.slice(0, OTHER_MODEL_SUMMARY_LIMIT)}${clean.length > OTHER_MODEL_SUMMARY_LIMIT ? "..." : ""}`,
      });
      contextMessages.push({
        role: "assistant",
        content: "(Understood. That was another model's response in this shared chat.)",
      });
    } else {
      contextMessages.push({ role: "assistant", content: clean });
    }
  }

  return contextMessages;
}

function listPriorModelNames(history: HistoryMessage[], currentModelName: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const message of history) {
    if (message.role !== "assistant") continue;
    if (!message.modelName || message.modelName === currentModelName) continue;
    if (seen.has(message.modelName)) continue;
    seen.add(message.modelName);
    names.push(message.modelName);
  }
  return names;
}

function describeMode(mode: RuntimeMode): string {
  if (mode === "direct") return "Direct mode: user explicitly selected one model.";
  if (mode === "single") return "Smart route mode: one model is chosen to answer this turn.";
  if (mode === "multi") return "Multi mode: several models answer the same user turn.";
  return "Debate mode: multiple models argue with different stances.";
}

function buildMetallmSystemPrompt(
  basePrompt: string,
  model: Pick<ModelConfig, "id" | "displayName" | "provider" | "role">,
  mode: RuntimeMode,
  history: HistoryMessage[]
): string {
  const priorModels = listPriorModelNames(history, model.displayName);
  const priorModelText = priorModels.length > 0 ? priorModels.join(", ") : "None yet";

  return `${basePrompt}

METALLM RUNTIME CONTEXT (authoritative):
- Platform: Metallm AI Aggregator.
- Current mode: ${mode}. ${describeMode(mode)}
- You are currently: ${model.displayName} (id: ${model.id}, provider: ${model.provider}, specialty: ${model.role}).
- Other models that already responded earlier in this same conversation: ${priorModelText}.
- This is a shared multi-model conversation. Never claim to be a different model.
- If asked which model the user is talking to, answer with your exact model identity above.
- If asked what platform this is, answer: Metallm AI Aggregator.
- Treat "Metallm", "MetaLLM", "MetalLM", and close misspellings as this platform by default.
- If the user asks about platform, mode, features, models, memory, or your role/job in this chat, answer from this runtime context first.
- Do not switch to external "MetaLLM" research definitions unless the user explicitly asks about papers, publications, or external projects.

METALLM PLATFORM GUIDE:
${METALLM_PLATFORM_GUIDE}`;
}

function resolveRuntimeMode(mode: unknown, targetModelId: unknown): RuntimeMode {
  if (mode === "multi") return "multi";
  if (mode === "debate") return "debate";
  if (typeof targetModelId === "string" && targetModelId.trim()) return "direct";
  return "single";
}

function resolvePrimaryModelForRequest(targetModelId: unknown): ModelConfig {
  if (typeof targetModelId === "string" && targetModelId.trim()) {
    return currentModels.find((m) => m.id === targetModelId) || getMainModel();
  }
  return getMainModel();
}

function isMetallmHardGuardrailQuestion(content: string): boolean {
  const normalized = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const asksIdentity = /\b(who are you|what are you|your job|your role|which model|what model)\b/.test(normalized);
  const asksPlatformNow = /\b(which platform|what platform|platform you are in)\b/.test(normalized);
  const asksModeNow = /\b(which mode|what mode|mode are we in|current mode)\b/.test(normalized);
  const asksBroadProductInfo = /\b(what is metallm|what is matellm|how .* work|how metallm work|key feature|features|explain metallm|describe metallm)\b/.test(normalized);

  if (asksBroadProductInfo) return false;
  return asksIdentity || asksPlatformNow || asksModeNow;
}

function shouldForceMetallmFocus(content: string): boolean {
  const normalized = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /\b(meta\s*llm|metallm|matellm|metal\s*lm)\b/.test(normalized);
}

function buildMetallmContextAnswer(
  runtimeMode: RuntimeMode,
  model: Pick<ModelConfig, "displayName" | "id" | "role">,
  history: HistoryMessage[]
): string {
  const priorModels = listPriorModelNames(history, model.displayName);
  const priorText = priorModels.length > 0 ? priorModels.join(", ") : "None yet";
  const modeLabel =
    runtimeMode === "direct"
      ? "Direct mode (single selected model)"
      : runtimeMode === "single"
        ? "Smart Route mode"
        : runtimeMode === "multi"
          ? "Multi mode"
          : "Debate mode";

  return [
    `You are in **Metallm AI Aggregator**.`,
    ``,
    `Current mode: **${modeLabel}**.`,
    `Current active model for this reply: **${model.displayName}** (${model.id}).`,
    `Model specialty: **${model.role}**.`,
    ``,
    `Other models used earlier in this same chat: ${priorText}.`,
    ``,
    `How Metallm works (short):`,
    `- One conversation can include multiple models.`,
    `- You can switch mode/model without losing shared chat history.`,
    `- Attachments are stored in user-message metadata and can be reused as context in later turns.`,
    `- Models must identify themselves correctly and not impersonate other models.`,
    ``,
    `My job in this chat: answer as ${model.displayName} using the shared conversation context inside Metallm.`,
  ].join("\n");
}

// SSE Helper
function sendSSE(res: Response, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // =============================================
  // === Model Configuration API ===
  // =============================================

  // Get available models with their roles
  app.get("/api/models", isAuthenticated, async (_req, res) => {
    res.json({
      models: currentModels,
      mainModelId: currentMainModelId,
    });
  });

  // Update model roles/configs
  app.put("/api/models", isAuthenticated, async (req, res) => {
    try {
      const { models, mainModelId } = req.body;
      if (models && Array.isArray(models)) {
        currentModels = models;
      }
      if (mainModelId && typeof mainModelId === "string") {
        currentMainModelId = mainModelId;
      }
      res.json({ models: currentModels, mainModelId: currentMainModelId });
    } catch (err) {
      res.status(400).json({ message: "Invalid model configuration" });
    }
  });

  // =============================================
  // === Chat Conversations API ===
  // =============================================

  // List conversations
  app.get("/api/chat/conversations", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const conversations = await storage.getConversations(userId, limit, offset);
      res.json(conversations);
    } catch (err) {
      console.error("Error fetching conversations:", err);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Create new conversation
  app.post("/api/chat/conversations", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const { title } = req.body;
      const conversation = await storage.createConversation({ userId, title: title || "New Chat" });
      res.status(201).json(conversation);
    } catch (err) {
      console.error("Error creating conversation:", err);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/chat/conversations/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      await storage.deleteConversation(conversationId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting conversation:", err);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  // Get conversation with messages
  app.get("/api/chat/conversations/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);

      const conversation = await storage.getConversationWithMessages(
        conversationId,
        Math.min(Number(req.query.messageLimit) || 100, 500),
        req.query.beforeId ? Number(req.query.beforeId) : undefined
      );
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      res.json(conversation);
    } catch (err) {
      console.error("Error fetching conversation:", err);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // Delete messages after a specific message (edit functionality)
  app.delete("/api/chat/conversations/:id/messages/:messageId/after", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);
      const messageId = Number(req.params.messageId);

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      await storage.deleteMessagesAfter(conversationId, messageId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting messages:", err);
      res.status(500).json({ message: "Failed to delete messages" });
    }
  });

  // =============================================
  // === ROUTING ENDPOINT (Step 1: Analyze + Enhanced Prompt) ===
  // =============================================
  app.post("/api/chat/conversations/:id/route", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      const { content, mode, selectedModelIds, debateConfig } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Content is required" });
      }

      if (mode === "single") {
        // Analyze and route using main model
        const routing = await analyzeAndRoute(content, currentModels, getMainModel());

        res.json({
          routingType: routing.type,
          targetModel: routing.targetModel ? {
            id: routing.targetModel.id,
            displayName: routing.targetModel.displayName,
            role: routing.targetModel.role,
            provider: routing.targetModel.provider,
          } : null,
          reason: routing.reason,
          enhancedPrompt: routing.enhancedPrompt,
          originalPrompt: content,
        });
      } else if (mode === "multi") {
        // Filter to only selected models
        const selectedModels = Array.isArray(selectedModelIds) && selectedModelIds.length > 0
          ? currentModels.filter((m) => (selectedModelIds as string[]).includes(m.id))
          : currentModels;

        // Generate a tailored prompt for each model based on its role/specialty
        const perModelPromptReq = `You are an expert prompt engineer. A user has submitted a request that will be answered by multiple AI models simultaneously, each with a unique specialty. Your task is to write a tailored, optimized version of the user's prompt for EACH model, making the most of that model's specific strengths and role.

User request: "${content}"

Models to tailor for:
${selectedModels.map((m, i) => `${i + 1}. id="${m.id}" name="${m.displayName}" specialty="${m.role}"`).join("\n")}

Rules:
- Each prompt must address the SAME underlying question but be framed to play to that model's specialty
- Keep the user's intent intact
- Return ONLY a valid JSON array — no markdown fences, no explanation

Format: [{"modelId":"<exact id>","prompt":"<tailored prompt>"}]`;

        let perModelPrompts: { modelId: string; displayName: string; prompt: string }[] =
          selectedModels.map((m) => ({ modelId: m.id, displayName: m.displayName, prompt: content }));

        try {
          const raw = await callModel(getMainModel(), [{ role: "user", content: perModelPromptReq }], {
            maxTokens: 2500,
            temperature: 0.3,
          });
          const jsonStr = raw.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed)) {
            perModelPrompts = parsed.map((p: any) => {
              const m = selectedModels.find((m) => m.id === p.modelId);
              return { modelId: p.modelId, displayName: m?.displayName ?? p.modelId, prompt: String(p.prompt || content) };
            });
          }
        } catch (e) {
          console.error("Per-model prompt generation failed, using raw content:", e);
        }

        res.json({
          routingType: "multi",
          models: selectedModels.map((m) => ({
            id: m.id,
            displayName: m.displayName,
            role: m.role,
            provider: m.provider,
          })),
          enhancedPrompt: perModelPrompts[0]?.prompt ?? content,
          perModelPrompts,
          originalPrompt: content,
        });
      } else {
        // Debate mode — main model reads full debater configs and generates per-debater prompts

        // 1. Build the debater list — debateConfig (with custom role/systemPrompt) wins,
        //    then selectedModelIds, then first 3 available models.
        type DebaterEntry = typeof currentModels[number] & { customSystemPrompt?: string };
        let debateModels: DebaterEntry[];
        if (Array.isArray(debateConfig) && debateConfig.length >= 2) {
          debateModels = debateConfig.map((p: { modelId: string; customRole?: string; customSystemPrompt?: string }) => {
            const base = currentModels.find((m) => m.id === p.modelId) ?? currentModels[0];
            return {
              ...base,
              role: p.customRole || base.role,
              systemPrompt: p.customSystemPrompt || base.systemPrompt,
              customSystemPrompt: p.customSystemPrompt,
            };
          });
        } else if (Array.isArray(selectedModelIds) && selectedModelIds.length >= 2) {
          debateModels = currentModels.filter((m) => (selectedModelIds as string[]).includes(m.id));
          if (debateModels.length < 2) debateModels = currentModels.slice(0, 3);
        } else {
          debateModels = currentModels.slice(0, 3);
        }

        // 2. Rephrase user input into a complete debate topic
        let enhancedPrompt = content;
        try {
          const result = await callModel(getMainModel(), [{
            role: "user",
            content: `You are a debate facilitator. Rephrase the following user input as a clear, complete, neutral debate topic or question (1–2 sentences). Do NOT shorten, truncate, or cut it off. Return ONLY the rephrased topic — no intro, no commentary.

User input: "${content}"

Debate topic:`,
          }], { maxTokens: 200, temperature: 0.3 });
          enhancedPrompt = result.replace(/^["']+|["']+$/g, "").trim() || content;
        } catch (e) {
          console.error("Debate topic enhancement failed:", e);
        }

        // 3. Ask the main model to generate a tailored prompt for EACH debater,
        //    using their full config: role, system prompt, and personality.
        const perModelPrompts: { modelId: string; displayName: string; prompt: string; stance: string }[] =
          debateModels.map((m) => ({ modelId: m.id, displayName: m.displayName, prompt: enhancedPrompt, stance: m.role }));

        try {
          const debaterDescriptions = debateModels.map((m, i) => {
            const sysSnippet = m.systemPrompt ? m.systemPrompt.slice(0, 300) : "(no system prompt)";
            return `${i + 1}. id="${m.id}"
   name: ${m.displayName}
   role/specialty: ${m.role}
   personality (system prompt excerpt): ${sysSnippet}`;
          }).join("\n\n");

          const stanceReq = `You are a master debate facilitator and prompt engineer. A user wants to run a structured debate between multiple AI models.

Debate topic: "${enhancedPrompt}"

Debaters (with their full personality/role config):
${debaterDescriptions}

Your job:
1. Assign each debater a DISTINCT debate stance (e.g. "strongly in favour", "strongly against", "devil's advocate", "neutral analyst", "ethical critic", "pragmatist", etc.) — no two debaters may share the same stance.
2. Write a tailored opening-argument prompt FOR each debater that:
   - Tells them exactly what stance to argue
   - Frames the debate topic in a way that plays to THEIR specific role and personality (use what you know from their system prompt excerpt)
   - Is concrete, specific, and compelling — not generic
   - Is 2–4 sentences long

Return ONLY a valid JSON array — no markdown fences, no explanation.

Format: [{"modelId":"<exact id>","stance":"<stance label>","prompt":"<tailored opening prompt>"}]`;

          const raw = await callModel(getMainModel(), [{ role: "user", content: stanceReq }], {
            maxTokens: 2000,
            temperature: 0.4,
          });
          const jsonStr = raw.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed)) {
            parsed.forEach((p: any) => {
              const idx = perModelPrompts.findIndex((x) => x.modelId === p.modelId);
              if (idx !== -1) {
                perModelPrompts[idx].prompt = String(p.prompt || enhancedPrompt);
                perModelPrompts[idx].stance = String(p.stance || debateModels[idx].role);
              }
            });
          }
        } catch (e) {
          console.error("Debate per-model prompt generation failed, using defaults:", e);
        }

        res.json({
          routingType: "debate",
          enhancedPrompt,
          originalPrompt: content,
          models: debateModels.map((m) => ({ id: m.id, displayName: m.displayName, role: m.role, provider: m.provider })),
          perModelPrompts,
        });
      }
    } catch (err) {
      console.error("Routing error:", err);
      res.status(500).json({ message: "Routing analysis failed" });
    }
  });

  // =============================================
  // === SEND MESSAGE (Step 2: With approved prompt) ===
  // =============================================
  app.post("/api/chat/conversations/:id/messages", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      const {
        content,
        mode,
        enhancedPrompt,
        targetModelId,
        webSearch,
        selectedModelIds,
        debateConfig,
        perModelPrompts,
        attachmentContext,
        attachments,
      } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });

      const cleanAttachmentContext = sanitizeAttachmentContext(attachmentContext);
      const cleanAttachments = sanitizeAttachments(attachments);
      // The prompt to actually send to the model (user-approved enhanced prompt)
      const promptBase = enhancedPrompt || content;
      const promptWithAttachments = cleanAttachmentContext
        ? `${promptBase}\n\n[Attached files with extracted content]\nUse this file/photo context when answering:\n${cleanAttachmentContext}`
        : promptBase;
      const promptToSend = shouldForceMetallmFocus(content)
        ? `[IMPORTANT: The user is asking about the Metallm platform in this chat. Use the provided runtime/platform context. Do not answer about external "MetaLLM" projects unless explicitly requested.]\n\n${promptWithAttachments}`
        : promptWithAttachments;


      // Check message count BEFORE saving the user message (so 0 = first ever message)
      // Use count query instead of loading all messages — much cheaper at scale
      const messageCount = await storage.getMessageCount(conversationId);
      const isFirstMessage = messageCount === 0;

      // Save the clean user-visible message (without extracted attachment context)
      const userMessage = await storage.addMessage({
        conversationId,
        role: "user",
        content,
        modelName: null,
        metadata: {
          attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
          attachmentContext: cleanAttachmentContext,
        },
      });

      // Setup SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      sendSSE(res, "user_message", userMessage);

      // Get conversation history for context
      const history = await storage.getMessages(conversationId, 12);
      const historyForContext = history.filter((m) => m.id !== userMessage.id) as HistoryMessage[];

      // =============================================
      // === TITLE: instant — first 3-4 words of user message ===
      // =============================================
      let titlePromise: Promise<void> = Promise.resolve();
      if (isFirstMessage) {
        titlePromise = (async () => {
          try {
            const words = content.trim().split(/\s+/).slice(0, 4);
            const title = words.join(" ").replace(/[^\w\s'\-]/g, "").trim().slice(0, 60);
            if (title) {
              await storage.updateConversationTitle(conversationId, title);
              sendSSE(res, "title_update", { title });
            }
          } catch (e) {
            console.error("Title update error:", e);
          }
        })();
      }

      const runtimeMode = resolveRuntimeMode(mode, targetModelId);
      const primaryModel = resolvePrimaryModelForRequest(targetModelId);

      // Hard guardrail for platform identity questions so models don't drift to
      // external "MetaLLM" definitions or generic provider/platform answers.
      if (runtimeMode === "single" || runtimeMode === "direct") {
        if (isMetallmHardGuardrailQuestion(content)) {
          const modelName = primaryModel.displayName;
          sendSSE(res, "model_start", { modelName, role: primaryModel.role, provider: primaryModel.provider });
          const fixedAnswer = buildMetallmContextAnswer(runtimeMode, primaryModel, historyForContext);
          sendSSE(res, "chunk", { modelName, content: fixedAnswer });

          const assistantMessage = await storage.addMessage({
            conversationId,
            role: "assistant",
            content: fixedAnswer,
            modelName,
            metadata: {
              modelId: primaryModel.id,
              role: primaryModel.role,
              provider: primaryModel.provider,
              isMetallmContextAnswer: true,
              webSearch: false,
              hasAttachmentContext: !!cleanAttachmentContext,
            },
          });
          sendSSE(res, "model_complete", { modelName, message: assistantMessage });
          await titlePromise;
          sendSSE(res, "done", {});
          res.end();
          return;
        }
      }

      // ===========================================
      // === SINGLE MODE ===
      // ============================================
      if (mode === "single") {
        // Find target model
        let targetModel: ModelConfig;
        if (targetModelId) {
          targetModel = currentModels.find(m => m.id === targetModelId) || getMainModel();
        } else {
          targetModel = getMainModel();
        }

        const modelName = targetModel.displayName;
        sendSSE(res, "model_start", { modelName, role: targetModel.role, provider: targetModel.provider });

        // directMode = user explicitly picked a model; skip grounding/thinking formatting
        const isDirectMode = !!targetModelId;
        const runtimeMode: RuntimeMode = isDirectMode ? "direct" : "single";
        const contextMessages = buildContextMessagesForModel(historyForContext, modelName);
        const systemPrompt = buildMetallmSystemPrompt(
          targetModel.systemPrompt,
          targetModel,
          runtimeMode,
          historyForContext
        );

        let fullContent = "";
        let modelSources: WebSource[] = [];
        let tokenUsage: TokenUsage | undefined;
        try {
          const result = await callModelStream(
            targetModel,
            [...contextMessages, { role: "user", content: promptToSend }],
            (chunk) => {
              sendSSE(res, "chunk", { modelName, content: chunk });
            },
            {
              systemPrompt,
              maxTokens: 2048,
              webSearch: !!webSearch,
              directMode: isDirectMode,
              onStatus: (event, data) => {
                sendSSE(res, "web_search_status", { modelName, phase: event, ...data });
              },
            }
          );
          fullContent = result.content;
          modelSources = result.sources;
          tokenUsage = result.tokenUsage;
          // Stream any sources to client immediately so UI can show them
          if (modelSources.length > 0) {
            sendSSE(res, "web_sources", { modelName, sources: modelSources });
          }
        } catch (e) {
          console.error(`${modelName} error:`, e);
          fullContent = `Sorry, I encountered an error processing your request. Error: ${(e as Error).message}`;
          sendSSE(res, "chunk", { modelName, content: fullContent });
        }

        const assistantMessage = await storage.addMessage({
          conversationId,
          role: "assistant",
          content: fullContent,
          modelName,
          metadata: {
            modelId: targetModel.id,
            role: targetModel.role,
            provider: targetModel.provider,
            enhancedPrompt: enhancedPrompt && enhancedPrompt !== content ? enhancedPrompt : undefined,
            hasAttachmentContext: !!cleanAttachmentContext,
            webSearch: modelSources.length > 0,
            sources: modelSources.length > 0 ? modelSources : undefined,
            tokenUsage: tokenUsage ?? undefined,
          },
        });
        sendSSE(res, "model_complete", { modelName, message: assistantMessage, tokenUsage });

        // ===========================================
        // === MULTI MODE ===
        // ===========================================
        // ===========================================
        // === MULTI MODE ===
        // ===========================================
      } else if (mode === "multi") {
        const modelResponses: { modelName: string; content: string; role: string }[] = [];
        const modelsToRun = Array.isArray(selectedModelIds) && selectedModelIds.length > 0
          ? currentModels.filter((m) => selectedModelIds.includes(m.id))
          : currentModels;
        const promises = modelsToRun.map(async (model) => {
          sendSSE(res, "model_start", { modelName: model.displayName, role: model.role, provider: model.provider });
          const contextMessages = buildContextMessagesForModel(historyForContext, model.displayName);
          const systemPrompt = buildMetallmSystemPrompt(
            model.systemPrompt,
            model,
            "multi",
            historyForContext
          );

          // Use per-model tailored prompt if provided, else fall back to the general enhanced prompt
          const modelPrompt = Array.isArray(perModelPrompts)
            ? (perModelPrompts.find((p: any) => p.modelId === model.id)?.prompt ?? promptToSend)
            : promptToSend;

          let fullContent = "";
          let multiSources: WebSource[] = [];
          let multiTokenUsage: TokenUsage | undefined;
          try {
            const result = await callModelStream(
              model,
              [...contextMessages, { role: "user", content: modelPrompt }],
              (chunk) => {
                sendSSE(res, "chunk", { modelName: model.displayName, content: chunk });
              },
              {
                systemPrompt,
                maxTokens: 4096,
                webSearch: !!webSearch,
                onStatus: (event, data) => {
                  sendSSE(res, "web_search_status", { modelName: model.displayName, phase: event, ...data });
                },
              }
            );
            fullContent = result.content;
            multiSources = result.sources;
            multiTokenUsage = result.tokenUsage;
            if (multiSources.length > 0) {
              sendSSE(res, "web_sources", { modelName: model.displayName, sources: multiSources });
            }
          } catch (e) {
            console.error(`${model.displayName} error:`, e);
            fullContent = `[${model.displayName}] Error: ${(e as Error).message}`;
            sendSSE(res, "chunk", { modelName: model.displayName, content: fullContent });
          }

          modelResponses.push({
            modelName: model.displayName,
            content: fullContent,
            role: model.role,
          });
          const assistantMessage = await storage.addMessage({
            conversationId,
            role: "assistant",
            content: fullContent,
            modelName: model.displayName,
            metadata: {
              modelId: model.id,
              role: model.role,
              provider: model.provider,
              isMultiModelResponse: true,
              webSearch: multiSources.length > 0,
              sources: multiSources.length > 0 ? multiSources : undefined,
              tokenUsage: multiTokenUsage ?? undefined,
            },
          });
          sendSSE(res, "model_complete", { modelName: model.displayName, message: assistantMessage, tokenUsage: multiTokenUsage });
        });

        await Promise.all(promises);

        // Main model (Gemini) summarizes all responses
        const summaryModelName = "✨ Summary";
        sendSSE(res, "model_start", { modelName: summaryModelName, isSummary: true });

        const summaryPrompt = `You are MetallmAI, an advanced AI orchestrator. Multiple AI models have analyzed the following user query. Review all their responses and provide:

1. **Unified Answer**: A comprehensive, synthesized answer combining the best insights
2. **Key Insights**: Highlight the most important points from each model
3. **Conclusion**: A final, actionable conclusion

User Query: "${content}"

Model Responses:
${modelResponses.map(r => `\n--- ${r.modelName} (${r.role}) ---\n${r.content.substring(0, 1500)}`).join("\n")}

Provide a well-structured summary. Do NOT just repeat - synthesize and add value.`;

        let summaryContent = "";
        try {
          const mainModel = getMainModel();
          const summarySystemPrompt = buildMetallmSystemPrompt(
            mainModel.systemPrompt,
            mainModel,
            "multi",
            historyForContext
          );
          summaryContent = (await callModelStream(
            mainModel,
            [{ role: "user", content: summaryPrompt }],
            (chunk) => {
              sendSSE(res, "chunk", { modelName: summaryModelName, content: chunk });
            },
            { maxTokens: 4096, systemPrompt: summarySystemPrompt }
          )).content;
        } catch (e) {
          console.error("Summary error:", e);
          summaryContent = "Failed to generate summary. Please review individual model responses above.";
          sendSSE(res, "chunk", { modelName: summaryModelName, content: summaryContent });
        }

        const summaryMessage = await storage.addMessage({
          conversationId,
          role: "assistant",
          content: summaryContent,
          modelName: summaryModelName,
          metadata: { isSummary: true, modelCount: modelResponses.length },
        });
        sendSSE(res, "model_complete", { modelName: summaryModelName, message: summaryMessage, isSummary: true });

        // ===========================================
        // === DEBATE MODE ===
        // ===========================================
      } else if (mode === "debate") {
        const debateRounds = 2;
        let debaters: typeof currentModels;
        if (Array.isArray(debateConfig) && debateConfig.length >= 2) {
          debaters = debateConfig.map((p: { modelId: string; customRole: string; customSystemPrompt: string }) => {
            const base = currentModels.find((m) => m.id === p.modelId) ?? currentModels[0];
            return { ...base, role: p.customRole || base.role, systemPrompt: p.customSystemPrompt || base.systemPrompt };
          });
        } else if (Array.isArray(perModelPrompts) && perModelPrompts.length >= 2) {
          // Use models selected during routing step
          debaters = perModelPrompts
            .map((p: any) => currentModels.find((m) => m.id === p.modelId))
            .filter(Boolean) as typeof currentModels;
          if (debaters.length < 2) debaters = currentModels.slice(0, 3);
        } else {
          debaters = currentModels.slice(0, 3);
        }
        let debateContext = `Debate topic: ${promptToSend}\n\n`;

        for (let round = 0; round < debateRounds; round++) {
          for (const debater of debaters) {
            // Find the tailored per-model prompt from the routing step
            const perModelEntry = Array.isArray(perModelPrompts)
              ? (perModelPrompts as any[]).find((p) => p.modelId === debater.id)
              : null;

            const stance = perModelEntry?.stance || debater.role;
            sendSSE(res, "model_start", { modelName: debater.displayName, round: round + 1, stance });
            const contextMessages = buildContextMessagesForModel(historyForContext, debater.displayName);
            const debateSystemPrompt = buildMetallmSystemPrompt(
              debater.systemPrompt,
              debater,
              "debate",
              historyForContext
            );

            let debatePrompt: string;
            if (round === 0 && perModelEntry?.prompt) {
              // Use the tailored opening prompt from routing
              debatePrompt = perModelEntry.prompt;
            } else {
              // Subsequent rounds: react to previous arguments
              debatePrompt = `You are ${debater.displayName} in a structured debate, arguing from the perspective of "${stance}".

Debate topic: ${promptToSend}

Previous discussion:
${debateContext}

Round ${round + 1} — Respond directly to the most recent arguments above. Challenge or support specific points made by other participants using your expertise (${debater.role}). Be thorough and persuasive — fully develop your argument.`;
            }

            let fullContent = "";
            let debateTokenUsage: TokenUsage | undefined;
            try {
              const debateResult = await callModelStream(
                debater,
                [...contextMessages, { role: "user", content: debatePrompt }],
                (chunk) => {
                  sendSSE(res, "chunk", { modelName: debater.displayName, content: chunk });
                },
                { systemPrompt: debateSystemPrompt }
              );
              fullContent = debateResult.content;
              debateTokenUsage = debateResult.tokenUsage;
            } catch (e) {
              console.error(`${debater.displayName} debate error:`, e);
              fullContent = `[${debater.displayName}] Error in debate round.`;
              sendSSE(res, "chunk", { modelName: debater.displayName, content: fullContent });
            }

            debateContext += `\n[${debater.displayName} — ${stance}]: ${fullContent}\n`;

            const assistantMessage = await storage.addMessage({
              conversationId,
              role: "assistant",
              content: fullContent,
              modelName: debater.displayName,
              metadata: { modelId: debater.id, role: debater.role, debateRound: round + 1, tokenUsage: debateTokenUsage ?? undefined },
            });
            sendSSE(res, "model_complete", { modelName: debater.displayName, message: assistantMessage, tokenUsage: debateTokenUsage });
          }
        }
      }

      // Wait for parallel title generation to finish before closing SSE
      await titlePromise;

      sendSSE(res, "done", {});
      res.end();

    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      } else {
        console.error("Chat error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // =============================================
  // === Legacy Metallm API ===
  // =============================================

  app.post(api.metallm.submit.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const input = api.metallm.submit.input.parse(req.body);
      const query = await storage.createQuery({ ...input, userId });

      const mainModel = getMainModel();
      const result = await callModel(mainModel, [
        { role: "user", content: `Respond to: "${input.prompt}"` }
      ]);

      const updatedQuery = await storage.updateQuerySummary(query.id, result);
      const fullQuery = await storage.getQueryWithResponses(updatedQuery.id);
      res.status(201).json(fullQuery);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      } else {
        console.error("Processing error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.metallm.list.path, isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const userId = user.id || user.claims?.sub;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const queries = await storage.getQueries(userId, limit, offset);
    res.json(queries);
  });

  app.get(api.metallm.get.path, isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const userId = user.id || user.claims?.sub;
    const query = await storage.getQueryWithResponses(Number(req.params.id));
    if (!query) return res.status(404).json({ message: "Query not found" });
    if (query.userId !== userId) return res.status(401).json({ message: "Unauthorized" });
    res.json(query);
  });

  return httpServer;
}
