import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatMessage, TypingIndicator } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ModelSettings } from "@/components/ModelSettings";
import { MultiModelResponse } from "@/components/MultiModelResponse";
import { useAuth } from "@/hooks/use-auth";
import { useConversation, useCreateConversation, useSendMessage, routePrompt, type RoutingResult } from "@/hooks/use-chat";
import { Loader2, MessageSquare, Settings, Zap, Edit3, Send, X, Sparkles, ChevronDown, Globe, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "@shared/schema";

interface StreamingMessage {
  modelName: string;
  content: string;
  isComplete: boolean;
  sources?: { title: string; url: string }[];
}

interface WebSearchStatus {
  modelName: string;
  phase: "searching" | "results" | "fetching" | "done";
  query?: string;
  count?: number;
  fetchIndex?: number;
  fetchTitle?: string;
  fetchTotal?: number;
}

interface AvailableModel {
  id: string;
  displayName: string;
  role: string;
  icon: string;
  provider: string;
}

export default function Dashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<Map<string, StreamingMessage>>(new Map());
  const [isStreaming, setIsStreaming] = useState(false);
  const [typingModel, setTypingModel] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Enhanced prompt approval state
  const [isRouting, setIsRouting] = useState(false);
  const [routingResult, setRoutingResult] = useState<RoutingResult | null>(null);
  const [editedEnhancedPrompt, setEditedEnhancedPrompt] = useState("");
  const [pendingMode, setPendingMode] = useState<"single" | "multi" | "debate">("single");
  const [pendingContent, setPendingContent] = useState("");
  const [pendingWebSearch, setPendingWebSearch] = useState(false);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [mainModelId, setMainModelId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [webSearchStatus, setWebSearchStatus] = useState<WebSearchStatus | null>(null);
  // Remember the last send params so retry/edit replays the exact same model
  const lastSendModeRef = useRef<"single" | "multi" | "debate" | "direct">("single");
  const lastSendDirectModelIdRef = useRef<string | undefined>(undefined);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const scrollRAFRef = useRef<number>(0);
  const activeConvIdRef = useRef<number | null>(activeConversationId);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persists streaming state per conv so switching away & back restores it
  const streamingStateRef = useRef<Map<number, {
    messages: Map<string, StreamingMessage>;
    isStreaming: boolean;
    typingModel: string | null;
    webSearchStatus: WebSearchStatus | null;
  }>>(new Map());

  const { data: conversationData, isLoading: convLoading } = useConversation(activeConversationId);
  const createConversation = useCreateConversation();
  const { sendMessage } = useSendMessage();

  // Keep ref in sync; restore saved streaming state when switching back to a conv
  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
    setRoutingResult(null);
    setIsRouting(false);

    if (activeConversationId !== null) {
      const saved = streamingStateRef.current.get(activeConversationId);
      setStreamingMessages(saved?.messages ?? new Map());
      setIsStreaming(saved?.isStreaming ?? false);
      setTypingModel(saved?.typingModel ?? null);
      setWebSearchStatus(saved?.webSearchStatus ?? null);
    } else {
      setStreamingMessages(new Map());
      setIsStreaming(false);
      setTypingModel(null);
      setWebSearchStatus(null);
    }
  }, [activeConversationId]);

  // Fetch available models on mount
  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/models", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data.models);
        setMainModelId(data.mainModelId);
      }
    } catch (e) {
      console.error("Failed to fetch models:", e);
    }
  };

  // Handle conversation deletion
  const handleConversationDeleted = useCallback((deletedId: number) => {
    streamingStateRef.current.delete(deletedId);
    if (activeConvIdRef.current === deletedId) {
      setActiveConversationId(null);
      setMessages([]);
      setStreamingMessages(new Map());
      setIsStreaming(false);
      setTypingModel(null);
      setRoutingResult(null);
    }
  }, []);

  // Sync messages
  useEffect(() => {
    if (conversationData?.messages) {
      setMessages(conversationData.messages);
    }
  }, [conversationData]);

  // Track whether the user is near the bottom so we know whether to auto-scroll
  const handleScrollAreaScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Scroll to bottom — immediate (no smooth, avoids animation fighting on every chunk)
  // Uses RAF so multiple calls in the same frame collapse into one
  const scrollToBottom = useCallback((force = false) => {
    if (!force && !isAtBottomRef.current) return; // user scrolled up — don't hijack
    cancelAnimationFrame(scrollRAFRef.current);
    scrollRAFRef.current = requestAnimationFrame(() => {
      const el = scrollAreaRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Auto-scroll when new committed messages arrive or routing UI shows (force = always scroll)
  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, !!routingResult, scrollToBottom]); // only when list grows or routing shows

  // Sticky-scroll while streaming (respects user scroll-up)
  useEffect(() => {
    if (isStreaming) scrollToBottom();
  }, [streamingMessages, isStreaming, scrollToBottom]);

  // Stop / cancel ongoing request
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (activeConvIdRef.current !== null) {
      streamingStateRef.current.delete(activeConvIdRef.current);
    }
    setIsStreaming(false);
    setIsRouting(false);
    setTypingModel(null);
    setStreamingMessages(new Map());
    setWebSearchStatus(null);
  }, []);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setStreamingMessages(new Map());
    setRoutingResult(null);
  }, []);

  // ============================================
  // === Step 1: Route prompt ===
  // ============================================
  const handleSend = async (content: string, mode: "single" | "multi" | "debate" | "direct", enhancerEnabled = true, webSearch = false, directModelId?: string) => {
    // Remap "direct" mode → "single" for internal routing
    const resolvedMode = mode === "direct" ? "single" : mode as "single" | "multi" | "debate";

    // Persist so retry/edit can replay the same model
    lastSendModeRef.current = mode;
    lastSendDirectModelIdRef.current = directModelId;

    setPendingContent(content);
    setPendingMode(resolvedMode);
    setPendingWebSearch(webSearch);
    setRoutingResult(null);

    // Create conversation if needed (shared by both paths)
    let convId = activeConversationId;
    if (!convId) {
      const newConv = await createConversation.mutateAsync(undefined);
      convId = newConv.id;
      setActiveConversationId(convId);
      activeConvIdRef.current = convId;
    }

    // ── Direct mode: bypass routing, send to specific model ───────────────
    if (mode === "direct" && directModelId) {
      handleApproveAndSend(content, "single", content, directModelId, convId, webSearch);
      return;
    }

    // ── Enhancer OFF: skip routing, send directly ──────────────────────────
    if (!enhancerEnabled) {
      handleApproveAndSend(content, resolvedMode, content, undefined, convId, webSearch);
      return;
    }

    // ── Enhancer ON: normal routing flow ──────────────────────────────────
    setIsRouting(true);

    try {
      if (resolvedMode === "single") {
        const result = await routePrompt(convId, content, resolvedMode);
        setIsRouting(false);

        if (result.routingType === "casual") {
          handleApproveAndSend(content, resolvedMode, content, result.targetModel?.id, convId, webSearch);
        } else {
          setRoutingResult(result);
          setEditedEnhancedPrompt(result.enhancedPrompt);
          setSelectedModelId(result.targetModel?.id || "");
        }
      } else {
        const result = await routePrompt(convId, content, resolvedMode);
        setIsRouting(false);
        setRoutingResult(result);
        setEditedEnhancedPrompt(result.enhancedPrompt);
      }
    } catch (error) {
      console.error("Routing error:", error);
      setIsRouting(false);
      const fallbackId = activeConvIdRef.current;
      if (fallbackId) {
        handleApproveAndSend(content, resolvedMode, content, undefined, fallbackId, webSearch);
      }
    }
  };

  // ============================================
  // === Step 2: Approve & Send ===
  // ============================================
  const handleApproveAndSend = async (
    originalContent: string,
    mode: "single" | "multi" | "debate",
    enhancedPrompt: string,
    targetModelId?: string,
    explicitConvId?: number,
    webSearch?: boolean,
  ) => {
    setRoutingResult(null);
    setIsStreaming(true);
    setStreamingMessages(new Map());
    setShowModelDropdown(false);

    const convId = explicitConvId || activeConversationId || activeConvIdRef.current;
    if (!convId) {
      console.error("No conversation ID available");
      setIsStreaming(false);
      return;
    }

    // Initialise per-conv streaming state so it survives navigation away & back
    streamingStateRef.current.set(convId, { messages: new Map(), isStreaming: true, typingModel: null, webSearchStatus: null });

    // Create a new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      await sendMessage(
        convId,
        originalContent,
        mode,
        // onChunk — always update the ref; only update React state when this conv is active
        (modelName, chunkContent) => {
          const s = streamingStateRef.current.get(convId);
          if (!s) return;
          const newMessages = new Map(s.messages);
          const existing = newMessages.get(modelName) ?? { modelName, content: "", isComplete: false };
          newMessages.set(modelName, { ...existing, content: existing.content + chunkContent });
          streamingStateRef.current.set(convId, { ...s, messages: newMessages });
          if (activeConvIdRef.current === convId) {
            setStreamingMessages(new Map(newMessages));
          }
        },
        // onModelStart
        (modelName) => {
          // Only mark who is typing — don't put an empty bubble in streamingMessages
          // yet, because that would immediately hide the TypingIndicator / web-search
          // status banner whose condition checks !streamingMessages.has(typingModel).
          // The streaming bubble will appear on the first chunk.
          const s = streamingStateRef.current.get(convId) ?? { messages: new Map(), isStreaming: true, typingModel: null, webSearchStatus: null };
          streamingStateRef.current.set(convId, { ...s, typingModel: modelName });
          if (activeConvIdRef.current === convId) {
            setTypingModel(modelName);
          }
        },
        // onModelComplete
        (modelName, message) => {
          const s = streamingStateRef.current.get(convId);
          if (s) {
            const newMessages = new Map(s.messages);
            newMessages.delete(modelName);
            streamingStateRef.current.set(convId, { ...s, typingModel: null, messages: newMessages });
            if (activeConvIdRef.current === convId) {
              setTypingModel(null);
              setStreamingMessages(new Map(newMessages));
            }
          }
          if (activeConvIdRef.current === convId) {
            setMessages((prev) => [...prev, message]);
          }
        },
        // onUserMessage
        (message) => {
          if (activeConvIdRef.current === convId) {
            setMessages((prev) => [...prev, message]);
          }
        },
        // onTitleUpdate — already patched in cache by use-chat.ts
        (newTitle) => { void newTitle; },
        // onDone
        () => {
          streamingStateRef.current.delete(convId);
          if (activeConvIdRef.current === convId) {
            setIsStreaming(false);
            setTypingModel(null);
            setStreamingMessages(new Map());
            setWebSearchStatus(null);
          }
        },
        enhancedPrompt,
        targetModelId,
        abortController.signal,
        // onWebSearchStatus
        (modelName, phase, data) => {
          const status: WebSearchStatus = {
            modelName,
            phase: phase as WebSearchStatus["phase"],
            query: data.query,
            count: data.count,
            fetchIndex: data.index,
            fetchTitle: data.title,
            fetchTotal: data.total,
          };
          const s = streamingStateRef.current.get(convId);
          if (s) streamingStateRef.current.set(convId, { ...s, webSearchStatus: phase === "done" ? null : status });
          if (activeConvIdRef.current === convId) {
            setWebSearchStatus(phase === "done" ? null : status);
          }
        },
        webSearch,
        // onWebSources — store live sources on the streaming bubble
        (modelName, sources) => {
          const s = streamingStateRef.current.get(convId);
          if (!s) return;
          const newMessages = new Map(s.messages);
          const existing = newMessages.get(modelName) ?? { modelName, content: "", isComplete: false };
          newMessages.set(modelName, { ...existing, sources });
          streamingStateRef.current.set(convId, { ...s, messages: newMessages });
          if (activeConvIdRef.current === convId) setStreamingMessages(new Map(newMessages));
        },
      );
    } catch (error: any) {
      // Ignore abort errors (user clicked stop)
      if (error?.name !== "AbortError") {
        console.error("Send error:", error);
      }
      streamingStateRef.current.delete(convId);
      if (activeConvIdRef.current === convId) {
        setIsStreaming(false);
        setTypingModel(null);
        setStreamingMessages(new Map());
        setWebSearchStatus(null);
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleSkipRouting = () => {
    setRoutingResult(null);
    handleApproveAndSend(pendingContent, pendingMode, pendingContent, undefined, undefined, pendingWebSearch);
  };

  const handleRetry = async (messageIndex: number) => {
    if (!activeConversationId) return;
    const userMessages = messages.slice(0, messageIndex).filter(m => m.role === "user");
    if (userMessages.length === 0) return;
    const lastUserMessage = userMessages[userMessages.length - 1];

    try {
      await fetch(`/api/chat/conversations/${activeConversationId}/messages/${lastUserMessage.id}/after`, {
        method: "DELETE", credentials: "include",
      });
      const response = await fetch(`/api/chat/conversations/${activeConversationId}`, { credentials: "include" });
      const data = await response.json();
      setMessages(data.messages);
      handleSend(lastUserMessage.content, lastSendModeRef.current, true, false, lastSendDirectModelIdRef.current);
    } catch (error) {
      console.error("Retry error:", error);
    }
  };

  const handleEdit = async (messageId: number, newContent: string) => {
    if (!activeConversationId) return;
    try {
      await fetch(`/api/chat/conversations/${activeConversationId}/messages/${messageId}/after`, {
        method: "DELETE", credentials: "include",
      });
      const response = await fetch(`/api/chat/conversations/${activeConversationId}`, { credentials: "include" });
      const data = await response.json();
      setMessages(data.messages);
      handleSend(newContent, lastSendModeRef.current, true, false, lastSendDirectModelIdRef.current);
    } catch (error) {
      console.error("Edit error:", error);
    }
  };

  const isMultiModelMsg = (msg: Message) => {
    const meta = msg.metadata as any;
    return meta?.isMultiModelResponse === true || meta?.isSummary === true;
  };

  const getSelectedModel = () => {
    return availableModels.find(m => m.id === selectedModelId);
  };

  // Group messages logic
  const groupedMessages = useMemo(() => {
    const groups: (Message | Message[])[] = [];
    let currentMultiGroup: Message[] = [];

    messages.forEach((msg) => {
      if (isMultiModelMsg(msg) && msg.role === "assistant") {
        currentMultiGroup.push(msg);
      } else {
        if (currentMultiGroup.length > 0) {
          groups.push([...currentMultiGroup]);
          currentMultiGroup = [];
        }
        groups.push(msg);
      }
    });
    if (currentMultiGroup.length > 0) {
      groups.push([...currentMultiGroup]);
    }
    return groups;
  }, [messages]);

  const mainModelName = useMemo(() => {
    return availableModels.find(m => m.id === mainModelId)?.displayName || "Main AI";
  }, [availableModels, mainModelId]);

  // Loading
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar
        activeConversationId={activeConversationId}
        onSelectConversation={setActiveConversationId}
        onNewChat={handleNewChat}
        onConversationDeleted={handleConversationDeleted}
      />

      <main className="flex-1 lg:ml-64 flex flex-col h-screen">
        <div className="flex items-center justify-end px-4 py-2 border-b border-white/5">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white hover:bg-white/5 transition-all"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Model Settings</span>
          </button>
        </div>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-white/5"
            >
              <ModelSettings
                onClose={() => setShowSettings(false)}
                onSave={fetchModels}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={scrollAreaRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleScrollAreaScroll}
        >
          {messages.length === 0 && !isStreaming && !routingResult && !isRouting ? (
            <div className="h-full flex flex-col items-center justify-center p-8">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4"
              >
                <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl flex items-center justify-center mx-auto">
                  <MessageSquare className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-white">Start a Conversation</h2>
                <p className="text-muted-foreground max-w-md">
                  Ask anything! <strong className="text-white">{mainModelName}</strong> handles casual chats directly.
                  For specialized tasks, it routes to the best model and lets you review the enhanced prompt first.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {availableModels.map(m => (
                    <span key={m.id} className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground">
                      {m.icon} {m.displayName} {m.id === mainModelId ? "(Main)" : ""}
                    </span>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto py-4 pb-12">
              <AnimatePresence>
                {groupedMessages.map((item, index) => {
                  if (Array.isArray(item)) {
                    // It's a MultiModel Group
                    const isLastGroup = index === groupedMessages.length - 1;
                    const streaming = isLastGroup && isStreaming ? streamingMessages : undefined;

                    const streamingContentMap = streaming
                      ? new Map(Array.from(streaming.entries()).map(([k, v]) => [k, v.content]))
                      : undefined;

                    return (
                      <MultiModelResponse
                        key={`multi-${index}`}
                        messages={item}
                        streamingContent={streamingContentMap}
                      />
                    );
                  } else {
                    const msg = item;
                    return (
                      <ChatMessage
                        key={msg.id}
                        role={msg.role as "user" | "assistant"}
                        content={msg.content}
                        modelName={msg.modelName}
                        timestamp={new Date(msg.createdAt)}
                        metadata={msg.metadata}
                        onRetry={msg.role === "assistant" && !isStreaming ? () => handleRetry(index) : undefined}
                        onEdit={msg.role === "user" && !isStreaming ? (newContent) => handleEdit(msg.id, newContent) : undefined}
                      />
                    );
                  }
                })}

                {/* If we are streaming but NO messages are in the last group yet */}
                {isStreaming && (groupedMessages.length === 0 || !Array.isArray(groupedMessages[groupedMessages.length - 1])) && (
                  (streamingMessages.size > 1 || pendingMode === "multi") ? (
                    <MultiModelResponse
                      key="streaming-multi"
                      messages={[]}
                      streamingContent={new Map(Array.from(streamingMessages.entries()).map(([k, v]) => [k, v.content]))}
                    />
                  ) : (
                    // Single model streaming
                    Array.from(streamingMessages.values()).map((sm) => (
                      <ChatMessage
                        key={`streaming-${sm.modelName}`}
                        role="assistant"
                        content={sm.content}
                        modelName={sm.modelName}
                        isStreaming
                        metadata={sm.sources && sm.sources.length > 0 ? { sources: sm.sources } : undefined}
                      />
                    ))
                  )
                )}

                {/* Routing / Routing Result UI */}
                {isRouting && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-4 my-4 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm font-medium text-white">{mainModelName} is analyzing your prompt...</span>
                    </div>
                  </motion.div>
                )}

                {routingResult && !isStreaming && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="mx-4 my-4 rounded-xl bg-gradient-to-br from-card to-card/80 border border-white/10 overflow-hidden shadow-xl shadow-primary/5"
                  >
                    <div className="px-4 py-3 bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-white/10">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-yellow-400" />
                          <span className="text-sm font-semibold text-white">
                            {routingResult.routingType === "multi"
                              ? "All Models Mode"
                              : routingResult.routingType === "debate"
                                ? "Debate Mode"
                                : "Routing to Specialist"}
                          </span>
                        </div>

                        {routingResult.routingType === "specialized" && (
                          <div className="relative">
                            <button
                              onClick={() => setShowModelDropdown(!showModelDropdown)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm"
                            >
                              <span className="text-lg">{getSelectedModel()?.icon || "🤖"}</span>
                              <div className="text-left">
                                <div className="text-xs font-medium text-white">{getSelectedModel()?.displayName || "Select Model"}</div>
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            <AnimatePresence>
                              {showModelDropdown && (
                                <motion.div
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -5 }}
                                  className="absolute right-0 top-full mt-1 w-72 bg-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                                >
                                  <div className="p-2 max-h-64 overflow-y-auto">
                                    {availableModels.map(model => (
                                      <button
                                        key={model.id}
                                        onClick={() => {
                                          setSelectedModelId(model.id);
                                          setShowModelDropdown(false);
                                        }}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${selectedModelId === model.id
                                          ? "bg-primary/15 border border-primary/30"
                                          : "hover:bg-white/5 border border-transparent"
                                          }`}
                                      >
                                        <span className="text-lg">{model.icon}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-medium text-white">{model.displayName}</div>
                                          <div className="text-[10px] text-muted-foreground">{model.role}</div>
                                        </div>
                                        {selectedModelId === model.id && (
                                          <span className="text-primary text-xs">✓</span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                      {routingResult.reason && (
                        <p className="text-[11px] text-muted-foreground/70 mt-1.5 italic">
                          💡 {routingResult.reason}
                        </p>
                      )}
                    </div>

                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Edit3 className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-medium text-primary">Enhanced Prompt</span>
                        <span className="text-[10px] text-muted-foreground/50">(edit before sending)</span>
                      </div>
                      <textarea
                        value={editedEnhancedPrompt}
                        onChange={(e) => setEditedEnhancedPrompt(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none font-normal leading-relaxed"
                        rows={Math.min(8, Math.max(3, editedEnhancedPrompt.split("\n").length + 1))}
                      />
                      <div className="mt-2 mb-3">
                        <div className="text-[10px] text-muted-foreground/40 mb-1">Your original prompt:</div>
                        <div className="text-xs text-muted-foreground/50 italic bg-white/[0.03] rounded px-2 py-1.5 border border-white/5">
                          {routingResult.originalPrompt}
                        </div>
                      </div>

                      {routingResult.routingType === "multi" && routingResult.models && (
                        <div className="mb-3 pb-3 border-b border-white/5">
                          <div className="text-xs text-muted-foreground/60 mb-2">Will send to {routingResult.models.length} models:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {routingResult.models.map(m => (
                              <span key={m.id} className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground flex items-center gap-1">
                                <span>{m.icon}</span>
                                <span>{m.displayName}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => {
                            setRoutingResult(null);
                            setIsRouting(false);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white hover:bg-white/5 transition-all border border-white/10"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                        <button
                          onClick={handleSkipRouting}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white hover:bg-white/10 transition-all border border-white/10"
                        >
                          Send Original
                        </button>
                        <button
                          onClick={() => {
                            handleApproveAndSend(
                              pendingContent,
                              pendingMode,
                              editedEnhancedPrompt,
                              routingResult?.routingType === "specialized" ? selectedModelId : routingResult?.targetModel?.id,
                              undefined,
                              pendingWebSearch
                            );
                          }}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                        >
                          <Send className="w-3 h-3" />
                          Approve & Send
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Web search status — shown while DDG pipeline is running */}
                {webSearchStatus && (
                  <motion.div
                    key="web-search-status"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-start gap-3 px-4 py-2.5"
                  >
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-4 h-4 text-blue-400 animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {webSearchStatus.phase === "searching" && (
                        <span className="text-xs text-blue-400/80 flex items-center gap-1.5">
                          <Search className="w-3 h-3 animate-spin" style={{ animationDuration: '1.5s' }} />
                          Searching the web{webSearchStatus.query ? <>: <em className="not-italic font-medium text-blue-300 truncate max-w-[260px]">&ldquo;{webSearchStatus.query}&rdquo;</em></> : '...'}
                        </span>
                      )}
                      {webSearchStatus.phase === "results" && (
                        <span className="text-xs text-blue-400/80 flex items-center gap-1.5">
                          <Globe className="w-3 h-3" />
                          Found {webSearchStatus.count} results &mdash; reading pages...
                        </span>
                      )}
                      {webSearchStatus.phase === "fetching" && (
                        <span className="text-xs text-blue-400/80 flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Reading page {webSearchStatus.fetchIndex}/{webSearchStatus.fetchTotal}:
                          <span className="font-medium text-blue-300 truncate max-w-[220px]">{webSearchStatus.fetchTitle}</span>
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Typing indicator — only while waiting for the first chunk and no web search banner is shown */}
                {typingModel && !streamingMessages.has(typingModel) && streamingMessages.size === 0 && !webSearchStatus && (
                  <TypingIndicator modelName={typingModel} />
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          isLoading={isStreaming || isRouting}
          disabled={convLoading}
          availableModels={availableModels}
        />
      </main>
    </div>
  );
}
