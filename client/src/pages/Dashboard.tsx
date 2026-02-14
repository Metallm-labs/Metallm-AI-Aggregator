import { useState, useRef, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatMessage, TypingIndicator } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ModelSettings } from "@/components/ModelSettings";
import { useAuth } from "@/hooks/use-auth";
import { useConversation, useCreateConversation, useSendMessage, routePrompt, type RoutingResult } from "@/hooks/use-chat";
import { Loader2, MessageSquare, Settings, Zap, Edit3, Send, X, Sparkles, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "@shared/schema";

interface StreamingMessage {
  modelName: string;
  content: string;
  isComplete: boolean;
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
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversationData, isLoading: convLoading } = useConversation(activeConversationId);
  const createConversation = useCreateConversation();
  const { sendMessage } = useSendMessage();

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
      }
    } catch (e) {
      console.error("Failed to fetch models:", e);
    }
  };

  // Handle conversation deletion
  const handleConversationDeleted = (deletedId: number) => {
    if (activeConversationId === deletedId) {
      setActiveConversationId(null);
      setMessages([]);
      setStreamingMessages(new Map());
      setIsStreaming(false);
      setTypingModel(null);
      setRoutingResult(null);
    }
  };

  // Sync messages
  useEffect(() => {
    if (conversationData?.messages) {
      setMessages(conversationData.messages);
    }
  }, [conversationData]);

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessages, routingResult, scrollToBottom]);

  // Handle new chat
  const handleNewChat = async () => {
    setActiveConversationId(null);
    setMessages([]);
    setStreamingMessages(new Map());
    setRoutingResult(null);
  };

  // ============================================
  // === Step 1: Route prompt ===
  // ============================================
  // Store convId in a ref so handleApproveAndSend can always access it
  const activeConvIdRef = useRef<number | null>(activeConversationId);
  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const handleSend = async (content: string, mode: "single" | "multi" | "debate") => {
    setPendingContent(content);
    setPendingMode(mode);
    setIsRouting(true);
    setRoutingResult(null);

    try {
      // Create conversation if needed
      let convId = activeConversationId;
      if (!convId) {
        const newConv = await createConversation.mutateAsync(undefined);
        convId = newConv.id;
        setActiveConversationId(convId);
        activeConvIdRef.current = convId;
      }

      if (mode === "single") {
        // Step 1: Get routing from Gemini
        const result = await routePrompt(convId, content, mode);
        setIsRouting(false);

        if (result.routingType === "casual") {
          // CASUAL → Send directly to main model, NO approval card, NO enhanced prompt
          handleApproveAndSend(content, mode, content, result.targetModel?.id, convId);
        } else {
          // SPECIALIZED → Show approval card with enhanced prompt + model selector
          setRoutingResult(result);
          setEditedEnhancedPrompt(result.enhancedPrompt);
          setSelectedModelId(result.targetModel?.id || "");
        }
      } else if (mode === "multi") {
        const result = await routePrompt(convId, content, mode);
        setIsRouting(false);
        setRoutingResult(result);
        setEditedEnhancedPrompt(result.enhancedPrompt);
      } else {
        const result = await routePrompt(convId, content, mode);
        setIsRouting(false);
        setRoutingResult(result);
        setEditedEnhancedPrompt(result.enhancedPrompt);
      }
    } catch (error) {
      console.error("Routing error:", error);
      setIsRouting(false);
      // Fallback: send directly
      const fallbackId = activeConvIdRef.current;
      if (fallbackId) {
        handleApproveAndSend(content, mode, content, undefined, fallbackId);
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
  ) => {
    setRoutingResult(null);
    setIsStreaming(true);
    setStreamingMessages(new Map());
    setShowModelDropdown(false);

    // Use explicit convId first, then state, then ref
    const convId = explicitConvId || activeConversationId || activeConvIdRef.current;
    if (!convId) {
      console.error("No conversation ID available");
      setIsStreaming(false);
      return;
    }

    try {
      await sendMessage(
        convId,
        originalContent,
        mode,
        // onChunk
        (modelName, chunkContent) => {
          setStreamingMessages((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(modelName) || { modelName, content: "", isComplete: false };
            newMap.set(modelName, { ...existing, content: existing.content + chunkContent });
            return newMap;
          });
        },
        // onModelStart
        (modelName) => {
          setTypingModel(modelName);
          setStreamingMessages((prev) => {
            const newMap = new Map(prev);
            newMap.set(modelName, { modelName, content: "", isComplete: false });
            return newMap;
          });
        },
        // onModelComplete
        (modelName, message) => {
          setTypingModel(null);
          setStreamingMessages((prev) => {
            const newMap = new Map(prev);
            newMap.delete(modelName);
            return newMap;
          });
          setMessages((prev) => [...prev, message]);
        },
        // onUserMessage
        (message) => {
          setMessages((prev) => [...prev, message]);
        },
        // onTitleUpdate
        (_title) => { },
        // onDone
        () => {
          setIsStreaming(false);
          setTypingModel(null);
          setStreamingMessages(new Map());
        },
        enhancedPrompt,
        targetModelId,
      );
    } catch (error) {
      console.error("Send error:", error);
      setIsStreaming(false);
    }
  };

  // Skip routing - send original prompt directly
  const handleSkipRouting = () => {
    setRoutingResult(null);
    handleApproveAndSend(pendingContent, pendingMode, pendingContent, undefined);
  };

  // Handle retry
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
      handleSend(lastUserMessage.content, "single");
    } catch (error) {
      console.error("Retry error:", error);
    }
  };

  // Handle edit
  const handleEdit = async (messageId: number, newContent: string) => {
    if (!activeConversationId) return;
    try {
      await fetch(`/api/chat/conversations/${activeConversationId}/messages/${messageId}/after`, {
        method: "DELETE", credentials: "include",
      });
      const response = await fetch(`/api/chat/conversations/${activeConversationId}`, { credentials: "include" });
      const data = await response.json();
      setMessages(data.messages);
      handleSend(newContent, "single");
    } catch (error) {
      console.error("Edit error:", error);
    }
  };

  // Check if multi-model response
  const isMultiModelMsg = (msg: Message) => {
    const meta = msg.metadata as any;
    return meta?.isMultiModelResponse === true;
  };

  // Get currently selected model for the dropdown
  const getSelectedModel = () => {
    return availableModels.find(m => m.id === selectedModelId);
  };

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
        {/* Top bar */}
        <div className="flex items-center justify-end px-4 py-2 border-b border-white/5">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white hover:bg-white/5 transition-all"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Model Settings</span>
          </button>
        </div>

        {/* Model Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-white/5"
            >
              <ModelSettings onClose={() => setShowSettings(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !isStreaming && !routingResult && !isRouting ? (
            // Empty state
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
                  Ask anything! <strong className="text-white">Gemini Flash</strong> handles casual chats directly.
                  For specialized tasks, it routes to the best model and lets you review the enhanced prompt first.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {[
                    "✨ Gemini Flash (Default)",
                    "🔬 Deep Reasoning",
                    "🦙 General",
                    "💎 Technical",
                    "⚡ Code",
                    "🧮 Math",
                    "✍️ Creative",
                    "📚 Research",
                    "📊 Business"
                  ].map(tag => (
                    <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-6 flex flex-col items-center gap-2 text-xs text-muted-foreground/60">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-primary" />
                    <span><strong className="text-primary">Casual</strong> → Gemini answers directly</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    <span><strong className="text-yellow-400">Specialized</strong> → Routes to best model + you approve enhanced prompt</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>👥</span>
                    <span><strong className="text-primary">All Models</strong> → Every model responds + summary</span>
                  </div>
                </div>
              </motion.div>
            </div>
          ) : (
            // Messages list
            <div className="max-w-4xl mx-auto py-4 pb-12">
              <AnimatePresence>
                {messages.map((msg, index) => (
                  <ChatMessage
                    key={msg.id}
                    role={msg.role as "user" | "assistant"}
                    content={msg.content}
                    modelName={msg.modelName}
                    timestamp={new Date(msg.createdAt)}
                    metadata={msg.metadata}
                    isCollapsible={isMultiModelMsg(msg)}
                    defaultCollapsed={isMultiModelMsg(msg)}
                    onRetry={msg.role === "assistant" && !isStreaming ? () => handleRetry(index) : undefined}
                    onEdit={msg.role === "user" && !isStreaming ? (newContent) => handleEdit(msg.id, newContent) : undefined}
                  />
                ))}

                {/* ======================================== */}
                {/* === Routing Loading Indicator === */}
                {/* ======================================== */}
                {isRouting && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-4 my-4 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm font-medium text-white">Gemini Flash is analyzing your prompt...</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Deciding if this needs a specialist model or if Gemini can handle it directly.
                    </p>
                  </motion.div>
                )}

                {/* ======================================== */}
                {/* === Enhanced Prompt Approval Card === */}
                {/* === (Only shown for specialized routing) === */}
                {/* ======================================== */}
                {routingResult && !isStreaming && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="mx-4 my-4 rounded-xl bg-gradient-to-br from-card to-card/80 border border-white/10 overflow-hidden shadow-xl shadow-primary/5"
                  >
                    {/* Routing Header */}
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

                        {/* Model Selector (Single mode only) */}
                        {routingResult.routingType === "specialized" && (
                          <div className="relative">
                            <button
                              onClick={() => setShowModelDropdown(!showModelDropdown)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm"
                            >
                              <span className="text-lg">{getSelectedModel()?.icon || "🤖"}</span>
                              <div className="text-left">
                                <div className="text-xs font-medium text-white">{getSelectedModel()?.displayName || "Select Model"}</div>
                                <div className="text-[10px] text-muted-foreground">{getSelectedModel()?.role}</div>
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>

                            {/* Model Dropdown */}
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
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground/60">
                                          {model.provider === "gemini" ? "Gemini" : "OpenRouter"}
                                        </span>
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

                    {/* Enhanced Prompt Editor */}
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

                      {/* Original prompt comparison */}
                      <div className="mt-2 mb-3">
                        <div className="text-[10px] text-muted-foreground/40 mb-1">Your original prompt:</div>
                        <div className="text-xs text-muted-foreground/50 italic bg-white/[0.03] rounded px-2 py-1.5 border border-white/5">
                          {routingResult.originalPrompt}
                        </div>
                      </div>

                      {/* Multi-model list */}
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

                      {/* Action Buttons */}
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
                              routingResult?.routingType === "specialized" ? selectedModelId : routingResult?.targetModel?.id
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

                {/* Streaming messages */}
                {Array.from(streamingMessages.values()).map((sm) => (
                  <ChatMessage
                    key={`streaming-${sm.modelName}`}
                    role="assistant"
                    content={sm.content}
                    modelName={sm.modelName}
                    isStreaming
                  />
                ))}

                {/* Typing indicator */}
                {typingModel && !streamingMessages.has(typingModel) && (
                  <TypingIndicator modelName={typingModel} />
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Chat Input */}
        <ChatInput
          onSend={handleSend}
          isLoading={isStreaming || isRouting}
          disabled={convLoading}
        />
      </main>
    </div>
  );
}
