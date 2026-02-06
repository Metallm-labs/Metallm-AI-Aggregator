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

      // 2. Intelligent Routing: Main model analyzes the task
      const prompt = input.prompt;
      const role = input.role || "general";
      const allModelsMode = input.allModelsMode;

      // Orchestrator analyzes first
      const analysisPrompt = `
        Analyze this user request: "${prompt}"
        User Role context: "${role}"
        
        Is this a simple/casual/general request that you (the main model) can handle alone, or does it require specialized expertise?
        
        Respond ONLY with a JSON object:
        {
          "type": "casual" | "specialized",
          "requiresModels": ["Claude (Technical)", "Grok (Social)", "Gemini (Image)", "LLaMA (Casual)"] // subset of these
        }
      `;

      const analysisCompletion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [{ role: "user", content: analysisPrompt }],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(analysisCompletion.choices[0].message.content || "{}");
      const isSpecialized = analysis.type === "specialized" || allModelsMode;
      const modelsToCall = allModelsMode 
        ? ["claude", "grok", "llama", "gemini"] 
        : (isSpecialized ? (analysis.requiresModels || []).map((m: string) => m.toLowerCase().split(' ')[0]) : []);

      // Helper to wrap promises and catch errors
      const safeCall = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
        try {
          return await fn();
        } catch (e) {
          console.error(`Error in model ${name}:`, e);
          return null;
        }
      };

      const promises = [];

      // Only call other models if it's specialized or allModelsMode is ON
      if (isSpecialized) {
        // --- Claude (Technical) ---
        if (modelsToCall.includes("claude") || modelsToCall.includes("technical")) {
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
        }

        // --- Grok (Social/News - Simulated) ---
        if (modelsToCall.includes("grok") || modelsToCall.includes("social")) {
          promises.push(safeCall("grok", async () => {
            const completion = await openai.chat.completions.create({
              model: "gpt-5.2",
              messages: [
                { role: "system", content: "You are Grok, a witty, rebellious, and truth-seeking AI with a focus on real-time news and social commentary." },
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
        }

        // --- LLaMA (Casual - Simulated) ---
        if (modelsToCall.includes("llama") || modelsToCall.includes("casual")) {
          promises.push(safeCall("llama", async () => {
            const completion = await openai.chat.completions.create({
              model: "gpt-5-mini",
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
        }

        // --- Gemini (Image Generation) ---
        if (modelsToCall.includes("gemini") || modelsToCall.includes("image")) {
          promises.push(safeCall("gemini", async () => {
            const promptGen = await openai.chat.completions.create({
              model: "gpt-5-mini",
              messages: [{ role: "user", content: `Create a detailed image generation prompt based on this user query: "${prompt}". Output ONLY the prompt.` }]
            });
            const imagePrompt = promptGen.choices[0].message.content || prompt;

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
        }
      }

      // Wait for all models (if any)
      const results = await Promise.all(promises);
      const validResults = results.filter(r => r !== null) as { model: string, content: string }[];

      // 3. Orchestrator Summary / Final Reply
      let finalSummaryPrompt = "";
      if (allModelsMode) {
        finalSummaryPrompt = `
          Synthesize these perspectives into a cohesive summary.
          User Query: "${prompt}"
          User Role: "${role}"
          Perspectives: ${validResults.map(r => `[${r.model}]: ${r.content.substring(0, 300)}`).join('\n')}
        `;
      } else if (isSpecialized) {
        finalSummaryPrompt = `
          The user has a specialized request: "${prompt}" (Role: ${role}).
          I have consulted these experts: ${validResults.map(r => r.model).join(', ')}.
          Provide a main response that integrates their findings.
        `;
      } else {
        finalSummaryPrompt = `
          Respond to this user query: "${prompt}"
          Role context: "${role}"
          Keep it direct as the main model.
        `;
      }

      const summaryCompletion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [{ role: "user", content: finalSummaryPrompt }],
      });

      const summary = summaryCompletion.choices[0].message.content || "Done.";

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
