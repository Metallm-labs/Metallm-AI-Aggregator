import { useState, useEffect } from "react";
import { Message } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Maximize2, Minimize2, Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

interface MultiModelResponseProps {
    messages: Message[];
    streamingContent?: Map<string, string>; // modelName -> content
    onRetry?: () => void;
}

export function MultiModelResponse({ messages, streamingContent, onRetry }: MultiModelResponseProps) {
    // Merge executed messages with streaming content
    const allModels = [...messages];

    // If we have streaming content, check if it's for a model not yet in messages, or update existing?
    // Actually, Dashboard separates them. Completed messages are in `messages`. Streaming are in `streamingContent`.
    // So we should combine them.
    if (streamingContent) {
        streamingContent.forEach((content, modelName) => {
            if (!allModels.find(m => m.modelName === modelName)) {
                allModels.push({
                    id: -1, // temporary ID
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

    // Find summary and regular models
    const summaryMsg = allModels.find(m => (m.metadata as any)?.isSummary || m.modelName === "✨ Summary");
    const otherModels = allModels.filter(m => m !== summaryMsg);

    // Default to summary if available, otherwise first model
    const [selectedModel, setSelectedModel] = useState<string | null>(summaryMsg?.modelName || otherModels[0]?.modelName || null);

    // Update selection if it was null and now we have models (e.g. started streaming)
    useEffect(() => {
        if (!selectedModel && (summaryMsg || otherModels.length > 0)) {
            setSelectedModel(summaryMsg?.modelName || otherModels[0]?.modelName);
        }
    }, [summaryMsg, otherModels, selectedModel]);

    const activeMsg = allModels.find(m => m.modelName === selectedModel);

    const [copied, setCopied] = useState(false);
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!activeMsg && allModels.length === 0) return null;

    return (
        <div className="w-full max-w-4xl mx-auto my-6">
            <div className="rounded-xl border border-white/10 bg-card overflow-hidden shadow-xl">
                {/* Header / Tabs */}
                <div className="flex flex-col border-b border-white/10 bg-white/5">
                    <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                        <span>Multi-Model Analysis ({otherModels.length} models)</span>
                        {onRetry && (
                            <button onClick={onRetry} className="hover:text-white transition-colors">
                                Retry All
                            </button>
                        )}
                    </div>

                    <div className="flex overflow-x-auto no-scrollbar gap-1 px-2 pb-2">
                        {/* Summary Tab */}
                        {summaryMsg && (
                            <button
                                onClick={() => setSelectedModel(summaryMsg.modelName)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${selectedModel === summaryMsg.modelName
                                        ? "bg-primary/20 text-primary border border-primary/20"
                                        : "hover:bg-white/10 text-muted-foreground border border-transparent"
                                    }`}
                            >
                                <span>✨</span>
                                <span>Summary</span>
                            </button>
                        )}

                        {/* Other Models Tabs */}
                        {otherModels.map((m) => (
                            <button
                                key={m.modelName}
                                onClick={() => setSelectedModel(m.modelName)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${selectedModel === m.modelName
                                        ? "bg-white/10 text-white border border-white/20 shadow-sm"
                                        : "hover:bg-white/5 text-muted-foreground border border-transparent"
                                    }`}
                            >
                                <span>{getIconForModel(m.modelName)}</span>
                                <span>{m.modelName}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-6 min-h-[200px] bg-card">
                    <AnimatePresence mode="wait">
                        {activeMsg ? (
                            <motion.div
                                key={activeMsg.modelName}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl">{getIconForModel(activeMsg.modelName)}</span>
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">{activeMsg.modelName}</h3>
                                            <p className="text-xs text-muted-foreground">
                                                {(activeMsg.metadata as any)?.provider || "AI Model"} • {(activeMsg.metadata as any)?.role || "Assistant"}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(activeMsg.content)}
                                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-white"
                                        title="Copy response"
                                    >
                                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>

                                <div className="prose prose-invert max-w-none text-sm leading-relaxed text-gray-300">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            code({ node, inline, className, children, ...props }: any) {
                                                const match = /language-(\w+)/.exec(className || "");
                                                return !inline && match ? (
                                                    <div className="relative group">
                                                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <span className="text-xs text-muted-foreground">{match[1]}</span>
                                                        </div>
                                                        <SyntaxHighlighter
                                                            style={oneDark}
                                                            language={match[1]}
                                                            PreTag="div"
                                                            {...props}
                                                            customStyle={{ margin: 0, borderRadius: "0.5rem", background: "#1e1e1e" }}
                                                        >
                                                            {String(children).replace(/\n$/, "")}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                ) : (
                                                    <code className={`${className} bg-white/10 px-1.5 py-0.5 rounded text-white`} {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            },
                                        }}
                                    >
                                        {activeMsg.content || "..."}
                                    </ReactMarkdown>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <div className="animate-pulse">Waiting for responses...</div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

function getIconForModel(name: string | null) {
    if (!name) return "🤖";
    if (name.includes("Gemini")) return "✨";
    if (name.includes("DeepSeek")) return "🔬";
    if (name.includes("LLaMA")) return "🦙";
    if (name.includes("Gemma")) return "💎";
    if (name.includes("Devstral")) return "⚡";
    if (name.includes("Nemotron")) return "🧮";
    if (name.includes("Qwen")) return "✍️";
    if (name.includes("GLM")) return "📊";
    if (name.includes("Summary")) return "📋";
    return "🤖";
}
