// ============================================================
// Groq Provider — ultra-fast inference via Groq Cloud API
// ============================================================
// Set env var  GROQ_API_KEY  to activate.
// Groq uses an OpenAI-compatible REST API at https://api.groq.com/openai/v1
// Supported models: llama-3.3-70b-versatile, llama-4-maverick, llama-4-scout,
//   kimi-k2, qwen3-32b, gpt-oss-120b, groq/compound, etc.

import type { WebSource } from "../types";
import * as logger from "../logger";

type GroqContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url?: string; image?: string }
    | { type: string; [key: string]: any };

type GroqMessage = {
    role: string;
    content: string | GroqContentPart[];
};

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

function getGroqMaxOutputTokens(modelId: string, requestedMaxTokens?: number): number {
    const isCompound = modelId.includes("groq/compound");
    const providerMax = isCompound ? 8192 : 8192;
    const desired = requestedMaxTokens ?? 4096;
    return Math.max(1, Math.min(desired, providerMax));
}

function normalizeGroqContent(content: string | GroqContentPart[]): string | Array<{ type: string; [key: string]: any }> {
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
            const file = part.input_file || {};
            const name = typeof file.filename === "string" ? file.filename : "attachment";
            const mime = typeof file.mime_type === "string" ? file.mime_type : "file";
            parts.push({ type: "text", text: `[Attachment: ${name} (${mime})]` });
            continue;
        }
    }

    if (parts.length === 0) return "";
    return parts;
}

function normalizeGroqMessages(messages: GroqMessage[]): GroqMessage[] {
    return messages.map((m) => ({
        role: m.role,
        content: normalizeGroqContent(m.content),
    }));
}

function extractSourcesFromExecutedTools(
    executedTools: any[],
    sources: WebSource[],
    seenUrls: Set<string>
): void {
    if (!Array.isArray(executedTools)) return;

    for (const tool of executedTools) {
        const searchResults = tool?.search_results;
        if (!Array.isArray(searchResults)) continue;

        for (const result of searchResults) {
            const url = result?.url || result?.link || result?.source_url;
            if (!url || typeof url !== "string" || !url.startsWith("http")) continue;
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);
            sources.push({ title: result?.title || result?.name || url, url });
        }
    }
}

function getApiKey(): string {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("Groq API key not configured — set GROQ_API_KEY in your environment");
    return key;
}

// ── Speech-to-Text via Whisper ────────────────────────────────────────────────
const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function transcribeAudio(
    audioBuffer: Buffer,
    options?: { language?: string; fileName?: string },
): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), options?.fileName || "voice.ogg");
    form.append("model", "whisper-large-v3");
    form.append("response_format", "text");
    if (options?.language) form.append("language", options.language);

    const response = await fetch(GROQ_TRANSCRIPTION_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${getApiKey()}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq Whisper API error: ${response.status} - ${errorText}`);
    }

    const text = await response.text();
    return text.trim();
}

// ── Non-streaming call ────────────────────────────────────────────────────────
export async function callGroq(
    modelId: string,
    messages: GroqMessage[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
    const body: any = {
        model: modelId,
        messages: options?.systemPrompt
            ? normalizeGroqMessages([{ role: "system", content: options.systemPrompt }, ...messages])
            : normalizeGroqMessages(messages),
        max_tokens: getGroqMaxOutputTokens(modelId, options?.maxTokens),
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
    messages: GroqMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        webSearch?: boolean;
        onSearchStatus?: (event: string, data: any) => void;
        abortSignal?: AbortSignal;
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: TokenUsage }> {
    const isCompound = modelId.includes("groq/compound");
    const useNativeWebSearch = options?.webSearch === true && isCompound;

    const body: any = {
        model: modelId,
        messages: options?.systemPrompt
            ? normalizeGroqMessages([{ role: "system", content: options.systemPrompt }, ...messages])
            : normalizeGroqMessages(messages),
        max_tokens: getGroqMaxOutputTokens(modelId, options?.maxTokens),
        temperature: options?.temperature ?? 0.7,
        stream: true,
        // Request token usage in the final streaming chunk
        stream_options: { include_usage: true },
    };

    if (useNativeWebSearch) {
        body.compound_custom = {
            tools: {
                enabled_tools: ["web_search"],
            },
        };
        options?.onSearchStatus?.("searching", { provider: "groq", mode: "compound-native" });
    }

    const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getApiKey()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: options?.abortSignal ?? AbortSignal.timeout(60_000),
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
    let nativeSearchObserved = false;

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

                // 1b. compound native web-search results can appear in executed_tools
                const deltaExecutedTools: any[] = delta.executed_tools || [];
                if (deltaExecutedTools.length > 0) {
                    nativeSearchObserved = true;
                    extractSourcesFromExecutedTools(deltaExecutedTools, sources, seenUrls);
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

                const msgExecutedTools: any[] = data.choices?.[0]?.message?.executed_tools || [];
                if (msgExecutedTools.length > 0) {
                    nativeSearchObserved = true;
                    extractSourcesFromExecutedTools(msgExecutedTools, sources, seenUrls);
                }

                // 6. Parse inline 【Title】 markers from compound content and map to URLs
                //    (compound embeds these when citing sources inline)
                if (isCompound && text) {
                    const inlineRegex = /【([^\]】]+)】/g;
                    let m: RegExpExecArray | null;
                    while ((m = inlineRegex.exec(text)) !== null) {
                        const title = (m[1] || "").trim();
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

    if (useNativeWebSearch) {
        options?.onSearchStatus?.("done", {
            provider: "groq",
            mode: "compound-native",
            count: sources.length,
            observed: nativeSearchObserved,
        });
    }

    return { content: fullContent, sources, tokenUsage };
}
