import { useState, useEffect } from "react";
import { Message } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Copy, Check, Brain, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelIcon } from "@/components/ModelIcon";
import { MarkdownRenderer } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ── Parse <think> blocks out of model content ─────────────────────────────────
function parseThinkingContent(raw: string): { thinkingBlocks: string[]; visibleContent: string } {
    const thinkingBlocks: string[] = [];
    const cleaned = raw.replace(/<think>([\s\S]*?)<\/think>/gi, (_match, inner: string) => {
        const trimmed = inner.trim();
        if (trimmed) thinkingBlocks.push(trimmed);
        return "";
    });
    const openIdx = cleaned.lastIndexOf("<think>");
    const closeIdx = cleaned.lastIndexOf("</think>");
    let visibleContent = cleaned;
    if (openIdx !== -1 && openIdx > closeIdx) {
        const partial = cleaned.slice(openIdx + 7).trim();
        if (partial) thinkingBlocks.push(partial + " ▌");
        visibleContent = cleaned.slice(0, openIdx);
    }
    return { thinkingBlocks, visibleContent: visibleContent.trim() };
}

// ── Model colour palette (mirrors ChatMessage) ────────────────────────────────
const modelConfig: Record<string, { color: string; bgColor: string }> = {
    "DeepSeek R1":      { color: "text-purple-400",  bgColor: "bg-purple-500/20" },
    "Nemotron":         { color: "text-lime-400",    bgColor: "bg-lime-500/20" },
    "GLM 4.5":          { color: "text-teal-400",    bgColor: "bg-teal-500/20" },
    "Trinity Large":    { color: "text-orange-400",  bgColor: "bg-orange-500/20" },
    "LLaMA 3.3 70B":    { color: "text-blue-400",    bgColor: "bg-blue-500/20" },
    "LLaMA 4 Maverick": { color: "text-violet-400",  bgColor: "bg-violet-500/20" },
    "LLaMA 4 Scout":    { color: "text-green-400",   bgColor: "bg-green-500/20" },
    "Kimi K2":          { color: "text-cyan-400",    bgColor: "bg-cyan-500/20" },
    "Qwen 3 32B":       { color: "text-orange-400",  bgColor: "bg-orange-500/20" },
    "GPT OSS 120B":     { color: "text-lime-400",    bgColor: "bg-lime-500/20" },
    "Groq Compound":    { color: "text-yellow-400",  bgColor: "bg-yellow-500/20" },
    "Gemini":           { color: "text-blue-400",    bgColor: "bg-blue-500/20" },
    "Summary":          { color: "text-yellow-400",  bgColor: "bg-gradient-to-br from-yellow-500/20 to-orange-500/20" },
};
const getModelCfg = (name: string | null) =>
    modelConfig[name ?? ""] ?? { color: "text-gray-400", bgColor: "bg-gray-500/20" };

// ─────────────────────────────────────────────────────────────────────────────

interface MultiModelResponseProps {
    messages: Message[];
    streamingContent?: Map<string, string>;
    onRetry?: () => void;
}

export function MultiModelResponse({ messages, streamingContent, onRetry }: MultiModelResponseProps) {
    const { toast } = useToast();

    // ── Merge completed + streaming ─────────────────────────────────────────
    // When streaming is active, REPLACE existing messages for streaming models
    // so the same model never appears twice in the switcher row.
    const allModels: Message[] = messages.map(msg => {
        const streamContent = streamingContent?.get(msg.modelName ?? "");
        if (streamContent !== undefined) {
            return { ...msg, id: -1, content: streamContent } as Message;
        }
        return msg;
    });
    if (streamingContent) {
        streamingContent.forEach((content, modelName) => {
            if (!allModels.find(m => m.modelName === modelName)) {
                allModels.push({
                    id: -1,
                    conversationId: -1,
                    role: "assistant",
                    content,
                    modelName,
                    createdAt: new Date(),
                    metadata: { isMultiModelResponse: true },
                } as Message);
            }
        });
    }

    const summaryMsg = allModels.find(m => (m.metadata as any)?.isSummary || m.modelName === "✨ Summary");
    const otherModels = allModels.filter(m => m !== summaryMsg);

    const [selectedModel, setSelectedModel] = useState<string | null>(
        summaryMsg?.modelName ?? otherModels[0]?.modelName ?? null
    );

    // When the message list changes (e.g. retry clears old messages), reset
    // the selection to the first available model so we don't keep a stale name.
    useEffect(() => {
        const available = allModels.map(m => m.modelName);
        if (!selectedModel || !available.includes(selectedModel)) {
            setSelectedModel(summaryMsg?.modelName ?? otherModels[0]?.modelName ?? null);
        }
    }, [messages, streamingContent]);

    const activeMsg = allModels.find(m => m.modelName === selectedModel);
    const isSummary = !!(activeMsg?.metadata as any)?.isSummary || activeMsg?.modelName === "✨ Summary";
    const isStreaming = activeMsg?.id === -1;

    const { thinkingBlocks, visibleContent } = activeMsg
        ? parseThinkingContent(activeMsg.content)
        : { thinkingBlocks: [], visibleContent: "" };
    const hasThinking = thinkingBlocks.length > 0;

    const [showThinking, setShowThinking] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isStreaming && hasThinking) setShowThinking(true);
    }, [isStreaming, hasThinking]);

    useEffect(() => { setShowThinking(false); }, [selectedModel]);

    if (!activeMsg && allModels.length === 0) return null;

    const activeCfg = getModelCfg(activeMsg?.modelName ?? null);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(visibleContent || activeMsg?.content || "");
        setCopied(true);
        toast({ description: "Copied to clipboard" });
        setTimeout(() => setCopied(false), 2000);
    };

    // Summary always last in the switcher row
    const tabOrder = [...otherModels, ...(summaryMsg ? [summaryMsg] : [])];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-0 sm:gap-3 px-3 sm:px-4 py-3 group w-full min-w-0 overflow-x-hidden"
        >
            {/* ── Left avatar — active model, desktop only ── */}
            <div className={cn(
                "hidden sm:flex w-8 h-8 rounded-full items-center justify-center flex-shrink-0 mt-0.5 transition-all",
                activeCfg.bgColor
            )}>
                <ModelIcon modelName={activeMsg?.modelName ?? ""} size={18} />
            </div>

            {/* ── Right side ── */}
            <div className="min-w-0 flex-1">

                {/* ── Header: active name + role + switcher row ── */}
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {/* Mobile inline avatar */}
                    <div className={cn("sm:hidden w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0", activeCfg.bgColor)}>
                        <ModelIcon modelName={activeMsg?.modelName ?? ""} size={16} />
                    </div>

                    {/* Active model name */}
                    <span className={cn("text-xs font-medium", activeCfg.color)}>
                        {activeMsg?.modelName ?? ""}
                    </span>

                    {/* Role badge */}
                    {(activeMsg?.metadata as any)?.role && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/10">
                            {(activeMsg?.metadata as any)?.role}
                        </span>
                    )}

                    {/* Summary badge */}
                    {isSummary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5" /> Final Summary
                        </span>
                    )}

                    <div className="flex-1" />

                    {/* Model switcher avatars */}
                    <div className="flex items-center gap-1 flex-wrap">
                        {tabOrder.map((m) => {
                            const cfg = getModelCfg(m.modelName);
                            const isActive = m.modelName === selectedModel;
                            const modelStreaming = m.id === -1;
                            return (
                                <button
                                    key={m.modelName}
                                    onClick={() => setSelectedModel(m.modelName)}
                                    title={m.modelName ?? ""}
                                    className={cn(
                                        "relative w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0",
                                        cfg.bgColor,
                                        isActive
                                            ? "ring-2 ring-white/50 scale-110 shadow-md"
                                            : "opacity-40 hover:opacity-75 hover:scale-105"
                                    )}
                                >
                                    <ModelIcon modelName={m.modelName ?? ""} size={14} />
                                    {modelStreaming && (
                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse border border-black/40" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Content area ── */}
                <AnimatePresence mode="wait">
                    {activeMsg && (
                        <motion.div
                            key={activeMsg.modelName}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                        >
                            {/* Thinking / reasoning block */}
                            {hasThinking && (
                                <div className="mb-3">
                                    <button
                                        onClick={() => setShowThinking(s => !s)}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/15 transition-colors text-[11px] text-purple-300 hover:text-purple-200 w-full text-left"
                                    >
                                        <Brain className="w-3 h-3 flex-shrink-0" />
                                        <span className="font-medium">
                                            {isStreaming && !activeMsg.content.includes("</think>") ? "Thinking…" : "View Reasoning"}
                                        </span>
                                        <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform flex-shrink-0", showThinking && "rotate-180")} />
                                    </button>
                                    <AnimatePresence>
                                        {showThinking && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-1.5 px-3 py-2.5 rounded-lg bg-purple-500/5 border border-purple-500/15 text-xs text-purple-200/70 leading-relaxed whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                                                    {thinkingBlocks.join("\n\n---\n\n")}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* Prose content */}
                            <div className={cn(
                                "py-1",
                                isSummary && "rounded-2xl px-4 py-3 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/15"
                            )}>
                                <div className="prose prose-invert prose-base max-w-none min-w-0 [&>p]:text-gray-100 [&>p]:font-normal [&>p]:leading-[1.8] sm:[&>p]:leading-relaxed [&>ul]:text-gray-100 [&>ol]:text-gray-100 [&>li]:text-gray-100 [&>li]:leading-[1.8] sm:[&>li]:leading-relaxed [&>code]:text-[#9cdcfe] [&>pre]:bg-[#1e1e1e] [&_pre]:max-w-full [&_pre]:overflow-x-auto">
                                    <MarkdownRenderer content={visibleContent || (isStreaming ? "" : activeMsg.content)} enableMermaid={!isStreaming} />
                                    {isStreaming && (
                                        <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Waiting state — no messages yet */}
                    {!activeMsg && (
                        <motion.div
                            key="waiting"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center gap-2 py-2 text-xs text-muted-foreground"
                        >
                            <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                            Waiting for responses…
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Action row */}
                {!isStreaming && activeMsg && (
                    <div className="flex items-center gap-1.5 mt-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-white/5 hover:bg-white/10 border border-white/10"
                            onClick={handleCopy}
                            title="Copy"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
