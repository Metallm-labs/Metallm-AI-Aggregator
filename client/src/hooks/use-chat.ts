import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Conversation, Message, ConversationWithMessages } from "@shared/schema";

// GET /api/chat/conversations
export function useConversations() {
    return useQuery<Conversation[]>({
        queryKey: ["/api/chat/conversations"],
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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
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
        icon: string;
        provider: string;
    };
    models?: Array<{
        id: string;
        displayName: string;
        role: string;
        icon: string;
        provider: string;
    }>;
    reason: string;
    enhancedPrompt: string;
    originalPrompt: string;
}

// Step 1: Route the prompt (get enhanced prompt + routing decision)
export async function routePrompt(
    conversationId: number,
    content: string,
    mode: "single" | "multi" | "debate"
): Promise<RoutingResult> {
    const res = await fetch(`/api/chat/conversations/${conversationId}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mode }),
        credentials: "include",
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Routing failed");
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
        onModelComplete: (modelName: string, message: Message) => void,
        onUserMessage: (message: Message) => void,
        onTitleUpdate?: (title: string) => void,
        onDone?: () => void,
        // Optional: pass the enhanced prompt + target model from routing
        enhancedPrompt?: string,
        targetModelId?: string,
    ) => {
        const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, mode, enhancedPrompt, targetModelId }),
            credentials: "include",
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.message || "Failed to send message");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith("event: ")) {
                    const eventType = line.slice(7);
                    const nextLine = lines[lines.indexOf(line) + 1];
                    if (nextLine?.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(nextLine.slice(6));

                            switch (eventType) {
                                case "user_message":
                                    onUserMessage(data);
                                    break;
                                case "model_start":
                                    onModelStart(data.modelName, data);
                                    break;
                                case "chunk":
                                    onChunk(data.modelName, data.content);
                                    break;
                                case "model_complete":
                                    onModelComplete(data.modelName, data.message);
                                    break;
                                case "title_update":
                                    onTitleUpdate?.(data.title);
                                    queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
                                    break;
                                case "done":
                                    onDone?.();
                                    break;
                            }
                        } catch (e) {
                            console.error("Error parsing SSE data:", e);
                        }
                    }
                }
            }
        }

        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", conversationId] });
    };

    return { sendMessage };
}
