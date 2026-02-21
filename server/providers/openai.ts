// ============================================================
// OpenAI Provider — GPT-4o, GPT-4 Turbo, o1, etc.
// ============================================================
// TODO: Set env var  OPENAI_API_KEY  to activate.
// Add models with provider: "openai" to server/models.json when ready.
import type { WebSource } from "../types";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function getApiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OpenAI API key not configured — set OPENAI_API_KEY in your environment");
    return key;
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callOpenAI(
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

    const response = await fetch(OPENAI_API_URL, {
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
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

// ── Streaming call ────────────────────────────────────────────────────────────
export async function callOpenAIStream(
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

    const response = await fetch(OPENAI_API_URL, {
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
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
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
