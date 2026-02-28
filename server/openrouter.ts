// OpenRouter + Gemini API integration for multi-model AI aggregation
// Model definitions are in server/models.json — edit that file to add/change models.
import { GoogleGenAI } from "@google/genai";
import modelsJson from "./models.json";

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

export type ModelProvider = "gemini" | "openrouter" | "openai" | "anthropic" | "grok";

export interface ModelConfig {
    id: string;
    displayName: string;
    role: string;
    systemPrompt: string;
    /** URL to the local brand icon image (served from /icons/) */
    iconUrl?: string;
    color: string;
    provider: ModelProvider;
}

// ─── Load model registry from models.json ───────────────────────────────────
// To add a new model, edit server/models.json only — no code changes needed.
export const DEFAULT_MODELS: ModelConfig[] = modelsJson.models as ModelConfig[];
export const DEFAULT_MAIN_MODEL_ID: string = modelsJson.defaultMainModelId;

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
// === Gemini Native Streaming ===
// ================================
async function callGeminiStream(
    modelId: string,
    messages: { role: string; content: string }[],
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
        parts: [{ text: m.content }],
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
        const text: string = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
    messages: { role: string; content: string }[],
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
        model: modelId,
        messages: options?.systemPrompt
            ? [{ role: "system", content: options.systemPrompt }, ...messages]
            : messages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
        // Request usage stats in streaming response
        stream_options: { include_usage: true },
    };
    // Add web search plugin when enabled
    if (options?.webSearch) {
        body.plugins = [{ id: "web", max_results: 5 }];
    }

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
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        onStatus?: (event: string, data: any) => void;
        webSearch?: boolean; // User-toggled web search — only affects OpenRouter
        directMode?: boolean; // Bypass routing formatting; respond naturally
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: TokenUsage }> {
    const onStatus = options?.onStatus;
    const userWantsWebSearch = options?.webSearch === true;

    // Inject current date into the system prompt so the model knows "today"
    const dateContext = getDateContext();
    const enrichedSystemPrompt = options?.systemPrompt
        ? `${options.systemPrompt}\n\n${dateContext}`
        : dateContext;

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
                    console.warn(`[Gemini] Rate limited (attempt ${attempt + 1}/3), waiting before retry...`);
                    await sleep((attempt + 1) * 3_000);
                    continue;
                }
                if (errMsg.includes("fetch failed") || errMsg.includes("ECONNRESET") || errMsg.includes("ETIMEDOUT")) {
                    console.warn(`[Gemini] Network error (attempt ${attempt + 1}/3), retrying...`);
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
            // If user enabled web search, use our DDG pipeline for the fallback
            const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
            let webSources: WebSource[] = [];
            let finalSystemPrompt = enrichedSystemPrompt;
            if (userWantsWebSearch) {
                const { context: webCtx, sources } = await fetchWebContext(lastUserMsg, onStatus);
                webSources = sources;
                if (webCtx) {
                    finalSystemPrompt += `\n\n${webCtx}\n\nThe above are fresh web search results. Use them to answer the user's question. For factual, numerical, or time-sensitive claims, prefer these results. Cite sources when you use them.`;
                }
            }
            const result = await callOpenRouterStream(fallbackModel.id, messages, onChunk, {
                ...options,
                systemPrompt: finalSystemPrompt,
                webSearch: false, // We injected context manually
            });
            return { content: result.content, sources: [...webSources, ...result.sources], tokenUsage: result.tokenUsage };
        }
        throw lastError!;
    } else {
        // ── OpenRouter ──────────────────────────────────────────────
        // Web search ONLY when user explicitly enabled it via the toggle.
        // Uses our DDG scraping pipeline to fetch real page content.
        const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
        let webSources: WebSource[] = [];
        let finalSystemPrompt = enrichedSystemPrompt;

        if (userWantsWebSearch) {
            console.log(`[WebSearch] User enabled web search for OpenRouter query: "${lastUserMsg.substring(0, 60)}"`);
            const { context: webCtx, sources } = await fetchWebContext(lastUserMsg, onStatus);
            webSources = sources;
            if (webCtx) {
                finalSystemPrompt += `\n\n${webCtx}\n\nThe above are fresh web search results. Use them to answer the user's question. For factual, numerical, or time-sensitive claims, prefer these results over your training data. Cite sources when you use them.`;
            }
        }

        const result = await (async () => {
            let lastErr: Error | null = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    return await callOpenRouterStream(model.id, messages, onChunk, {
                        ...options,
                        systemPrompt: finalSystemPrompt,
                        webSearch: false,
                    });
                } catch (e: any) {
                    lastErr = e;
                    const msg = String(e?.message || "");
                    const isConnErr = msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("UND_ERR_CONNECT_TIMEOUT");
                    if (isConnErr && attempt < 2) {
                        console.warn(`[OpenRouter] Connection error attempt ${attempt + 1}/3, retrying in ${(attempt + 1) * 2}s...`);
                        await sleep((attempt + 1) * 2_000);
                        continue;
                    }
                    throw e;
                }
            }
            throw lastErr!;
        })();
        return {
            content: result.content,
            sources: webSources.length > 0 ? webSources : result.sources,
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
    const indexMatch = cleaned.match(/"modelIndex"\s*:\s*(\d+)/);
    // Use [\s\S] to match newlines, and (?:"|$) to handle truncation
    const reasonMatch = cleaned.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const promptMatch = cleaned.match(/"enhancedPrompt"\s*:\s*"((?:[^"\\]|\\.|[\r\n])*?)(?:"|$)/);

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
    mainModel: ModelConfig
): Promise<{ type: "casual" | "specialized"; targetModel: ModelConfig | null; reason: string; enhancedPrompt: string }> {

    // ⚡ INSTANT casual detection — no API call needed
    if (isObviouslyCasual(prompt)) {
        console.log(`[Router] Instant casual detection: "${prompt.substring(0, 50)}"`);
        return {
            type: "casual",
            targetModel: mainModel, // User-selected model
            reason: `Casual/greeting — ${mainModel.displayName} answers directly`,
            enhancedPrompt: prompt, // No enhancement needed for casual
        };
    }

    // For non-trivial prompts, use Gemini to analyze
    const routingPrompt = `
You are an advanced AI routing system for a multi-model chat application.
Your goal is to analyze the user's prompt and determine the best strategy:
1. "casual": For simple greetings, small talk, or general questions (e.g., "Hi", "How are you?", "What is AI?"). Use the main model directly.
2. "specialized": For complex tasks requiring deep reasoning, coding, math, creative writing, or specific domain knowledge. Route to a specialized model.
3. "multi": For subjective topics, controversial questions, or requests for diverse perspectives (e.g., "Is AI good?", "Compare React and Vue"). Route to ALL models.
4. "debate": For requests explicitly asking for a debate or argument between viewpoints.

You must also improve the user's prompt ("enhancedPrompt") to be clearer, more detailed, and optimized for LLMs.
For "casual" prompts, keeping the original prompt is usually fine, but you can fix grammar.
For "specialized"/"multi"/"debate", SIGNIFICANTLY enhance the prompt to include context, persona, and specific constraints.

Analyze the following user prompt:
"${prompt}"

Available Models for "specialized" routing:
${models.map((m, i) => `${i + 1}. ${m.displayName} (${m.role})`).join("\n")}

Return a JSON object with this EXACT structure (no markdown):
{
  "type": "casual" | "specialized" | "multi" | "debate",
  "modelIndex": number (1-based index of the best model, only for "specialized"),
  "reason": "Very concise reason (max 1 sentence) for your choice.",
  "enhancedPrompt": "The fully optimized and detailed version of the user's prompt."
}
`;

    try {
        const response = await callModel(mainModel, [
            { role: "user", content: routingPrompt }
        ], { maxTokens: 4096, temperature: 0.1 });

        console.log(`[Router] Model raw response: ${response.substring(0, 300)} `);

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
            targetModel: mainModel,
            reason: analysis.reason || "General/casual query",
            enhancedPrompt: prompt, // No enhancement for casual
        };
    } catch (e) {
        console.error("Routing analysis failed:", e);
        return {
            type: "casual",
            targetModel: mainModel,
            reason: `Routing failed, using default ${mainModel.displayName}`,
            enhancedPrompt: prompt,
        };
    }
}
