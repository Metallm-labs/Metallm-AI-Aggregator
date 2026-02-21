import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, Sparkles, Users, MessageSquare, X, FileText, Image as ImageIcon, Square, Globe, Plus, Bot, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ModelIcon } from "@/components/ModelIcon";

export type ChatMode = "single" | "multi" | "debate" | "direct";

interface AvailableModel {
    id: string;
    displayName: string;
    role: string;
    icon: string;
    provider: string;
}

interface ChatInputProps {
    onSend: (content: string, mode: ChatMode, enhancerEnabled: boolean, webSearch?: boolean, directModelId?: string) => void;
    onStop?: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    availableModels?: AvailableModel[];
}

const modeConfig: Record<ChatMode, { label: string; icon: React.ReactNode; description: string; color: string }> = {
    single: {
        label: "Smart Route",
        icon: <Sparkles className="w-3.5 h-3.5" />,
        description: "AI picks the best model",
        color: "text-primary",
    },
    multi: {
        label: "All Models",
        icon: <Users className="w-3.5 h-3.5" />,
        description: "All models answer + summary",
        color: "text-purple-400",
    },
    debate: {
        label: "Debate",
        icon: <MessageSquare className="w-3.5 h-3.5" />,
        description: "Models discuss your question",
        color: "text-orange-400",
    },
    direct: {
        label: "Single Model",
        icon: <Bot className="w-3.5 h-3.5" />,
        description: "Chat with one specific model",
        color: "text-emerald-400",
    },
};

export function ChatInput({ onSend, onStop, isLoading, disabled, availableModels = [] }: ChatInputProps) {
    const [content, setContent] = useState("");
    const [mode, setMode] = useState<ChatMode>("single");
    const [directModelId, setDirectModelIdState] = useState<string>("");
    const directModelIdRef = useRef<string>(""); // always-current mirror of directModelId
    const setDirectModelId = (id: string) => {
        directModelIdRef.current = id;
        setDirectModelIdState(id);
    };
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showModeMenu, setShowModeMenu] = useState(false);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachMenuRef = useRef<HTMLDivElement>(null);
    const modeMenuRef = useRef<HTMLDivElement>(null);
    const modelPickerRef = useRef<HTMLDivElement>(null);

    // Clear directModelId when leaving direct mode so re-entering always re-defaults to first model
    useEffect(() => {
        if (mode !== "direct") {
            setDirectModelId("");
        }
    }, [mode]);

    // Auto-set first model when switching to direct mode
    useEffect(() => {
        if (mode === "direct" && !directModelId && availableModels.length > 0) {
            setDirectModelId(availableModels[0].id);
        }
    }, [mode, availableModels, directModelId]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [content]);

    // Close menus on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setShowAttachMenu(false);
            if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) setShowModeMenu(false);
            if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) setShowModelPicker(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!content.trim() || isLoading || disabled) return;
        // Always read from ref — guards against any stale closure on the state value
        const currentDirectModelId = directModelIdRef.current;
        if (mode === "direct" && !currentDirectModelId) return;

        const finalContent = attachedFiles.length > 0
            ? `${content.trim()}\n\n[Attached files: ${attachedFiles.map(f => f.name).join(", ")}]`
            : content.trim();

        const enhancerEnabled = mode !== "direct";
        onSend(finalContent, mode, enhancerEnabled, webSearchEnabled, mode === "direct" ? currentDirectModelId : undefined);

        setContent("");
        setAttachedFiles([]);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setAttachedFiles(prev => [...prev, ...files]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const removeFile = (index: number) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const getFileIcon = (file: File) =>
        file.type.startsWith("image/") ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const selectedModel = availableModels.find(m => m.id === directModelId);
    const currentMode = modeConfig[mode];

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
                                        <button type="button" onClick={() => setWebSearchEnabled(false)} className="hover:text-white">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                                {attachedFiles.map((file, index) => (
                                    <div key={index} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground">
                                        {getFileIcon(file)}
                                        <span className="truncate max-w-[120px]">{file.name}</span>
                                        <button type="button" onClick={() => removeFile(index)} className="hover:text-white">
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
                            placeholder={
                                mode === "direct" && selectedModel
                                    ? `Chat with ${selectedModel.displayName}...`
                                    : "Ask anything..."
                            }
                            className="min-h-[44px] max-h-[120px] bg-transparent border-0 resize-none focus-visible:ring-0 text-base placeholder:text-muted-foreground/50 py-2.5 px-4"
                            disabled={isLoading || disabled}
                            rows={1}
                        />

                        {/* Bottom toolbar */}
                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                            <div className="flex items-center gap-1 min-w-0 flex-wrap">

                                {/* ── Plus / Attach menu ── */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    accept="image/*,.pdf,.doc,.docx,.txt"
                                />
                                <div className="relative flex-shrink-0" ref={attachMenuRef}>
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
                                                className="absolute bottom-full left-0 mb-2 w-52 bg-card border border-white/10 rounded-xl shadow-2xl z-[60] overflow-hidden"
                                            >
                                                <div className="p-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setWebSearchEnabled(v => !v); setShowAttachMenu(false); }}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-sm",
                                                            webSearchEnabled ? "bg-blue-500/15 text-blue-400" : "hover:bg-white/5 text-muted-foreground hover:text-white"
                                                        )}
                                                    >
                                                        <Globe className="w-4 h-4 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-xs">Web Search</div>
                                                            <div className="text-[10px] opacity-60">Search the web for answers</div>
                                                        </div>
                                                        {webSearchEnabled && <span className="text-blue-400 text-xs font-bold">✓</span>}
                                                    </button>
                                                    <div className="border-t border-white/5 my-1" />
                                                    <button
                                                        type="button"
                                                        onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
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

                                {/* ── Mode selector ── */}
                                <div className="relative flex-shrink-0" ref={modeMenuRef}>
                                    <button
                                        type="button"
                                        onClick={() => { setShowModeMenu(v => !v); setShowModelPicker(false); }}
                                        className={cn(
                                            "flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border transition-all",
                                            showModeMenu
                                                ? "bg-white/10 border-white/20 text-white"
                                                : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10",
                                            currentMode.color
                                        )}
                                    >
                                        {currentMode.icon}
                                        <span className="hidden sm:inline">{currentMode.label}</span>
                                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                    </button>

                                    <AnimatePresence>
                                        {showModeMenu && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute bottom-full left-0 mb-2 w-60 bg-card border border-white/10 rounded-xl shadow-2xl z-[60] overflow-hidden"
                                            >
                                                <div className="p-1.5">
                                                    {(Object.entries(modeConfig) as [ChatMode, typeof modeConfig[ChatMode]][]).map(([key, cfg]) => (
                                                        <button
                                                            key={key}
                                                            type="button"
                                                            onClick={() => { setMode(key); setShowModeMenu(false); }}
                                                            className={cn(
                                                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                                                                mode === key ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground hover:text-white"
                                                            )}
                                                        >
                                                            <span className={cn("flex-shrink-0", cfg.color)}>{cfg.icon}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-medium text-white">{cfg.label}</div>
                                                                <div className="text-[10px] text-muted-foreground/70">{cfg.description}</div>
                                                            </div>
                                                            {mode === key && <span className="text-primary text-xs">✓</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* ── Model picker — shown only in "direct" mode ── */}
                                {mode === "direct" && availableModels.length > 0 && (
                                    <div className="relative flex-shrink-0" ref={modelPickerRef}>
                                        <button
                                            type="button"
                                            onClick={() => { setShowModelPicker(v => !v); setShowModeMenu(false); }}
                                            className={cn(
                                                "flex items-center gap-1.5 h-8 px-2 rounded-lg text-xs font-medium border transition-all",
                                                showModelPicker
                                                    ? "bg-emerald-500/15 border-emerald-500/40 text-white"
                                                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
                                            )}
                                        >
                                            {selectedModel ? (
                                                <ModelIcon modelName={selectedModel.displayName} size={16} />
                                            ) : (
                                                <Bot className="w-3.5 h-3.5" />
                                            )}
                                            <span className="hidden sm:inline max-w-[100px] truncate">
                                                {selectedModel?.displayName ?? "Pick model"}
                                            </span>
                                            <ChevronDown className="w-3 h-3 opacity-60" />
                                        </button>

                                        <AnimatePresence>
                                            {showModelPicker && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="absolute bottom-full left-0 mb-2 w-64 bg-card border border-white/10 rounded-xl shadow-2xl z-[60] overflow-hidden"
                                                >
                                                    <div className="px-3 py-2 border-b border-white/5">
                                                        <p className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wide">Select Model</p>
                                                    </div>
                                                    <div className="p-1.5 max-h-72 overflow-y-auto">
                                                        {availableModels.map(model => (
                                                            <button
                                                                key={model.id}
                                                                type="button"
                                                                onClick={() => { setDirectModelId(model.id); setShowModelPicker(false); }}
                                                                className={cn(
                                                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all",
                                                                    directModelId === model.id
                                                                        ? "bg-emerald-500/15 border border-emerald-500/30"
                                                                        : "hover:bg-white/5 border border-transparent"
                                                                )}
                                                            >
                                                                <ModelIcon modelName={model.displayName} size={22} className="flex-shrink-0" />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-xs font-medium text-white truncate">{model.displayName}</div>
                                                                    <div className="text-[10px] text-muted-foreground/60 truncate">{model.role}</div>
                                                                </div>
                                                                {directModelId === model.id && (
                                                                    <span className="text-emerald-400 text-xs font-bold flex-shrink-0">✓</span>
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

                            {/* ── Send / Stop button ── */}
                            {isLoading ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    onClick={onStop}
                                    className="h-9 w-9 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all flex-shrink-0"
                                    title="Stop generating"
                                >
                                    <Square className="w-3.5 h-3.5 fill-white" />
                                </Button>
                            ) : (
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={!content.trim() || disabled || (mode === "direct" && !directModelId)}
                                    className={cn(
                                        "h-9 w-9 rounded-full text-white transition-all flex-shrink-0",
                                        content.trim() ? "bg-primary hover:bg-primary/90" : "bg-transparent hover:bg-white/5"
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

