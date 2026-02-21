// ============================================================
// Anthropic Provider — Claude 3.5 Sonnet, Claude 3 Opus, etc.
// ============================================================
// TODO: Set env var  ANTHROPIC_API_KEY  to activate.
// Add models with provider: "anthropic" to server/models.json when ready.
//
// Example model entry in models.json:
// {
//   "id": "claude-3-5-sonnet-20241022",
//   "displayName": "Claude 3.5 Sonnet",
//   "role": "Thoughtful Reasoning & Writing",
//   "systemPrompt": "You are Claude, made by Anthropic...",
//   "icon": "🌿",
//   "iconUrl": "https://cdn.simpleicons.org/anthropic/CC785C",
//   "color": "orange",
//   "provider": "anthropic"
// }

import type { WebSource } from "../types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function getApiKey(): string {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Anthropic API key not configured — set ANTHROPIC_API_KEY in your environment");
    return key;
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callAnthropic(
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
        messages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
    };

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
    return data.content?.[0]?.text || "";
}

// ── Streaming call ────────────────────────────────────────────────────────────
export async function callAnthropicStream(
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
        messages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
        ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
    };

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
            if (!trimmed || trimmed.startsWith("event:")) continue;
            if (!trimmed.startsWith("data: ")) continue;
            try {
                const data = JSON.parse(trimmed.slice(6));
                // Anthropic SSE: content_block_delta events carry text
                const text: string = data.delta?.text || "";
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
