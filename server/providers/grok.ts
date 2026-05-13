// ============================================================
// Grok Provider — xAI Grok-2, Grok-3, Grok-4, etc.
// ============================================================
// Uses the xAI Responses API (/v1/responses) with web_search tool.
// The model autonomously decides when to invoke web search, just
// like Gemini with Google Search grounding.
//
// Set env var  XAI_API_KEY  (or GROK_API_KEY) to activate.
// Add models with provider: "grok" to server/models.json when ready.

import type { WebSource } from "../types";
import * as logger from "../logger";

type GrokContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url?: string; image?: string }
    | { type: string; [key: string]: any };

type GrokMessage = {
    role: string;
    content: string | GrokContentPart[];
};

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

// ── API Endpoints ──────────────────────────────────────────────────────────────
// Responses API for web search (model auto-decides when to search)
const GROK_RESPONSES_URL = "https://api.x.ai/v1/responses";
// Chat Completions API for non-search calls (fallback)
const GROK_CHAT_URL = "https://api.x.ai/v1/chat/completions";

function getApiKey(): string {
    const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.AI_INTEGRATIONS_GROK_API_KEY;
    if (!key) throw new Error("xAI API key not configured — set GROK_API_KEY (or XAI_API_KEY) in your environment");
    return key;
}

// ── Citation / source extraction helpers ───────────────────────────────────────

/** Extract sources from the `citations` array in a Responses API response */
function extractCitations(citations: any[], sources: WebSource[], seenUrls: Set<string>): void {
    if (!Array.isArray(citations)) return;
    for (const cit of citations) {
        const url = typeof cit === "string" ? cit : (cit?.url || cit?.link || cit?.source_url || "");
        if (url && /^https?:\/\//i.test(url) && !seenUrls.has(url)) {
            seenUrls.add(url);
            const title = (typeof cit === "object" && cit?.title) ? cit.title : url;
            sources.push({ title, url });
        }
    }
}

/** Deep-scan any object tree for URL-like fields */
function extractSourcesFromAny(
    payload: any,
    sources: WebSource[],
    seenUrls: Set<string>
): void {
    const queue: any[] = [payload];
    let steps = 0;
    while (queue.length > 0 && steps < 400) {
        const node = queue.shift();
        steps++;
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node)) {
            queue.push(...node);
            continue;
        }

        const url = typeof node.url === "string"
            ? node.url
            : (typeof node.link === "string" ? node.link : (typeof node.source_url === "string" ? node.source_url : ""));
        if (url && /^https?:\/\//i.test(url) && !seenUrls.has(url)) {
            seenUrls.add(url);
            const title = typeof node.title === "string"
                ? node.title
                : (typeof node.name === "string" ? node.name : url);
            sources.push({ title, url });
        }

        for (const v of Object.values(node)) {
            if (v && typeof v === "object") queue.push(v);
        }
    }
}

/** Extract inline URLs from text content as a fallback */
function extractSourcesFromText(content: string, sources: WebSource[], seenUrls: Set<string>): void {
    const matches = content.match(/https?:\/\/[^\s)\]]+/g) || [];
    for (const raw of matches) {
        const url = raw.replace(/[.,;:!?]+$/, "");
        if (!/^https?:\/\//i.test(url) || seenUrls.has(url)) continue;
        seenUrls.add(url);
        sources.push({ title: url, url });
    }
}

/** Extract inline markdown citation links like [[1]](url) from text */
function extractInlineCitations(content: string, sources: WebSource[], seenUrls: Set<string>): void {
    const citationRegex = /\[\[?\d+\]?\]\((https?:\/\/[^\s)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = citationRegex.exec(content)) !== null) {
        const url = match[1].replace(/[.,;:!?]+$/, "");
        if (!seenUrls.has(url)) {
            seenUrls.add(url);
            sources.push({ title: url, url });
        }
    }
}

// ── Convert messages to Responses API input format ─────────────────────────────
function messagesToResponsesInput(
    messages: GrokMessage[],
    systemPrompt?: string
): { input: any[]; instructions?: string } {
    const input: any[] = [];

    for (const msg of messages) {
        if (msg.role === "system") continue; // handled via instructions

        const role = msg.role === "assistant" ? "assistant" : "user";

        if (typeof msg.content === "string") {
            input.push({
                role,
                content: msg.content,
            });
        } else if (Array.isArray(msg.content)) {
            // Convert content parts to Responses API format
            const contentParts: any[] = [];
            for (const part of msg.content) {
                if (part.type === "text" || part.type === "input_text") {
                    contentParts.push({ type: "input_text", text: part.text });
                } else if (part.type === "image_url" && part.image_url?.url) {
                    contentParts.push({ type: "input_image", image_url: part.image_url.url });
                } else if (part.type === "input_image") {
                    const url = part.image_url || part.image;
                    if (url) contentParts.push({ type: "input_image", image_url: url });
                } else if (part.type === "input_file") {
                    const fileData = part.input_file?.file_data || part.input_file?.data;
                    if (fileData) {
                        contentParts.push({ 
                            type: "input_file", 
                            file_data: fileData, 
                            filename: part.input_file?.filename || "upload.file"
                        });
                    }
                } else {
                    // Pass through unknown parts
                    contentParts.push(part);
                }
            }
            input.push({ role, content: contentParts });
        }
    }

    return {
        input,
        instructions: systemPrompt || undefined,
    };
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callGrok(
    modelId: string,
    messages: GrokMessage[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
    }
): Promise<string> {
    if (options?.webSearch) {
        // ── Use Responses API with web_search tool ──
        const { input, instructions } = messagesToResponsesInput(messages, options.systemPrompt);
        const body: any = {
            model: modelId,
            input,
            tools: [{ type: "web_search" }],
            ...(instructions ? { instructions } : {}),
        };

        const response = await fetch(GROK_RESPONSES_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${getApiKey()}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Grok Responses API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        // Extract text from output items
        let text = "";
        if (Array.isArray(data.output)) {
            for (const item of data.output) {
                if (item.type === "message" && Array.isArray(item.content)) {
                    for (const part of item.content) {
                        if (part.type === "output_text") {
                            text += part.text || "";
                        }
                    }
                }
            }
        }
        return text || data.output_text || "";
    }

    // ── Use Chat Completions API (no web search) ──
    const body: any = {
        model: modelId,
        messages: options?.systemPrompt
            ? [{ role: "system", content: options.systemPrompt }, ...messages]
            : messages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
    };

    const response = await fetch(GROK_CHAT_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getApiKey()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

// ── Streaming call ────────────────────────────────────────────────────────────
export async function callGrokStream(
    modelId: string,
    messages: GrokMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
        /** Called when the API actually invokes web search (not every message) */
        onSearchStatus?: (event: string, data: any) => void;
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: TokenUsage }> {

    // ── Web search enabled: use Responses API with streaming ──
    if (options?.webSearch) {
        return callGrokResponsesStream(modelId, messages, onChunk, options);
    }

    // ── No web search: use Chat Completions API with streaming ──
    return callGrokChatStream(modelId, messages, onChunk, options);
}

// ── Responses API Streaming (with web_search) ─────────────────────────────────
async function callGrokResponsesStream(
    modelId: string,
    messages: GrokMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        onSearchStatus?: (event: string, data: any) => void;
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: TokenUsage }> {
    const { input, instructions } = messagesToResponsesInput(messages, options?.systemPrompt);

    const body: any = {
        model: modelId,
        input,
        tools: [{ type: "web_search" }],
        stream: true,
        ...(instructions ? { instructions } : {}),
    };

    logger.ok("Grok", `${logger.colorModel(modelId)} using Responses API with web_search tool (streaming)`);

    const response = await fetch(GROK_RESPONSES_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getApiKey()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000), // Web search can take longer
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok Responses API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let tokenUsage: TokenUsage | undefined;
    const sources: WebSource[] = [];
    const seenUrls = new Set<string>();
    let searchWasUsed = false; // Track if model actually searched

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;

            // Handle SSE event types
            if (trimmed.startsWith("event:")) continue; // Skip event type lines

            if (!trimmed.startsWith("data: ")) continue;

            try {
                const data = JSON.parse(trimmed.slice(6));
                const eventType = data.type || "";

                // ── Text content delta ──
                if (eventType === "response.output_text.delta") {
                    const text = data.delta || "";
                    if (text) {
                        onChunk(text);
                        fullContent += text;
                    }
                }

                // ── Web search call detected mid-stream ──
                // The API emits this when the model decides to search BEFORE results arrive
                if (eventType === "response.output_item.added" && data.item?.type === "web_search_call") {
                    if (!searchWasUsed) {
                        options?.onSearchStatus?.("searching", { provider: "grok", mode: "builtin" });
                    }
                    searchWasUsed = true;
                    logger.ok("Grok", `Web search initiated mid-stream`);
                }

                // ── Output text done (may contain final text) ──
                if (eventType === "response.output_text.done") {
                    // The full text is in data.text but we've already streamed it
                }

                // ── Response completed — extract citations and usage ──
                if (eventType === "response.completed") {
                    const resp = data.response || data;

                    // Extract citations from the response
                    if (Array.isArray(resp.citations)) {
                        extractCitations(resp.citations, sources, seenUrls);
                    }

                    // Extract sources from output items
                    if (Array.isArray(resp.output)) {
                        for (const item of resp.output) {
                            // Check for web_search_call results
                            if (item.type === "web_search_call") {
                                if (!searchWasUsed) {
                                    // First search detected — notify UI
                                    options?.onSearchStatus?.("searching", { provider: "grok", mode: "builtin" });
                                }
                                searchWasUsed = true;
                                logger.ok("Grok", `Web search executed: ${item.id || "search"}`);
                            }

                            // Check message content for annotations/citations
                            if (item.type === "message" && Array.isArray(item.content)) {
                                for (const part of item.content) {
                                    if (part.type === "output_text") {
                                        // Check for annotations in the text part
                                        if (Array.isArray(part.annotations)) {
                                            for (const ann of part.annotations) {
                                                if (ann.type === "url_citation" && ann.url) {
                                                    if (!seenUrls.has(ann.url)) {
                                                        seenUrls.add(ann.url);
                                                        sources.push({ title: ann.title || ann.url, url: ann.url });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Extract token usage
                    const usage = resp.usage;
                    if (usage) {
                        tokenUsage = {
                            promptTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
                            completionTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
                            totalTokens: usage.total_tokens ??
                                ((usage.input_tokens ?? usage.prompt_tokens ?? 0) +
                                 (usage.output_tokens ?? usage.completion_tokens ?? 0)),
                        };
                    }
                }

                // ── Handle Chat Completions format as fallback ──
                // Some models may still return in the old format
                if (data.choices) {
                    const delta = data.choices[0]?.delta ?? {};
                    const text: string = delta.content || "";
                    if (text) {
                        onChunk(text);
                        fullContent += text;
                    }

                    // Extract annotations from delta
                    const annotations: any[] = delta.annotations || [];
                    for (const ann of annotations) {
                        if (ann.type === "url_citation" && ann.url_citation?.url) {
                            const url: string = ann.url_citation.url;
                            if (!seenUrls.has(url)) {
                                seenUrls.add(url);
                                sources.push({ title: ann.url_citation.title || url, url });
                            }
                        }
                        if (ann.type === "citation" && ann.url) {
                            const url: string = ann.url;
                            if (!seenUrls.has(url)) {
                                seenUrls.add(url);
                                sources.push({ title: ann.title || url, url });
                            }
                        }
                    }

                    // Usage from chat completions format
                    if (data.usage && !tokenUsage) {
                        tokenUsage = {
                            promptTokens: data.usage.prompt_tokens ?? 0,
                            completionTokens: data.usage.completion_tokens ?? 0,
                            totalTokens: data.usage.total_tokens ?? 0,
                        };
                    }
                }

                // Deep scan for any sources in unexpected locations
                extractSourcesFromAny(data.search_results, sources, seenUrls);
                extractSourcesFromAny(data.web_results, sources, seenUrls);

            } catch {
                // skip malformed lines
            }
        }
    }

    // Log token usage
    if (tokenUsage) {
        logger.tokenLog("Grok", modelId, tokenUsage.promptTokens, tokenUsage.completionTokens, tokenUsage.totalTokens);
    } else {
        logger.warn("Grok", `${logger.colorModel(modelId)} — API returned no token usage`);
    }

    // Extract inline citations from content if no structured sources found
    if (sources.length === 0) {
        extractInlineCitations(fullContent, sources, seenUrls);
    }

    // Final fallback: extract raw URLs from text
    if (sources.length === 0) {
        extractSourcesFromText(fullContent, sources, seenUrls);
        if (sources.length > 0) {
            logger.ok("Grok", `${logger.colorModel(modelId)} extracted ${logger.colorValue(sources.length)} URL sources from final content`);
        }
    } else {
        logger.ok("Grok", `${logger.colorModel(modelId)} extracted ${logger.colorValue(sources.length)} web sources`);
    }

    // Emit "done" status only if the model actually searched
    if (searchWasUsed) {
        options?.onSearchStatus?.("done", { provider: "grok", mode: "builtin", count: sources.length });
    }

    return { content: fullContent, sources, tokenUsage };
}

// ── Chat Completions Streaming (no web search) ────────────────────────────────
async function callGrokChatStream(
    modelId: string,
    messages: GrokMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: TokenUsage }> {
    const body: any = {
        model: modelId,
        messages: options?.systemPrompt
            ? [{ role: "system", content: options.systemPrompt }, ...messages]
            : messages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true },
    };

    const response = await fetch(GROK_CHAT_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getApiKey()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let tokenUsage: TokenUsage | undefined;
    const sources: WebSource[] = [];
    const seenUrls = new Set<string>();

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
                const delta = data.choices?.[0]?.delta ?? {};
                const text: string = delta.content || "";
                if (text) {
                    onChunk(text);
                    fullContent += text;
                }

                if (data.usage && (data.usage.total_tokens > 0 || data.usage.prompt_tokens > 0 || data.usage.completion_tokens > 0)) {
                    tokenUsage = {
                        promptTokens: data.usage.prompt_tokens ?? 0,
                        completionTokens: data.usage.completion_tokens ?? 0,
                        totalTokens: data.usage.total_tokens ?? ((data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0)),
                    };
                }
            } catch {
                // skip malformed lines
            }
        }
    }

    if (tokenUsage) {
        logger.tokenLog("Grok", modelId, tokenUsage.promptTokens, tokenUsage.completionTokens, tokenUsage.totalTokens);
    } else {
        logger.warn("Grok", `${logger.colorModel(modelId)} — API returned no token usage`);
    }

    return { content: fullContent, sources, tokenUsage };
}
