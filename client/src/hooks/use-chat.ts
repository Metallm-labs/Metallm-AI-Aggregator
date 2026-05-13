import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Conversation, Message, ConversationWithMessages } from "@shared/schema";
import type { ChatAttachmentMeta, DebateParticipant } from "@/components/ChatInput";
import type { UserPersonalization } from "@/hooks/use-personalization";

// Token usage data returned from model APIs
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedPromptTokens?: number;
}

function sortConversationsByActivity(items: Conversation[]): Conversation[] {
    return [...items].sort((a, b) => {
        const ta = new Date(a.updatedAt ?? a.createdAt).getTime();
        const tb = new Date(b.updatedAt ?? b.createdAt).getTime();
        if (ta !== tb) return tb - ta;
        return b.id - a.id;
    });
}

function upsertConversationSummary(
    queryClient: ReturnType<typeof useQueryClient>,
    conversation: Conversation
) {
    queryClient.setQueryData<Conversation[]>(
        ["/api/chat/conversations"],
        (old) => {
            const current = old ?? [];
            const index = current.findIndex((item) => item.id === conversation.id);
            const next =
                index === -1
                    ? [conversation, ...current]
                    : current.map((item, i) => (i === index ? { ...item, ...conversation } : item));
            return sortConversationsByActivity(next);
        }
    );
}

function patchConversationSummary(
    queryClient: ReturnType<typeof useQueryClient>,
    conversationId: number,
    patch: Partial<Conversation>
) {
    queryClient.setQueryData<Conversation[]>(
        ["/api/chat/conversations"],
        (old) => {
            if (!old) return old;
            const next = old.map((item) => item.id === conversationId ? { ...item, ...patch } : item);
            return sortConversationsByActivity(next);
        }
    );
    queryClient.setQueryData<ConversationWithMessages>(
        ["/api/chat/conversations", conversationId],
        (old) => old ? { ...old, ...patch } : old
    );
}

// Helper: directly patch a conversation's title in the cache
function patchConversationTitle(
    queryClient: ReturnType<typeof useQueryClient>,
    conversationId: number,
    title: string
) {
    patchConversationSummary(queryClient, conversationId, {
        title,
        updatedAt: new Date(),
    });
}

function sortMessagesChronologically(items: Message[]): Message[] {
    return [...items].sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        if (ta !== tb) return ta - tb;
        return a.id - b.id;
    });
}

function patchConversationMessage(
    queryClient: ReturnType<typeof useQueryClient>,
    conversationId: number,
    message: Message
) {
    queryClient.setQueryData<ConversationWithMessages>(
        ["/api/chat/conversations", conversationId],
        (old) => {
            if (!old) {
                const existingConversation = queryClient
                    .getQueryData<Conversation[]>(["/api/chat/conversations"])
                    ?.find((c) => c.id === conversationId);
                if (!existingConversation) return old;
                return {
                    ...existingConversation,
                    messages: [message],
                };
            }
            const current = Array.isArray(old.messages) ? old.messages : [];
            const index = current.findIndex((m) => m.id === message.id);
            const next =
                index === -1
                    ? [...current, message]
                    : current.map((m, i) => (i === index ? message : m));
            return {
                ...old,
                messages: sortMessagesChronologically(next),
            };
        }
    );
}

// GET /api/chat/conversations
export function useConversations(options?: { enabled?: boolean }) {
    return useQuery<Conversation[]>({
        queryKey: ["/api/chat/conversations"],
        enabled: options?.enabled ?? true,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false, // don't refetch just because window gets focus
        queryFn: async () => {
            const res = await fetch("/api/chat/conversations", { credentials: "include" });
            if (res.status === 401) throw new Error("Unauthorized");
            if (!res.ok) throw new Error("Failed to fetch conversations");
            return res.json();
        },
    });
}

// GET /api/chat/conversations/:id
export function useConversation(id: number | null) {
    return useQuery<ConversationWithMessages>({
        queryKey: ["/api/chat/conversations", id],
        enabled: !!id,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false, // don't refetch just because user alt-tabs back
        queryFn: async () => {
            if (!id) throw new Error("No conversation ID");
            const res = await fetch(`/api/chat/conversations/${id}`, { credentials: "include" });
            if (res.status === 404) throw new Error("Conversation not found");
            if (!res.ok) throw new Error("Failed to fetch conversation");
            return res.json();
        },
    });
}

// POST /api/chat/conversations
export function useCreateConversation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (title?: string) => {
            const res = await fetch("/api/chat/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title }),
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to create conversation");
            return res.json() as Promise<Conversation>;
        },
        onSuccess: (conversation) => {
            upsertConversationSummary(queryClient, conversation);
            queryClient.setQueryData<ConversationWithMessages>(
                ["/api/chat/conversations", conversation.id],
                { ...conversation, messages: [] }
            );
        },
    });
}

// DELETE /api/chat/conversations/:id
export function useDeleteConversation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`/api/chat/conversations/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to delete conversation");
            return id;
        },
        // Optimistic update: remove from list immediately so sidebar doesn't flicker
        onMutate: async (id: number) => {
            await queryClient.cancelQueries({ queryKey: ["/api/chat/conversations"] });
            const previous = queryClient.getQueryData<Conversation[]>(["/api/chat/conversations"]);
            queryClient.setQueryData<Conversation[]>(
                ["/api/chat/conversations"],
                (old) => old?.filter((c) => c.id !== id) ?? []
            );
            // Drop the individual conversation cache too
            queryClient.removeQueries({ queryKey: ["/api/chat/conversations", id] });
            return { previous };
        },
        onError: (_err, _id, context: any) => {
            // Roll back on failure
            if (context?.previous) {
                queryClient.setQueryData(["/api/chat/conversations"], context.previous);
            }
        },
    });
}

// =============================
// === Routing Info Types ===
// =============================
export interface RoutingResult {
    routingType: "casual" | "specialized" | "multi" | "debate";
    targetModel?: {
        id: string;
        displayName: string;
        role: string;
        iconUrl?: string;
        provider: string;
    };
    models?: Array<{
        id: string;
        displayName: string;
        role: string;
        iconUrl?: string;
        provider: string;
    }>;
    reason: string;
    enhancedPrompt: string;
    originalPrompt: string;
    perModelPrompts?: Array<{ modelId: string; displayName: string; prompt: string; stance?: string }>;
}

// Step 1: Route the prompt (get enhanced prompt + routing decision)
export async function routePrompt(
    conversationId: number,
    content: string,
    mode: "single" | "multi" | "debate",
    selectedModelIds?: string[],
    debateConfig?: DebateParticipant[],
): Promise<RoutingResult> {
    const res = await fetch(`/api/chat/conversations/${conversationId}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mode, selectedModelIds, debateConfig }),
        credentials: "include",
    });

    if (!res.ok) {
        const error = await res.json();
        const err = new Error(error.message || "Routing failed") as Error & { status?: number; code?: string; payload?: any };
        err.status = res.status;
        err.code = error.code;
        err.payload = error;
        throw err;
    }

    return res.json();
}

// Step 2: Send message with approved prompt (streaming)
export function useSendMessage() {
    const queryClient = useQueryClient();

    const sendMessage = async (
        conversationId: number,
        content: string,
        mode: "single" | "multi" | "debate",
        onChunk: (modelName: string, content: string) => void,
        onModelStart: (modelName: string, extra?: any) => void,
        onModelComplete: (modelName: string, message: Message, tokenUsage?: TokenUsage) => void,
        onUserMessage: (message: Message) => void,
        onTitleUpdate?: (title: string) => void,
        onDone?: () => void,
        // Optional: pass the enhanced prompt + target model from routing
        enhancedPrompt?: string,
        targetModelId?: string,
        signal?: AbortSignal,
        onWebSearchStatus?: (modelName: string, phase: string, data: any) => void,
        onMemoryStatus?: (modelName: string, phase: string, data: any) => void,
        webSearch?: boolean,
        onWebSources?: (modelName: string, sources: { title: string; url: string }[]) => void,
        selectedModelIds?: string[],
        debateConfig?: DebateParticipant[],
        perModelPrompts?: Array<{ modelId: string; displayName: string; prompt: string }>,
        attachmentContext?: string,
        attachments?: ChatAttachmentMeta[],
        roundNumber?: number,
        totalRounds?: number,
        skipUserMessage?: boolean,
        personalization?: UserPersonalization,
    ) => {
        const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content,
                mode,
                enhancedPrompt,
                targetModelId,
                webSearch,
                selectedModelIds,
                debateConfig,
                perModelPrompts,
                attachmentContext,
                attachments,
                roundNumber,
                totalRounds,
                skipUserMessage: skipUserMessage === true ? true : undefined,
                personalization,
            }),
            credentials: "include",
            signal,
        });

        if (!res.ok) {
            const error = await res.json();
            const err = new Error(error.message || "Failed to send message") as Error & { status?: number; code?: string; payload?: any };
            err.status = res.status;
            err.code = error.code;
            err.payload = error;
            throw err;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";
        let sawDoneEvent = false;

        const processBufferedLines = (flushFinalChunk = false) => {
            const lines = buffer.split("\n");
            if (!flushFinalChunk) {
                buffer = lines.pop() || "";
            } else {
                buffer = "";
            }

            for (const line of lines) {
                if (line.startsWith("event: ")) {
                    currentEvent = line.slice(7).trim();
                } else if (line.startsWith("data: ") && currentEvent) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        switch (currentEvent) {
                            case "user_message":
                                patchConversationMessage(queryClient, conversationId, data as Message);
                                patchConversationSummary(queryClient, conversationId, {
                                    updatedAt: (data as Message).createdAt as Conversation["updatedAt"],
                                });
                                onUserMessage(data);
                                break;
                            case "model_start":
                                onModelStart(data.modelName, data);
                                break;
                            case "chunk":
                                onChunk(data.modelName, data.content);
                                break;
                            case "model_complete":
                                patchConversationMessage(queryClient, conversationId, data.message as Message);
                                patchConversationSummary(queryClient, conversationId, {
                                    updatedAt: (data.message as Message)?.createdAt as Conversation["updatedAt"],
                                });
                                onModelComplete(data.modelName, data.message, data.tokenUsage as TokenUsage | undefined);
                                break;
                            case "credit_update":
                                // Update credit balance in cache when credits are deducted
                                queryClient.setQueryData(["/api/credits/balance"], { credits: data.newBalance });
                                break;
                            case "web_sources":
                                onWebSources?.(data.modelName, data.sources ?? []);
                                break;
                            case "web_search_status":
                                onWebSearchStatus?.(data.modelName, data.phase, data);
                                break;
                            case "memory_status":
                                onMemoryStatus?.(data.modelName, data.phase, data);
                                break;
                            case "title_update":
                                onTitleUpdate?.(data.title);
                                patchConversationTitle(queryClient, conversationId, data.title);
                                break;
                            case "done":
                                sawDoneEvent = true;
                                onDone?.();
                                break;
                        }
                    } catch (e) {
                        console.error("Error parsing SSE data:", e);
                    }
                    // Reset after consuming the data line
                    currentEvent = "";
                } else if (line === "") {
                    // blank line resets (SSE spec: dispatch the event)
                    currentEvent = "";
                }
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            processBufferedLines(false);
        }

        buffer += decoder.decode();
        if (buffer.length > 0) {
            processBufferedLines(true);
        }

        // Safety net: if the stream closed cleanly but the final SSE "done" event
        // was split across chunks and never parsed, still finalize the UI state.
        if (!sawDoneEvent) {
            onDone?.();
        }
    };

    return { sendMessage };
}
