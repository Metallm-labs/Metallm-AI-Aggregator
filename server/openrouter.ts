// OpenRouter + Gemini + Groq API integration for multi-model AI aggregation
// Model definitions are in server/models.json — edit that file to add/change models.
import { GoogleGenAI } from "@google/genai";
import modelsJson from "./models.json";
import { callGroq, callGroqStream } from "./providers/groq";
import { callGrok, callGrokStream } from "./providers/grok";
import { callAnthropic, callAnthropicStream } from "./providers/anthropic";
import { callOpenAI, callOpenAIStream } from "./providers/openai";
import { callBedrock, callBedrockStream } from "./providers/bedrock";
import * as logger from "./logger";

// ================================
// === Web Search Types ===
// ================================
export interface WebSource {
    title: string;
    url: string;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedPromptTokens?: number;
}

export type ChatMessagePart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url?: string; image?: string }
    | { type: "input_file"; input_file?: { file_data?: string; data?: string; filename?: string; mime_type?: string } }
    | { type: "file"; file?: { file_data?: string; data?: string; filename?: string; mime_type?: string } }
    | { type: string; [key: string]: any };

export interface ChatMessage {
    role: string;
    content: string | ChatMessagePart[];
}

function dataUrlToGeminiInlineData(dataUrl: string): { mimeType: string; data: string } | null {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    return { mimeType: m[1], data: m[2] };
}

function toGeminiParts(content: string | ChatMessagePart[]): any[] {
    if (typeof content === "string") return [{ text: content }];

    const parts: any[] = [];
    for (const part of content) {
        if (part.type === "text" || part.type === "input_text") {
            if (typeof part.text === "string" && part.text.trim()) {
                parts.push({ text: part.text });
            }
            continue;
        }

        const imageUrl = part.type === "image_url"
            ? part.image_url?.url
            : (part.type === "input_image" ? (part.image_url || part.image) : undefined);

        if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
            const inlineData = dataUrlToGeminiInlineData(imageUrl);
            if (inlineData) {
                parts.push({ inlineData });
            }
            continue;
        }

        const fileDataUrl = part.type === "input_file"
            ? (part.input_file?.file_data || part.input_file?.data)
            : (part.type === "file" ? (part.file?.file_data || part.file?.data) : undefined);

        if (typeof fileDataUrl === "string" && fileDataUrl.startsWith("data:")) {
            const inlineData = dataUrlToGeminiInlineData(fileDataUrl);
            if (inlineData) {
                parts.push({ inlineData });
            }
        }
    }

    return parts.length > 0 ? parts : [{ text: "" }];
}

function normalizeOpenRouterContent(content: string | ChatMessagePart[]): string | Array<{ type: string; [key: string]: any }> {
    if (typeof content === "string") return content;

    const parts: Array<{ type: string; [key: string]: any }> = [];
    for (const part of content) {
        if (part.type === "text" || part.type === "input_text") {
            if (typeof part.text === "string" && part.text.length > 0) {
                parts.push({ type: "text", text: part.text });
            }
            continue;
        }

        if (part.type === "image_url" && part.image_url?.url) {
            parts.push({ type: "image_url", image_url: { url: part.image_url.url, detail: part.image_url.detail || "auto" } });
            continue;
        }

        if (part.type === "input_image") {
            const url = part.image_url || part.image;
            if (typeof url === "string" && url.length > 0) {
                parts.push({ type: "image_url", image_url: { url, detail: "auto" } });
            }
            continue;
        }

        const fileData = part.type === "input_file"
            ? (part.input_file?.file_data || part.input_file?.data)
            : (part.type === "file" ? (part.file?.file_data || part.file?.data) : undefined);

        if (typeof fileData === "string" && fileData.length > 0) {
            const fileName = part.type === "input_file"
                ? part.input_file?.filename
                : (part as any).file?.filename;
            const fileMime = part.type === "input_file"
                ? part.input_file?.mime_type
                : (part as any).file?.mime_type;
            parts.push({
                type: "file",
                file: {
                    file_data: fileData,
                    filename: fileName,
                    mime_type: fileMime,
                },
            });
        }
    }

    return parts.length > 0 ? parts : "";
}

function normalizeMessagesForOpenRouter(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((m) => ({
        role: m.role,
        content: normalizeOpenRouterContent(m.content),
    }));
}

function getLatestUserText(messages: ChatMessage[]): string {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return "";
    if (typeof lastUser.content === "string") return lastUser.content;

    const text = lastUser.content
        .filter((p): p is Extract<ChatMessagePart, { text: string }> =>
            (p.type === "text" || p.type === "input_text") && typeof (p as any).text === "string"
        )
        .map((p) => p.text)
        .join("\n")
        .trim();
    return text;
}

function extractGeminiChunkText(chunk: any): string {
    const parts = chunk?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts
        .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .filter(Boolean)
        .join("");
}

type AttachmentKind = "image" | "file";

function getLatestUserContent(messages: ChatMessage[]): string | ChatMessagePart[] | null {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return lastUser ? lastUser.content : null;
}

function detectAttachmentKinds(content: string | ChatMessagePart[] | null): Set<AttachmentKind> {
    const kinds = new Set<AttachmentKind>();
    if (!content || typeof content === "string") return kinds;

    for (const part of content) {
        if (part.type === "image_url" || part.type === "input_image") {
            kinds.add("image");
            continue;
        }
        if (part.type === "input_file" || part.type === "file") {
            const mime = part.type === "input_file"
                ? part.input_file?.mime_type
                : (part as Extract<ChatMessagePart, { type: "file" }>).file?.mime_type;
            if (typeof mime === "string" && mime.startsWith("image/")) {
                kinds.add("image");
            } else {
                kinds.add("file");
            }
        }
    }

    return kinds;
}

function modelSupportsImageInput(model: ModelConfig): boolean {
    const id = model.id.toLowerCase();
    if (model.provider === "openai") return true;
    if (model.provider === "gemini") return true;
    if (model.provider === "grok") return true;
    if (model.provider === "anthropic") return true;
    if (model.provider === "groq") {
        return /llama-4-scout|vision|multimodal|\bvl\b/.test(id);
    }
    if (model.provider === "openrouter") {
        return /vision|multimodal|\bvl\b|llava|qwen2\.5-vl|qwen-vl|gpt-4o|gemini|pixtral|phi-3\.5-vision|internvl|moondream|llama-4-scout/.test(id);
    }
    return false;
}

function modelSupportsFileInput(model: ModelConfig): boolean {
    const id = model.id.toLowerCase();
    if (model.provider === "openai") return true;
    if (model.provider === "gemini") return true;
    if (model.provider === "anthropic") return true;
    if (model.provider === "openrouter") {
        return /gpt-4o|gemini|claude|document|pdf|file/.test(id);
    }
    return false;
}

// ================================
// === Web Content Fetching (used when user explicitly enables Web Search) ===
// ================================

// Strip HTML to plain text
function stripHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#?\w+;/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// Fetch a page and extract text (with timeout)
async function fetchPageText(url: string, maxChars = 4000): Promise<string> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml",
            },
            signal: controller.signal,
            redirect: "follow",
        });
        clearTimeout(timeout);
        if (!res.ok) return "";
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("text/html") && !ct.includes("text/plain")) return "";
        const html = await res.text();
        return stripHtml(html).slice(0, maxChars);
    } catch {
        return "";
    }
}

// Parse DuckDuckGo HTML response into result objects
function parseDDGHtml(html: string, maxResults: number): Array<{ title: string; url: string; snippet: string }> {
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const blocks = html.split(/class="result[\s"]/);
    for (const block of blocks.slice(1, maxResults + 1)) {
        const uddgMatch = block.match(/href="[^"]*uddg=([^&"]+)/);
        const directMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
        let url = "";
        if (uddgMatch) {
            url = decodeURIComponent(uddgMatch[1]);
        } else if (directMatch) {
            url = directMatch[1];
            if (url.startsWith("//")) url = "https:" + url;
        }
        if (!url || !url.startsWith("http")) continue;
        const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
        results.push({
            title: titleMatch ? stripHtml(titleMatch[1]) : url,
            url,
            snippet: snippetMatch ? stripHtml(snippetMatch[1]) : "",
        });
    }
    return results;
}

// Search DuckDuckGo lite HTML and parse results
async function searchDDG(query: string, maxResults = 5): Promise<Array<{ title: string; url: string; snippet: string }>> {
    // Try GET (lite endpoint) first — more reliable, fewer bot blocks
    const tryFetch = async (url: string, init: RequestInit): Promise<string> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const res = await fetch(url, { ...init, signal: controller.signal });
            clearTimeout(timer);
            return await res.text();
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    };

    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    const headers = { "User-Agent": userAgent, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" };

    // Attempt 1: DuckDuckGo lite GET
    try {
        const html = await tryFetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=us-en`, { headers });
        // lite.duckduckgo.com uses <a class="result-link"> and <td class="result-snippet">
        const liteResults: Array<{ title: string; url: string; snippet: string }> = [];
        const rowMatches = Array.from(html.matchAll(/<a[^>]+href="([^"]+)"[^>]*class="result-link"[^>]*>([^<]+)<\/a>/g));
        const snippetMatches = Array.from(html.matchAll(/<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g));
        for (let i = 0; i < Math.min(rowMatches.length, maxResults); i++) {
            let url = rowMatches[i][1];
            if (url.includes("uddg=")) {
                const m = url.match(/uddg=([^&]+)/);
                if (m) url = decodeURIComponent(m[1]);
            }
            if (!url.startsWith("http")) continue;
            liteResults.push({
                title: stripHtml(rowMatches[i][2]),
                url,
                snippet: snippetMatches[i] ? stripHtml(snippetMatches[i][1]) : "",
            });
        }
        if (liteResults.length > 0) {
    console.log(`[WebSearch] DDG lite found ${liteResults.length} results for: "${query.substring(0, 60)}"`);
            return liteResults;
        }
    } catch (e) {
        console.warn("[WebSearch] DDG lite GET failed:", (e as Error).message);
    }

    // Attempt 2: DuckDuckGo HTML POST
    try {
        const html = await tryFetch("https://html.duckduckgo.com/html/", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
            body: `q=${encodeURIComponent(query)}&kl=us-en`,
        });
        const results = parseDDGHtml(html, maxResults);
        console.log(`[WebSearch] DDG POST found ${results.length} results for: "${query.substring(0, 60)}"`);
        return results;
    } catch (e) {
        console.error("[WebSearch] DDG POST failed:", (e as Error).message);
    }

    // Attempt 3: DuckDuckGo HTML GET
    try {
        const html = await tryFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`, { headers });
        const results = parseDDGHtml(html, maxResults);
        console.log(`[WebSearch] DDG GET found ${results.length} results for: "${query.substring(0, 60)}"`);
        return results;
    } catch (e) {
        console.error("[WebSearch] DDG GET failed:", (e as Error).message);
    }

    return [];
}

// Full pipeline: search → fetch top pages → build context string + sources
async function fetchWebContext(
    query: string,
    onStatus?: (event: string, data: any) => void
): Promise<{ context: string; sources: WebSource[] }> {
    const t0 = Date.now();
    onStatus?.("searching", { query });
    const searchResults = await searchDDG(query);
    if (searchResults.length === 0) {
        onStatus?.("done", { count: 0 });
        return { context: "", sources: [] };
    }

    const sources: WebSource[] = searchResults.map(r => ({ title: r.title, url: r.url }));
    onStatus?.("results", { results: sources, count: sources.length });

    // Fetch actual page content from top 3 results in parallel
    const topN = Math.min(3, searchResults.length);
    const pages = await Promise.all(
        searchResults.slice(0, topN).map(async (r, i) => {
            onStatus?.("fetching", { index: i + 1, title: r.title, url: r.url, total: topN });
            const content = await fetchPageText(r.url);
            return { ...r, content };
        })
    );

    // Build context for the model
    const now = new Date().toISOString();
    let context = `\n\n[WEB SEARCH RESULTS — query: "${query}" — fetched: ${now}]\n`;
    for (const page of pages) {
        context += `\nSource: ${page.title}\nURL: ${page.url}\n`;
        if (page.content) {
            context += `Content:\n${page.content}\n`;
        } else if (page.snippet) {
            context += `Snippet: ${page.snippet}\n`;
        }
        context += "---\n";
    }
    for (const r of searchResults.slice(3)) {
        if (r.snippet) {
            context += `\nSource: ${r.title} (${r.url})\nSnippet: ${r.snippet}\n---\n`;
        }
    }
    context += "[END OF WEB SEARCH RESULTS]\n";

    console.log(`[WebSearch] Pipeline done in ${Date.now() - t0}ms (${pages.filter(p => p.content).length}/${pages.length} pages fetched)`);
    onStatus?.("done", { count: sources.length });
    return { context, sources };
}

// Initialize Gemini client
const gemini = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "",
    httpOptions: {
        apiVersion: "v1beta",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
});

export type ModelProvider = "gemini" | "openrouter" | "openai" | "anthropic" | "grok" | "groq" | "bedrock";

export interface ModelConfig {
    id: string;
    displayName: string;
    role: string;
    systemPrompt: string;
    /** URL to the local brand icon image (served from /icons/) */
    iconUrl?: string;
    color: string;
    provider: ModelProvider;
    /** UI ordering/grouping only (1=top, 2=mid, 3=rest). */
    tier?: 1 | 2 | 3;
    /**
     * Maximum output tokens supported by this model (sourced from official API docs).
     * Used as the default max_tokens for every call to this model so responses are
     * never truncated. Falls back to 16384 if not set.
     */
    maxOutputTokens?: number;
    /** Per-million-token pricing. Set free:true (or both to 0) for free models. */
    pricing?: {
        inputPerMillion: number;
        cachedInputPerMillion?: number;
        outputPerMillion: number;
        webSearchPerCall?: number;
        toolsExtra?: {
            basicSearch?: number;
            advancedSearch?: number;
            visitWebsite?: number;
        };
        free?: boolean;
    };
}

// ─── Load model registry from models.json ───────────────────────────────────
// To add a new model, edit server/models.json only — no code changes needed.
export const DEFAULT_MODELS: ModelConfig[] = modelsJson.models as ModelConfig[];
export const DEFAULT_MAIN_MODEL_ID: string = modelsJson.defaultMainModelId;
export const MEDIA_MODELS = (modelsJson as any).mediaModels as {
  image: Array<{ id: string; displayName: string; role: string; iconUrl: string; color: string; provider: string; type: string; pricing: any; config: any }>;
};

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getOpenRouterRequestModelId(modelId: string, webSearch?: boolean): string {
    if (!webSearch) return modelId;
    return modelId.includes(":online") ? modelId : `${modelId}:online`;
}

// ================================
// === Gemini Native API Call ===
// ================================
export async function callGemini(
    modelId: string,
    messages: ChatMessage[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
    const contents = messages.map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: toGeminiParts(m.content),
    }));

    const config: any = {};
    if (options?.maxTokens) config.maxOutputTokens = options.maxTokens;
    if (options?.temperature !== undefined) config.temperature = options.temperature;

    // Add system instruction if provided
    const systemInstruction = options?.systemPrompt
        ? { parts: [{ text: options.systemPrompt }] }
        : undefined;

    // Configure safety settings to be permissive
    const safetySettings = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ];

    const result = await gemini.models.generateContent({
        model: modelId,
        contents,
        config,
        safetySettings,
        ...(systemInstruction ? { systemInstruction } : {}),
    } as any);

    return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ================================
// === OpenRouter API Call ===
// ================================
export async function callOpenRouter(
    modelId: string,
    messages: ChatMessage[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
    }
): Promise<string> {
    const apiKey = process.env["AI-INTEGRATIONS-OPEN-ROUTER-API-KEY"];
    if (!apiKey) {
        throw new Error("OpenRouter API key not configured");
    }

    const body: any = {
        model: getOpenRouterRequestModelId(modelId, options?.webSearch),
        messages: options?.systemPrompt
            ? normalizeMessagesForOpenRouter([{ role: "system", content: options.systemPrompt }, ...messages])
            : normalizeMessagesForOpenRouter(messages),
        max_tokens: options?.maxTokens || 4096,
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
    messages: ChatMessage[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
    if (model.provider === "gemini") {
        return callGemini(model.id, messages, options);
    } else if (model.provider === "openai") {
        return callOpenAI(model.id, messages, options);
    } else if (model.provider === "anthropic") {
        return callAnthropic(model.id, messages, options);
    } else if (model.provider === "groq") {
        return callGroq(model.id, messages, options);
    } else if (model.provider === "grok") {
        return callGrok(model.id, messages, options);
    } else if (model.provider === "bedrock") {
        return callBedrock(model.id, messages, options);
    } else {
        return callOpenRouter(model.id, messages, options);
    }
}

// ================================
// === Gemini Native Streaming ===
// ================================
async function callGeminiStream(
    modelId: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        directMode?: boolean;
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: TokenUsage }> {
    const contents = messages.map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: toGeminiParts(m.content),
    }));

    const config: any = {};
    // Google Search grounding — always enabled so Gemini can look up real-time
    // information (prices, news, etc.). Gemini decides when to invoke the tool.
    // directMode only suppresses chain-of-thought output, NOT web access.
    config.tools = [{ googleSearch: {} }];
    if (options?.directMode) {
        // Suppress thinking output so the model responds directly.
        config.thinkingConfig = { thinkingBudget: 0 };
    }
    if (options?.maxTokens) config.maxOutputTokens = options.maxTokens;
    if (options?.temperature !== undefined) config.temperature = options.temperature;

    const systemInstruction = options?.systemPrompt
        ? { parts: [{ text: options.systemPrompt }] }
        : undefined;

    const safetySettings = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ];

    let fullContent = "";
    const sources: WebSource[] = [];
    const seenUrls = new Set<string>();
    let lastUsageMetadata: any = null;

    // Count actual input tokens BEFORE streaming — Gemini's usageMetadata.promptTokenCount
    // does NOT include systemInstruction tokens, so we use countTokens API for accuracy.
    let countedInputTokens: number | null = null;
    try {
        // Log what we're sending so we can debug
        const sysPromptLen = options?.systemPrompt?.length ?? 0;
        console.log(`[Gemini] countTokens: systemPrompt length=${sysPromptLen} chars, contents count=${contents.length}`);

        const countResult = await gemini.models.countTokens({
            model: modelId,
            contents,
            ...(systemInstruction ? { systemInstruction } : {}),
        } as any);
        console.log("[Gemini] countTokens raw result:", JSON.stringify(countResult));
        countedInputTokens = (countResult as any).totalTokens ?? null;

        // If countTokens didn't include systemInstruction, count it separately
        if (systemInstruction && countedInputTokens !== null) {
            const sysCountResult = await gemini.models.countTokens({
                model: modelId,
                contents: [{ role: "user", parts: [{ text: options!.systemPrompt! }] }],
            } as any);
            const sysTokens = (sysCountResult as any).totalTokens ?? 0;
            console.log(`[Gemini] System instruction separately counted: ${sysTokens} tokens`);
            // If the original count is suspiciously low (same as without system prompt), add system tokens
            if (countedInputTokens < sysTokens) {
                countedInputTokens = countedInputTokens + sysTokens;
                console.log(`[Gemini] Adjusted input tokens with system prompt: ${countedInputTokens}`);
            }
        }

        console.log(`[Gemini] countTokens final: ${countedInputTokens} input tokens`);
    } catch (e) {
        console.warn("[Gemini] countTokens failed, will use stream metadata:", e);
    }

    const result = await gemini.models.generateContentStream({
        model: modelId,
        contents,
        config,
        safetySettings,
        ...(systemInstruction ? { systemInstruction } : {}),
    } as any);

    for await (const chunk of result) {
        const text = extractGeminiChunkText(chunk);
        if (text) {
            onChunk(text);
            fullContent += text;
        }

        // Capture usageMetadata from chunks (typically present on the last chunk)
        if ((chunk as any).usageMetadata) {
            lastUsageMetadata = (chunk as any).usageMetadata;
        }

        // Extract Google Search grounding sources from every chunk that has them.
        // The SDK may surface them at candidate-level or response-level.
        const candidate: any = chunk.candidates?.[0];
        const gm = candidate?.groundingMetadata;
        if (gm) {
            // Log once so we can see the shape
            if (sources.length === 0) {
                console.log("[Gemini] groundingMetadata keys:", Object.keys(gm));
            }
            // Standard path: groundingChunks
            const groundingChunks: any[] = gm.groundingChunks || [];
            for (const gc of groundingChunks) {
                const uri = gc.web?.uri;
                if (uri && !seenUrls.has(uri)) {
                    seenUrls.add(uri);
                    sources.push({ title: gc.web.title || uri, url: uri });
                }
            }
            // Alternative path: groundingSupports → segment.groundingChunkIndices
            // (some SDK versions nest differently)
            const supports: any[] = gm.groundingSupports || gm.grounding_supports || [];
            for (const s of supports) {
                const chunk2 = s.groundingChunk || s.grounding_chunk;
                if (chunk2?.web?.uri && !seenUrls.has(chunk2.web.uri)) {
                    seenUrls.add(chunk2.web.uri);
                    sources.push({ title: chunk2.web.title || chunk2.web.uri, url: chunk2.web.uri });
                }
            }
            // Alternative: webSearchQueries (signals that search was used even if sources differ)
            const queries: string[] = gm.webSearchQueries || gm.web_search_queries || [];
            if (queries.length > 0 && sources.length === 0) {
                console.log("[Gemini] Search was used with queries:", queries, "but no source URLs found yet");
            }
        }
    }

    if (sources.length > 0) {
        console.log(`[Gemini] Extracted ${sources.length} web sources`);
    }

    // Extract FULL token usage.
    // We use countTokens API result for accurate input count (includes systemInstruction).
    // usageMetadata gives us output (candidatesTokenCount + thoughtsTokenCount).
    let tokenUsage: TokenUsage | undefined;
    try {
        const um = lastUsageMetadata
            ?? (result as any).response?.usageMetadata
            ?? (result as any)._response?.usageMetadata
            ?? (result as any).usageMetadata;
        if (um) {
            console.log("[Gemini] Raw usageMetadata:", JSON.stringify(um));

            const rawPrompt = um.promptTokenCount ?? um.prompt_token_count ?? 0;
            const rawCandidates = um.candidatesTokenCount ?? um.candidates_token_count ?? 0;
            const thoughtTokens = um.thoughtsTokenCount ?? um.thoughts_token_count ?? 0;
            const cachedTokens = um.cachedContentTokenCount ?? um.cached_content_token_count ?? 0;

            // Use countTokens result for accurate input (includes system instruction + messages)
            // Fall back to raw promptTokenCount if countTokens failed
            const inputTokens = countedInputTokens ?? rawPrompt;

            // Output = visible generated text + thinking tokens
            const outputTokens = rawCandidates + thoughtTokens;

            // Total = input + output
            const totalTokens = inputTokens + outputTokens;

            tokenUsage = {
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                totalTokens,
            };
            console.log(
                `[Gemini] FULL token usage: input=${inputTokens} (countTokens=${countedInputTokens}, rawPrompt=${rawPrompt}), ` +
                `output=${outputTokens} (visible=${rawCandidates}, thinking=${thoughtTokens}), ` +
                `total=${totalTokens}, cached=${cachedTokens}`
            );
        } else if (countedInputTokens) {
            // No usageMetadata but we have countTokens result — at least report input
            tokenUsage = {
                promptTokens: countedInputTokens,
                completionTokens: 0,
                totalTokens: countedInputTokens,
            };
            console.warn(`[Gemini] No usageMetadata — using countTokens only: input=${countedInputTokens}`);
        } else {
            console.warn("[Gemini] No usageMetadata and countTokens failed — token count unavailable");
        }
    } catch (e) {
        console.warn("[Gemini] Could not extract token usage:", e);
    }

    return { content: fullContent, sources, tokenUsage };
}

// ================================
// === OpenRouter Streaming ===
// ================================
async function callOpenRouterStream(
    modelId: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: TokenUsage }> {
    const apiKey = process.env["AI-INTEGRATIONS-OPEN-ROUTER-API-KEY"];
    if (!apiKey) throw new Error("OpenRouter API key not configured");

    const body: any = {
        // OpenRouter documents `:online` as the shortcut for enabling the
        // `web` plugin on any model.
        model: getOpenRouterRequestModelId(modelId, options?.webSearch),
        messages: options?.systemPrompt
            ? normalizeMessagesForOpenRouter([{ role: "system", content: options.systemPrompt }, ...messages])
            : normalizeMessagesForOpenRouter(messages),
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
        // Request usage stats in streaming response
        stream_options: { include_usage: true },
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
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    const sources: WebSource[] = [];
    const seenUrls = new Set<string>();
    let tokenUsage: TokenUsage | undefined;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            if (!trimmed.startsWith("data: ")) continue;

            try {
                const data = JSON.parse(trimmed.slice(6));
                const text: string = data.choices?.[0]?.delta?.content || "";
                if (text) {
                    onChunk(text);
                    fullContent += text;
                }
                // Extract URL citations from OpenRouter web plugin annotations
                const annotations: any[] = data.choices?.[0]?.delta?.annotations || [];
                for (const ann of annotations) {
                    if (ann.type === "url_citation" && ann.url_citation?.url) {
                        const url: string = ann.url_citation.url;
                        if (!seenUrls.has(url)) {
                            seenUrls.add(url);
                            sources.push({ title: ann.url_citation.title || url, url });
                        }
                    }
                }
                const messageAnnotations: any[] = data.choices?.[0]?.message?.annotations || [];
                for (const ann of messageAnnotations) {
                    if (ann.type === "url_citation" && ann.url_citation?.url) {
                        const url: string = ann.url_citation.url;
                        if (!seenUrls.has(url)) {
                            seenUrls.add(url);
                            sources.push({ title: ann.url_citation.title || url, url });
                        }
                    }
                }
                // Capture actual token usage from model API response (present in the final stream chunk)
                if (data.usage) {
                    tokenUsage = {
                        promptTokens: data.usage.prompt_tokens ?? 0,
                        completionTokens: data.usage.completion_tokens ?? 0,
                        totalTokens: data.usage.total_tokens ?? (data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0),
                    };
                    console.log("[OpenRouter] Raw usage from API:", JSON.stringify(data.usage));
                }
            } catch {
                // skip malformed lines
            }
        }
    }

    if (tokenUsage) {
        console.log(`[OpenRouter] Token usage: prompt=${tokenUsage.promptTokens}, completion=${tokenUsage.completionTokens}, total=${tokenUsage.totalTokens}`);
    } else {
        console.log(`[OpenRouter] No token usage data returned from API for model ${modelId}`);
    }

    return { content: fullContent, sources, tokenUsage };
}

// ================================
// === Current date helper ===
// ================================
function getDateContext(): string {
    return `Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. When answering questions about current events, prices, news, or any time-sensitive topic, always use the most recent information available from web search results.`;
}

// ================================
// === Sleep helper for retry ===
// ================================
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ================================
// === Unified Streaming (auto-picks provider) ===
// ================================
export async function callModelStream(
    model: ModelConfig,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        onStatus?: (event: string, data: any) => void;
        webSearch?: boolean;
        directMode?: boolean; // Bypass routing formatting; respond naturally
        abortSignal?: AbortSignal;
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: TokenUsage }> {
    const onStatus = options?.onStatus;
    const userWantsWebSearch = options?.webSearch === true;
    const providerAutoWebSearch =
        model.provider === "gemini" ||
        model.provider === "grok" ||
        model.provider === "openai" ||
        model.provider === "anthropic";
    const effectiveWebSearch = userWantsWebSearch || providerAutoWebSearch;

    // Use manual web search fallback if the provider doesn't have native tool search
    // but the user explicitly requested it.
    let manualWebContext = "";
    let manualWebSources: WebSource[] = [];
    if (userWantsWebSearch && !providerAutoWebSearch) {
        try {
            const query = getLatestUserText(messages);
            if (query && !isObviouslyCasual(query)) {
                onStatus?.("searching", { query, mode: "manual-fallback" });
                const searchResult = await fetchWebContext(query, onStatus);
                manualWebContext = searchResult.context;
                manualWebSources = searchResult.sources;
                if (manualWebSources.length > 0) {
                    onStatus?.("done", { count: manualWebSources.length, mode: "manual-fallback" });
                }
            }
        } catch (err) {
            console.error("[WebSearch] Manual fallback failed:", err);
        }
    }

    const latestUserContent = getLatestUserContent(messages);
    const requestedAttachmentKinds = detectAttachmentKinds(latestUserContent);
    if (requestedAttachmentKinds.size > 0) {
        const unsupported: AttachmentKind[] = [];
        if (requestedAttachmentKinds.has("image") && !modelSupportsImageInput(model)) {
            unsupported.push("image");
        }
        if (requestedAttachmentKinds.has("file") && !modelSupportsFileInput(model)) {
            unsupported.push("file");
        }

        if (unsupported.length > 0) {
            const unsupportedText = unsupported.join(" and ");
            const friendly = `This model (${model.displayName}) does not support ${unsupportedText} attachments. Please choose a multimodal model and try again.`;
            onChunk(friendly);
            return { content: friendly, sources: [] };
        }
    }

    // Inject current date and potentially manual web context into the system prompt
    const dateContext = getDateContext();
    let enrichedSystemPrompt = options?.systemPrompt
        ? `${options.systemPrompt}\n\n${dateContext}`
        : dateContext;
    
    if (manualWebContext) {
        enrichedSystemPrompt += `\n\n${manualWebContext}`;
    }

    if (model.provider === "gemini") {
        // Gemini: Google Search grounding is enabled unless directMode is set.
        // The user's web search toggle is ignored for Gemini — it handles it natively.
        const enrichedOptions = { ...options, systemPrompt: enrichedSystemPrompt, directMode: options?.directMode };
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            // On the 2nd retry, drop thinkingConfig in case the model doesn't support it
            const attemptOptions = attempt >= 1 && enrichedOptions.directMode
                ? { ...enrichedOptions, directMode: false }
                : enrichedOptions;
            try {
                return await callGeminiStream(model.id, messages, onChunk, attemptOptions);
            } catch (e: any) {
                lastError = e;
                const errMsg = String(e?.message || "");
                if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
                    const waitSec = (attempt + 1) * 3;
                    logger.rateLimit("Gemini", model.id, waitSec);
                    await sleep(waitSec * 1_000);
                    continue;
                }
                if (errMsg.includes("fetch failed") || errMsg.includes("ECONNRESET") || errMsg.includes("ETIMEDOUT")) {
                    logger.warn("Gemini", `Network error (attempt ${attempt + 1}/3), retrying...`);
                    await sleep(1_000);
                    continue;
                }
                throw e;
            }
        }
        // All retries exhausted — fall back to first OpenRouter model
        console.warn(`[Gemini] All retries exhausted, falling back to OpenRouter`);
        const fallbackModel = DEFAULT_MODELS.find(m => m.provider === "openrouter");
        if (fallbackModel) {
            const result = await callOpenRouterStream(fallbackModel.id, messages, onChunk, {
                ...options,
                systemPrompt: enrichedSystemPrompt,
                webSearch: userWantsWebSearch,
            });
            return { content: result.content, sources: result.sources, tokenUsage: result.tokenUsage };
        }
        throw lastError!;
    } else if (model.provider === "groq") {
        // ── Groq ──────────────────────────────────────────────────────
        // Ultra-fast inference via Groq Cloud API (OpenAI-compatible).
        // Native web search is available on Groq compound models.
        const supportsNativeGroqSearch = model.id.includes("groq/compound");
        const useNativeGroqSearch = effectiveWebSearch && supportsNativeGroqSearch;

        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const result = await callGroqStream(model.id, messages, onChunk, {
                    ...options,
                    systemPrompt: enrichedSystemPrompt,
                    webSearch: useNativeGroqSearch,
                    onSearchStatus: onStatus,
                });
                return { 
                    content: result.content, 
                    sources: result.sources.length > 0 ? result.sources : manualWebSources, 
                    tokenUsage: result.tokenUsage 
                };
            } catch (e: any) {
                lastErr = e;
                const msg = String(e?.message || "");
                const isConnErr = msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("UND_ERR_CONNECT_TIMEOUT");
                if (isConnErr && attempt < 2) {
                    logger.warn("Groq", `Connection error attempt ${attempt + 1}/3, retrying in ${(attempt + 1) * 2}s...`);
                    await sleep((attempt + 1) * 2_000);
                    continue;
                }
                if (msg.includes("429") || msg.includes("rate_limit_exceeded")) {
                    // Parse retry-after seconds from Groq error message if available
                    const secMatch = msg.match(/(\d+\.?\d*)\s*s\./i);
                    const retrySec = secMatch ? Math.ceil(parseFloat(secMatch[1])) : (attempt + 1) * 5;
                    logger.rateLimit("Groq", model.id, retrySec);
                    await sleep(Math.min(retrySec * 1_000, 60_000));
                    continue;
                }
            }
        }
        throw lastErr!;
    } else if (model.provider === "grok") {
        // ── Grok (xAI) ─────────────────────────────────────────────
        // Always enable web search via xAI Responses API — the model
        // autonomously decides when to invoke the web_search tool,
        // just like Gemini with Google Search grounding.
        // Status ("searching"/"done") is emitted by the stream handler
        // only when the model actually invokes web search.
        let grokSystemPrompt = enrichedSystemPrompt;

        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const result = await callGrokStream(model.id, messages, onChunk, {
                    ...options,
                    systemPrompt: grokSystemPrompt,
                    webSearch: true, // Always enabled — model auto-decides
                    onSearchStatus: onStatus, // Only emits when model actually searches
                });
                return {
                    content: result.content,
                    sources: result.sources,
                    tokenUsage: result.tokenUsage,
                };
            } catch (e: any) {
                lastErr = e;
                const msg = String(e?.message || "");
                const isConnErr = msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("UND_ERR_CONNECT_TIMEOUT");
                if (isConnErr && attempt < 2) {
                    logger.warn("Grok", `Connection error attempt ${attempt + 1}/3, retrying in ${(attempt + 1) * 2}s...`);
                    await sleep((attempt + 1) * 2_000);
                    continue;
                }
                if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
                    const retrySec = (attempt + 1) * 5;
                    logger.rateLimit("Grok", model.id, retrySec);
                    await sleep(retrySec * 1_000);
                    continue;
                }
                throw e;
            }
        }
        throw lastErr!;
    } else if (model.provider === "anthropic") {
        // ── Anthropic (Claude) ───────────────────────────────────────
        // Attachments are sent natively as multimodal parts.
        // Web search uses Anthropic native web-search tool only.
        let anthropicSystemPrompt = enrichedSystemPrompt;
        if (effectiveWebSearch) {
            const nativeResult = await callAnthropicStream(model.id, messages, onChunk, {
                ...options,
                systemPrompt: anthropicSystemPrompt,
                webSearch: true,
                onSearchStatus: onStatus,
            });
            return {
                content: nativeResult.content,
                sources: nativeResult.sources,
                tokenUsage: nativeResult.tokenUsage,
            };
        }

        const result = await callAnthropicStream(model.id, messages, onChunk, {
            ...options,
            systemPrompt: anthropicSystemPrompt,
        });
        return {
            content: result.content,
            sources: result.sources,
            tokenUsage: result.tokenUsage,
        };
    } else if (model.provider === "openai") {
        // ── OpenAI (Responses API) ────────────────────────────────
        // Supports native multimodal input, web search, and prompt caching usage details.
        const openaiResult = await callOpenAIStream(model.id, messages, onChunk, {
            ...options,
            systemPrompt: enrichedSystemPrompt,
            webSearch: effectiveWebSearch,
            onSearchStatus: onStatus,
        });
        return {
            content: openaiResult.content,
            sources: openaiResult.sources,
            tokenUsage: openaiResult.tokenUsage,
        };
    } else if (model.provider === "bedrock") {
        // ── Amazon Bedrock ─────────────────────────────────────────────
        const result = await callBedrockStream(model.id, messages, onChunk, {
            ...options,
            systemPrompt: enrichedSystemPrompt,
        });
        return {
            content: result.content,
            sources: manualWebSources.length > 0 ? manualWebSources : result.sources,
            tokenUsage: result.tokenUsage,
        };
    } else {
        // ── OpenRouter ──────────────────────────────────────────────
        // Web search via OpenRouter's native `web` plugin when user enables the toggle.
        let finalSystemPrompt = enrichedSystemPrompt;
        if (effectiveWebSearch) onStatus?.("searching", { provider: "openrouter", mode: "plugin-web" });

        const result = await (async () => {
            let lastErr: Error | null = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    return await callOpenRouterStream(model.id, messages, onChunk, {
                        ...options,
                        systemPrompt: finalSystemPrompt,
                        webSearch: effectiveWebSearch,
                    });
                } catch (e: any) {
                    lastErr = e;
                    const msg = String(e?.message || "");
                    const isConnErr = msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("UND_ERR_CONNECT_TIMEOUT");
                    if (isConnErr && attempt < 2) {
                        logger.warn("OpenRouter", `Connection error attempt ${attempt + 1}/3, retrying in ${(attempt + 1) * 2}s...`);
                        await sleep((attempt + 1) * 2_000);
                        continue;
                    }
                    throw e;
                }
            }
            throw lastErr!;
        })();
        if (effectiveWebSearch) onStatus?.("done", { provider: "openrouter", mode: "plugin-web", count: result.sources.length });
        return {
            content: result.content,
            sources: result.sources.length > 0 ? result.sources : manualWebSources,
            tokenUsage: result.tokenUsage,
        };
    }
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

function blendedCostPer1k(model: ModelConfig): number {
    const p = model.pricing;
    if (!p || p.free || (p.inputPerMillion === 0 && p.outputPerMillion === 0)) return 0;
    return (p.inputPerMillion + p.outputPerMillion) / 2000;
}

// ================================
// === Robust JSON Extraction ===
// ================================
function extractJSON(text: string): any {
    // Attempt 1: Try finding JSON object in markdown blocks
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[1]);
        } catch (e) { /* continue */ }
    }

    // Attempt 2: Try finding brace-enclosed object
    const braceMatch = text.match(/(\{[\s\S]*\})/);
    if (braceMatch) {
        try {
            return JSON.parse(braceMatch[1]);
        } catch (e) { /* continue */ }
    }

    // Attempt 3: Extract fields with regex (robust to truncation and newlines)
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const typeMatch = cleaned.match(/"type"\s*:\s*"(casual|specialized|multi|debate)"/);
    const modelIdMatch = cleaned.match(/"modelId"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const indexMatch = cleaned.match(/"modelIndex"\s*:\s*(\d+)/);
    // Use [\s\S] to match newlines, and (?:"|$) to handle truncation
    const reasonMatch = cleaned.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const promptMatch = cleaned.match(/"enhancedPrompt"\s*:\s*"((?:[^"\\]|\\.|[\r\n])*?)(?:"|$)/);

    if (typeMatch) {
        return {
            type: typeMatch[1],
            modelId: modelIdMatch ? modelIdMatch[1] : "",
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
    mainModel: ModelConfig
): Promise<{ type: "casual" | "specialized"; targetModel: ModelConfig | null; reason: string; enhancedPrompt: string }> {

    const rankedByCost = [...models].sort((a, b) => blendedCostPer1k(a) - blendedCostPer1k(b));

    // For non-trivial prompts, use main model to analyze with explicit cost-awareness.
    const routingPrompt = `
You are an advanced AI routing system for a multi-model chat application.
Current router model (for analysis only): ${mainModel.displayName} (id: ${mainModel.id}, provider: ${mainModel.provider}).

Neutrality policy (strict):
- You must be provider-neutral and family-neutral when selecting a target model.
- Do NOT prefer models from your own provider/model family by default.
- Choose only on objective task fit, quality, latency, and cost.
- If you select a model from your own provider/family, it must be because it is objectively best for this specific task.

Your goal is to analyze the user's prompt and determine the best strategy:
1. "casual": For simple greetings, small talk, or general questions (e.g., "Hi", "How are you?", "What is AI?"). Use the main model directly.
2. "specialized": For complex tasks requiring deep reasoning, coding, math, creative writing, or specific domain knowledge. Route to a specialized model.
3. "multi": For subjective topics, controversial questions, or requests for diverse perspectives (e.g., "Is AI good?", "Compare React and Vue"). Route to ALL models.
4. "debate": For requests explicitly asking for a debate or argument between viewpoints.

Routing policy for cost optimization:
- Minimize user cost while preserving quality.
- Prefer lower-cost models for routine requests.
- Use top-tier expensive models only when task complexity clearly requires them.
- If two models can do the task similarly well, pick the cheaper one.
- For real-time/web-heavy tasks, prefer models with strong live web/search capability.
- Prefer strongest top-tier models when the user asks for advanced, highly accurate, complex, or programming-heavy output.
- Prefer cheaper models when the task is simple and high-end capability is not required.

You must also improve the user's prompt ("enhancedPrompt") to be clearer, more detailed, and optimized for LLMs.
For "casual" prompts, keeping the original prompt is usually fine, but you can fix grammar.
For "specialized"/"multi"/"debate", SIGNIFICANTLY enhance the prompt to include context, persona, and specific constraints.

Analyze the following user prompt:
"${prompt}"

Available Models for "specialized" routing:
${models.map((m, i) => `${i + 1}. ${m.displayName} | role=${m.role} | tier=${m.tier ?? 3} | provider=${m.provider} | estCostPer1K=$${blendedCostPer1k(m).toFixed(4)}`).join("\n")}

Cheapest-to-expensive order (for tie-breaking):
${rankedByCost.map((m) => `${m.displayName} ($${blendedCostPer1k(m).toFixed(4)}/1K est)`).join("; ")}

Return a JSON object with this EXACT structure (no markdown):
{
  "type": "casual" | "specialized" | "multi" | "debate",
    "modelId": "exact model id from the list above (required for specialized)",
  "modelIndex": number (1-based index of the best model, only for "specialized"),
    "reason": "Very concise reason (max 1 sentence) for your choice, and mention role fit.",
  "enhancedPrompt": "The fully optimized and detailed version of the user's prompt."
}
`;

    try {
        const response = await callModel(mainModel, [
            { role: "user", content: routingPrompt }
        ], { maxTokens: 4096, temperature: 0.1 });

        console.log(`[Router] Model raw response: ${response.substring(0, 300)} `);

        const analysis = extractJSON(response);
        const parsedType: string = typeof analysis?.type === "string" ? analysis.type : "casual";
        const safeEnhancedPrompt =
            typeof analysis?.enhancedPrompt === "string" && analysis.enhancedPrompt.trim().length > 0
                ? analysis.enhancedPrompt
                : prompt;
        const safeReason = typeof analysis?.reason === "string" && analysis.reason.trim().length > 0
            ? analysis.reason
            : "General routing decision";

        const findByIdOrName = (value: string | undefined): ModelConfig | null => {
            if (!value || !value.trim()) return null;
            const needle = value.trim().toLowerCase();
            return (
                models.find((m) => m.id.toLowerCase() === needle)
                || models.find((m) => m.displayName.toLowerCase() === needle)
                || null
            );
        };

        const byModelId = findByIdOrName(typeof analysis?.modelId === "string" ? analysis.modelId : undefined);
        const hasValidIndex = Number.isInteger(analysis?.modelIndex)
            && analysis.modelIndex > 0
            && analysis.modelIndex <= models.length;
        const indexSelected = hasValidIndex ? models[analysis.modelIndex - 1] : null;
        const selectedModel = byModelId ?? indexSelected;

        if (!selectedModel) {
            throw new Error("Router did not return a valid target model (modelId/modelIndex mismatch)");
        }

        if (parsedType === "specialized") {
            return {
                type: "specialized",
                targetModel: selectedModel,
                reason: safeReason,
                enhancedPrompt: safeEnhancedPrompt,
            };
        }

        return {
            type: "casual",
            targetModel: selectedModel,
            reason: safeReason,
            enhancedPrompt: safeEnhancedPrompt,
        };
    } catch (e) {
        console.error("Routing analysis failed:", e);
        throw e instanceof Error
            ? e
            : new Error("Routing analysis failed with unknown error");
    }
}
