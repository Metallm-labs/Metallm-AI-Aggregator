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
    const seenTitles = new Set<string>();
    let firstChunkLogged = false;
    const isCompound = modelId.includes("compound");

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

                // Log first non-empty chunk — for compound, dump full structure so we can
                // understand exactly where citations/sources are returned
                if (!firstChunkLogged && (data.choices?.length > 0 || data.usage || data.x_groq)) {
                    const keys = Object.keys(data);
                    const deltaKeys = data.choices?.[0]?.delta ? Object.keys(data.choices[0].delta) : [];
                    logger.info("groq", `${logger.colorModel(modelId)} first chunk — keys: ${logger.colorValue(keys.join(","))} delta: ${logger.colorValue(deltaKeys.join(",") || "none")}`);
                    if (isCompound) {
                        // Dump full first chunk for compound so we can see citations structure
                        logger.info("groq", `[compound] full first chunk: ${JSON.stringify(data).slice(0, 500)}`);
                    }
                    firstChunkLogged = true;
                }

                const delta = data.choices?.[0]?.delta ?? {};

                // ── Content: compound streams reasoning first, then content ──
                // delta.content = final visible answer (stream to client)
                // delta.reasoning = internal search steps (skip — not user-facing)
                const text: string = delta.content || "";
                if (text) {
                    onChunk(text);
                    fullContent += text;
                }

                // ── Sources: check every known location Groq may put citations ──

                // 1. delta.annotations (OpenAI-style url_citation)
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
                        if (!seenUrls.has(url)) { seenUrls.add(url); sources.push({ title: ann.title || url, url }); }
                    }
                }

                // 2. delta.citations (Groq compound-beta specific array)
                const deltaCitations: any[] = delta.citations || [];
                for (const cit of deltaCitations) {
                    const url: string = cit.url || cit.link || "";
                    if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        sources.push({ title: cit.title || cit.name || url, url });
                    }
                }

                // 3. Top-level data.citations array (some Groq responses)
                const topCitations: any[] = data.citations || data.sources || [];
                for (const cit of topCitations) {
                    const url: string = cit.url || cit.link || "";
                    if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        sources.push({ title: cit.title || cit.name || url, url });
                    }
                }

                // 4. x_groq.citations (Groq extension field)
                const xGroqCitations: any[] = data.x_groq?.citations || data.x_groq?.sources || [];
                for (const cit of xGroqCitations) {
                    const url: string = cit.url || cit.link || "";
                    if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        sources.push({ title: cit.title || cit.name || url, url });
                    }
                }

                // 5. choices[0].message.citations (non-streaming final message)
                const msgCitations: any[] = data.choices?.[0]?.message?.citations || [];
                for (const cit of msgCitations) {
                    const url: string = cit.url || cit.link || "";
                    if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        sources.push({ title: cit.title || cit.name || url, url });
                    }
                }

                // 6. Parse inline 【Title】 markers from compound content and map to URLs
                //    (compound embeds these when citing sources inline)
                if (isCompound && text) {
                    const inlineMarkers = text.matchAll(/【([^\]】]+)】/g);
                    for (const m of inlineMarkers) {
                        const title = m[1].trim();
                        if (title && !seenTitles.has(title) && !title.match(/^\d+$/)) {
                            seenTitles.add(title);
                            // Only add if we don't already have it as a URL source
                            const alreadyHave = sources.some(s => s.title === title);
                            if (!alreadyHave) {
                                // Will be a title-only source — better than nothing
                                sources.push({ title, url: `https://www.google.com/search?q=${encodeURIComponent(title)}` });
                            }
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
                    // Final log emitted after loop — don't log here to avoid duplicate
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
                        // Final log emitted after loop — don't log here to avoid duplicate
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
        logger.ok("Groq", `${logger.colorModel(modelId)} extracted ${logger.colorValue(sources.length)} sources from built-in search`);
        sources.slice(0, 3).forEach((s, i) => logger.info("groq", `  ${i + 1}. ${logger.colorValue(s.title.slice(0, 60))} — ${s.url.slice(0, 80)}`));
    } else if (isCompound) {
        logger.warn("Groq", `${logger.colorModel(modelId)} responded but no sources found — check compound chunk structure in logs above`);
    }

    return { content: fullContent, sources, tokenUsage };
}

