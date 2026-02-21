// ============================================================
// Gemini Provider — Google GenAI native SDK
// ============================================================
import { GoogleGenAI } from "@google/genai";
import type { WebSource } from "../types";

// Initialize Gemini client once
const gemini = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "",
    httpOptions: {
        apiVersion: "v1beta",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
});

const SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH",        threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",  threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT",  threshold: "BLOCK_NONE" },
];

// ── Non-streaming call ────────────────────────────────────────────────────────
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
    if (options?.maxTokens)            config.maxOutputTokens = options.maxTokens;
    if (options?.temperature !== undefined) config.temperature = options.temperature;

    const systemInstruction = options?.systemPrompt
        ? { parts: [{ text: options.systemPrompt }] }
        : undefined;

    const result = await gemini.models.generateContent({
        model: modelId,
        contents,
        config,
        safetySettings: SAFETY_SETTINGS,
        ...(systemInstruction ? { systemInstruction } : {}),
    } as any);

    return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ── Streaming call ────────────────────────────────────────────────────────────
export async function callGeminiStream(
    modelId: string,
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        /** directMode = skip Google Search grounding + suppress thinking output */
        directMode?: boolean;
    }
): Promise<{ content: string; sources: WebSource[] }> {
    const contents = messages.map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
    }));

    const config: any = {};
    // Google Search grounding — always enabled so Gemini can look up real-time
    // information (prices, news, etc.). Gemini decides when to invoke the tool.
    // directMode only suppresses chain-of-thought output, not web access.
    config.tools = [{ googleSearch: {} }];
    if (options?.directMode) {
        // Suppress thinking output so the model responds directly.
        config.thinkingConfig = { thinkingBudget: 0 };
    }
    if (options?.maxTokens)                 config.maxOutputTokens = options.maxTokens;
    if (options?.temperature !== undefined) config.temperature = options.temperature;

    const systemInstruction = options?.systemPrompt
        ? { parts: [{ text: options.systemPrompt }] }
        : undefined;

    let fullContent = "";
    const sources: WebSource[] = [];
    const seenUrls = new Set<string>();

    const result = await gemini.models.generateContentStream({
        model: modelId,
        contents,
        config,
        safetySettings: SAFETY_SETTINGS,
        ...(systemInstruction ? { systemInstruction } : {}),
    } as any);

    for await (const chunk of result) {
        const text: string = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) {
            onChunk(text);
            fullContent += text;
        }

        // Extract Google Search grounding sources
        const candidate: any = chunk.candidates?.[0];
        const gm = candidate?.groundingMetadata;
        if (gm) {
            if (sources.length === 0) {
                console.log("[Gemini] groundingMetadata keys:", Object.keys(gm));
            }
            // Standard path: groundingChunks
            for (const gc of (gm.groundingChunks || []) as any[]) {
                const uri = gc.web?.uri;
                if (uri && !seenUrls.has(uri)) {
                    seenUrls.add(uri);
                    sources.push({ title: gc.web.title || uri, url: uri });
                }
            }
            // Alternative path: groundingSupports
            for (const s of (gm.groundingSupports || gm.grounding_supports || []) as any[]) {
                const c2 = s.groundingChunk || s.grounding_chunk;
                if (c2?.web?.uri && !seenUrls.has(c2.web.uri)) {
                    seenUrls.add(c2.web.uri);
                    sources.push({ title: c2.web.title || c2.web.uri, url: c2.web.uri });
                }
            }
            const queries: string[] = gm.webSearchQueries || gm.web_search_queries || [];
            if (queries.length > 0 && sources.length === 0) {
                console.log("[Gemini] Search queries used:", queries, "— no source URLs yet");
            }
        }
    }

    if (sources.length > 0) {
        console.log(`[Gemini] Extracted ${sources.length} web sources`);
    }

    return { content: fullContent, sources };
}
