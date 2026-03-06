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
import { calculateTokenCost, deductCredits, getUserCredits } from "./integrations/paddle";
import { registerPaddleRoutes } from "./integrations/paddle/routes";

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

function shouldForceMetallmFocus(content: string): boolean {
  const normalized = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /\b(meta\s*llm|metallm|matellm|metal\s*lm)\b/.test(normalized);
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

  // Setup Paddle Payment Routes
  registerPaddleRoutes(app);

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
        const perModelPromptReq = `You are an expert prompt engineer. A user has submitted a request that will be answered by multiple AI models simultaneously, each with a unique specialty. Your job is to write a focused version of the user's prompt for EACH model — adjusting only the APPROACH and FRAMING to match that model's specialty role.

User request: "${content}"

Models to tailor for:
${selectedModels.map((m, i) => `${i + 1}. id="${m.id}" name="${m.displayName}" specialty="${m.role}"`).join("\n")}

STRICT RULES — follow exactly:
1. NEVER change the language — always write the prompt in the SAME language as the user's original request
2. NEVER change the topic — the underlying question must remain identical to what the user asked
3. ONLY adjust the angle, depth, and framing to suit the model's specialty (e.g. ask a reasoning model to reason step-by-step, ask a coding model to focus on implementation)
4. Keep prompts concise — do NOT pad, embellish, or add unrelated content
5. Return ONLY a valid JSON array — no markdown fences, no preamble, no explanation

Format: [{"modelId":"<exact id>","prompt":"<tailored prompt>"}]`;

        let perModelPrompts: { modelId: string; displayName: string; prompt: string }[] =
          selectedModels.map((m) => ({ modelId: m.id, displayName: m.displayName, prompt: content }));

        try {
          const raw = await callModel(getMainModel(), [{ role: "user", content: perModelPromptReq }], {
            maxTokens: 2500,
            temperature: 0.3,
          });

          // Robustly extract JSON array — handles preamble text, markdown fences, etc.
          let parsed: any[] | null = null;

          // Attempt 1: JSON array inside markdown fences
          const fenceMatch = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
          if (fenceMatch) {
            try { parsed = JSON.parse(fenceMatch[1]); } catch { /* continue */ }
          }

          // Attempt 2: First [...] block in the response
          if (!parsed) {
            const bracketMatch = raw.match(/(\[[\s\S]*\])/);
            if (bracketMatch) {
              try { parsed = JSON.parse(bracketMatch[1]); } catch { /* continue */ }
            }
          }

          // Attempt 3: Strip fences and try the whole thing
          if (!parsed) {
            const jsonStr = raw.replace(/```json|```/g, "").trim();
            try { parsed = JSON.parse(jsonStr); } catch { /* continue */ }
          }

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
        // Debate mode — NO prompt enhancement, NO per-model tailoring.
        // Send the EXACT same user prompt to both debaters.
        // Custom roles from debateConfig completely override default model roles.

        // 1. Build the debater list — debateConfig (with custom role) wins.
        type DebaterEntry = typeof currentModels[number] & { customSystemPrompt?: string };
        let debateModels: DebaterEntry[];
        if (Array.isArray(debateConfig) && debateConfig.length >= 2) {
          debateModels = debateConfig.map((p: { modelId: string; customRole?: string; customSystemPrompt?: string }) => {
            const base = currentModels.find((m) => m.id === p.modelId) ?? currentModels[0];
            return {
              ...base,
              // COMPLETELY replace default role with custom role if provided
              role: p.customRole && p.customRole.trim() ? p.customRole.trim() : base.role,
              systemPrompt: p.customSystemPrompt || "",
              customSystemPrompt: p.customSystemPrompt,
            };
          });
        } else if (Array.isArray(selectedModelIds) && selectedModelIds.length >= 2) {
          debateModels = currentModels.filter((m) => (selectedModelIds as string[]).includes(m.id));
          if (debateModels.length < 2) debateModels = currentModels.slice(0, 3);
        } else {
          debateModels = currentModels.slice(0, 3);
        }

        // 2. NO enhancement — use exact user prompt as-is
        const enhancedPrompt = content;

        // 3. Same prompt for all debaters — no tailoring, no stance generation
        const perModelPrompts: { modelId: string; displayName: string; prompt: string; stance: string }[] =
          debateModels.map((m) => ({
            modelId: m.id,
            displayName: m.displayName,
            prompt: content,  // exact same user prompt
            stance: m.role,   // their assigned role IS their stance
          }));

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
        skipUserMessage,
      } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });

      // Check credit balance before processing
      const userCredits = await getUserCredits(userId);
      if (userCredits <= 0) {
        return res.status(402).json({ message: "Insufficient credits. Please purchase credits to continue.", credits: userCredits });
      }

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

      // Setup SSE first (needed regardless of skipUserMessage)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      // On retry (skipUserMessage=true) the user message already exists in DB — skip creating it
      let userMessage: Awaited<ReturnType<typeof storage.addMessage>> | null = null;
      let isFirstMessage = false;
      if (!skipUserMessage) {
        // Check message count BEFORE saving the user message (so 0 = first ever message)
        const messageCount = await storage.getMessageCount(conversationId);
        isFirstMessage = messageCount === 0;

        // Save the clean user-visible message (without extracted attachment context)
        userMessage = await storage.addMessage({
          conversationId,
          role: "user",
          content,
          modelName: null,
          metadata: {
            attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
            attachmentContext: cleanAttachmentContext,
          },
        });
        sendSSE(res, "user_message", userMessage);
      }

      // Get conversation history for context
      const history = await storage.getMessages(conversationId, 12);
      let historyForContext: HistoryMessage[];
      if (skipUserMessage) {
        // Retry: the user message is already in DB. Exclude it from context
        // since it will be appended as the final `promptToSend` to the model.
        const lastUserInHistory = [...history].reverse().find((m) => m.role === "user");
        historyForContext = (lastUserInHistory
          ? history.filter((m) => m.id !== lastUserInHistory.id)
          : history) as HistoryMessage[];
      } else {
        historyForContext = history.filter((m) => m.id !== userMessage!.id) as HistoryMessage[];
      }

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
        // Deduct credits based on token usage
        if (tokenUsage) {
          const cost = calculateTokenCost(targetModel.id, tokenUsage.promptTokens, tokenUsage.completionTokens);
          if (cost > 0) {
            const deductResult = await deductCredits(userId, cost, `Chat: ${targetModel.displayName}`, {
              modelId: targetModel.id, promptTokens: tokenUsage.promptTokens, completionTokens: tokenUsage.completionTokens, cost,
            });
            sendSSE(res, "credit_update", { cost, newBalance: deductResult.newBalance });
          }
        }
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
          // Deduct credits based on token usage
          if (multiTokenUsage) {
            const cost = calculateTokenCost(model.id, multiTokenUsage.promptTokens, multiTokenUsage.completionTokens);
            if (cost > 0) {
              const deductResult = await deductCredits(userId, cost, `Multi: ${model.displayName}`, {
                modelId: model.id, promptTokens: multiTokenUsage.promptTokens, completionTokens: multiTokenUsage.completionTokens, cost,
              });
              sendSSE(res, "credit_update", { cost, newBalance: deductResult.newBalance });
            }
          }
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
        let summaryTokenUsage: TokenUsage | undefined;
        try {
          const mainModel = getMainModel();
          const summarySystemPrompt = buildMetallmSystemPrompt(
            mainModel.systemPrompt,
            mainModel,
            "multi",
            historyForContext
          );
          const summaryResult = await callModelStream(
            mainModel,
            [{ role: "user", content: summaryPrompt }],
            (chunk) => {
              sendSSE(res, "chunk", { modelName: summaryModelName, content: chunk });
            },
            { maxTokens: 4096, systemPrompt: summarySystemPrompt }
          );
          summaryContent = summaryResult.content;
          summaryTokenUsage = summaryResult.tokenUsage;
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
          metadata: { isSummary: true, modelCount: modelResponses.length, tokenUsage: summaryTokenUsage ?? undefined },
        });

        // Deduct credits for summary generation
        if (summaryTokenUsage) {
          const mainModel = getMainModel();
          const summaryCost = calculateTokenCost(mainModel.id, summaryTokenUsage.promptTokens, summaryTokenUsage.completionTokens);
          if (summaryCost > 0) {
            const deductResult = await deductCredits(userId, summaryCost, "Multi summary", {
              modelId: mainModel.id, promptTokens: summaryTokenUsage.promptTokens, completionTokens: summaryTokenUsage.completionTokens, cost: summaryCost,
            });
            sendSSE(res, "credit_update", { cost: summaryCost, newBalance: deductResult.newBalance });
          }
        }

        sendSSE(res, "model_complete", { modelName: summaryModelName, message: summaryMessage, isSummary: true, tokenUsage: summaryTokenUsage });

        // ===========================================
        // === DEBATE MODE ===
        // ===========================================
      } else if (mode === "debate") {
        // Single round per server call — the client handles multi-round via betweenRoundState
        const serverRound = 1;

        // Build debaters with CUSTOM roles completely overriding defaults
        let debaters: (typeof currentModels[number] & { customRole?: string; customSystemPrompt?: string })[];
        if (Array.isArray(debateConfig) && debateConfig.length >= 2) {
          debaters = debateConfig.map((p: { modelId: string; customRole?: string; customSystemPrompt?: string }) => {
            const base = currentModels.find((m) => m.id === p.modelId) ?? currentModels[0];
            return {
              ...base,
              // COMPLETELY replace model's default role with user's custom role
              role: p.customRole && p.customRole.trim() ? p.customRole.trim() : base.role,
              systemPrompt: "",  // ignore default system prompt — debate has its own
              customRole: p.customRole?.trim() || undefined,
              // Preserve custom system prompt from user's debate config
              customSystemPrompt: p.customSystemPrompt?.trim() || undefined,
            };
          });
        } else if (Array.isArray(perModelPrompts) && perModelPrompts.length >= 2) {
          debaters = perModelPrompts
            .map((p: any) => {
              const base = currentModels.find((m) => m.id === p.modelId);
              if (!base) return null;
              return { ...base, role: p.stance || base.role };
            })
            .filter(Boolean) as typeof debaters;
          if (debaters.length < 2) debaters = currentModels.slice(0, 3);
        } else {
          debaters = currentModels.slice(0, 3);
        }

        // Determine round number from request body (client tracks this)
        const clientRoundNumber = typeof req.body.roundNumber === "number" ? req.body.roundNumber : 1;
        const totalRounds = typeof req.body.totalRounds === "number" ? req.body.totalRounds : 1;

        // Determine debate phase from round number and total
        function getDebatePhase(round: number, total: number): "opening" | "rebuttal" | "closing" {
          if (total <= 1) return "opening";
          if (round === 1) return "opening";
          if (round === total) return "closing";
          return "rebuttal";
        }
        const debatePhase = getDebatePhase(clientRoundNumber, totalRounds);

        // Build the opponent info string for each debater
        function getOpponentInfo(currentDebater: typeof debaters[number], allDebaters: typeof debaters): string {
          return allDebaters
            .filter(d => d.id !== currentDebater.id)
            .map(d => `"${d.displayName}" arguing as "${d.role}"`)
            .join(", ");
        }

        // Build aggressive debate system prompt — this REPLACES the default metallm system prompt
        function buildDebateSystemPrompt(
          debater: typeof debaters[number],
          allDebaters: typeof debaters,
          phase: "opening" | "rebuttal" | "closing",
          round: number,
          total: number,
        ): string {
          const opponentInfo = getOpponentInfo(debater, allDebaters);
          const roleInstruction = debater.role
            ? `You ARE "${debater.role}". This is your IDENTITY in this debate. You believe in this position with absolute conviction. Every word you say must reflect this role. FORGET any default AI assistant personality — you are ONLY "${debater.role}" now.`
            : `You are ${debater.displayName} with your own strong opinions.`;

          // Inject user-provided custom instructions for this debater (if any)
          const customInstructions = (debater as any).customSystemPrompt?.trim();
          const customInstructionsBlock = customInstructions
            ? `\n\n=== USER CUSTOM INSTRUCTIONS FOR YOUR ROLE ===\n${customInstructions}\n=== END CUSTOM INSTRUCTIONS ===`
            : "";

          const phaseInstructions: Record<string, string> = {
            opening: `THIS IS YOUR OPENING ARGUMENT (Round ${round} of ${total}).
- State your position clearly and forcefully
- Present your 2-3 strongest arguments with concrete evidence or logic
- Set the tone — be bold, provocative, and unapologetic
- Make your opponent WANT to respond
- Do NOT acknowledge the other side's potential merit — that's weakness`,

            rebuttal: `THIS IS A REBUTTAL ROUND (Round ${round} of ${total}).
- You MUST directly attack your opponent's specific arguments from the previous round
- Quote or reference their exact points and tear them apart
- Expose logical fallacies, weak evidence, and contradictions in their reasoning
- Present counter-evidence that demolishes their position
- Do NOT repeat your opening arguments — advance NEW points
- Be relentless — every sentence should be a counter-punch`,

            closing: `THIS IS YOUR CLOSING ARGUMENT (Round ${round} of ${total} — FINAL ROUND).
- Make your final, strongest case for YOUR position — leave no ambiguity
- Show how YOUR core arguments have been consistent and well-supported throughout
- Highlight the weakest points in your opponent's reasoning that were never resolved
- Deliver a compelling final statement that cements your perspective
- Be memorable — this is your last word, make it count
- Do NOT introduce brand new arguments — synthesize and conclude
- Do NOT declare yourself the winner — let the strength of your argument speak for itself`,
          };

          return `=== METALLM AGGRESSIVE DEBATE MODE ===

YOU ARE IN A COMPETITIVE DEBATE. THIS IS NOT A POLITE AI CONFERENCE. THIS IS A FIERCE, AGGRESSIVE DEBATE.

${roleInstruction}

Your opponent(s): ${opponentInfo}

DEBATE STRUCTURE:
- Total rounds: ${total}
- Current round: ${round}
- Phase: ${phase.toUpperCase()}

${phaseInstructions[phase]}

=== MANDATORY RULES (VIOLATION = PENALTY) ===

1. ROLE LOCK: You are ONLY "${debater.role}". Do NOT break character. Do NOT say "as an AI" or "I don't have opinions". You HAVE strong opinions — that's your job here.

2. NO COPYING: NEVER repeat, paraphrase, or agree with your opponent's arguments. If you find yourself agreeing, FIND A WAY TO DISAGREE. This is a debate, not a discussion.

3. SHORT & SHARP: Keep your response focused and punchy. 150-250 words MAX. No filler, no hedging, no "on the other hand". Every sentence must advance YOUR position.

4. ATTACK MODE: Directly challenge your opponent. Use their role when addressing their points. Be specific — vague disagreement is weak.

5. NO FENCE-SITTING: Do NOT say "both sides have valid points" or "it depends". Pick your side and FIGHT for it.

6. EVIDENCE & LOGIC: Back your claims with reasoning, examples, data, or analogies. Bare assertions are penalties.

7. COUNTER-PUNCHING: In rebuttal/closing rounds, you MUST reference and dismantle specific opponent arguments. Generic responses = penalty.

8. UNIQUE VOICE: Your argument style must reflect your role "${debater.role}". Bring that perspective's unique insights, not generic debate points.

PENALTIES (invisible judge is scoring):
- Repeating opponent's points: -10 points
- Breaking character: -15 points
- Being too agreeable/diplomatic: -10 points
- Going over word limit: -5 points
- Failing to address opponent's arguments (in rebuttal/closing): -20 points
- Using "as an AI" or similar disclaimers: -25 points
- Generic filler without substance: -10 points

BONUS POINTS:
- Devastating counter-argument: +15 points
- Creative analogy or example: +10 points
- Exposing opponent's logical fallacy: +20 points
- Memorable closing line: +10 points
- Using role-specific expertise effectively: +15 points

Platform: Metallm AI Aggregator — Debate Mode
You are: ${debater.displayName} (${debater.id})
Your debate role: ${debater.role}${customInstructionsBlock}

NOW ARGUE. BE FIERCE. MAKE YOUR CASE.`;
        }

        let debateContext = `Debate topic: ${promptToSend}\n\n`;

        // Collect previous messages for rebuttal context
        const previousDebateMessages = historyForContext
          .filter(m => m.role === "assistant" && m.metadata && (m.metadata as any).debateRound)
          .map(m => `[${m.modelName} — Round ${(m.metadata as any).debateRound}]: ${m.content}`)
          .join("\n\n");

        if (previousDebateMessages) {
          debateContext += `Previous rounds:\n${previousDebateMessages}\n\n`;
        }

        for (const debater of debaters) {
          const perModelEntry = Array.isArray(perModelPrompts)
            ? (perModelPrompts as any[]).find((p) => p.modelId === debater.id)
            : null;

          const stance = perModelEntry?.stance || debater.role;
          sendSSE(res, "model_start", {
            modelName: debater.displayName,
            round: clientRoundNumber,
            totalRounds,
            phase: debatePhase,
            stance,
          });

          // Build the debate-specific system prompt (completely replaces default)
          const debateSystemPrompt = buildDebateSystemPrompt(
            debater,
            debaters,
            debatePhase,
            clientRoundNumber,
            totalRounds,
          );

          // Build the user message — SAME prompt for all debaters, with debate context
          let debatePrompt: string;
          if (clientRoundNumber === 1) {
            // Opening round — use exact user prompt
            debatePrompt = `DEBATE TOPIC: ${content}\n\nDeliver your ${debatePhase} argument as "${stance}". Fight for your position.`;
          } else {
            // Subsequent rounds — include previous debate context for rebuttals
            debatePrompt = `DEBATE TOPIC: ${content}\n\nPREVIOUS ARGUMENTS:\n${debateContext}\n\nRound ${clientRoundNumber} of ${totalRounds} (${debatePhase.toUpperCase()}).\nYou are "${stance}". Respond to your opponent's arguments above. Attack their weakest points. Defend your position. WIN.`;
          }

          let fullContent = "";
          let debateTokenUsage: TokenUsage | undefined;
          try {
            const debateResult = await callModelStream(
              debater,
              [{ role: "user", content: debatePrompt }],
              (chunk) => {
                sendSSE(res, "chunk", { modelName: debater.displayName, content: chunk });
              },
              {
                systemPrompt: debateSystemPrompt,
                maxTokens: 8192,
              }
            );
            fullContent = debateResult.content;
            debateTokenUsage = debateResult.tokenUsage;
          } catch (e) {
            console.error(`${debater.displayName} debate error:`, e);
            fullContent = `[${debater.displayName}] Error in debate round.`;
            sendSSE(res, "chunk", { modelName: debater.displayName, content: fullContent });
          }

          debateContext += `\n[${debater.displayName} — ${stance} — Round ${clientRoundNumber}]: ${fullContent}\n`;

          const assistantMessage = await storage.addMessage({
            conversationId,
            role: "assistant",
            content: fullContent,
            modelName: debater.displayName,
            metadata: {
              modelId: debater.id,
              role: debater.role,
              debateRound: clientRoundNumber,
              debatePhase,
              totalRounds,
              stance,
              tokenUsage: debateTokenUsage ?? undefined,
            },
          });
          // Deduct credits based on token usage for debate
          if (debateTokenUsage) {
            const cost = calculateTokenCost(debater.id, debateTokenUsage.promptTokens, debateTokenUsage.completionTokens);
            if (cost > 0) {
              const deductResult = await deductCredits(userId, cost, `Debate: ${debater.displayName}`, {
                modelId: debater.id, promptTokens: debateTokenUsage.promptTokens, completionTokens: debateTokenUsage.completionTokens, cost,
              });
              sendSSE(res, "credit_update", { cost, newBalance: deductResult.newBalance });
            }
          }
          sendSSE(res, "model_complete", { modelName: debater.displayName, message: assistantMessage, tokenUsage: debateTokenUsage });
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
