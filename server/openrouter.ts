// OpenRouter + Gemini API integration for multi-model AI aggregation
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini client
const gemini = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "",
    httpOptions: {
        apiVersion: "v1beta",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
});

export type ModelProvider = "gemini" | "openrouter";

export interface ModelConfig {
    id: string;           // Model ID (Gemini model name OR OpenRouter model ID)
    displayName: string;  // Friendly name
    role: string;         // Role/specialty
    systemPrompt: string; // Default system prompt
    icon: string;         // Emoji icon
    color: string;        // CSS color identifier
    provider: ModelProvider; // Which API to use
}

// Default model configurations with roles and system prompts
export const DEFAULT_MODELS: ModelConfig[] = [
    // ===== GEMINI MODELS (Native API) =====
    {
        id: "gemini-3-flash-preview",
        displayName: "Gemini Flash",
        role: "Main AI Assistant",
        systemPrompt: "You are Gemini Flash, Google's fastest and most capable AI model. You provide intelligent, accurate, and well-structured responses. You excel at understanding context, following instructions precisely, and generating high-quality content across all domains.",
        icon: "✨",
        color: "blue",
        provider: "gemini",
    },

    // ===== OPENROUTER MODELS (Free Tier) =====
    {
        id: "deepseek/deepseek-r1-0528:free",
        displayName: "DeepSeek R1",
        role: "Deep Reasoning & Analysis",
        systemPrompt: "You are DeepSeek R1, an expert in deep reasoning, logical analysis, and complex problem solving. You excel at breaking down intricate problems into clear steps, providing thorough analysis with well-reasoned conclusions. Always think step by step and provide detailed explanations.",
        icon: "🔬",
        color: "purple",
        provider: "openrouter",
    },
    {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        displayName: "LLaMA 3.3",
        role: "General Knowledge & Conversation",
        systemPrompt: "You are LLaMA 3.3, a highly capable general-purpose AI assistant. You excel at providing clear, accurate, and helpful responses across a wide range of topics. You are friendly, approachable, and always aim to be helpful while being honest about your limitations.",
        icon: "🦙",
        color: "green",
        provider: "openrouter",
    },
    {
        id: "google/gemma-3-27b-it:free",
        displayName: "Gemma 3 27B",
        role: "Technical & Scientific",
        systemPrompt: "You are Gemma 3 27B, Google's advanced AI model specializing in technical and scientific topics. You provide precise, well-structured responses with a focus on accuracy and technical depth. You are excellent at explaining complex concepts clearly and providing code examples when relevant.",
        icon: "💎",
        color: "indigo",
        provider: "openrouter",
    },
    {
        id: "mistralai/devstral-2512:free",
        displayName: "Devstral",
        role: "Code & Development",
        systemPrompt: "You are Devstral by Mistral AI, a specialized coding and software development assistant. You excel at writing clean, efficient code, debugging, explaining software architecture, and providing best practices. Always include code examples and explain your reasoning.",
        icon: "⚡",
        color: "cyan",
        provider: "openrouter",
    },
    {
        id: "nvidia/nemotron-3-nano-30b-a3b:free",
        displayName: "Nemotron",
        role: "Data & Math",
        systemPrompt: "You are Nemotron by NVIDIA, an AI model specializing in data analysis, mathematics, statistics, and computational tasks. You provide precise numerical analysis, mathematical proofs, and data-driven insights. Always show your work and calculations.",
        icon: "🧮",
        color: "lime",
        provider: "openrouter",
    },
    {
        id: "qwen/qwen-2.5-vl-7b-instruct:free",
        displayName: "Qwen 2.5",
        role: "Creative & Writing",
        systemPrompt: "You are Qwen 2.5, an AI model with exceptional creative writing and content generation abilities. You excel at crafting engaging narratives, marketing copy, poetry, and creative content. Your writing style is vivid, engaging, and adaptable to different tones and formats.",
        icon: "✍️",
        color: "pink",
        provider: "openrouter",
    },
    {
        id: "google/gemma-3-12b-it:free",
        displayName: "Gemma 3 12B",
        role: "Research & Education",
        systemPrompt: "You are Gemma 3 12B, focused on research and educational content. You excel at explaining complex topics in an accessible way, providing well-cited information, and creating educational content. You adapt your explanations to different knowledge levels.",
        icon: "📚",
        color: "amber",
        provider: "openrouter",
    },
    {
        id: "z-ai/glm-4.5-air:free",
        displayName: "GLM 4.5",
        role: "Business & Strategy",
        systemPrompt: "You are GLM 4.5, an AI model specializing in business analysis, strategy, and professional consulting. You provide actionable business insights, market analysis, and strategic recommendations. Your responses are structured, professional, and data-informed.",
        icon: "📊",
        color: "teal",
        provider: "openrouter",
    },
];

// The main orchestrator model - Gemini Flash Preview (native API, NOT OpenRouter)
export const DEFAULT_MAIN_MODEL_ID = "gemini-3-flash-preview";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// ================================
// === Gemini Native API Call ===
// ================================
export async function callGemini(
    modelId: string,
    messages: { role: string; content: string }[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
    const contents = messages.map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
    }));

    const config: any = {};
    if (options?.maxTokens) config.maxOutputTokens = options.maxTokens;
    if (options?.temperature !== undefined) config.temperature = options.temperature;

    // Add system instruction if provided
    const systemInstruction = options?.systemPrompt
        ? { parts: [{ text: options.systemPrompt }] }
        : undefined;

    const result = await gemini.models.generateContent({
        model: modelId,
        contents,
        config,
        ...(systemInstruction ? { systemInstruction } : {}),
    });

    return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ================================
// === OpenRouter API Call ===
// ================================
export async function callOpenRouter(
    modelId: string,
    messages: { role: string; content: string }[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
    const apiKey = process.env["AI-INTEGRATIONS-OPEN-ROUTER-API-KEY"];
    if (!apiKey) {
        throw new Error("OpenRouter API key not configured");
    }

    const body: any = {
        model: modelId,
        messages: options?.systemPrompt
            ? [{ role: "system", content: options.systemPrompt }, ...messages]
            : messages,
        max_tokens: options?.maxTokens || 2048,
        temperature: options?.temperature ?? 0.7,
    };

    const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Metallm AI Aggregator",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error (${modelId}):`, response.status, errorText);
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

// ================================
// === Unified Call (auto-picks provider) ===
// ================================
export async function callModel(
    model: ModelConfig,
    messages: { role: string; content: string }[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
    if (model.provider === "gemini") {
        return callGemini(model.id, messages, options);
    } else {
        return callOpenRouter(model.id, messages, options);
    }
}

// ================================
// === Stream word-by-word (SSE simulation) ===
// ================================
export async function callModelStream(
    model: ModelConfig,
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
    const fullContent = await callModel(model, messages, options);

    // Stream word by word for smooth display
    const words = fullContent.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const chunk = i === words.length - 1 ? words[i] : words[i] + " ";
        onChunk(chunk);
        await new Promise(r => setTimeout(r, 30));
    }

    return fullContent;
}

// ================================
// === Quick Casual Detection (NO API call) ===
// ================================
function isObviouslyCasual(prompt: string): boolean {
    const trimmed = prompt.trim().toLowerCase();
    // Short messages that are clearly casual
    if (trimmed.length < 50) {
        const casualPatterns = [
            /^(hi|hello|hey|howdy|sup|yo|hola|greetings|salam|assalamualaikum)/i,
            /^how are you/i,
            /^how'?s it going/i,
            /^what'?s up/i,
            /^good (morning|afternoon|evening|night)/i,
            /^thanks?( you)?[!?.]?$/i,
            /^(ok|okay|sure|yes|no|yeah|nah|yep|nope)[!?.]?$/i,
            /^(bye|goodbye|see ya|later|cya)[!?.]?$/i,
            /^who are you/i,
            /^what can you do/i,
            /^what are you/i,
            /^tell me about yourself/i,
            /^introduce yourself/i,
            /^nice to meet you/i,
            /^how do you work/i,
            /^test(ing)?[!?.]?$/i,
        ];
        if (casualPatterns.some(p => p.test(trimmed))) {
            return true;
        }
    }
    return false;
}

// ================================
// === Robust JSON Extraction ===
// ================================
function extractJSON(text: string): any {
    // Attempt 1: Direct parse after cleanup
    let cleaned = text.trim();
    cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
        return JSON.parse(cleaned);
    } catch { /* continue */ }

    // Attempt 2: Find JSON object in response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            // Fix common issues: single quotes → double quotes, trailing commas
            let fixed = jsonMatch[0];
            fixed = fixed.replace(/'/g, '"');
            fixed = fixed.replace(/,\s*}/g, '}');
            fixed = fixed.replace(/,\s*]/g, ']');
            return JSON.parse(fixed);
        } catch { /* continue */ }
    }

    // Attempt 3: Extract fields with regex
    const typeMatch = cleaned.match(/"type"\s*:\s*"(casual|specialized)"/);
    const indexMatch = cleaned.match(/"modelIndex"\s*:\s*(\d+)/);
    const reasonMatch = cleaned.match(/"reason"\s*:\s*"([^"]*?)"/);
    const promptMatch = cleaned.match(/"enhancedPrompt"\s*:\s*"([\s\S]*?)(?:"\s*[,}])/);

    if (typeMatch) {
        return {
            type: typeMatch[1],
            modelIndex: indexMatch ? parseInt(indexMatch[1]) : 1,
            reason: reasonMatch ? reasonMatch[1] : "",
            enhancedPrompt: promptMatch ? promptMatch[1] : "",
        };
    }

    throw new Error("Could not extract JSON from response: " + cleaned.substring(0, 200));
}

// ================================
// === Route Analysis (uses Gemini) ===
// ================================
export async function analyzeAndRoute(
    prompt: string,
    models: ModelConfig[],
): Promise<{ type: "casual" | "specialized"; targetModel: ModelConfig | null; reason: string; enhancedPrompt: string }> {

    // ⚡ INSTANT casual detection — no API call needed
    if (isObviouslyCasual(prompt)) {
        console.log(`[Router] Instant casual detection: "${prompt.substring(0, 50)}"`);
        return {
            type: "casual",
            targetModel: models[0], // Gemini Flash
            reason: "Casual/greeting — Gemini Flash answers directly",
            enhancedPrompt: prompt, // No enhancement needed for casual
        };
    }

    // For non-trivial prompts, use Gemini to analyze
    const routingPrompt = `You are an AI router. Analyze this user request and decide which specialist model should handle it.

Available models:
${models.map((m, i) => `${i + 1}. "${m.displayName}" - ${m.role}`).join("\n")}

User request: "${prompt}"

Respond with ONLY valid JSON, no other text:
{"type":"casual","modelIndex":1,"reason":"reason here","enhancedPrompt":"improved prompt here"}
OR
{"type":"specialized","modelIndex":NUMBER,"reason":"reason here","enhancedPrompt":"improved prompt here"}

Rules:
- Greetings/casual chat/simple questions → type "casual", modelIndex 1
- Coding/development → route to Code & Development model
- Math/data/statistics → Data & Math model
- Creative writing/content → Creative & Writing model
- Deep analysis/complex reasoning → Deep Reasoning model
- Business/strategy → Business & Strategy model
- Technical/scientific → Technical & Scientific model
- Educational/research → Research & Education model
- General knowledge → General Knowledge model
- enhancedPrompt must be an improved version of the original prompt`;

    try {
        const response = await callGemini("gemini-3-flash-preview", [
            { role: "user", content: routingPrompt }
        ], { maxTokens: 500, temperature: 0.1 });

        console.log(`[Router] Gemini raw response: ${response.substring(0, 300)}`);

        const analysis = extractJSON(response);

        if (analysis.type === "specialized" && analysis.modelIndex > 0 && analysis.modelIndex <= models.length) {
            return {
                type: "specialized",
                targetModel: models[analysis.modelIndex - 1],
                reason: analysis.reason || "",
                enhancedPrompt: analysis.enhancedPrompt || prompt,
            };
        }

        return {
            type: "casual",
            targetModel: models[0],
            reason: analysis.reason || "General/casual query",
            enhancedPrompt: prompt, // No enhancement for casual
        };
    } catch (e) {
        console.error("Routing analysis failed:", e);
        return {
            type: "casual",
            targetModel: models[0],
            reason: "Routing failed, using default Gemini Flash",
            enhancedPrompt: prompt,
        };
    }
}
