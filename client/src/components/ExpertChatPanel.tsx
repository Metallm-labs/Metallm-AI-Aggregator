import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Download, Bot, Loader2, MessageSquare, Sparkles, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateConversation, useSendMessage } from "@/hooks/use-chat";

interface ExpertMessage {
  role: "user" | "assistant";
  content: string;
  modelName?: string;
  id: string;
}

interface ExpertChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

async function downloadMarkdown(messages: ExpertMessage[]) {
  const lines: string[] = [
    `# Expert Chat Session`,
    `*Exported on ${new Date().toLocaleString()}*`,
    ``,
    `---`,
    ``,
  ];
  for (const m of messages) {
    if (m.role === "user") {
      lines.push(`## You`, ``, m.content, ``, `---`, ``);
    } else {
      lines.push(`## Expert${m.modelName ? ` (${m.modelName})` : ""}`, ``, m.content, ``, `---`, ``);
    }
  }
  const text = lines.join("\n");

  // Use File System Access API where available (shows save-as dialog)
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `expert-chat-${new Date().toISOString().slice(0, 10)}.md`,
        types: [
          {
            description: "Markdown file",
            accept: { "text/markdown": [".md"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (e: any) {
      if (e?.name === "AbortError") return; // user cancelled – do nothing
    }
  }

  // Fallback: trigger <a download>
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `expert-chat-${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExpertChatPanel({ isOpen, onClose }: ExpertChatPanelProps) {
  const [messages, setMessages] = useState<ExpertMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convIdRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createConversation = useCreateConversation();
  const { sendMessage } = useSendMessage();

  // Keep ref in sync
  useEffect(() => {
    convIdRef.current = conversationId;
  }, [conversationId]);

  // Scroll to bottom as content streams in
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
    }
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");

    // Append user message
    const userMsgId = `u-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: text }]);
    setIsStreaming(true);
    setStreamingContent("");

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      // Create conversation on first message
      let convId = convIdRef.current;
      if (!convId) {
        const conv = await createConversation.mutateAsync("🤖 Expert Chat");
        convId = conv.id;
        setConversationId(convId);
        convIdRef.current = convId;
      }

      let assistantContent = "";
      let assistantModel = "";
      const assistantMsgId = `a-${Date.now()}`;

      await sendMessage(
        convId,
        text,
        "single",
        // onChunk
        (_modelName, chunk) => {
          assistantContent += chunk;
          setStreamingContent(assistantContent);
        },
        // onModelStart
        (modelName) => {
          assistantModel = modelName;
        },
        // onModelComplete
        (modelName, _msg) => {
          assistantModel = modelName;
        },
        // onUserMessage
        () => {},
        // onTitleUpdate
        undefined,
        // onDone
        () => {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMsgId,
              role: "assistant",
              content: assistantContent,
              modelName: assistantModel,
            },
          ]);
          setStreamingContent("");
          setIsStreaming(false);
        },
        // enhancedPrompt – pass through unchanged (no routing/enhancement)
        text,
        // targetModelId – let server pick the main model
        undefined,
        // signal
        abortController.signal,
      );
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "⚠️ Something went wrong. Please try again.",
          },
        ]);
      }
      setStreamingContent("");
      setIsStreaming(false);
    }
  }, [input, isStreaming, createConversation, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (streamingContent) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-stopped-${Date.now()}`,
          role: "assistant",
          content: streamingContent + "\n\n*[Stopped]*",
        },
      ]);
    }
    setStreamingContent("");
    setIsStreaming(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="relative w-full max-w-2xl h-[85vh] sm:h-[75vh] bg-card border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-card/80 backdrop-blur-xl flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Expert Chat</h3>
                  <p className="text-[10px] text-muted-foreground/60">Chat with AI • ask anything</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={() => void downloadMarkdown(messages)}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"
                    title="Download as Markdown (choose location)"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Export .md</span>
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-7 w-7 text-muted-foreground hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
            >
              {messages.length === 0 && !isStreaming && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center gap-3 py-8"
                >
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/15 flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-cyan-400/50" />
                  </div>
                  <div>
                    <p className="text-white/70 font-medium text-sm mb-1">Ask the Expert</p>
                    <p className="text-muted-foreground/50 text-xs max-w-[260px]">
                      Ask anything — analysis, explanations, code review, brainstorming, or advice.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                    {[
                      "Summarize this concept",
                      "Review my code",
                      "Explain in simple terms",
                      "Give me 3 ideas",
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground hover:text-white hover:border-white/20 transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex gap-2.5", m.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {m.role === "assistant" && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                        m.role === "user"
                          ? "bg-primary text-white rounded-br-sm"
                          : "bg-white/5 border border-white/10 text-white/90 rounded-bl-sm"
                      )}
                    >
                      {m.content}
                      {m.role === "assistant" && m.modelName && (
                        <div className="text-[10px] text-muted-foreground/40 mt-1.5">
                          via {m.modelName}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Streaming bubble */}
              {isStreaming && streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-2.5 justify-start"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2.5 bg-white/5 border border-white/10 text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
                    {streamingContent}
                    <span className="inline-block w-1.5 h-4 bg-cyan-400/70 ml-0.5 rounded-sm animate-pulse align-bottom" />
                  </div>
                </motion.div>
              )}

              {/* Waiting indicator */}
              {isStreaming && !streamingContent && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/15 flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  </div>
                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-white/5 border border-white/10 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="px-4 py-3 border-t border-white/10 flex-shrink-0 bg-card/50">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the expert… (Enter to send, Shift+Enter for new line)"
                  className="flex-1 min-h-[44px] max-h-[120px] bg-white/5 border-white/10 resize-none text-sm placeholder:text-muted-foreground/40 focus-visible:ring-primary/30"
                  rows={1}
                  disabled={isStreaming}
                />
                {isStreaming ? (
                  <Button
                    type="button"
                    onClick={handleStop}
                    size="icon"
                    className="h-11 w-11 flex-shrink-0 bg-red-500 hover:bg-red-600 text-white"
                    title="Stop"
                  >
                    <span className="w-3 h-3 bg-white rounded-sm" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!input.trim()}
                    size="icon"
                    className={cn(
                      "h-11 w-11 flex-shrink-0 transition-all",
                      input.trim()
                        ? "bg-primary hover:bg-primary/90 text-white"
                        : "bg-white/5 text-muted-foreground"
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
