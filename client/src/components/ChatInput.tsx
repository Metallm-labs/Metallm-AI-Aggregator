import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paperclip, Send, Sparkles, Users, MessageSquare, X, FileText, Image as ImageIcon, Square, Globe, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type ChatMode = "single" | "multi" | "debate";

interface ChatInputProps {
    onSend: (content: string, mode: ChatMode, enhancerEnabled: boolean, webSearch?: boolean) => void;
    onStop?: () => void;
    isLoading?: boolean;
    disabled?: boolean;
}

const modeConfig: Record<ChatMode, { label: string; icon: React.ReactNode; description: string }> = {
    single: {
        label: "Smart Route",
        icon: <Sparkles className="w-4 h-4" />,
        description: "AI picks the best model"
    },
    multi: {
        label: "All Models",
        icon: <Users className="w-4 h-4" />,
        description: "All models + summary"
    },
    debate: {
        label: "Debate Mode",
        icon: <MessageSquare className="w-4 h-4" />,
        description: "Models discuss"
    },
};

export function ChatInput({ onSend, onStop, isLoading, disabled }: ChatInputProps) {
    const [content, setContent] = useState("");
    const [mode, setMode] = useState<ChatMode>("single");
    const [enhancerEnabled, setEnhancerEnabled] = useState(true);
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachMenuRef = useRef<HTMLDivElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [content]);

    // Close attach menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
                setShowAttachMenu(false);
            }
        };
        if (showAttachMenu) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [showAttachMenu]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!content.trim() || isLoading || disabled) return;

        if (attachedFiles.length > 0) {
            const fileNames = attachedFiles.map(f => f.name).join(", ");
            const contentWithFiles = `${content.trim()}\n\n[Attached files: ${fileNames}]`;
            onSend(contentWithFiles, mode, enhancerEnabled, webSearchEnabled);
        } else {
            onSend(content.trim(), mode, enhancerEnabled, webSearchEnabled);
        }

        setContent("");
        setAttachedFiles([]);
        // Don't reset webSearchEnabled — user may want it on for subsequent messages
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setAttachedFiles(prev => [...prev, ...files]);
        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const removeFile = (index: number) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const getFileIcon = (file: File) => {
        if (file.type.startsWith("image/")) {
            return <ImageIcon className="w-3 h-3" />;
        }
        return <FileText className="w-3 h-3" />;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-background/95 backdrop-blur-xl px-4 py-3"
        >
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
                <div className="relative group">
                    {/* Glow effect */}
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 rounded-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition duration-300 blur" />

                    <div className="relative bg-card/50 rounded-2xl border border-white/10">
                        {/* Attached files + web search badge */}
                        {(attachedFiles.length > 0 || webSearchEnabled) && (
                            <div className="flex flex-wrap gap-2 px-4 pt-3">
                                {webSearchEnabled && (
                                    <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
                                        <Globe className="w-3 h-3" />
                                        <span>Web Search</span>
                                        <button
                                            type="button"
                                            onClick={() => setWebSearchEnabled(false)}
                                            className="hover:text-white"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                {attachedFiles.map((file, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground"
                                    >
                                        {getFileIcon(file)}
                                        <span className="truncate max-w-[120px]">{file.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(index)}
                                            className="hover:text-white"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Textarea */}
                        <Textarea
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask anything..."
                            className="min-h-[44px] max-h-[120px] bg-transparent border-0 resize-none focus-visible:ring-0 text-base placeholder:text-muted-foreground/50 py-2.5 px-4"
                            disabled={isLoading || disabled}
                            rows={1}
                        />

                        {/* Bottom toolbar */}
                        <div className="flex items-center justify-between px-3 py-2">
                            <div className="flex items-center gap-2">
                                {/* Attach menu (Plus button) */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    accept="image/*,.pdf,.doc,.docx,.txt"
                                />
                                <div className="relative" ref={attachMenuRef}>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "w-8 h-8 text-muted-foreground hover:text-white transition-colors",
                                            (showAttachMenu || webSearchEnabled || attachedFiles.length > 0) && "text-primary"
                                        )}
                                        onClick={() => setShowAttachMenu(v => !v)}
                                        title="Attach files or enable web search"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>

                                    <AnimatePresence>
                                        {showAttachMenu && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute bottom-full left-0 mb-2 w-52 bg-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                                            >
                                                <div className="p-1.5">
                                                    {/* Web Search toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setWebSearchEnabled(v => !v);
                                                            setShowAttachMenu(false);
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-sm",
                                                            webSearchEnabled
                                                                ? "bg-blue-500/15 text-blue-400"
                                                                : "hover:bg-white/5 text-muted-foreground hover:text-white"
                                                        )}
                                                    >
                                                        <Globe className="w-4 h-4 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-xs">Web Search</div>
                                                            <div className="text-[10px] opacity-60">Search the web for answers</div>
                                                        </div>
                                                        {webSearchEnabled && (
                                                            <span className="text-blue-400 text-xs font-bold">✓</span>
                                                        )}
                                                    </button>

                                                    {/* Divider */}
                                                    <div className="border-t border-white/5 my-1" />

                                                    {/* Attach file */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            fileInputRef.current?.click();
                                                            setShowAttachMenu(false);
                                                        }}
                                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-sm hover:bg-white/5 text-muted-foreground hover:text-white"
                                                    >
                                                        <Paperclip className="w-4 h-4 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-xs">Attach File</div>
                                                            <div className="text-[10px] opacity-60">Upload images, PDFs, docs</div>
                                                        </div>
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Mode selector */}
                                <Select value={mode} onValueChange={(v) => setMode(v as ChatMode)}>
                                    <SelectTrigger className="w-auto h-8 gap-2 bg-transparent border-0 hover:bg-white/5 focus:ring-0 px-2 text-xs font-medium text-muted-foreground hover:text-white transition-colors">
                                        <div className="flex items-center gap-2">
                                            {modeConfig[mode].icon}
                                            <span>{modeConfig[mode].label}</span>
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover border-white/10">
                                        {Object.entries(modeConfig).map(([key, config]) => (
                                            <SelectItem key={key} value={key} className="text-sm cursor-pointer">
                                                <div className="flex items-center gap-2 min-w-[140px]">
                                                    {config.icon}
                                                    <div>
                                                        <div className="font-medium">{config.label}</div>
                                                        <div className="text-xs text-muted-foreground">{config.description}</div>
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <span className="text-xs text-muted-foreground/50 hidden sm:inline">
                                    Enter to send
                                </span>

                                {/* Prompt Enhancer toggle */}
                                <button
                                    type="button"
                                    onClick={() => setEnhancerEnabled(v => !v)}
                                    title={enhancerEnabled ? "Prompt Enhancer ON — click to disable" : "Prompt Enhancer OFF — click to enable"}
                                    className={cn(
                                        "flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border transition-all",
                                        enhancerEnabled
                                            ? "bg-primary/15 border-primary/40 text-primary hover:bg-primary/25"
                                            : "bg-white/5 border-white/10 text-muted-foreground hover:text-white hover:bg-white/10"
                                    )}
                                >
                                    <Sparkles className={cn("w-3 h-3", enhancerEnabled && "animate-pulse")} />
                                    <span className="hidden sm:inline">{enhancerEnabled ? "Enhancer On" : "Enhancer Off"}</span>
                                </button>
                            </div>

                            {/* Send / Stop button */}
                            {isLoading ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    onClick={onStop}
                                    className="h-9 w-9 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all"
                                    title="Stop generating"
                                >
                                    <Square className="w-3.5 h-3.5 fill-white" />
                                </Button>
                            ) : (
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={!content.trim() || disabled}
                                    className={cn(
                                        "h-9 w-9 rounded-full text-white transition-all",
                                        content.trim()
                                            ? "bg-primary hover:bg-primary/90"
                                            : "bg-transparent hover:bg-white/5"
                                    )}
                                    variant="ghost"
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </form>
        </motion.div>
    );
}
