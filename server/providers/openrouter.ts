// ============================================================
// OpenRouter Provider — universal access to 200+ open-source models
// ============================================================
import type { WebSource } from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getApiKey(): string {
    const key = process.env["AI-INTEGRATIONS-OPEN-ROUTER-API-KEY"];
    if (!key) throw new Error("OpenRouter API key not configured");
    return key;
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callOpenRouter(
    modelId: string,
    messages: { role: string; content: string }[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
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

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

// ── Streaming call ────────────────────────────────────────────────────────────
export async function callOpenRouterStream(
    modelId: string,
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
    }
): Promise<{ content: string; sources: WebSource[] }> {
    const body: any = {
        model: modelId,
        messages: options?.systemPrompt
            ? [{ role: "system", content: options.systemPrompt }, ...messages]
            : messages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
    };
    if (options?.webSearch) {
        body.plugins = [{ id: "web", max_results: 5 }];
    }

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
            } catch {
                // skip malformed lines
            }
        }
    }

    return { content: fullContent, sources };
}
