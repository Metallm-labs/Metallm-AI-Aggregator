import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { User, Copy, RotateCcw, Edit, ChevronDown, ChevronUp, Zap, Globe, ExternalLink, ChevronRight } from "lucide-react";
import { MarkdownRenderer } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

// Extract hostname for favicon
function getFavicon(url: string): string {
    try {
        const host = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
    } catch {
        return "";
    }
}

// Dynamic model colors and icons configuration
const modelConfig: Record<string, { color: string; bgColor: string; icon: string }> = {
    // OpenRouter Models
    "DeepSeek R1": { color: "text-purple-400", bgColor: "bg-purple-500/20", icon: "🔬" },
    "LLaMA 3.3": { color: "text-green-400", bgColor: "bg-green-500/20", icon: "🦙" },
    "Gemma 3 27B": { color: "text-blue-400", bgColor: "bg-blue-500/20", icon: "💎" },
    "Devstral": { color: "text-cyan-400", bgColor: "bg-cyan-500/20", icon: "⚡" },
    "Nemotron": { color: "text-lime-400", bgColor: "bg-lime-500/20", icon: "🧮" },
    "Qwen 2.5": { color: "text-pink-400", bgColor: "bg-pink-500/20", icon: "✍️" },
    "Gemma 3 12B": { color: "text-amber-400", bgColor: "bg-amber-500/20", icon: "📚" },
    "GLM 4.5": { color: "text-teal-400", bgColor: "bg-teal-500/20", icon: "📊" },
    // Summary
    "Summary": { color: "text-yellow-400", bgColor: "bg-gradient-to-br from-yellow-500/20 to-orange-500/20", icon: "🏆" },
    // Legacy models
    Gemini: { color: "text-blue-400", bgColor: "bg-blue-500/20", icon: "✨" },
    Claude: { color: "text-orange-400", bgColor: "bg-orange-500/20", icon: "🧠" },
    Grok: { color: "text-cyan-400", bgColor: "bg-cyan-500/20", icon: "⚡" },
    LLaMA: { color: "text-green-400", bgColor: "bg-green-500/20", icon: "🦙" },
};

const getModelConfig = (name: string) => {
    return modelConfig[name] || { color: "text-gray-400", bgColor: "bg-gray-500/20", icon: "🤖" };
};

interface ChatMessageProps {
    role: "user" | "assistant" | "system";
    content: string;
    modelName?: string | null;
    isStreaming?: boolean;
    timestamp?: Date;
    onRetry?: () => void;
    onEdit?: (newContent: string) => void;
    metadata?: any;
    isCollapsible?: boolean;
    defaultCollapsed?: boolean;
}

export function ChatMessage({
    role, content, modelName, isStreaming, timestamp, onRetry, onEdit,
    metadata, isCollapsible, defaultCollapsed
}: ChatMessageProps) {
    const isUser = role === "user";
    const config = modelName ? getModelConfig(modelName) : getModelConfig("Gemini");
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(content);
    const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);
    const [showSources, setShowSources] = useState(false);
    const isSummary = modelName === "Summary" || metadata?.isSummary;

    const handleCopy = async () => {
        await navigator.clipboard.writeText(content);
        toast({ description: "Copied to clipboard" });
    };

    const handleEdit = () => {
        if (isEditing && editContent.trim() && editContent !== content) {
            onEdit?.(editContent.trim());
        }
        setIsEditing(!isEditing);
    };

    const handleCancelEdit = () => {
        setEditContent(content);
        setIsEditing(false);
    };

    const formatTime = (date: Date) => {
        return new Date(date).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "flex gap-3 px-4 py-3 group",
                isUser ? "flex-row-reverse" : "flex-row",
                isSummary && "bg-gradient-to-r from-yellow-500/5 to-orange-500/5 border-t border-b border-yellow-500/10"
            )}
        >
            {/* Avatar */}
            <div
                className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm transition-all mt-0.5",
                    isUser
                        ? "bg-gradient-to-br from-primary to-secondary text-white"
                        : config.bgColor,
                    isCollapsible && "cursor-pointer hover:scale-110 hover:ring-2 hover:ring-white/20"
                )}
                onClick={() => isCollapsible && setIsExpanded(!isExpanded)}
                title={isCollapsible ? (isExpanded ? "Click to collapse" : "Click to expand") : undefined}
            >
                {isUser ? <User className="w-4 h-4" /> : <span>{config.icon}</span>}
            </div>

            {/* Message Content */}
            <div className={cn("flex-1 max-w-[80%]", isUser && "flex flex-col items-end")}>

                {/* Model name + role — no web search badge here */}
                {!isUser && modelName && (
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={cn("text-xs font-medium", config.color)}>{modelName}</span>
                        {metadata?.role && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/10">
                                {metadata.role}
                            </span>
                        )}
                        {isSummary && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                                <Zap className="w-2.5 h-2.5" /> Final Summary
                            </span>
                        )}
                        {isCollapsible && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="text-muted-foreground hover:text-white transition-colors"
                            >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                        )}
                    </div>
                )}

                {/* Message body */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={isCollapsible ? { height: 0, opacity: 0 } : false}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={isCollapsible ? { height: 0, opacity: 0 } : undefined}
                            className={cn("relative", isCollapsible && "overflow-hidden")}
                        >
                            {isUser ? (
                                /* ── User bubble ── */
                                isEditing ? (
                                    <div className="space-y-2 rounded-2xl bg-primary px-4 py-3 rounded-br-sm">
                                        <textarea
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="w-full bg-white/10 text-white rounded px-2 py-1 text-base resize-none focus:outline-none focus:ring-1 focus:ring-white/30"
                                            rows={3}
                                            autoFocus
                                        />
                                        <div className="flex gap-2 justify-end">
                                            <button onClick={handleCancelEdit} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">Cancel</button>
                                            <button onClick={handleEdit} className="text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30">Send</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-2xl bg-primary text-white rounded-br-sm px-4 py-3">
                                        <p className="text-base font-medium whitespace-pre-wrap leading-relaxed">{content}</p>
                                    </div>
                                )
                            ) : (
                                /* ── Assistant — clean, no box ── */
                                <div className={cn(
                                    isSummary
                                        ? "rounded-2xl px-4 py-3 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/15 rounded-bl-sm"
                                        : "py-1"
                                )}>
                                    <div className="prose prose-invert prose-base max-w-none [&>p]:text-gray-100 [&>p]:font-normal [&>p]:leading-relaxed [&>p]:text-base [&>ul]:text-gray-100 [&>ol]:text-gray-100 [&>li]:text-gray-100 [&>code]:bg-white/10 [&>code]:text-gray-100 [&>pre]:bg-white/5">
                                        <MarkdownRenderer content={content} />
                                        {isStreaming && (
                                            <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
                                        )}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Collapsed preview */}
                {!isExpanded && isCollapsible && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-muted-foreground/60 italic cursor-pointer hover:text-muted-foreground/80"
                        onClick={() => setIsExpanded(true)}
                    >
                        Click to expand response...
                    </motion.div>
                )}

                {/* ── Sources row + action buttons ── */}
                {!isStreaming && !isEditing && isExpanded && !isUser && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">

                        {/* Favicon preview strip + expand button */}
                        {metadata?.sources?.length > 0 && (
                            <button
                                onClick={() => setShowSources(s => !s)}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-[11px] text-muted-foreground hover:text-white"
                            >
                                {/* First 4 favicons */}
                                <div className="flex items-center -space-x-1">
                                    {(metadata.sources as { title: string; url: string }[]).slice(0, 4).map((src, i) => (
                                        <img
                                            key={i}
                                            src={getFavicon(src.url)}
                                            alt=""
                                            width={14}
                                            height={14}
                                            className="rounded-sm ring-1 ring-black/30 bg-white/5"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                    ))}
                                </div>
                                <Globe className="w-3 h-3 text-blue-400" />
                                <span>{metadata.sources.length} source{metadata.sources.length > 1 ? "s" : ""}</span>
                                <ChevronRight className={cn("w-3 h-3 transition-transform", showSources && "rotate-90")} />
                            </button>
                        )}

                        {/* Copy */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-white/5 hover:bg-white/10 border border-white/10"
                            onClick={handleCopy}
                            title="Copy"
                        >
                            <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {onRetry && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-white/5 hover:bg-white/10 border border-white/10"
                                onClick={onRetry}
                                title="Try again"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                )}

                {/* User action buttons */}
                {!isStreaming && !isEditing && isExpanded && isUser && (
                    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 justify-end">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 bg-card hover:bg-card/80 border border-white/10"
                            onClick={handleCopy}
                            title="Copy"
                        >
                            <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {onEdit && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 bg-card hover:bg-card/80 border border-white/10"
                                onClick={() => setIsEditing(true)}
                                title="Edit"
                            >
                                <Edit className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                )}

                {/* Expanded sources list */}
                <AnimatePresence>
                    {showSources && metadata?.sources?.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-2 pt-2 border-t border-white/8 flex flex-col gap-1">
                                {(metadata.sources as { title: string; url: string }[]).map((source, i) => (
                                    <a
                                        key={i}
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-white transition-colors py-0.5 group/src"
                                    >
                                        <img
                                            src={getFavicon(source.url)}
                                            alt=""
                                            width={14}
                                            height={14}
                                            className="rounded-sm flex-shrink-0 bg-white/5"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).replaceWith((() => {
                                                    const el = document.createElement("span");
                                                    el.className = "w-3.5 h-3.5 flex-shrink-0";
                                                    return el;
                                                })());
                                            }}
                                        />
                                        <span className="truncate group-hover/src:underline">{source.title || source.url}</span>
                                        <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-0 group-hover/src:opacity-60" />
                                    </a>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Timestamp */}
                {timestamp && isExpanded && (
                    <div className="text-[10px] text-muted-foreground/40 mt-1.5">
                        {formatTime(timestamp)}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// Routing indicator component
export function RoutingIndicator({ modelName, role, reason, type }: {
    modelName: string;
    role: string;
    reason: string;
    type: "casual" | "specialized";
}) {
    const config = getModelConfig(modelName);

    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-2 mx-4 rounded-lg bg-white/5 border border-white/10 text-xs"
        >
            <Zap className="w-3 h-3 text-yellow-400" />
            <span className="text-muted-foreground">
                {type === "specialized" ? "Routing to specialist:" : "Handling as general query:"}
            </span>
            <span className={cn("font-medium", config.color)}>
                {config.icon} {modelName}
            </span>
            <span className="text-muted-foreground/60">({role})</span>
        </motion.div>
    );
}

// Typing indicator
export function TypingIndicator({ modelName }: { modelName: string }) {
    const config = getModelConfig(modelName);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex gap-3 px-4 py-3"
        >
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", config.bgColor)}>
                <span>{config.icon}</span>
            </div>
            <div className="flex items-center gap-1">
                <span className={cn("text-xs font-medium mr-2", config.color)}>{modelName}</span>
                <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
            </div>
        </motion.div>
    );
}
