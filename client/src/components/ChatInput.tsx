import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, Sparkles, Users, MessageSquare, X, FileText, Image as ImageIcon, Square, Globe, Plus, Bot, ChevronDown, Settings, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ModelIcon } from "@/components/ModelIcon";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export type ChatMode = "single" | "multi" | "debate" | "direct";
export const CHAT_MODE_STORAGE_KEY = "metallm.chat.mode";
export const CHAT_DIRECT_MODEL_STORAGE_KEY = "metallm.chat.directModelId";
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_SIZE_MB = 25;
const MAX_TOTAL_ATTACHMENT_SIZE_MB = 100;
const MAX_ATTACHMENT_CONTEXT_CHARS = 70_000;
const MAX_TEXT_FILE_CHARS = 12_000;
const MAX_BINARY_SCAN_BYTES = 600_000;
const MAX_IMAGE_DATA_URL_CHARS = 18_000;
const MAX_IMAGE_PREVIEW_DATA_URL_CHARS = 18_000;
const IMAGE_MAX_DIMENSION = 256;
const IMAGE_JPEG_QUALITY = 0.65;

const KNOWN_TEXT_MIME_TYPES = new Set([
    "application/json",
    "application/xml",
    "application/javascript",
    "application/x-javascript",
    "application/typescript",
    "application/x-sh",
    "application/sql",
    "application/x-yaml",
    "application/yaml",
    "application/x-httpd-php",
    "application/x-python-code",
    "application/x-ruby",
    "application/x-java",
    "application/x-c",
    "application/x-c++",
    "application/x-markdown",
    "application/pdf",
]);

const KNOWN_TEXT_EXTENSIONS = new Set([
    "txt", "md", "markdown", "json", "yaml", "yml", "xml", "csv", "tsv", "ini", "toml",
    "js", "jsx", "ts", "tsx", "mjs", "cjs",
    "py", "rb", "php", "java", "c", "cc", "cpp", "h", "hpp", "cs", "go", "rs", "swift", "kt",
    "sh", "bash", "zsh", "ps1", "sql", "r", "scala", "lua", "dart",
    "html", "css", "scss", "sass", "less",
    "env", "gitignore", "dockerfile", "pdf",
]);

const getExtension = (name: string): string => {
    const idx = name.lastIndexOf(".");
    return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
};

const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const truncateText = (value: string, maxChars: number): { text: string; truncated: boolean } => {
    if (value.length <= maxChars) return { text: value, truncated: false };
    return { text: value.slice(0, maxChars), truncated: true };
};

const normalizeExtractedText = (value: string): string =>
    value
        .replace(/\0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]{3,}/g, "  ")
        .replace(/\n{4,}/g, "\n\n")
        .trim();

const extractTextFromBinary = (bytes: Uint8Array): string => {
    const decoded = new TextDecoder("latin1", { fatal: false }).decode(bytes);
    const matches = decoded.match(/[ -~\n\r\t]{6,}/g) || [];
    const joined = matches.join("\n");
    return normalizeExtractedText(joined);
};

const isLikelyTextFile = (file: File): boolean => {
    if (file.type.startsWith("text/")) return true;
    if (KNOWN_TEXT_MIME_TYPES.has(file.type)) return true;
    return KNOWN_TEXT_EXTENSIONS.has(getExtension(file.name));
};

const fileToDataURL = async (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsDataURL(file);
    });

const downscaleImageToDataURL = async (
    file: File,
    maxDimension = IMAGE_MAX_DIMENSION,
    quality = IMAGE_JPEG_QUALITY
): Promise<string> => {
    const original = await fileToDataURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image ${file.name}`));
        image.src = original;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL("image/jpeg", quality);
};

const buildBestPreviewDataUrl = async (file: File): Promise<string | undefined> => {
    const candidates = [
        { dim: 240, quality: 0.9 },
        { dim: 200, quality: 0.85 },
        { dim: 170, quality: 0.8 },
        { dim: 140, quality: 0.75 },
    ];
    for (const c of candidates) {
        const url = await downscaleImageToDataURL(file, c.dim, c.quality);
        if (url.length <= MAX_IMAGE_PREVIEW_DATA_URL_CHARS) return url;
    }
    return undefined;
};

async function buildAttachmentContext(files: File[]) {
    let totalChars = 0;
    const sections: string[] = [];
    const warnings: string[] = [];
    const attachments: ChatAttachmentMeta[] = [];

    for (const file of files) {
        if (totalChars >= MAX_ATTACHMENT_CONTEXT_CHARS) {
            warnings.push("Attachment context truncated due to overall context limit.");
            break;
        }

        const attachmentMeta: ChatAttachmentMeta = {
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            isImage: file.type.startsWith("image/"),
        };

        const header = `### File: ${file.name}\nType: ${file.type || "unknown"} | Size: ${formatBytes(file.size)}\n`;
        let body = "";
        let truncated = false;

        try {
            if (file.type.startsWith("image/")) {
                const previewDataUrl = await buildBestPreviewDataUrl(file);
                if (previewDataUrl) attachmentMeta.previewDataUrl = previewDataUrl;
                const dataUrl = await downscaleImageToDataURL(file);
                if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
                    warnings.push(`Image ${file.name} is too large for inline context after compression; included metadata only.`);
                    body = "Image attached. Content omitted due to size limit.\n";
                } else {
                    body =
                        "Image content (data URL for vision-capable models):\n" +
                        dataUrl +
                        "\n";
                }
            } else if (isLikelyTextFile(file)) {
                if (file.type === "application/pdf" || getExtension(file.name) === "pdf") {
                    const bytes = new Uint8Array(await file.slice(0, MAX_BINARY_SCAN_BYTES).arrayBuffer());
                    const extracted = extractTextFromBinary(bytes);
                    if (!extracted) {
                        body = "PDF attached. Could not extract readable text in browser.\n";
                    } else {
                        const textCut = truncateText(extracted, MAX_TEXT_FILE_CHARS);
                        body = `Extracted text:\n\`\`\`\n${textCut.text}\n\`\`\`\n`;
                        truncated = textCut.truncated || file.size > MAX_BINARY_SCAN_BYTES;
                    }
                } else {
                    const preview = await file.slice(0, MAX_TEXT_FILE_CHARS * 4).text();
                    const normalized = normalizeExtractedText(preview);
                    const textCut = truncateText(normalized, MAX_TEXT_FILE_CHARS);
                    body = `Extracted text:\n\`\`\`\n${textCut.text}\n\`\`\`\n`;
                    truncated = textCut.truncated || file.size > MAX_TEXT_FILE_CHARS * 4;
                }
            } else {
                body = "Binary file attached. Content extraction is not supported for this format in browser.\n";
            }
        } catch {
            body = "Failed to read this file for context.\n";
            warnings.push(`Failed to extract content from ${file.name}.`);
        }

        if (truncated) {
            body += "[Truncated due to file/context limits]\n";
        }

        let section = `${header}${body}`;
        const remaining = MAX_ATTACHMENT_CONTEXT_CHARS - totalChars;
        if (section.length > remaining) {
            if (remaining > 500) {
                section = `${section.slice(0, remaining - 60)}\n[Context truncated]\n`;
                totalChars += section.length;
                sections.push(section);
            }
            warnings.push(`Attachment context reached limit while processing ${file.name}.`);
            break;
        }

        totalChars += section.length;
        sections.push(section);
        attachments.push(attachmentMeta);
    }

    return {
        context: sections.join("\n"),
        warnings,
        attachments,
    };
}

export interface DebateParticipant {
    modelId: string;
    customRole: string;
    customSystemPrompt: string;
}

export interface ChatAttachmentMeta {
    name: string;
    type: string;
    size: number;
    isImage: boolean;
    previewDataUrl?: string;
}

export interface AttachmentPayload {
    context: string;
    attachments: ChatAttachmentMeta[];
}

interface AvailableModel {
    id: string;
    displayName: string;
    role: string;
    iconUrl?: string;
    provider: string;
}

interface ChatInputProps {
    onSend: (
        content: string,
        mode: ChatMode,
        enhancerEnabled: boolean,
        webSearch?: boolean,
        directModelId?: string,
        attachmentPayload?: AttachmentPayload
    ) => void;
    onStop?: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    storageScope?: string;
    availableModels?: AvailableModel[];
    onModeChange?: (mode: ChatMode) => void;
    onSettingsClick?: () => void;
    showSettings?: boolean;
    selectedMultiModelIds?: string[];
    debateParticipants?: DebateParticipant[];
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

const isValidChatMode = (value: string | null): value is ChatMode =>
    value === "single" || value === "multi" || value === "debate" || value === "direct";

const getStorageKey = (baseKey: string, storageScope?: string): string =>
    storageScope ? `${baseKey}:${storageScope}` : baseKey;

const getStoredChatMode = (storageScope?: string): ChatMode => {
    if (typeof window === "undefined") return "single";
    const stored = window.localStorage.getItem(getStorageKey(CHAT_MODE_STORAGE_KEY, storageScope));
    return isValidChatMode(stored) ? stored : "single";
};

const getStoredDirectModelId = (storageScope?: string): string => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(getStorageKey(CHAT_DIRECT_MODEL_STORAGE_KEY, storageScope)) ?? "";
};

export function ChatInput({ onSend, onStop, isLoading, disabled, storageScope, availableModels = [], onModeChange, onSettingsClick, showSettings, selectedMultiModelIds = [], debateParticipants = [] }: ChatInputProps) {
    const { toast } = useToast();
    const [content, setContent] = useState("");
    const [mode, setMode] = useState<ChatMode>(() => getStoredChatMode(storageScope));
    const [directModelId, setDirectModelIdState] = useState<string>(() => getStoredDirectModelId(storageScope));
    const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
    const directModelIdRef = useRef<string>(directModelId); // always-current mirror of directModelId
    const setDirectModelId = (id: string) => {
        directModelIdRef.current = id;
        setDirectModelIdState(id);
    };
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const [attachedImagePreviews, setAttachedImagePreviews] = useState<Array<{ index: number; name: string; url: string }>>([]);
    const [previewImage, setPreviewImage] = useState<{ name: string; url: string } | null>(null);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showModeMenu, setShowModeMenu] = useState(false);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachMenuRef = useRef<HTMLDivElement>(null);
    const modeMenuRef = useRef<HTMLDivElement>(null);
    const modelPickerRef = useRef<HTMLDivElement>(null);

    // Reload scoped preferences when authenticated user changes
    useEffect(() => {
        const storedMode = getStoredChatMode(storageScope);
        const storedDirectModelId = getStoredDirectModelId(storageScope);
        setMode(storedMode);
        setDirectModelId(storedDirectModelId);
    }, [storageScope]);

    // Notify parent when mode changes
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(getStorageKey(CHAT_MODE_STORAGE_KEY, storageScope), mode);
        }
        onModeChange?.(mode);
    }, [mode, onModeChange, storageScope]);

    // Persist direct model preference across refresh/login
    useEffect(() => {
        if (typeof window === "undefined") return;
        const key = getStorageKey(CHAT_DIRECT_MODEL_STORAGE_KEY, storageScope);
        if (directModelId) {
            window.localStorage.setItem(key, directModelId);
        } else {
            window.localStorage.removeItem(key);
        }
    }, [directModelId, storageScope]);

    // Ensure direct mode always has a valid selected model
    useEffect(() => {
        if (mode !== "direct" || availableModels.length === 0) return;
        const hasSelectedModel = availableModels.some((m) => m.id === directModelId);
        if (!hasSelectedModel) {
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

    // Create object URLs for input-bar image previews and clean them up safely.
    useEffect(() => {
        const previews = attachedFiles
            .map((file, index) =>
                file.type.startsWith("image/")
                    ? { index, name: file.name, url: URL.createObjectURL(file) }
                    : null
            )
            .filter((x): x is { index: number; name: string; url: string } => !!x);

        setAttachedImagePreviews(previews);
        return () => {
            previews.forEach((p) => URL.revokeObjectURL(p.url));
        };
    }, [attachedFiles]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!content.trim() || isLoading || disabled || isPreparingAttachments) return;
        // Always read from ref — guards against any stale closure on the state value
        const currentDirectModelId = directModelIdRef.current;
        if (mode === "direct" && !currentDirectModelId) return;

        setIsPreparingAttachments(true);
        try {
            let attachmentPayload: AttachmentPayload | undefined;
            if (attachedFiles.length > 0) {
                const { context, warnings, attachments } = await buildAttachmentContext(attachedFiles);
                if (warnings.length > 0) {
                    toast({
                        variant: "destructive",
                        description: warnings[0],
                    });
                }
                attachmentPayload = { context, attachments };
            }

            const finalContent = content.trim();
            const enhancerEnabled = mode !== "direct";
            onSend(
                finalContent,
                mode,
                enhancerEnabled,
                webSearchEnabled,
                mode === "direct" ? currentDirectModelId : undefined,
                attachmentPayload
            );

            setContent("");
            setAttachedFiles([]);
        } finally {
            setIsPreparingAttachments(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const maxBytesPerFile = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;
        const maxTotalBytes = MAX_TOTAL_ATTACHMENT_SIZE_MB * 1024 * 1024;
        const next = [...attachedFiles];
        let rejectedCount = 0;
        let rejectedBySize = 0;
        let totalBytes = next.reduce((sum, file) => sum + file.size, 0);

        for (const file of files) {
            if (next.length >= MAX_ATTACHMENTS) {
                rejectedCount++;
                continue;
            }
            if (file.size > maxBytesPerFile) {
                rejectedBySize++;
                continue;
            }
            if (totalBytes + file.size > maxTotalBytes) {
                rejectedBySize++;
                continue;
            }
            next.push(file);
            totalBytes += file.size;
        }

        setAttachedFiles(next);

        if (rejectedCount > 0) {
            toast({
                variant: "destructive",
                description: `Attachment limit reached (max ${MAX_ATTACHMENTS} files).`,
            });
        }
        if (rejectedBySize > 0) {
            toast({
                variant: "destructive",
                description: `Some files were too large. Max ${MAX_ATTACHMENT_SIZE_MB}MB per file, ${MAX_TOTAL_ATTACHMENT_SIZE_MB}MB total.`,
            });
        }
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
            void handleSubmit();
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
                        {/* Attached files / web search / model selection badges */}
                        {(attachedFiles.length > 0 || webSearchEnabled || (mode === "multi" && selectedMultiModelIds.length > 0) || (mode === "debate" && debateParticipants.length >= 2)) && (
                            <div className="flex flex-wrap gap-2 px-4 pt-3">
                                {/* Multi-mode selected models pill */}
                                {mode === "multi" && selectedMultiModelIds.length > 0 && (() => {
                                    const chosen = availableModels.filter(m => selectedMultiModelIds.includes(m.id));
                                    return (
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
                                            <div className="flex items-center -space-x-1">
                                                {chosen.slice(0, 4).map(m => (
                                                    <span key={m.id} className="ring-1 ring-background rounded-full">
                                                        <ModelIcon modelName={m.displayName} iconUrl={m.iconUrl} size={14} />
                                                    </span>
                                                ))}
                                            </div>
                                            <span>{chosen.length} model{chosen.length !== 1 ? "s" : ""}</span>
                                        </div>
                                    );
                                })()}
                                {/* Debate-mode participant pills */}
                                {mode === "debate" && debateParticipants.length >= 2 && (
                                    <div className="flex items-center gap-1.5">
                                        {debateParticipants.slice(0, 2).map((p, i) => {
                                            const m = availableModels.find(x => x.id === p.modelId);
                                            if (!m) return null;
                                            return (
                                                <div key={i} className={cn(
                                                    "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs",
                                                    i === 0 ? "bg-orange-500/10 border-orange-500/20 text-orange-300" : "bg-blue-500/10 border-blue-500/20 text-blue-300"
                                                )}>
                                                    <ModelIcon modelName={m.displayName} iconUrl={m.iconUrl} size={14} />
                                                    <span className="truncate max-w-[80px]">{p.customRole || m.displayName}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
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
                                    (() => {
                                        const preview = attachedImagePreviews.find((p) => p.index === index);
                                        if (preview) {
                                            return (
                                                <div key={index} className="relative rounded-lg overflow-hidden border border-white/15 bg-white/5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewImage({ name: preview.name, url: preview.url })}
                                                        className="block hover:opacity-90 transition-opacity"
                                                        title="Open image"
                                                    >
                                                        <img
                                                            src={preview.url}
                                                            alt={preview.name}
                                                            className="w-16 h-16 object-cover"
                                                        />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFile(index)}
                                                        className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                                                        title="Remove"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            );
                                        }
                                        return (
                                            <div key={index} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground">
                                                {getFileIcon(file)}
                                                <span className="truncate max-w-[120px]">{file.name}</span>
                                                <button type="button" onClick={() => removeFile(index)} className="hover:text-white">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        );
                                    })()
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
                            disabled={isLoading || disabled || isPreparingAttachments}
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
                                    accept="*/*"
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
                                        disabled={isPreparingAttachments}
                                        onClick={() => setShowAttachMenu(v => !v)}
                                        title="Photos & Files or web search"
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
                                                        disabled={isPreparingAttachments}
                                                    >
                                                        <Paperclip className="w-4 h-4 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-xs">Photos &amp; Files</div>
                                                            <div className="text-[10px] opacity-60">Any file type • up to 8 files • content is extracted</div>
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
                                                <ModelIcon modelName={selectedModel.displayName} iconUrl={selectedModel.iconUrl} size={16} />
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
                                                                <ModelIcon modelName={model.displayName} iconUrl={model.iconUrl} size={22} className="flex-shrink-0" />
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

                            {/* ── Right side: Settings + Send/Stop ── */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                {/* ── Settings button (hidden in direct mode) ── */}
                                {mode !== "direct" && (
                                    <button
                                        type="button"
                                        onClick={onSettingsClick}
                                        className={cn(
                                            "flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border transition-all",
                                            showSettings
                                                ? "bg-white/10 border-white/20 text-white"
                                                : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10 text-muted-foreground hover:text-white"
                                        )}
                                    >
                                        <Settings className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span className="hidden sm:inline">
                                            {mode === "multi" ? "Select Models" : mode === "debate" ? "Debate Config" : "Model Settings"}
                                        </span>
                                    </button>
                                )}

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
                                    disabled={!content.trim() || disabled || isPreparingAttachments || (mode === "direct" && !directModelId)}
                                    className={cn(
                                        "h-9 w-9 rounded-full text-white transition-all flex-shrink-0",
                                        content.trim() ? "bg-primary hover:bg-primary/90" : "bg-transparent hover:bg-white/5"
                                    )}
                                    variant="ghost"
                                >
                                    {isPreparingAttachments ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </Button>
                            )}
                            </div>
                        </div>
                    </div>
                </div>
            </form>
            <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
                <DialogContent className="max-w-5xl w-[95vw] p-3 bg-black/95 border-white/10">
                    {previewImage && (
                        <div className="w-full">
                            <div className="text-xs text-muted-foreground mb-2 truncate">{previewImage.name}</div>
                            <img
                                src={previewImage.url}
                                alt={previewImage.name}
                                className="w-full max-h-[80vh] object-contain rounded-md"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
