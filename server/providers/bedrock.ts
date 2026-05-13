// ============================================================
// Amazon Bedrock Provider — Long-term API Keys (ABSK)
// Uses direct HTTP fetch with Bearer token auth (no SigV4 needed)
// Bedrock Converse & ConverseStream REST API
// ============================================================

import type { WebSource } from "../types";

interface BedrockTokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

type ContentPart =
    | { type: "text"; text: string }
    | { type: "input_text"; text: string }
    | { type: "image_url"; image_url?: { url: string } }
    | { type: "input_image"; image_url?: string; image?: string }
    | { type: string;[key: string]: any };

type GenericMessage = {
    role: string;
    content: string | ContentPart[];
};

// Bedrock API base url
function getBedrockBaseUrl(): string {
    const region = process.env.AWS_REGION || "us-east-1";
    return `https://bedrock-runtime.${region}.amazonaws.com`;
}

// Get the bearer token from env
function getBearerToken(): string {
    const token =
        process.env.AWS_BEDROCK_API_KEY ||
        process.env.AWS_BEARER_TOKEN_BEDROCK;
    if (!token) {
        throw new Error(
            "Missing AWS_BEDROCK_API_KEY in .env — set it to your Bedrock Long-term API Key (ABSK...)"
        );
    }
    return token;
}

// Convert generic messages to Bedrock Converse message format
function toBedrockMessages(messages: GenericMessage[]) {
    const result: Array<{ role: "user" | "assistant"; content: Array<{ text: string }> }> = [];

    for (const message of messages) {
        const role: "user" | "assistant" = message.role === "assistant" ? "assistant" : "user";
        const textParts: string[] = [];

        if (typeof message.content === "string") {
            if (message.content.trim()) textParts.push(message.content);
        } else {
            for (const part of message.content) {
                if ((part.type === "text" || part.type === "input_text") && typeof part.text === "string") {
                    if (part.text.trim()) textParts.push(part.text);
                }
                // Note: image/file parts are not supported by all Bedrock models via this key type.
                // For multimodal support you'd need SigV4 IAM auth.
            }
        }

        const text = textParts.join("\n").trim() || " ";
        result.push({ role, content: [{ text }] });
    }

    return result;
}

// Build the Converse API body
function buildConverseBody(
    messages: GenericMessage[],
    options?: { maxTokens?: number; temperature?: number; systemPrompt?: string }
) {
    const body: Record<string, any> = {
        messages: toBedrockMessages(messages),
        inferenceConfig: {
            maxTokens: options?.maxTokens || 4096,
            temperature: options?.temperature !== undefined ? options.temperature : 0.7,
        },
    };
    if (options?.systemPrompt) {
        body.system = [{ text: options.systemPrompt }];
    }
    return body;
}

// ── Non-streaming call ──────────────────────────────────────────────
export async function callBedrock(
    modelId: string,
    messages: GenericMessage[],
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
    }
): Promise<string> {
    const url = `${getBedrockBaseUrl()}/model/${encodeURIComponent(modelId)}/converse`;
    const body = buildConverseBody(messages, options);

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getBearerToken()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Bedrock API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    // Response: { output: { message: { content: [{ text: "..." }] } } }
    const content = data?.output?.message?.content;
    if (Array.isArray(content)) {
        return content.map((c: any) => c.text ?? "").join("");
    }
    return "";
}

// ── Streaming call (ConverseStream) ────────────────────────────────
export async function callBedrockStream(
    modelId: string,
    messages: GenericMessage[],
    onChunk: (chunk: string) => void,
    options?: {
        maxTokens?: number;
        temperature?: number;
        systemPrompt?: string;
        abortSignal?: AbortSignal;
    }
): Promise<{ content: string; sources: WebSource[]; tokenUsage?: BedrockTokenUsage }> {
    const url = `${getBedrockBaseUrl()}/model/${encodeURIComponent(modelId)}/converse-stream`;
    const body = buildConverseBody(messages, options);

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${getBearerToken()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: options?.abortSignal ?? AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Bedrock API error (${response.status}): ${errorText}`);
    }

    // Bedrock ConverseStream uses AWS Event Stream encoding (binary framing).
    // We parse the raw binary stream using a lightweight event-stream reader.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from Bedrock");

    let fullContent = "";
    let tokenUsage: BedrockTokenUsage | undefined;

    // Event stream parser state
    let buffer = new Uint8Array(0);

    const append = (a: Uint8Array, b: Uint8Array): Uint8Array => {
        const merged = new Uint8Array(a.length + b.length);
        merged.set(a, 0);
        merged.set(b, a.length);
        return merged;
    };

    const readInt32BE = (buf: Uint8Array, offset: number): number => {
        return ((buf[offset]! << 24) | (buf[offset + 1]! << 16) | (buf[offset + 2]! << 8) | buf[offset + 3]!) >>> 0;
    };

    const textDecoder = new TextDecoder();

    // Parse AWS Event Stream frames:
    // Each frame: [total_length(4)] [headers_length(4)] [prelude_crc(4)] [headers(N)] [payload(M)] [message_crc(4)]
    const tryParseFrames = () => {
        while (buffer.length >= 12) {
            const totalLen = readInt32BE(buffer, 0);
            const headersLen = readInt32BE(buffer, 4);

            if (buffer.length < totalLen) break; // wait for more data

            const payloadStart = 12 + headersLen;
            const payloadEnd = totalLen - 4; // minus 4 for message CRC

            if (payloadEnd <= payloadStart) {
                // Empty or corrupt frame, skip
                buffer = buffer.slice(totalLen);
                continue;
            }

            const payloadBytes = buffer.slice(payloadStart, payloadEnd);
            buffer = buffer.slice(totalLen);

            try {
                const payloadStr = textDecoder.decode(payloadBytes);
                const payload = JSON.parse(payloadStr) as any;

                // contentBlockDelta — streaming text chunk
                if (payload?.contentBlockDelta?.delta?.text) {
                    const text: string = payload.contentBlockDelta.delta.text;
                    onChunk(text);
                    fullContent += text;
                }

                // metadata — token usage
                if (payload?.metadata?.usage) {
                    const u = payload.metadata.usage;
                    tokenUsage = {
                        promptTokens: u.inputTokens ?? 0,
                        completionTokens: u.outputTokens ?? 0,
                        totalTokens: (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
                    };
                }
            } catch {
                // Ignore malformed frames (headers-only frames, CRC frames, etc.)
            }
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer = append(buffer, value);
        tryParseFrames();
    }

    // Final parse attempt for any remaining buffered data
    tryParseFrames();

    console.log(`[Bedrock] Stream complete: ${fullContent.length} chars, tokenUsage:`, tokenUsage);

    return { content: fullContent, sources: [], tokenUsage };
}
