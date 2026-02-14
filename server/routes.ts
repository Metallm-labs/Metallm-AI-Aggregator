import type { Express, Response } from "express";
import { createServer, type Server } from "http";
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
} from "./openrouter";

// In-memory model config store
let currentModels: ModelConfig[] = [...DEFAULT_MODELS];
let currentMainModelId: string = DEFAULT_MAIN_MODEL_ID;

// Helper: get main model config
function getMainModel(): ModelConfig {
  return currentModels.find(m => m.id === currentMainModelId) || currentModels[0];
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
      const conversations = await storage.getConversations(userId);
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

      const conversation = await storage.getConversationWithMessages(conversationId);
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

      const { content, mode } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Content is required" });
      }

      if (mode === "single") {
        // Analyze and route using Gemini
        const routing = await analyzeAndRoute(content, currentModels);

        res.json({
          routingType: routing.type,
          targetModel: routing.targetModel ? {
            id: routing.targetModel.id,
            displayName: routing.targetModel.displayName,
            role: routing.targetModel.role,
            icon: routing.targetModel.icon,
            provider: routing.targetModel.provider,
          } : null,
          reason: routing.reason,
          enhancedPrompt: routing.enhancedPrompt,
          originalPrompt: content,
        });
      } else if (mode === "multi") {
        // For multi-mode: enhance the prompt for all models
        const enhancePrompt = `You are a prompt engineer. Improve this user prompt to be clearer, more specific, and better structured. Keep the same intent but add clarity.

User prompt: "${content}"

Return ONLY the enhanced prompt text, nothing else.`;

        let enhancedPrompt = content;
        try {
          enhancedPrompt = await callGemini("gemini-3-flash-preview", [
            { role: "user", content: enhancePrompt }
          ], { maxTokens: 300, temperature: 0.3 });
          // Clean up any quotes
          enhancedPrompt = enhancedPrompt.replace(/^["']|["']$/g, "").trim();
        } catch (e) {
          console.error("Prompt enhancement failed:", e);
        }

        res.json({
          routingType: "multi",
          models: currentModels.map(m => ({
            id: m.id,
            displayName: m.displayName,
            role: m.role,
            icon: m.icon,
            provider: m.provider,
          })),
          enhancedPrompt,
          originalPrompt: content,
        });
      } else {
        // Debate mode - just enhance
        let enhancedPrompt = content;
        try {
          const result = await callGemini("gemini-3-flash-preview", [
            { role: "user", content: `Rephrase this as a clear debate topic: "${content}". Return ONLY the topic, nothing else.` }
          ], { maxTokens: 100, temperature: 0.3 });
          enhancedPrompt = result.replace(/^["']|["']$/g, "").trim() || content;
        } catch (e) {
          console.error("Debate topic enhancement failed:", e);
        }

        res.json({
          routingType: "debate",
          enhancedPrompt,
          originalPrompt: content,
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

      const { content, mode, enhancedPrompt, targetModelId } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });

      // The prompt to actually send to the model (user-approved enhanced prompt)
      const promptToSend = enhancedPrompt || content;

      // Save user message (always save the original content the user sees)
      const userMessage = await storage.addMessage({
        conversationId,
        role: "user",
        content,
        modelName: null,
      });

      // Setup SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      sendSSE(res, "user_message", userMessage);

      // Get conversation history for context
      const history = await storage.getMessages(conversationId);
      const contextMessages = history.slice(-10).map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: `${m.modelName ? `[${m.modelName}]: ` : ""}${m.content}`
      }));

      // ===========================================
      // === SINGLE MODE ===
      // ===========================================
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

        let fullContent = "";
        try {
          fullContent = await callModelStream(
            targetModel,
            [...contextMessages, { role: "user", content: promptToSend }],
            (chunk) => {
              sendSSE(res, "chunk", { modelName, content: chunk });
            },
            {
              systemPrompt: targetModel.systemPrompt,
              maxTokens: 2048,
            }
          );
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
            enhancedPrompt: promptToSend !== content ? promptToSend : undefined,
          },
        });
        sendSSE(res, "model_complete", { modelName, message: assistantMessage });

        // ===========================================
        // === MULTI MODE ===
        // ===========================================
      } else if (mode === "multi") {
        const modelResponses: { modelName: string; content: string; role: string }[] = [];

        // Send to ALL models
        for (const model of currentModels) {
          sendSSE(res, "model_start", { modelName: model.displayName, role: model.role, provider: model.provider });

          let fullContent = "";
          try {
            fullContent = await callModelStream(
              model,
              [{ role: "user", content: promptToSend }],
              (chunk) => {
                sendSSE(res, "chunk", { modelName: model.displayName, content: chunk });
              },
              {
                systemPrompt: model.systemPrompt,
                maxTokens: 1024,
              }
            );
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
            },
          });
          sendSSE(res, "model_complete", { modelName: model.displayName, message: assistantMessage });
        }

        // Main model (Gemini) summarizes all responses
        const summaryModelName = "✨ Summary";
        sendSSE(res, "model_start", { modelName: summaryModelName, isSummary: true });

        const summaryPrompt = `You are MetallmAI, an advanced AI orchestrator. Multiple AI models have analyzed the following user query. Review all their responses and provide:

1. **Unified Answer**: A comprehensive, synthesized answer combining the best insights
2. **Key Insights**: Highlight the most important points from each model
3. **Conclusion**: A final, actionable conclusion

User Query: "${content}"

Model Responses:
${modelResponses.map(r => `\n--- ${r.modelName} (${r.role}) ---\n${r.content.substring(0, 800)}`).join("\n")}

Provide a well-structured summary. Do NOT just repeat - synthesize and add value.`;

        let summaryContent = "";
        try {
          const mainModel = getMainModel();
          summaryContent = await callModelStream(
            mainModel,
            [{ role: "user", content: summaryPrompt }],
            (chunk) => {
              sendSSE(res, "chunk", { modelName: summaryModelName, content: chunk });
            },
            { maxTokens: 2048 }
          );
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
        const debaters = currentModels.slice(0, 3);
        let debateContext = `Topic: ${promptToSend}\n\n`;

        for (let round = 0; round < debateRounds; round++) {
          for (const debater of debaters) {
            sendSSE(res, "model_start", { modelName: debater.displayName, round: round + 1 });

            const debatePrompt = `You are ${debater.displayName} (${debater.role}) in a friendly intellectual debate.
              Topic: ${promptToSend}
              Previous discussion: ${debateContext}
              Round ${round + 1}: Provide your unique perspective (2-3 paragraphs).
              ${round > 0 ? "Respond to or build upon points made by other participants." : ""}`;

            let fullContent = "";
            try {
              fullContent = await callModelStream(
                debater,
                [{ role: "user", content: debatePrompt }],
                (chunk) => {
                  sendSSE(res, "chunk", { modelName: debater.displayName, content: chunk });
                },
                { systemPrompt: debater.systemPrompt, maxTokens: 512 }
              );
            } catch (e) {
              console.error(`${debater.displayName} debate error:`, e);
              fullContent = `[${debater.displayName}] Error in debate round.`;
              sendSSE(res, "chunk", { modelName: debater.displayName, content: fullContent });
            }

            debateContext += `\n[${debater.displayName}]: ${fullContent}\n`;

            const assistantMessage = await storage.addMessage({
              conversationId,
              role: "assistant",
              content: fullContent,
              modelName: debater.displayName,
              metadata: { modelId: debater.id, role: debater.role, debateRound: round + 1 },
            });
            sendSSE(res, "model_complete", { modelName: debater.displayName, message: assistantMessage });
          }
        }
      }

      // Auto-generate title for first message
      if (history.length <= 1) {
        try {
          const title = await callGemini("gemini-3-flash-preview", [
            { role: "user", content: `Generate a very short title (3-5 words) for a conversation starting with: "${content}". Return ONLY the title.` }
          ], { maxTokens: 30, temperature: 0.3 });
          let cleanTitle = title.replace(/[".\n]/g, "").trim().slice(0, 50);
          if (cleanTitle) {
            await storage.updateConversationTitle(conversationId, cleanTitle);
            sendSSE(res, "title_update", { title: cleanTitle });
          }
        } catch (e) {
          console.error("Title generation error:", e);
        }
      }

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
    const queries = await storage.getQueries(userId);
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
