// ============================================================
// OpenAI Provider — GPT family via Responses API
// ============================================================

import type { WebSource } from "../types";

type OpenAIContentPart =
    | { type: "text"; text: string }
    | { type: "input_text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    | { type: "input_image"; image_url?: string; image?: string }
    | { type: "input_file"; input_file?: { file_data?: string; data?: string; filename?: string; mime_type?: string } }
    | { type: "file"; file?: { file_data?: string; data?: string; filename?: string; mime_type?: string } }
    | { type: string; [key: string]: any };

type OpenAIMessage = {
    role: string;
    content: string | OpenAIContentPart[];
};

interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedPromptTokens?: number;
}

function getApiKey(): string {
    const key = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!key) {
        throw new Error("OpenAI API key not configured — set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY");
    }
    return key;
}

function getBaseUrl(): string {
    const raw = process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
    return raw.replace(/\/+$/, "");
}

function apiUrl(path: string): string {
    const base = getBaseUrl();
    if (/\/v\d+$/.test(base)) {
        return `${base}${path}`;
    }
    return `${base}/v1${path}`;
}

function openaiModelSupportsTemperature(modelId: string): boolean {
    const id = modelId.toLowerCase();
    // Some newer OpenAI models reject temperature entirely (ex: GPT-5.x).
    // In those cases, omit the parameter instead of sending a default.
    if (id.startsWith("gpt-5")) return false;
    return true;
}

function toResponsesInput(messages: OpenAIMessage[]): any[] {
    const input: any[] = [];

    for (const message of messages) {
        const role = message.role === "assistant" ? "assistant" : "user";
        const textType = role === "assistant" ? "output_text" : "input_text";
        if (typeof message.content === "string") {
            input.push({ role, content: [{ type: textType, text: message.content }] });
            continue;
        }

        const contentParts: any[] = [];
        for (const part of message.content) {
            if (part.type === "text" || part.type === "input_text") {
                if (typeof part.text === "string" && part.text.length > 0) {
                    contentParts.push({ type: textType, text: part.text });
                }
                continue;
            }

            if (part.type === "image_url" && part.image_url?.url) {
                contentParts.push({ type: "input_image", image_url: part.image_url.url });
                continue;
            }

            if (part.type === "input_image") {
                const url = part.image_url || part.image;
                if (typeof url === "string" && url.length > 0) {
                    contentParts.push({ type: "input_image", image_url: url });
                }
                continue;
            }

            const fileData = part.type === "input_file"
                ? (part.input_file?.file_data || part.input_file?.data)
                : (part.type === "file" ? (part.file?.file_data || part.file?.data) : undefined);

            if (typeof fileData === "string" && fileData.length > 0) {
                const filePart = part as any;
                contentParts.push({
                    type: "input_file",
                    file_data: fileData,
                    filename: part.type === "input_file" ? part.input_file?.filename : filePart.file?.filename,
                });
            }
        }

        input.push({ role, content: contentParts.length > 0 ? contentParts : [{ type: textType, text: "" }] });
    }

    return input;
}

function extractTextFromResponse(data: any): string {
    if (typeof data?.output_text === "string" && data.output_text.length > 0) {
        return data.output_text;
    }

    if (!Array.isArray(data?.output)) return "";
    return data.output
        .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
        .filter((part: any) => part?.type === "output_text" && typeof part?.text === "string")
        .map((part: any) => part.text)
        .join("");
}

function extractTokenUsage(data: any): TokenUsage | undefined {
    const usage = data?.usage;
    if (!usage || typeof usage !== "object") return undefined;

    const promptTokens = usage.input_tokens ?? 0;
    const completionTokens = usage.output_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
    const cachedPromptTokens = usage.input_tokens_details?.cached_tokens ?? 0;

    if (promptTokens <= 0 && completionTokens <= 0 && totalTokens <= 0) return undefined;
    return {
        promptTokens,
        completionTokens,
        totalTokens,
        cachedPromptTokens: cachedPromptTokens > 0 ? cachedPromptTokens : undefined,
    };
}

function addSource(sources: WebSource[], seenUrls: Set<string>, title: string, url: string): void {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    sources.push({ title: title || url, url });
}

function addSourcesFromUnknown(node: any, sources: WebSource[], seenUrls: Set<string>): void {
    if (!node || typeof node !== "object") return;

    if (typeof node.url === "string" && /^https?:\/\//i.test(node.url)) {
        const title = typeof node.title === "string" && node.title ? node.title : node.url;
        addSource(sources, seenUrls, title, node.url);
    }

    // OpenAI web_search can return feed sources without URL, like { type: "api", name: "oai-finance" }.
    if (node.type === "api" && typeof node.name === "string") {
        const feedUrl = `https://platform.openai.com/docs/guides/tools-web-search#sources`;
        addSource(sources, seenUrls, `${node.name} (OpenAI web source)`, feedUrl);
    }

    // Keep query trace as a clickable fallback source when URL citations are absent.
    if (Array.isArray(node.queries)) {
        for (const q of node.queries) {
            if (typeof q !== "string" || !q.trim()) continue;
            const u = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
            addSource(sources, seenUrls, `Search query: ${q}`, u);
        }
    }
    if (typeof node.query === "string" && node.query.trim()) {
        const u = `https://www.google.com/search?q=${encodeURIComponent(node.query)}`;
        addSource(sources, seenUrls, `Search query: ${node.query}`, u);
    }

    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            for (const item of value) addSourcesFromUnknown(item, sources, seenUrls);
        } else if (value && typeof value === "object") {
            addSourcesFromUnknown(value, sources, seenUrls);
        }
    }
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callOpenAI(
    modelId: string,
    messages: OpenAIMessage[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
    }
): Promise<string> {
    const body: any = {
        model: modelId,
        input: toResponsesInput(messages),
        max_output_tokens: options?.maxTokens || 4096,
        ...(options?.systemPrompt ? { instructions: options.systemPrompt } : {}),
        ...(options?.webSearch
            ? {
                tools: [{ type: "web_search", external_web_access: true }],
                tool_choice: "auto",
            }
            : {}),
    };
    if (openaiModelSupportsTemperature(modelId) && options?.temperature !== undefined) {
        body.temperature = options.temperature;
    }

    const response = await fetch(apiUrl("/responses"), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getApiKey()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return extractTextFromResponse(data);
}

// ── Streaming call ────────────────────────────────────────────────────────────
export async function callOpenAIStream(
    modelId: string,
    messages: OpenAIMessage[],
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
        input: toResponsesInput(messages),
        max_output_tokens: options?.maxTokens || 4096,
        stream: true,
        include: ["web_search_call.action.sources"],
        ...(options?.systemPrompt ? { instructions: options.systemPrompt } : {}),
    };
    if (openaiModelSupportsTemperature(modelId) && options?.temperature !== undefined) {
        body.temperature = options.temperature;
    }

    if (options?.webSearch) {
        body.tools = [{ type: "web_search", external_web_access: true }];
        body.tool_choice = "auto";
    }

    const response = await fetch(apiUrl("/responses"), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getApiKey()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: options?.abortSignal ?? AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let tokenUsage: TokenUsage | undefined;
    let searchStarted = false;

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
            if (!trimmed || trimmed === "data: [DONE]" || trimmed.startsWith("event:")) continue;
            if (!trimmed.startsWith("data: ")) continue;

            try {
                const data = JSON.parse(trimmed.slice(6));
                const type = data?.type;

                if (type === "response.output_text.delta") {
                    const text: string = typeof data?.delta === "string" ? data.delta : "";
                    if (text) {
                        onChunk(text);
                        fullContent += text;
                    }
                }

                if (
                    options?.webSearch &&
                    !searchStarted &&
                    (type === "response.output_item.added" || type === "response.output_item.in_progress") &&
                    data?.item?.type === "web_search_call"
                ) {
                    searchStarted = true;
                    options.onSearchStatus?.("searching", { provider: "openai", mode: "native-web-search" });
                }

                addSourcesFromUnknown(data, sources, seenUrls);

                const maybeUsage = extractTokenUsage(data?.response || data);
                if (maybeUsage) tokenUsage = maybeUsage;
            } catch {
                // Skip malformed stream chunks.
            }
        }
    }

    if (options?.webSearch && searchStarted) {
        options.onSearchStatus?.("done", { provider: "openai", mode: "native-web-search", count: sources.length });
    }

    return { content: fullContent, sources, tokenUsage };
}
