// ============================================================
// Groq Provider — ultra-fast inference via Groq Cloud API
// ============================================================
// Set env var  GROQ_API_KEY  to activate.
// Groq uses an OpenAI-compatible REST API at https://api.groq.com/openai/v1
// Supported models: llama-3.3-70b-versatile, llama-4-maverick, llama-4-scout,
//   kimi-k2, qwen3-32b, gpt-oss-120b, groq/compound, etc.

import type { WebSource } from "../types";
import * as logger from "../logger";

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

function getApiKey(): string {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("Groq API key not configured — set GROQ_API_KEY in your environment");
    return key;
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callGroq(
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

    const response = await fetch(GROQ_API_URL, {
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
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

// ── Streaming call ────────────────────────────────────────────────────────────
export async function callGroqStream(
    modelId: string,
    messages: { role: string; content: string }[],
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
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature ?? 0.7,
        stream: true,
        // Request token usage in the final streaming chunk
        stream_options: { include_usage: true },
    };

    const response = await fetch(GROQ_API_URL, {
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
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let tokenUsage: TokenUsage | undefined;
    const sources: WebSource[] = [];
    const seenUrls = new Set<string>();
    let firstChunkLogged = false;

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

                // Log first non-empty chunk structure to understand compound model fields
                if (!firstChunkLogged && (data.choices?.length > 0 || data.usage || data.x_groq)) {
                    const keys = Object.keys(data);
                    const deltaKeys = data.choices?.[0]?.delta ? Object.keys(data.choices[0].delta) : [];
                    logger.info("groq", `${logger.colorModel(modelId)} first chunk — keys: ${logger.colorValue(keys.join(","))} delta: ${logger.colorValue(deltaKeys.join(",") || "none")}`);
                    firstChunkLogged = true;
                }

                // Stream text content (including <think> tags — client strips them)
                const text: string = data.choices?.[0]?.delta?.content || "";
                if (text) {
                    onChunk(text);
                    fullContent += text;
                }

                // ── Sources: parse from annotations (Groq Compound built-in search) ──
                // Compound model returns URL citations as delta.annotations, same
                // structure as OpenRouter web plugin: { type: "url_citation", url_citation: {...} }
                const annotations: any[] = data.choices?.[0]?.delta?.annotations || [];
                for (const ann of annotations) {
                    if (ann.type === "url_citation" && ann.url_citation?.url) {
                        const url: string = ann.url_citation.url;
                        if (!seenUrls.has(url)) {
                            seenUrls.add(url);
                            sources.push({ title: ann.url_citation.title || url, url });
                        }
                    }
                    // Some Groq compound chunks use a flat citation structure
                    if (ann.type === "citation" && ann.url) {
                        const url: string = ann.url;
                        if (!seenUrls.has(url)) {
                            seenUrls.add(url);
                            sources.push({ title: ann.title || url, url });
                        }
                    }
                }

                // ── Token usage ──
                // Standard OpenAI-compatible usage (stream_options.include_usage)
                if (data.usage && (data.usage.total_tokens > 0 || data.usage.prompt_tokens > 0 || data.usage.completion_tokens > 0)) {
                    tokenUsage = {
                        promptTokens: data.usage.prompt_tokens ?? 0,
                        completionTokens: data.usage.completion_tokens ?? 0,
                        totalTokens: data.usage.total_tokens ?? ((data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0)),
                    };
                    logger.tokenLog("Groq", modelId, tokenUsage.promptTokens, tokenUsage.completionTokens, tokenUsage.totalTokens);
                }
                // Groq-specific usage field (compound-beta and some other models)
                if (!tokenUsage && data.x_groq?.usage) {
                    const u = data.x_groq.usage;
                    const total = (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
                    if (total > 0) {
                        tokenUsage = {
                            promptTokens: u.prompt_tokens ?? 0,
                            completionTokens: u.completion_tokens ?? 0,
                            totalTokens: u.total_tokens ?? total,
                        };
                        logger.tokenLog("Groq", modelId, tokenUsage.promptTokens, tokenUsage.completionTokens, tokenUsage.totalTokens);
                    }
                }
            } catch {
                // skip malformed lines
            }
        }
    }

    if (tokenUsage) {
        logger.tokenLog("Groq", modelId, tokenUsage.promptTokens, tokenUsage.completionTokens, tokenUsage.totalTokens);
    } else {
        // groq/compound is a compound orchestrator — Groq does not report token
        // usage for it (always returns 0 in the API). Leave tokenUsage undefined
        // so the UI shows "—" rather than a wrong number.
        logger.warn("Groq", `${logger.colorModel(modelId)} — API returned no token usage (compound model, Groq limitation)`);
    }

    if (sources.length > 0) {
        logger.ok("Groq", `${logger.colorModel(modelId)} extracted ${logger.colorValue(sources.length)} built-in search sources`);
    }

    return { content: fullContent, sources, tokenUsage };
}

