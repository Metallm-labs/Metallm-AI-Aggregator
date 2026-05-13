// ============================================================
// OpenRouter Provider — universal access to 200+ open-source models
// ============================================================
import type { WebSource } from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getOpenRouterRequestModelId(modelId: string, webSearch?: boolean): string {
    if (!webSearch) return modelId;
    return modelId.includes(":online") ? modelId : `${modelId}:online`;
}

type OpenRouterContentPart =
    | { type: "text"; text: string }
    | { type: "input_text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    | { type: "input_image"; image_url?: string; image?: string }
    | { type: "input_file"; input_file?: { file_data?: string; data?: string; filename?: string; mime_type?: string } }
    | { type: "file"; file?: { file_data?: string; data?: string; filename?: string; mime_type?: string } }
    | { type: string; [key: string]: any };

type OpenRouterMessage = {
    role: string;
    content: string | OpenRouterContentPart[];
};

function normalizeOpenRouterContent(content: string | OpenRouterContentPart[]): string | Array<{ type: string; [key: string]: any }> {
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

        if (part.type === "input_file") {
            const file = part.input_file;
            const fileData = file?.file_data || file?.data;
            if (typeof fileData === "string" && fileData.length > 0) {
                parts.push({
                    type: "file",
                    file: {
                        file_data: fileData,
                        filename: file?.filename,
                        mime_type: file?.mime_type,
                    },
                });
            }
            continue;
        }

        if (part.type === "file" && part.file) {
            parts.push(part as any);
        }
    }

    if (parts.length === 0) return "";
    return parts;
}

function normalizeOpenRouterMessages(messages: OpenRouterMessage[]): OpenRouterMessage[] {
    return messages.map((m) => ({
        role: m.role,
        content: normalizeOpenRouterContent(m.content),
    }));
}

function getApiKey(): string {
    const key = process.env["AI-INTEGRATIONS-OPEN-ROUTER-API-KEY"];
    if (!key) throw new Error("OpenRouter API key not configured");
    return key;
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callOpenRouter(
    modelId: string,
    messages: OpenRouterMessage[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
        abortSignal?: AbortSignal;
    }
): Promise<string> {
    const body: any = {
        model: getOpenRouterRequestModelId(modelId, options?.webSearch),
        messages: options?.systemPrompt
            ? normalizeOpenRouterMessages([{ role: "system", content: options.systemPrompt }, ...messages])
            : normalizeOpenRouterMessages(messages),
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
    };

    const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getApiKey()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Metallm AI Aggregator",
        },
        body: JSON.stringify(body),
        signal: options?.abortSignal ?? AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

// ── Streaming call ────────────────────────────────────────────────────────────
export async function callOpenRouterStream(
    modelId: string,
    messages: OpenRouterMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
    }
): Promise<{ content: string; sources: WebSource[] }> {
    const body: any = {
        // OpenRouter documents `:online` as the shortcut for enabling the
        // `web` plugin on any model.
        model: getOpenRouterRequestModelId(modelId, options?.webSearch),
        messages: options?.systemPrompt
            ? normalizeOpenRouterMessages([{ role: "system", content: options.systemPrompt }, ...messages])
            : normalizeOpenRouterMessages(messages),
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
    };

    const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getApiKey()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Metallm AI Aggregator",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
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

                const msgAnnotations: any[] = data.choices?.[0]?.message?.annotations || [];
                for (const ann of msgAnnotations) {
                    if (ann.type === "url_citation" && ann.url_citation?.url) {
                        const url: string = ann.url_citation.url;
                        if (!seenUrls.has(url)) {
                            seenUrls.add(url);
                            sources.push({ title: ann.url_citation.title || url, url });
                        }
                    }
                }
            } catch {
                // skip malformed lines
            }
        }
    }

    return { content: fullContent, sources };
}
