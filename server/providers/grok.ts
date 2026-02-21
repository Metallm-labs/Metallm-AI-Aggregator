// ============================================================
// Grok Provider — xAI Grok-2, Grok-3, etc.
// ============================================================
// TODO: Set env var  XAI_API_KEY  to activate.
// Add models with provider: "grok" to server/models.json when ready.
//
// Example model entry in models.json:
// {
//   "id": "grok-2-latest",
//   "displayName": "Grok 2",
//   "role": "Real-time Knowledge & Wit",
//   "systemPrompt": "You are Grok, made by xAI...",
//   "icon": "🤖",
//   "iconUrl": "https://cdn.simpleicons.org/xai/000000",
//   "color": "gray",
//   "provider": "grok"
// }

import type { WebSource } from "../types";

// Grok uses OpenAI-compatible API format
const GROK_API_URL = "https://api.x.ai/v1/chat/completions";

function getApiKey(): string {
    const key = process.env.XAI_API_KEY;
    if (!key) throw new Error("xAI API key not configured — set XAI_API_KEY in your environment");
    return key;
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callGrok(
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

    const response = await fetch(GROK_API_URL, {
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
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
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

    const response = await fetch(GROK_API_URL, {
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
            } catch {
                // skip malformed lines
            }
        }
    }

    return { content: fullContent, sources: [] };
}
