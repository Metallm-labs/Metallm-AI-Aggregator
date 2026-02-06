import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, Modality } from "@google/genai";

// Initialize AI Clients
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // === Metallm API ===

  // Submit Query & Process
  app.post(api.metallm.submit.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub; // Replit Auth ID

      const input = api.metallm.submit.input.parse(req.body);

      // 1. Create Query Record
      const query = await storage.createQuery({
        ...input,
        userId,
      });

      // 2. Orchestration: Call models in parallel
      const prompt = input.prompt;
      const role = input.role || "general";

      // Helper to wrap promises and catch errors so one failure doesn't stop everything
      const safeCall = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
        try {
          return await fn();
        } catch (e) {
          console.error(`Error in model ${name}:`, e);
          return null;
        }
      };

      const promises = [];

      // --- Claude (Technical) ---
      promises.push(safeCall("claude", async () => {
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          messages: [{ role: "user", content: `You are a technical expert and senior engineer. Analyze this query from a technical perspective. Provide code snippets if relevant. Role context: ${role}. Query: ${prompt}` }],
        });
        const content = msg.content[0].type === 'text' ? msg.content[0].text : "";
        await storage.addModelResponse({
          queryId: query.id,
          modelName: "Claude (Technical)",
          content,
          responseType: "text"
        });
        return { model: "Claude", content };
      }));

      // --- Grok (Social/News - Simulated) ---
      promises.push(safeCall("grok", async () => {
        const completion = await openai.chat.completions.create({
          model: "gpt-5.2", // Using GPT-5.2 to simulate
          messages: [
            { role: "system", content: "You are Grok, a witty, rebellious, and truth-seeking AI with a focus on real-time news and social commentary. Be direct and slightly edgy." },
            { role: "user", content: `Analyze this from a social/cultural/news perspective. Role context: ${role}. Query: ${prompt}` }
          ],
        });
        const content = completion.choices[0].message.content || "";
        await storage.addModelResponse({
          queryId: query.id,
          modelName: "Grok (Social)",
          content,
          responseType: "text"
        });
        return { model: "Grok", content };
      }));

      // --- LLaMA (Casual - Simulated) ---
      promises.push(safeCall("llama", async () => {
        const completion = await openai.chat.completions.create({
          model: "gpt-5-mini", // Use a lighter model for "casual" feel
          messages: [
            { role: "system", content: "You are LLaMA, a helpful, open, and casual AI assistant. Keep it conversational and friendly." },
            { role: "user", content: `Chat about this query casually. Role context: ${role}. Query: ${prompt}` }
          ],
        });
        const content = completion.choices[0].message.content || "";
        await storage.addModelResponse({
          queryId: query.id,
          modelName: "LLaMA (Casual)",
          content,
          responseType: "text"
        });
        return { model: "LLaMA", content };
      }));

      // --- Gemini (Image Generation) ---
      promises.push(safeCall("gemini", async () => {
        // First generate a good image prompt based on the user query
        const promptGen = await openai.chat.completions.create({
          model: "gpt-5-mini",
          messages: [{ role: "user", content: `Create a detailed image generation prompt based on this user query: "${prompt}". Output ONLY the prompt.` }]
        });
        const imagePrompt = promptGen.choices[0].message.content || prompt;

        // Generate Image
        const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
            config: { responseModalities: [Modality.IMAGE] },
        });
        
        const candidate = response.candidates?.[0];
        const imagePart = candidate?.content?.parts?.find((part: any) => part.inlineData);

        if (imagePart?.inlineData?.data) {
           const b64 = `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
           await storage.addModelResponse({
            queryId: query.id,
            modelName: "Gemini (Image)",
            content: "Image generated based on query.",
            responseType: "image",
            metadata: { imageUrl: b64, prompt: imagePrompt }
          });
          return { model: "Gemini", content: "[Image Generated]" };
        }
        return null;
      }));

      // Wait for all models
      const results = await Promise.all(promises);
      const validResults = results.filter(r => r !== null) as { model: string, content: string }[];

      // 3. Orchestrator Summary
      const summaryPrompt = `
        You are the Main Orchestrator of a multi-AI system.
        User Query: "${prompt}"
        User Role: "${role}"
        
        Here are the perspectives from other models:
        ${validResults.map(r => `[${r.model}]: ${r.content.substring(0, 500)}...`).join('\n\n')}
        
        Synthesize these perspectives into a cohesive, high-level summary. Highlight consensus and divergence. 
        Provide a final recommendation or insight.
      `;

      const summaryCompletion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [{ role: "user", content: summaryPrompt }],
      });

      const summary = summaryCompletion.choices[0].message.content || "Could not generate summary.";

      // Update Query with Summary
      const updatedQuery = await storage.updateQuerySummary(query.id, summary);
      
      // Get full object to return
      const fullQuery = await storage.getQueryWithResponses(updatedQuery.id);
      
      res.status(201).json(fullQuery);

    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      } else {
        console.error("Processing error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // Get History
  app.get(api.metallm.list.path, isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const userId = user.claims.sub;
    const queries = await storage.getQueries(userId);
    res.json(queries);
  });

  // Get Single Query
  app.get(api.metallm.get.path, isAuthenticated, async (req, res) => {
    const user = req.user as any;
    // Optional: check if query belongs to user
    const query = await storage.getQueryWithResponses(Number(req.params.id));
    if (!query) {
      return res.status(404).json({ message: "Query not found" });
    }
    // Simplistic ownership check
    if (query.userId !== user.claims.sub) {
       return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(query);
  });

  return httpServer;
}
