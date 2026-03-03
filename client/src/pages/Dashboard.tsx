import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/Sidebar";
import { ChatMessage, TypingIndicator } from "@/components/ChatMessage";
import { ChatInput, CHAT_MODE_STORAGE_KEY, type AttachmentPayload, type ChatMode, type DebateParticipant, type DebateContinueState } from "@/components/ChatInput";
import { MAX_MULTI_MODELS, ModelSettings } from "@/components/ModelSettings";
import { MultiModelResponse } from "@/components/MultiModelResponse";
import { ModelIcon } from "@/components/ModelIcon";
import { useAuth } from "@/hooks/use-auth";
import { useConversation, useCreateConversation, useSendMessage, routePrompt, type RoutingResult, type TokenUsage } from "@/hooks/use-chat";
import { Loader2, MessageSquare, Zap, Edit3, Send, X, Sparkles, ChevronDown, Globe, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "@shared/schema";
import { TokenCounter, type ModelTokenUsage } from "@/components/TokenCounter";

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
  iconUrl?: string;
  provider: string;
}

const POST_STREAM_SYNC_GRACE_MS = 4_000;

function sortMessagesChronologically(items: Message[]): Message[] {
  return [...items].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });
}

const getInitialChatMode = (storageScope?: string): ChatMode => {
  if (typeof window === "undefined") return "single";
  const key = storageScope ? `${CHAT_MODE_STORAGE_KEY}:${storageScope}` : CHAT_MODE_STORAGE_KEY;
  const stored = window.localStorage.getItem(key);
  return stored === "single" || stored === "multi" || stored === "debate" || stored === "direct"
    ? stored
    : "single";
};

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
  const [pendingAttachmentPayload, setPendingAttachmentPayload] = useState<AttachmentPayload | undefined>(undefined);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [mainModelId, setMainModelId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [currentChatMode, setCurrentChatMode] = useState<ChatMode>("single");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedMultiModelIds, setSelectedMultiModelIds] = useState<string[]>([]);
  const [debateParticipants, setDebateParticipants] = useState<DebateParticipant[]>([]);
  const [perModelPrompts, setPerModelPrompts] = useState<Array<{ modelId: string; displayName: string; prompt: string; stance?: string }>>([]); 
  const [webSearchStatus, setWebSearchStatus] = useState<WebSearchStatus | null>(null);
  // Token usage tracking per model for the active conversation
  const [tokensByModel, setTokensByModel] = useState<Map<string, ModelTokenUsage>>(new Map());
  // Remember the last send params so retry/edit replays the exact same model
  const lastSendModeRef = useRef<"single" | "multi" | "debate" | "direct">("single");
  const lastSendDirectModelIdRef = useRef<string | undefined>(undefined);
  // Debate rounds
  const [debateRounds, setDebateRounds] = useState(1);
  const debateRoundsRef = useRef(1);
  // Between-rounds dialog
  const [betweenRoundState, setBetweenRoundState] = useState<{
    currentRound: number;
    totalRounds: number;
    originalContent: string;
    convId: number;
    selectedModelIds: string[];
    debateConfig: DebateParticipant[];
    webSearch: boolean;
  } | null>(null);
  const [betweenRoundInput, setBetweenRoundInput] = useState("");

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const scrollRAFRef = useRef<number>(0);
  const activeConvIdRef = useRef<number | null>(activeConversationId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamSettlingUntilRef = useRef(0);

  // Persists streaming state per conv so switching away & back restores it
  const streamingStateRef = useRef<Map<number, {
    messages: Map<string, StreamingMessage>;
    isStreaming: boolean;
    typingModel: string | null;
    webSearchStatus: WebSearchStatus | null;
  }>>(new Map());
  // Persists token usage per conversation so switching away & back restores it
  const tokenTrackingRef = useRef<Map<number, Map<string, ModelTokenUsage>>>(new Map());

  const { data: conversationData, isLoading: convLoading } = useConversation(activeConversationId);
  const createConversation = useCreateConversation();
  const { sendMessage } = useSendMessage();
  // Prevents the activeConversationId effect from wiping isRouting when we
  // create a new conversation mid-send (the effect fires after setActiveConversationId)
  const pendingRoutingRef = useRef(false);

  // Keep debateRoundsRef in sync
  useEffect(() => { debateRoundsRef.current = debateRounds; }, [debateRounds]);

  // Keep ref in sync; restore saved streaming state when switching back to a conv
  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
    setMessages([]);
    setRoutingResult(null);
    // Only reset routing when switching convs by the user, not during a send flow
    if (!pendingRoutingRef.current) {
      setIsRouting(false);
    }
    pendingRoutingRef.current = false;

    if (activeConversationId !== null) {
      const saved = streamingStateRef.current.get(activeConversationId);
      setStreamingMessages(saved?.messages ?? new Map());
      setIsStreaming(saved?.isStreaming ?? false);
      setTypingModel(saved?.typingModel ?? null);
      setWebSearchStatus(saved?.webSearchStatus ?? null);
      // Restore token tracking for this conversation
      setTokensByModel(tokenTrackingRef.current.get(activeConversationId) ?? new Map());
    } else {
      setStreamingMessages(new Map());
      setIsStreaming(false);
      setTypingModel(null);
      setWebSearchStatus(null);
      setTokensByModel(new Map());
    }
  }, [activeConversationId]);

  // Fetch available models on mount
  useEffect(() => {
    fetchModels();
  }, []);

  // Restore mode for the authenticated user scope
  useEffect(() => {
    if (!user?.id) return;
    setCurrentChatMode(getInitialChatMode(user.id));
  }, [user?.id]);

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/models", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data.models);
        setMainModelId(data.mainModelId);
        setSelectedMultiModelIds((prev) => {
          const validPrev = prev.filter((id) => data.models.some((m: any) => m.id === id));
          if (validPrev.length > 0) return validPrev.slice(0, MAX_MULTI_MODELS);
          return data.models.slice(0, MAX_MULTI_MODELS).map((m: any) => m.id);
        });
        setDebateParticipants((prev) => prev.length > 0 ? prev : [
          { modelId: data.models[0]?.id ?? "", customRole: "", customSystemPrompt: "" },
          { modelId: data.models[1]?.id ?? data.models[0]?.id ?? "", customRole: "", customSystemPrompt: "" },
        ]);
      }
    } catch (e) {
      console.error("Failed to fetch models:", e);
    }
  };

  // Handle conversation deletion
  const handleConversationDeleted = useCallback((deletedId: number) => {
    streamingStateRef.current.delete(deletedId);
    tokenTrackingRef.current.delete(deletedId);
    if (activeConvIdRef.current === deletedId) {
      setActiveConversationId(null);
      setMessages([]);
      setStreamingMessages(new Map());
      setIsStreaming(false);
      setTypingModel(null);
      setRoutingResult(null);
      setTokensByModel(new Map());
    }
  }, []);

  // Sync messages
  const upsertLocalMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === message.id);
      if (idx === -1) return sortMessagesChronologically([...prev, message]);
      const next = [...prev];
      next[idx] = message;
      return sortMessagesChronologically(next);
    });
  }, []);

  useEffect(() => {
    if (conversationData?.messages) {
      setMessages((prev) => {
        const fromServer = conversationData.messages;
        const prevIds = new Set(prev.map((m) => m.id));
        const serverIds = new Set(fromServer.map((m) => m.id));
        const serverIsSubsetOfPrev = fromServer.every((m) => prevIds.has(m.id));
        const missingLocalMessages = prev.some((m) => !serverIds.has(m.id));
        const inPostStreamGrace = Date.now() < streamSettlingUntilRef.current;
        const shouldProtectLocal =
          isStreaming ||
          isRouting ||
          inPostStreamGrace ||
          (fromServer.length < prev.length && serverIsSubsetOfPrev) ||
          (inPostStreamGrace && missingLocalMessages);

        const next = shouldProtectLocal
          ? (() => {
              // Keep already-rendered messages while backend catches up to avoid flicker.
              const merged = new Map<number, Message>();
              for (const msg of fromServer) merged.set(msg.id, msg);
              for (const msg of prev) {
                if (!merged.has(msg.id)) merged.set(msg.id, msg);
              }
              return sortMessagesChronologically(Array.from(merged.values()));
            })()
          : fromServer;

        // Avoid unnecessary re-renders when there is no effective change.
        if (
          next.length === prev.length &&
          next.every((m, i) =>
            m.id === prev[i]?.id &&
            m.content === prev[i]?.content &&
            m.role === prev[i]?.role &&
            m.modelName === prev[i]?.modelName
          )
        ) {
          return prev;
        }
        return next;
      });
    }
  }, [conversationData, isStreaming, isRouting]);

  // Reconstruct token usage from saved message metadata when loading a conversation
  useEffect(() => {
    if (!conversationData?.messages || !activeConversationId) return;
    // Don't overwrite live streaming token data
    if (isStreaming) return;
    // If we already have token data from live streaming for this conversation, keep it
    if (tokenTrackingRef.current.has(activeConversationId) && tokenTrackingRef.current.get(activeConversationId)!.size > 0) return;

    const restoredTokens = new Map<string, ModelTokenUsage>();
    for (const msg of conversationData.messages) {
      if (msg.role !== "assistant" || !msg.modelName) continue;
      const meta = msg.metadata as any;
      const tu = meta?.tokenUsage;
      if (!tu) continue;
      const promptTokens = tu.promptTokens ?? 0;
      const completionTokens = tu.completionTokens ?? 0;
      const totalTokens = tu.totalTokens ?? 0;
      if (totalTokens === 0 && promptTokens === 0 && completionTokens === 0) continue;

      const existing = restoredTokens.get(msg.modelName);
      restoredTokens.set(msg.modelName, {
        modelName: msg.modelName,
        promptTokens: (existing?.promptTokens ?? 0) + promptTokens,
        completionTokens: (existing?.completionTokens ?? 0) + completionTokens,
        totalTokens: (existing?.totalTokens ?? 0) + totalTokens,
      });
    }
    if (restoredTokens.size > 0) {
      tokenTrackingRef.current.set(activeConversationId, restoredTokens);
      setTokensByModel(new Map(restoredTokens));
    }
  }, [conversationData, activeConversationId, isStreaming]);

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
    streamSettlingUntilRef.current = Date.now() + POST_STREAM_SYNC_GRACE_MS;
  }, []);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setStreamingMessages(new Map());
    setRoutingResult(null);
    setPendingAttachmentPayload(undefined);
    setTokensByModel(new Map());
  }, []);

  // Export current conversation as Markdown
  const exportChat = useCallback(async () => {
    if (messages.length === 0) return;
    const lines: string[] = [
      `# Chat Export`,
      `*Exported ${new Date().toLocaleString()}*`,
      ``,
      `---`,
      ``,
    ];
    for (const m of messages) {
      if (m.role === "user") {
        lines.push(`## You`, ``, m.content, ``, `---`, ``);
      } else {
        lines.push(`## ${m.modelName ?? "Assistant"}`, ``, m.content, ``, `---`, ``);
      }
    }
    const text = lines.join("\n");
    const filename = `chat-${new Date().toISOString().slice(0, 10)}.md`;
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "Markdown file", accept: { "text/markdown": [".md"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages]);

  // ============================================
  // === Step 1: Route prompt ===
  // ============================================
  const handleSend = async (
    content: string,
    mode: "single" | "multi" | "debate" | "direct",
    enhancerEnabled = true,
    webSearch = false,
    directModelId?: string,
    attachmentPayload?: AttachmentPayload,
  ) => {
    // In debate-continue mode the input bar routes straight to the next round
    if (betweenRoundState) {
      handleContinueDebateRound(content);
      return;
    }
    // Remap "direct" mode → "single" for internal routing
    const resolvedMode = mode === "direct" ? "single" : mode as "single" | "multi" | "debate";

    // Persist so retry/edit can replay the same model
    lastSendModeRef.current = mode;
    lastSendDirectModelIdRef.current = directModelId;

    setPendingContent(content);
    setPendingMode(resolvedMode);
    setPendingWebSearch(webSearch);
    setPendingAttachmentPayload(attachmentPayload);
    setRoutingResult(null);
    setPerModelPrompts([]);
    const effectiveSelectedModelIds = selectedMultiModelIds.slice(0, MAX_MULTI_MODELS);

    // Create conversation if needed (shared by both paths)
    let convId = activeConversationId;
    if (!convId) {
      const newConv = await createConversation.mutateAsync(undefined);
      convId = newConv.id;
      pendingRoutingRef.current = true; // suppress upcoming effect's isRouting reset
      setActiveConversationId(convId);
      activeConvIdRef.current = convId;
    }

    // ── Direct mode: bypass routing, send to specific model ───────────────
    if (mode === "direct" && directModelId) {
      handleApproveAndSend(content, "single", content, directModelId, convId, webSearch, effectiveSelectedModelIds, debateParticipants, undefined, attachmentPayload);
      return;
    }

    // ── Enhancer OFF: skip routing, send directly ──────────────────────────
    if (!enhancerEnabled) {
      handleApproveAndSend(content, resolvedMode, content, undefined, convId, webSearch, effectiveSelectedModelIds, debateParticipants, undefined, attachmentPayload);
      return;
    }

    // ── Enhancer ON: normal routing flow ──────────────────────────────────
    setIsRouting(true);

    try {
      if (resolvedMode === "single") {
        const result = await routePrompt(convId, content, resolvedMode);
        setIsRouting(false);

        if (result.routingType === "casual") {
          handleApproveAndSend(content, resolvedMode, content, result.targetModel?.id, convId, webSearch, effectiveSelectedModelIds, debateParticipants, undefined, attachmentPayload);
        } else {
          setRoutingResult(result);
          setEditedEnhancedPrompt(result.enhancedPrompt);
          setSelectedModelId(result.targetModel?.id || "");
        }
      } else {
        const result = await routePrompt(convId, content, resolvedMode, effectiveSelectedModelIds, resolvedMode === "debate" ? debateParticipants : undefined);
        setIsRouting(false);
        setRoutingResult(result);
        setEditedEnhancedPrompt(result.enhancedPrompt);
        if (result.perModelPrompts?.length) {
          setPerModelPrompts(result.perModelPrompts.map(p => ({ ...p })));
        }
      }
    } catch (error) {
      console.error("Routing error:", error);
      setIsRouting(false);
      const fallbackId = activeConvIdRef.current;
      if (fallbackId) {
        handleApproveAndSend(content, resolvedMode, content, undefined, fallbackId, webSearch, effectiveSelectedModelIds, debateParticipants, undefined, attachmentPayload);
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
    selectedModelIds?: string[],
    debateConfig?: DebateParticipant[],
    perModelPromptsArg?: Array<{ modelId: string; displayName: string; prompt: string }>,
    attachmentPayload?: AttachmentPayload,
    roundNumber = 1,
  ) => {
    setRoutingResult(null);
    setIsStreaming(true);
    setStreamingMessages(new Map());
    setShowModelDropdown(false);
    streamSettlingUntilRef.current = 0;

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
        (modelName, message, tokenUsage) => {
          // Compute next streaming map
          const s = streamingStateRef.current.get(convId);
          let nextStreamingMessages = s ? new Map(s.messages) : new Map<string, StreamingMessage>();
          nextStreamingMessages.delete(modelName);
          if (s) {
            streamingStateRef.current.set(convId, { ...s, typingModel: null, messages: nextStreamingMessages });
          }

          // Compute next token map
          let nextTokensByModel: Map<string, ModelTokenUsage> | null = null;
          const hasRealTokens = tokenUsage && (tokenUsage.totalTokens > 0 || tokenUsage.promptTokens > 0 || tokenUsage.completionTokens > 0);
          if (hasRealTokens) {
            const convTokens = new Map(tokenTrackingRef.current.get(convId) ?? new Map<string, ModelTokenUsage>());
            const existing = convTokens.get(modelName);
            convTokens.set(modelName, {
              modelName,
              promptTokens: (existing?.promptTokens ?? 0) + tokenUsage!.promptTokens,
              completionTokens: (existing?.completionTokens ?? 0) + tokenUsage!.completionTokens,
              totalTokens: (existing?.totalTokens ?? 0) + tokenUsage!.totalTokens,
            });
            tokenTrackingRef.current.set(convId, convTokens);
            nextTokensByModel = convTokens;
          } else if (!tokenUsage) {
            // Provider responded but didn't return token counts (e.g. groq/compound)
            // Still show the model in the counter with an "N/A" indicator
            const convTokens = new Map(tokenTrackingRef.current.get(convId) ?? new Map<string, ModelTokenUsage>());
            if (!convTokens.has(modelName)) {
              convTokens.set(modelName, {
                modelName,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                unavailable: true,
              });
              tokenTrackingRef.current.set(convId, convTokens);
              nextTokensByModel = convTokens;
            }
          }

          if (activeConvIdRef.current === convId) {
            // Batch all state updates for this model completion into one React render
            setTypingModel(null);
            setStreamingMessages(new Map(nextStreamingMessages));
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === message.id);
              if (idx === -1) return sortMessagesChronologically([...prev, message]);
              const next = [...prev];
              next[idx] = message;
              return sortMessagesChronologically(next);
            });
            if (nextTokensByModel) setTokensByModel(new Map(nextTokensByModel));
          }
        },
        // onUserMessage
        (message) => {
          if (activeConvIdRef.current === convId) {
            upsertLocalMessage(message);
          }
        },
        // onTitleUpdate — already patched in cache by use-chat.ts
        (newTitle) => { void newTitle; },
        // onDone
        () => {
          streamingStateRef.current.delete(convId);
          setPendingAttachmentPayload(undefined);
          // Extend the grace window so the conversationData sync effect doesn't
          // overwrite locally committed messages with a stale server snapshot
          streamSettlingUntilRef.current = Date.now() + POST_STREAM_SYNC_GRACE_MS;
          if (activeConvIdRef.current === convId) {
            // Batch final cleanup into one render
            setIsStreaming(false);
            setTypingModel(null);
            setStreamingMessages(new Map());
            setWebSearchStatus(null);
          }
          // ── Debate rounds: show between-round dialog if more rounds remain ──
          if (mode === "debate" && roundNumber < debateRoundsRef.current) {
            setBetweenRoundState({
              currentRound: roundNumber,
              totalRounds: debateRoundsRef.current,
              originalContent,
              convId,
              selectedModelIds: selectedModelIds ?? [],
              debateConfig: debateConfig ?? [],
              webSearch: webSearch ?? false,
            });
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
        selectedModelIds,
        debateConfig,
        perModelPromptsArg,
        attachmentPayload?.context,
        attachmentPayload?.attachments,
        mode === "debate" ? roundNumber : undefined,
        mode === "debate" ? debateRoundsRef.current : undefined,
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
      streamSettlingUntilRef.current = Date.now() + POST_STREAM_SYNC_GRACE_MS;
      setPendingAttachmentPayload(undefined);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleSkipRouting = () => {
    setRoutingResult(null);
    handleApproveAndSend(
      pendingContent,
      pendingMode,
      pendingContent,
      undefined,
      undefined,
      pendingWebSearch,
      selectedMultiModelIds.slice(0, MAX_MULTI_MODELS),
      debateParticipants,
      undefined,
      pendingAttachmentPayload
    );
  };

  // Continue to next debate round (called from between-round dialog)
  const handleContinueDebateRound = useCallback((userInput: string) => {
    if (!betweenRoundState) return;
    const { currentRound, totalRounds, convId, selectedModelIds, debateConfig, webSearch } = betweenRoundState;
    setBetweenRoundState(null);
    setBetweenRoundInput("");
    const roundContent = userInput.trim()
      ? userInput.trim()
      : `Continue the debate — Round ${currentRound + 1} of ${totalRounds}. Build on the arguments presented so far.`;
    handleApproveAndSend(
      roundContent,
      "debate",
      roundContent,
      undefined,
      convId,
      webSearch,
      selectedModelIds,
      debateConfig,
      undefined,
      undefined,
      currentRound + 1,
    );
  }, [betweenRoundState]);

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

  // Debate-continue state passed down to ChatInput
  const debateContinueState: DebateContinueState | null = betweenRoundState ? {
    currentRound: betweenRoundState.currentRound,
    totalRounds: betweenRoundState.totalRounds,
    onEnd: () => { setBetweenRoundState(null); setBetweenRoundInput(""); },
  } : null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Token Counter - floating top-right */}
      <TokenCounter tokensByModel={tokensByModel} onExportChat={exportChat} />

      <Sidebar
        activeConversationId={activeConversationId}
        onSelectConversation={setActiveConversationId}
        onNewChat={handleNewChat}
        onConversationDeleted={handleConversationDeleted}
        onCollapseChange={setSidebarCollapsed}
      />

      <main
        className={cn(
          "flex-1 flex flex-col h-screen transition-all duration-200 overflow-x-hidden",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        )}
      >
        <div
          ref={scrollAreaRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onScroll={handleScrollAreaScroll}
        >
          {messages.length === 0 && !isStreaming && !routingResult && !isRouting ? (
            <div className="min-h-full flex flex-col items-center justify-center p-8 text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4 w-full max-w-md"
              >
                <h2 className="text-2xl font-bold text-white">
                  {currentChatMode === "single" && "Start a Conversation"}
                  {currentChatMode === "multi" && "All Models, One Query"}
                  {currentChatMode === "debate" && "Let Them Debate"}
                  {currentChatMode === "direct" && "Direct Chat"}
                </h2>
                <p className="text-muted-foreground">
                  {currentChatMode === "single" && (
                    <>Get accurate answers &amp; save your time — <strong className="text-white">{mainModelName}</strong> routes every question to the best model automatically.</>
                  )}
                  {currentChatMode === "multi" && "Every model answers simultaneously — compare perspectives side by side in a single view."}
                  {currentChatMode === "debate" && "Models argue your question from different angles — get richer, more nuanced insights."}
                  {currentChatMode === "direct" && "Talk directly to your chosen model — full control over which AI you're speaking with."}
                </p>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto py-4 pb-12 overflow-x-hidden w-full">
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
                        <span className="text-sm font-medium text-white">
                          {pendingMode === "multi"
                            ? `${mainModelName} is crafting tailored prompts for ${selectedMultiModelIds.length} model${selectedMultiModelIds.length !== 1 ? "s" : ""}...`
                            : pendingMode === "debate"
                              ? `${mainModelName} is designing debate stances for each model...`
                              : `${mainModelName} is analyzing your prompt...`}
                        </span>
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
                              <ModelIcon modelName={getSelectedModel()?.displayName || ""} iconUrl={getSelectedModel()?.iconUrl} size={18} />
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
                                        <ModelIcon modelName={model.displayName} iconUrl={model.iconUrl} size={20} />
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
                        <span className="text-xs font-medium text-primary">
                          {(routingResult.routingType === "multi" || routingResult.routingType === "debate") ? "Per-Model Prompts" : "Enhanced Prompt"}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">(edit before sending)</span>
                      </div>

                      {(routingResult.routingType === "multi" || routingResult.routingType === "debate") && perModelPrompts.length > 0 ? (
                        <div className="space-y-2 mb-3">
                          {perModelPrompts.map((p, i) => {
                            const modelMeta = availableModels.find(m => m.id === p.modelId);
                            const isDebate = routingResult.routingType === "debate";
                            return (
                              <div key={p.modelId} className="rounded-lg border border-white/10 overflow-hidden bg-white/[0.03]">
                                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-white/5">
                                  <ModelIcon modelName={p.displayName} iconUrl={modelMeta?.iconUrl} size={14} />
                                  <span className="text-xs font-medium text-white/80">{p.displayName}</span>
                                  {isDebate && (p as any).stance ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-300/80 ml-1">{(p as any).stance}</span>
                                  ) : modelMeta?.role ? (
                                    <span className="text-[10px] text-muted-foreground/50 ml-1">{modelMeta.role}</span>
                                  ) : null}
                                </div>
                                <textarea
                                  value={p.prompt}
                                  onChange={(e) => setPerModelPrompts(prev =>
                                    prev.map((x, j) => j === i ? { ...x, prompt: e.target.value } : x)
                                  )}
                                  className="w-full bg-transparent px-3 py-2 text-sm text-white/90 focus:outline-none resize-none"
                                  rows={Math.min(6, Math.max(2, p.prompt.split("\n").length + 1))}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea
                          value={editedEnhancedPrompt}
                          onChange={(e) => setEditedEnhancedPrompt(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none font-normal leading-relaxed"
                          rows={Math.min(8, Math.max(3, editedEnhancedPrompt.split("\n").length + 1))}
                        />
                      )}
                      <div className="mt-2 mb-3">
                        <div className="text-[10px] text-muted-foreground/40 mb-1">Your original prompt:</div>
                        <div className="text-xs text-muted-foreground/50 italic bg-white/[0.03] rounded px-2 py-1.5 border border-white/5">
                          {routingResult.originalPrompt}
                        </div>
                      </div>

                      {(routingResult.routingType === "multi" || routingResult.routingType === "debate") && routingResult.models && (
                        <div className="mb-3 pb-3 border-b border-white/5">
                          <div className="text-xs text-muted-foreground/60 mb-2">
                            {routingResult.routingType === "debate" ? `Debate between ${routingResult.models.length} model${routingResult.models.length !== 1 ? "s" : ""}:` : `Will send to ${routingResult.models.length} selected model${routingResult.models.length !== 1 ? "s" : ""}:`}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {routingResult.models.map(m => (
                              <span key={m.id} className="text-[10px] px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-muted-foreground flex items-center gap-1">
                                <ModelIcon modelName={m.displayName} iconUrl={m.iconUrl} size={12} />
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
                              pendingWebSearch,
                              selectedMultiModelIds.slice(0, MAX_MULTI_MODELS),
                              debateParticipants,
                              pendingMode === "multi" || pendingMode === "debate" ? perModelPrompts : undefined,
                              pendingAttachmentPayload,
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

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/5"
            >
              <ModelSettings
                mode={currentChatMode}
                availableModels={availableModels}
                selectedMultiModelIds={selectedMultiModelIds}
                onMultiModelsChange={(ids) => setSelectedMultiModelIds(ids.slice(0, MAX_MULTI_MODELS))}
                debateParticipants={debateParticipants}
                onDebateConfigChange={setDebateParticipants}
                debateRounds={debateRounds}
                onDebateRoundsChange={setDebateRounds}
                onClose={() => setShowSettings(false)}
                onSave={fetchModels}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          isLoading={isStreaming || isRouting}
          disabled={convLoading}
          storageScope={user.id}
          availableModels={availableModels}
          onModeChange={setCurrentChatMode}
          onSettingsClick={() => setShowSettings(v => !v)}
          showSettings={showSettings}
          selectedMultiModelIds={selectedMultiModelIds}
          debateParticipants={debateParticipants}
          debateContinue={debateContinueState}
        />
      </main>
    </div>
  );
}
