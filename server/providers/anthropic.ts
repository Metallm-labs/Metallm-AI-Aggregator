// ============================================================
// Anthropic Provider — Claude family models (Messages API)
// ============================================================
// Requires env var: ANTHROPIC_API_KEY

import type { WebSource } from "../types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_WEB_SEARCH_TOOL_TYPE = "web_search_20260209";

function anthropicModelSupportsTemperature(modelId: string): boolean {
    const normalized = modelId.trim().toLowerCase();

    // Newer Claude 4.x variants reject the temperature parameter entirely.
    if (
        normalized.includes("claude-opus-4") ||
        normalized.includes("claude-sonnet-4") ||
        normalized.includes("claude-haiku-4")
    ) {
        return false;
    }

    return true;
}

interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

type ChatMessagePart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url?: string; image?: string }
    | { type: "input_file"; input_file?: { file_data?: string; data?: string; filename?: string; mime_type?: string } }
    | { type: "file"; file?: { file_data?: string; data?: string; filename?: string; mime_type?: string } }
    | { type: string; [key: string]: any };

interface ChatMessage {
    role: string;
    content: string | ChatMessagePart[];
}

type AnthropicContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    | {
        type: "document";
        title?: string;
        source: { type: "base64"; media_type: string; data: string };
      };

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    return { mediaType: m[1], data: m[2] };
}

function toAnthropicContent(content: string | ChatMessagePart[]): AnthropicContentBlock[] {
    if (typeof content === "string") {
        return [{ type: "text", text: content }];
    }

    const out: AnthropicContentBlock[] = [];
    for (const part of content) {
        if (part.type === "text" || part.type === "input_text") {
            if (typeof part.text === "string" && part.text.length > 0) {
                out.push({ type: "text", text: part.text });
            }
            continue;
        }

        const imageUrl = part.type === "image_url"
            ? part.image_url?.url
            : (part.type === "input_image" ? (part.image_url || part.image) : undefined);

        if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
            const parsed = parseDataUrl(imageUrl);
            if (parsed && parsed.mediaType.startsWith("image/")) {
                out.push({
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: parsed.mediaType,
                        data: parsed.data,
                    },
                });
            }
            continue;
        }

        const fileDataUrl = part.type === "input_file"
            ? (part.input_file?.file_data || part.input_file?.data)
            : (part.type === "file" ? (part.file?.file_data || part.file?.data) : undefined);

        if (typeof fileDataUrl !== "string" || !fileDataUrl.startsWith("data:")) continue;
        const parsed = parseDataUrl(fileDataUrl);
        if (!parsed) continue;

        const filename = part.type === "input_file"
            ? part.input_file?.filename
            : (part.type === "file" ? part.file?.filename : undefined);

        if (parsed.mediaType.startsWith("image/")) {
            out.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: parsed.mediaType,
                    data: parsed.data,
                },
            });
        } else {
            out.push({
                type: "document",
                ...(filename ? { title: filename } : {}),
                source: {
                    type: "base64",
                    media_type: parsed.mediaType,
                    data: parsed.data,
                },
            });
        }
    }

    return out.length > 0 ? out : [{ type: "text", text: "" }];
}

function normalizeAnthropicMessages(messages: ChatMessage[]): Array<{ role: "user" | "assistant"; content: AnthropicContentBlock[] }> {
    const normalized: Array<{ role: "user" | "assistant"; content: AnthropicContentBlock[] }> = [];

    for (const msg of messages) {
        const role = msg.role === "assistant" ? "assistant" : (msg.role === "user" ? "user" : null);
        if (!role) continue;
        normalized.push({ role, content: toAnthropicContent(msg.content) });
    }

    return normalized;
}

function extractTextFromAnthropicContent(content: any): string {
    if (!Array.isArray(content)) return "";
    return content
        .filter((c) => c?.type === "text" && typeof c?.text === "string")
        .map((c) => c.text)
        .join("");
}

function getApiKey(): string {
    const key =
        process.env.ANTHROPIC_API_KEY ||
        process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||
        process.env["AI-INTEGRATIONS-ANTHROPIC-API-KEY"];
    if (!key) {
        throw new Error(
            "Anthropic API key not configured — set ANTHROPIC_API_KEY or AI_INTEGRATIONS_ANTHROPIC_API_KEY"
        );
    }
    return key;
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callAnthropic(
    modelId: string,
    messages: ChatMessage[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
    const body: any = {
        model: modelId,
        messages: normalizeAnthropicMessages(messages),
        max_tokens: options?.maxTokens || 4096,
        ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
    };

    if (anthropicModelSupportsTemperature(modelId) && options?.temperature !== undefined) {
        body.temperature = options.temperature;
    }

    const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
            "x-api-key": getApiKey(),
            "anthropic-version": ANTHROPIC_VERSION,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return extractTextFromAnthropicContent(data.content);
}

// ── Streaming call ────────────────────────────────────────────────────────────
export async function callAnthropicStream(
    modelId: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
        onSearchStatus?: (event: "searching" | "done", data?: any) => void;
        abortSignal?: AbortSignal;
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: TokenUsage }> {
    const body: any = {
        model: modelId,
        messages: normalizeAnthropicMessages(messages),
        max_tokens: options?.maxTokens || 4096,
        stream: true,
        ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
    };

    if (anthropicModelSupportsTemperature(modelId) && options?.temperature !== undefined) {
        body.temperature = options.temperature;
    }

    if (options?.webSearch) {
        // Anthropic native web search tool (latest version).
        body.tools = [{
            type: ANTHROPIC_WEB_SEARCH_TOOL_TYPE,
            name: "web_search",
            max_uses: 5,
            // Allow direct model invocation without code_execution wrapper.
            allowed_callers: ["direct"],
        }];
        // Keep tool available; model decides when search is needed.
        body.tool_choice = { type: "auto" };
    }

    const headers: Record<string, string> = {
        "x-api-key": getApiKey(),
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
    };

    const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: options?.abortSignal ?? AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    const sources: WebSource[] = [];
    const seenUrls = new Set<string>();
    let emittedSearching = false;
    let inputTokens = 0;
    let cacheCreationInputTokens = 0;
    let cacheReadInputTokens = 0;
    let outputTokens = 0;

    const addSource = (title: string | undefined, url: string | undefined) => {
        if (typeof url !== "string" || !url) return;
        if (seenUrls.has(url)) return;
        seenUrls.add(url);
        sources.push({ title: title || url, url });
    };

    const extractSourcesFromUnknown = (node: any) => {
        if (!node || typeof node !== "object") return;
        if (typeof node.url === "string") {
            addSource(typeof node.title === "string" ? node.title : undefined, node.url);
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                for (const item of value) extractSourcesFromUnknown(item);
            } else if (value && typeof value === "object") {
                extractSourcesFromUnknown(value);
            }
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("event:")) continue;
            if (!trimmed.startsWith("data: ")) continue;
            try {
                const data = JSON.parse(trimmed.slice(6));
                const eventType = data?.type;
                if (
                    options?.webSearch &&
                    !emittedSearching &&
                    (eventType === "content_block_start" || eventType === "content_block_delta")
                ) {
                    const blockType = data?.content_block?.type || data?.delta?.type;
                    const blockName = data?.content_block?.name || data?.delta?.name;
                    const looksLikeSearch =
                        (typeof blockType === "string" && blockType.toLowerCase().includes("web_search")) ||
                        (blockType === "server_tool_use" && blockName === "web_search");
                    if (looksLikeSearch) {
                        options.onSearchStatus?.("searching", { provider: "anthropic", mode: "native-web-search" });
                        emittedSearching = true;
                    }
                }

                const text: string =
                    (data.delta?.type === "text_delta" ? data.delta?.text : "") ||
                    data.delta?.text ||
                    "";
                if (text) {
                    onChunk(text);
                    fullContent += text;
                }

                extractSourcesFromUnknown(data);

                // Anthropic usage data can appear on different stream events.
                // Keep the latest/highest values so totals stay accurate.
                const usage = data?.message?.usage || data?.usage;
                if (usage && typeof usage === "object") {
                    if (typeof usage.input_tokens === "number") {
                        inputTokens = Math.max(inputTokens, usage.input_tokens);
                    }
                    if (typeof usage.cache_creation_input_tokens === "number") {
                        cacheCreationInputTokens = Math.max(cacheCreationInputTokens, usage.cache_creation_input_tokens);
                    }
                    if (typeof usage.cache_read_input_tokens === "number") {
                        cacheReadInputTokens = Math.max(cacheReadInputTokens, usage.cache_read_input_tokens);
                    }
                    if (typeof usage.output_tokens === "number") {
                        outputTokens = Math.max(outputTokens, usage.output_tokens);
                    }
                }

                if (options?.webSearch && eventType === "message_stop") {
                    options.onSearchStatus?.("done", {
                        provider: "anthropic",
                        mode: "native-web-search",
                        count: sources.length,
                    });
                }
            } catch {
                // skip malformed lines
            }
        }
    }

    if (options?.webSearch && emittedSearching) {
        options.onSearchStatus?.("done", {
            provider: "anthropic",
            mode: "native-web-search",
            count: sources.length,
        });
    }

    const promptTokens = inputTokens + cacheCreationInputTokens + cacheReadInputTokens;
    const completionTokens = outputTokens;
    const totalTokens = promptTokens + completionTokens;
    const tokenUsage = totalTokens > 0
        ? { promptTokens, completionTokens, totalTokens }
        : undefined;

    return { content: fullContent, sources, tokenUsage };
}
