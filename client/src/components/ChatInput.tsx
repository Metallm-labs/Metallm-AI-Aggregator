import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, Sparkles, Users, MessageSquare, X, FileText, Image as ImageIcon, Square, Globe, Plus, Bot, ChevronDown, Settings, Loader2, ArrowRight, CheckCircle2, Edit, Trophy, Gavel, Palette } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ModelIcon } from "@/components/ModelIcon";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export type ChatMode = "single" | "multi" | "debate" | "direct" | "media";
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
const MAX_IMAGE_FULL_DATA_URL_CHARS = 6_000_000;
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

type DataUrlFormat = "image/jpeg" | "image/png" | "image/webp";

const downscaleImageToDataURL = async (
    file: File,
    maxDimension = IMAGE_MAX_DIMENSION,
    quality = IMAGE_JPEG_QUALITY,
    format: DataUrlFormat = "image/jpeg",
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
    if (format === "image/png") {
        return canvas.toDataURL("image/png");
    }
    return canvas.toDataURL(format, quality);
};

const buildBestPreviewDataUrl = async (file: File): Promise<string | undefined> => {
    const candidates = [
        { dim: 240, quality: 0.9 },
        { dim: 200, quality: 0.85 },
        { dim: 170, quality: 0.8 },
        { dim: 140, quality: 0.75 },
    ];
    for (const c of candidates) {
        const url = await downscaleImageToDataURL(file, c.dim, c.quality, "image/jpeg");
        if (url.length <= MAX_IMAGE_PREVIEW_DATA_URL_CHARS) return url;
    }
    return undefined;
};

function ProBadge({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                "rounded-full border border-white/35 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(98,154,255,0.16))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_18px_rgba(122,168,255,0.28)]",
                className
            )}
        >
            Pro
        </span>
    );
}

const buildBestFullViewDataUrl = async (file: File): Promise<string | undefined> => {
    const original = await fileToDataURL(file);
    if (original.length <= MAX_IMAGE_FULL_DATA_URL_CHARS) return original;

    const sourceType = file.type.toLowerCase();
    const primaryFormat: DataUrlFormat =
        sourceType === "image/png"
            ? "image/png"
            : sourceType === "image/webp"
                ? "image/webp"
                : "image/jpeg";
    const fallbackFormats: DataUrlFormat[] = [];
    if (primaryFormat !== "image/webp") fallbackFormats.push("image/webp");
    if (primaryFormat !== "image/jpeg") fallbackFormats.push("image/jpeg");
    if (primaryFormat !== "image/png") fallbackFormats.push("image/png");
    const formats: DataUrlFormat[] = [primaryFormat, ...fallbackFormats];

    const candidates = [
        { dim: 4096, quality: 0.99 },
        { dim: 3200, quality: 0.98 },
        { dim: 2560, quality: 0.97 },
        { dim: 2160, quality: 0.96 },
        { dim: 1920, quality: 0.95 },
        { dim: 1600, quality: 0.94 },
        { dim: 1400, quality: 0.92 },
    ];

    for (const format of formats) {
        for (const c of candidates) {
            const url = await downscaleImageToDataURL(file, c.dim, c.quality, format);
            if (url.length <= MAX_IMAGE_FULL_DATA_URL_CHARS) return url;
        }
    }

    return undefined;
};

async function buildAttachmentContext(files: File[]) {
    const warnings: string[] = [];
    const attachments: ChatAttachmentMeta[] = [];

    for (const file of files) {
        const attachmentMeta: ChatAttachmentMeta = {
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            isImage: file.type.startsWith("image/"),
        };

        try {
            if (file.type.startsWith("image/")) {
                const fullDataUrl = await buildBestFullViewDataUrl(file);
                if (fullDataUrl) {
                    attachmentMeta.fullDataUrl = fullDataUrl;
                } else {
                    warnings.push(`Could not store high-detail full view for ${file.name}; using preview quality in chat history.`);
                }
                const previewDataUrl = await buildBestPreviewDataUrl(file);
                if (previewDataUrl) attachmentMeta.previewDataUrl = previewDataUrl;
            } else {
                const fileDataUrl = await fileToDataURL(file);
                if (fileDataUrl.length <= MAX_IMAGE_FULL_DATA_URL_CHARS) {
                    attachmentMeta.fullDataUrl = fileDataUrl;
                } else {
                    warnings.push(`${file.name} is too large for provider-level inline file forwarding; sent as metadata only.`);
                }
            }
        } catch {
            warnings.push(`Failed to extract content from ${file.name}.`);
        }
        attachments.push(attachmentMeta);
    }

    return {
        context: "",
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
    fullDataUrl?: string;
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
    tier?: 1 | 2 | 3;
    isSelectable?: boolean;
    accessLabel?: string | null;
}

interface DebateMentionTarget {
    modelId: string;
    displayName: string;
    pov: string;
    mention: string;
    iconUrl?: string;
}

const toMentionHandle = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);

const buildDebateMentionTargets = (
    participants: DebateParticipant[],
    models: AvailableModel[]
): DebateMentionTarget[] => {
    const out: DebateMentionTarget[] = [];
    const seen = new Set<string>();

    for (const p of participants) {
        const model = models.find((m) => m.id === p.modelId);
        if (!model) continue;
        const mention = toMentionHandle(model.displayName) || toMentionHandle(model.id) || "model";
        if (seen.has(mention)) continue;
        seen.add(mention);
        out.push({
            modelId: model.id,
            displayName: model.displayName,
            pov: p.customRole?.trim() || model.role,
            mention,
            iconUrl: model.iconUrl,
        });
    }

    return out;
};

export interface DebateContinueState {
    currentRound: number;
    totalRounds: number;
    onEnd: () => void;
}

export interface DebateCompleteState {
    roundsCompleted: number;
    onGetVerdict: () => void;
    verdictLoading: boolean;
    onDismiss: () => void;
}

export interface MediaSendPayload {
    prompt: string;
    modelId: string;
    mediaType: "image";
    config: {
        aspectRatio?: string; imageSize?: string;
    };
}

interface ChatInputProps {
    onSend: (
        content: string,
        mode: ChatMode,
        enhancerEnabled: boolean,
        webSearch?: boolean,
        directModelId?: string,
        attachmentPayload?: AttachmentPayload
    ) => void | boolean | Promise<void | boolean>;
    onMediaSend?: (payload: MediaSendPayload) => void | boolean | Promise<void | boolean>;
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
    /** When set, the input bar switches to "debate continue" mode */
    debateContinue?: DebateContinueState | null;
    /** When set, all debate rounds are finished — shows Get Verdict button */
    debateComplete?: DebateCompleteState | null;
    /** When set, the input bar pre-fills with the user message content for editing */
    editingMessage?: { id: number; content: string } | null;
    onCancelEdit?: () => void;
    appearance?: "default" | "transparent";
}

const modeConfig: Record<ChatMode, { label: string; icon: React.ReactNode; description: string; color: string }> = {
    direct: {
        label: "Direct",
        icon: <Bot className="w-3.5 h-3.5" />,
        description: "Chat with one specific model",
        color: "text-emerald-400",
    },
    single: {
        label: "Smart Route",
        icon: <Sparkles className="w-3.5 h-3.5" />,
        description: "AI picks the best model",
        color: "text-primary",
    },
    multi: {
        label: "Multi",
        icon: <Users className="w-3.5 h-3.5" />,
        description: "Multiple models answer + summary",
        color: "text-purple-400",
    },
    debate: {
        label: "Debate",
        icon: <MessageSquare className="w-3.5 h-3.5" />,
        description: "Models discuss your question",
        color: "text-orange-400",
    },
    media: {
        label: "Image",
        icon: <Palette className="w-3.5 h-3.5" />,
        description: "Generate images with AI",
        color: "text-pink-400",
    },
};

const MODE_ORDER: ChatMode[] = ["direct", "single", "debate", "multi", "media"];

const isValidChatMode = (value: string | null): value is ChatMode =>
    value === "single" || value === "multi" || value === "debate" || value === "direct" || value === "media";

const getStorageKey = (baseKey: string, storageScope?: string): string =>
    storageScope ? `${baseKey}:${storageScope}` : baseKey;

const getStoredChatMode = (storageScope?: string): ChatMode => {
    if (typeof window === "undefined") return "direct";
    const stored = window.localStorage.getItem(getStorageKey(CHAT_MODE_STORAGE_KEY, storageScope));
    return isValidChatMode(stored) ? stored : "direct";
};

const getStoredDirectModelId = (storageScope?: string): string => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(getStorageKey(CHAT_DIRECT_MODEL_STORAGE_KEY, storageScope)) ?? "";
};

const getPreferredDirectModelId = (availableModels: AvailableModel[]): string =>
    availableModels.find((model) => model.isSelectable !== false)?.id
    ?? availableModels[0]?.id
    ?? "";

export function ChatInput({ onSend, onMediaSend, onStop, isLoading, disabled, storageScope, availableModels = [], onModeChange, onSettingsClick, showSettings, selectedMultiModelIds = [], debateParticipants = [], debateContinue = null, debateComplete = null, editingMessage = null, onCancelEdit, appearance = "default" }: ChatInputProps) {
    const { toast } = useToast();
    const [content, setContent] = useState("");
    const [mode, setMode] = useState<ChatMode>(() => getStoredChatMode(storageScope));
    const [directModelId, setDirectModelIdState] = useState<string>(() => getStoredDirectModelId(storageScope));
    const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
    const skipPersistModeRef = useRef(false);
    const skipPersistDirectModelRef = useRef(false);
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
    const [showMediaModelPicker, setShowMediaModelPicker] = useState(false);
    const [mediaModelId, setMediaModelId] = useState<string>("");
    const [mediaType] = useState<"image">("image");
    const [mediaConfig, setMediaConfig] = useState<{
        aspectRatio?: string; imageSize?: string;
    }>({});
    const [mediaModels, setMediaModels] = useState<{
        image: Array<{ id: string; displayName: string; role: string; iconUrl: string; color: string; config: any; pricing: any }>;
    }>({ image: [] });
    const mediaModelPickerRef = useRef<HTMLDivElement>(null);
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionIndex, setMentionIndex] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachMenuRef = useRef<HTMLDivElement>(null);
    const modeMenuRef = useRef<HTMLDivElement>(null);
    const modelPickerRef = useRef<HTMLDivElement>(null);

    // Reload scoped preferences when authenticated user changes
    useEffect(() => {
        const storedMode = getStoredChatMode(storageScope);
        const storedDirectModelId = getStoredDirectModelId(storageScope);
        skipPersistModeRef.current = true;
        skipPersistDirectModelRef.current = true;
        setMode(storedMode);
        setDirectModelId(storedDirectModelId);
    }, [storageScope]);

    // Notify parent when mode changes
    useEffect(() => {
        if (skipPersistModeRef.current) {
            skipPersistModeRef.current = false;
            onModeChange?.(mode);
            return;
        }
        if (typeof window !== "undefined") {
            window.localStorage.setItem(getStorageKey(CHAT_MODE_STORAGE_KEY, storageScope), mode);
        }
        onModeChange?.(mode);
    }, [mode, onModeChange, storageScope]);

    // Persist direct model preference across refresh/login
    useEffect(() => {
        if (skipPersistDirectModelRef.current) {
            skipPersistDirectModelRef.current = false;
            return;
        }
        if (typeof window === "undefined") return;
        const key = getStorageKey(CHAT_DIRECT_MODEL_STORAGE_KEY, storageScope);
        if (directModelId) {
            window.localStorage.setItem(key, directModelId);
        } else {
            window.localStorage.removeItem(key);
        }
    }, [directModelId, storageScope]);

    // Fetch media models when entering media mode
    useEffect(() => {
        if (mode !== "media") return;
        if (mediaModels.image.length > 0) return;
        fetch("/api/media/models")
            .then((r) => r.json())
            .then((data) => {
                setMediaModels(data);
                if (data.image?.length > 0 && !mediaModelId) {
                    setMediaModelId(data.image[0].id);
                }
            })
            .catch(() => {});
    }, [mode]);

    // Ensure direct mode always has a valid selected model
    useEffect(() => {
        if (mode !== "direct" || availableModels.length === 0) return;
        const selectedModel = availableModels.find((m) => m.id === directModelId);
        if (!selectedModel || selectedModel.isSelectable === false) {
            const preferredModelId = getPreferredDirectModelId(availableModels);
            if (preferredModelId) {
                setDirectModelId(preferredModelId);
            }
        }
    }, [mode, availableModels, directModelId]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [content]);

    // Pre-fill textarea when editing a message
    useEffect(() => {
        if (!editingMessage) return;
        setContent(editingMessage.content);
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, [editingMessage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close menus on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setShowAttachMenu(false);
            if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) setShowModeMenu(false);
            if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) setShowModelPicker(false);
            if (mediaModelPickerRef.current && !mediaModelPickerRef.current.contains(e.target as Node)) setShowMediaModelPicker(false);
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
        // In debate-continue mode, allow empty content (instructions are optional)
        if (!debateContinue && !editingMessage && !content.trim()) return;
        if (isLoading || disabled || isPreparingAttachments) return;

        // Media mode - handle separately
        if (mode === "media") {
            if (!mediaModelId || !content.trim()) return;
            if (onMediaSend) {
                const accepted = await onMediaSend({
                    prompt: content.trim(),
                    modelId: mediaModelId,
                    mediaType,
                    config: mediaConfig,
                });
                if (accepted !== false) {
                    setContent("");
                }
            }
            return;
        }

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
            const accepted = await onSend(
                finalContent,
                mode,
                enhancerEnabled,
                webSearchEnabled,
                mode === "direct" ? currentDirectModelId : undefined,
                attachmentPayload
            );

            if (accepted !== false) {
                setContent("");
                setAttachedFiles([]);
            }
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

    const debateMentionTargets = useMemo(
        () => buildDebateMentionTargets(debateParticipants, availableModels),
        [debateParticipants, availableModels]
    );

    const filteredMentionTargets = useMemo(() => {
        if (!debateContinue || mentionStart === null) return [] as DebateMentionTarget[];
        const q = mentionQuery.trim().toLowerCase();
        return debateMentionTargets.filter((m) => {
            if (!q) return true;
            return (
                m.mention.includes(q) ||
                m.displayName.toLowerCase().includes(q) ||
                m.pov.toLowerCase().includes(q)
            );
        });
    }, [debateContinue, mentionStart, mentionQuery, debateMentionTargets]);

    const syncMentionState = (text: string, caret: number | null) => {
        if (!debateContinue || typeof caret !== "number") {
            setMentionStart(null);
            setMentionQuery("");
            setMentionIndex(0);
            return;
        }

        const uptoCaret = text.slice(0, caret);
        const tokenStart = Math.max(
            uptoCaret.lastIndexOf(" "),
            uptoCaret.lastIndexOf("\n"),
            uptoCaret.lastIndexOf("\t"),
            uptoCaret.lastIndexOf("\r")
        ) + 1;

        const token = uptoCaret.slice(tokenStart);
        if (!token.startsWith("@")) {
            setMentionStart(null);
            setMentionQuery("");
            setMentionIndex(0);
            return;
        }

        setMentionStart(tokenStart);
        setMentionQuery(token.slice(1));
        setMentionIndex(0);
    };

    const applyMentionTarget = (target: DebateMentionTarget) => {
        const textarea = textareaRef.current;
        if (!textarea || mentionStart === null) return;

        const cursor = textarea.selectionStart ?? content.length;
        const next = `${content.slice(0, mentionStart)}@${target.mention} ${content.slice(cursor)}`;
        setContent(next);
        setMentionStart(null);
        setMentionQuery("");
        setMentionIndex(0);

        requestAnimationFrame(() => {
            const pos = mentionStart + target.mention.length + 2;
            textarea.focus();
            textarea.setSelectionRange(pos, pos);
        });
    };

    const getFileIcon = (file: File) =>
        file.type.startsWith("image/") ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (debateContinue && mentionStart !== null && filteredMentionTargets.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((idx) => (idx + 1) % filteredMentionTargets.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((idx) => (idx - 1 + filteredMentionTargets.length) % filteredMentionTargets.length);
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                applyMentionTarget(filteredMentionTargets[Math.max(0, mentionIndex)]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setMentionStart(null);
                setMentionQuery("");
                setMentionIndex(0);
                return;
            }
        }

        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
        }
    };

    const selectedModel = availableModels.find(m => m.id === directModelId);
    const currentMode = modeConfig[mode];
    const isTransparent = appearance === "transparent";
    const tierOf = (m: { tier?: 1 | 2 | 3 }) => m.tier ?? 3;
    const tierLabel = (tier: 1 | 2 | 3) =>
        tier === 1
            ? "Premium"
            : tier === 2
                ? "Balanced"
                : "Lightweight & Fast";
    const tierOrder: Array<1 | 2 | 3> = [1, 2, 3];
    const directGroups = tierOrder
        .map((t) => ({ tier: t, items: availableModels.filter((m) => tierOf(m) === t) }))
        .filter((g) => g.items.length > 0);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "px-4 py-3",
                isTransparent ? "bg-transparent backdrop-blur-0" : "bg-background/95 backdrop-blur-xl"
            )}
        >
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
                <div className="relative group">
                    {/* Glow effect */}
                    <div className={cn(
                        "absolute -inset-0.5 rounded-2xl transition duration-300 blur",
                        isTransparent
                            ? "bg-gradient-to-r from-white/10 via-blue-200/10 to-white/10 opacity-70 group-hover:opacity-100 group-focus-within:opacity-100"
                            : "bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    )} />

                    <div className={cn(
                        "relative rounded-2xl border border-white/10",
                        isTransparent ? "bg-black/18 backdrop-blur-md" : "bg-card/50"
                    )}>
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

                                        {/* Edit-message banner */}
                        {editingMessage && !debateContinue && (
                            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Edit className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                    <span className="text-xs text-blue-300/90 font-medium">Editing message</span>
                                    <span className="text-xs text-muted-foreground/50 hidden sm:inline">— modify and press Update to send</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setContent(""); onCancelEdit?.(); }}
                                    className="text-[10px] text-muted-foreground hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5 flex-shrink-0"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {/* Debate-continue notification banner */}
                        {debateContinue && (
                            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                                    <span className="text-xs text-orange-300/90 font-medium">
                                        Round {debateContinue.currentRound} of {debateContinue.totalRounds} complete
                                    </span>
                                    <span className="text-xs text-muted-foreground/50 hidden sm:inline">
                                        — Use @model for private instructions, blank line for global instructions
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {/* Verdict button — disabled between rounds */}
                                    <button
                                        type="button"
                                        disabled
                                        title={`Complete all ${debateContinue.totalRounds} rounds to unlock verdict`}
                                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-white/10 text-muted-foreground/40 cursor-not-allowed select-none"
                                    >
                                        <Trophy className="w-3 h-3" />
                                        <span className="hidden sm:inline">Get Verdict</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={debateContinue.onEnd}
                                        className="text-[10px] text-muted-foreground hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                                    >
                                        End debate
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Debate-complete banner — all rounds done, verdict available */}
                        {debateComplete && !debateContinue && (
                            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Trophy className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                                    <span className="text-xs text-yellow-300/90 font-medium">
                                        All {debateComplete.roundsCompleted} rounds complete!
                                    </span>
                                    <span className="text-xs text-muted-foreground/50 hidden sm:inline">
                                        — Request a verdict from a neutral judge
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                        type="button"
                                        onClick={debateComplete.onGetVerdict}
                                        disabled={debateComplete.verdictLoading}
                                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {debateComplete.verdictLoading ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Gavel className="w-3 h-3" />
                                        )}
                                        <span>{debateComplete.verdictLoading ? "Judging..." : "Get Verdict"}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={debateComplete.onDismiss}
                                        className="text-[10px] text-muted-foreground hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Textarea */}
                        <Textarea
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => {
                                const next = e.target.value;
                                setContent(next);
                                syncMentionState(next, e.target.selectionStart);
                            }}
                            onClick={(e) => {
                                const el = e.target as HTMLTextAreaElement;
                                syncMentionState(el.value, el.selectionStart);
                            }}
                            onKeyUp={(e) => {
                                const el = e.currentTarget as HTMLTextAreaElement;
                                syncMentionState(el.value, el.selectionStart);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                debateContinue
                                    ? "Enter instructions or context for next round (optional)..."
                                    : editingMessage
                                        ? "Edit your message..."
                                        : mode === "media"
                                            ? "Describe the image you want to generate..."
                                            : mode === "direct" && selectedModel
                                                ? `Chat with ${selectedModel.displayName}...`
                                                : "Ask anything..."
                            }
                            className="min-h-[44px] max-h-[120px] bg-transparent border-0 resize-none focus-visible:ring-0 text-base placeholder:text-muted-foreground/50 py-2.5 px-4"
                            disabled={isLoading || disabled || isPreparingAttachments}
                            rows={1}
                        />

                        {debateContinue && mentionStart !== null && filteredMentionTargets.length > 0 && (
                            <div className="px-4 pb-1">
                                <div className="rounded-lg border border-white/10 bg-card/90 overflow-hidden">
                                    {filteredMentionTargets.slice(0, 6).map((target, idx) => (
                                        <button
                                            key={target.modelId}
                                            type="button"
                                            onClick={() => applyMentionTarget(target)}
                                            className={cn(
                                                "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors",
                                                idx === mentionIndex ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground"
                                            )}
                                        >
                                            <ModelIcon modelName={target.displayName} iconUrl={target.iconUrl} size={14} />
                                            <span className="font-medium text-white/90">@{target.mention}</span>
                                            <span className="text-[10px] text-muted-foreground truncate">{target.displayName} — {target.pov}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

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
                                                    {MODE_ORDER.map((key) => {
                                                        const cfg = modeConfig[key];
                                                        return (
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
                                                        );
                                                    })}
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
                                            {selectedModel?.isSelectable === false && (
                                                <ProBadge className="hidden md:inline" />
                                            )}
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
                                                        {directGroups.map((group, gi) => (
                                                            <div key={group.tier}>
                                                                <div className="px-2 pt-1 pb-1.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                                                                            {tierLabel(group.tier)}
                                                                        </span>
                                                                        <div className="h-px flex-1 bg-white/10" />
                                                                    </div>
                                                                </div>
                                                                {group.items.map((model) => (
                                                                    <button
                                                                        key={model.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            if (model.isSelectable === false) return;
                                                                            setDirectModelId(model.id);
                                                                            setShowModelPicker(false);
                                                                        }}
                                                                        className={cn(
                                                                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all",
                                                                            directModelId === model.id
                                                                                ? "bg-emerald-500/15 border border-emerald-500/30"
                                                                                : "hover:bg-white/5 border border-transparent",
                                                                            model.isSelectable === false && "opacity-45 cursor-not-allowed hover:bg-transparent"
                                                                        )}
                                                                    >
                                                                        <ModelIcon modelName={model.displayName} iconUrl={model.iconUrl} size={22} className="flex-shrink-0" />
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="text-xs font-medium text-white truncate">{model.displayName}</div>
                                                                            <div className="text-[10px] text-muted-foreground/60 truncate">{model.role}</div>
                                                                        </div>
                                                                        {model.isSelectable === false && (
                                                                            <ProBadge className="flex-shrink-0" />
                                                                        )}
                                                                        {directModelId === model.id && (
                                                                            <span className="text-emerald-400 text-xs font-bold flex-shrink-0">✓</span>
                                                                        )}
                                                                    </button>
                                                                ))}
                                                                {gi < directGroups.length - 1 && (
                                                                    <div className="my-1 border-t border-white/5" />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* ── Media type toggle + model picker — shown only in "media" mode ── */}
                                {mode === "media" && (
                                    <>

                                        {/* Media model picker */}
                                        <div className="relative flex-shrink-0" ref={mediaModelPickerRef}>
                                            <button
                                                type="button"
                                                onClick={() => setShowMediaModelPicker((v) => !v)}
                                                className={cn(
                                                    "flex items-center gap-1.5 h-8 px-2 rounded-lg text-xs font-medium border transition-all",
                                                    showMediaModelPicker
                                                        ? "bg-pink-500/15 border-pink-500/40 text-white"
                                                        : "bg-pink-500/10 border-pink-500/20 text-pink-300 hover:bg-pink-500/20"
                                                )}
                                            >
                                                <Palette className="w-3.5 h-3.5" />
                                                <span className="hidden sm:inline max-w-[100px] truncate">
                                                    {(() => {
                                                        const models = mediaModels.image;
                                                        return models.find((m) => m.id === mediaModelId)?.displayName ?? "Pick model";
                                                    })()}
                                                </span>
                                                <ChevronDown className="w-3 h-3 opacity-60" />
                                            </button>

                                            <AnimatePresence>
                                                {showMediaModelPicker && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                                        transition={{ duration: 0.15 }}
                                                        className="absolute bottom-full left-0 mb-2 w-72 bg-card border border-white/10 rounded-xl shadow-2xl z-[60] overflow-hidden"
                                                    >
                                                        <div className="px-3 py-2 border-b border-white/5">
                                                            <p className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wide">
                                                                {"Image Models"}
                                                            </p>
                                                        </div>
                                                        <div className="p-1.5 max-h-72 overflow-y-auto">
                                                            {mediaModels.image.map((model) => (
                                                                <button
                                                                    key={model.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setMediaModelId(model.id);
                                                                        setShowMediaModelPicker(false);
                                                                        setMediaConfig({});
                                                                    }}
                                                                    className={cn(
                                                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                                                                        mediaModelId === model.id
                                                                            ? "bg-pink-500/15 border border-pink-500/30"
                                                                            : "hover:bg-white/5 border border-transparent"
                                                                    )}
                                                                >
                                                                    <ModelIcon modelName={model.displayName} iconUrl={model.iconUrl} size={22} className="flex-shrink-0" />
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-xs font-medium text-white truncate">{model.displayName}</div>
                                                                        <div className="text-[10px] text-muted-foreground/60 truncate">{model.role}</div>
                                                                    </div>
                                                                    {mediaModelId === model.id && (
                                                                        <span className="text-pink-400 text-xs font-bold flex-shrink-0">✓</span>
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>

                                                        {/* Config options */}
                                                        {(() => {
                                                            const models = mediaModels.image;
                                                            const currentModel = models.find((m) => m.id === mediaModelId);
                                                            if (!currentModel?.config) return null;
                                                            const cfg = currentModel.config;
                                                            return (
                                                                <div className="px-3 py-2.5 border-t border-white/5 space-y-2">
                                                                    {/* Aspect Ratio */}
                                                                    {cfg.aspectRatios && (
                                                                        <div>
                                                                            <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Aspect Ratio</label>
                                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                                {cfg.aspectRatios.map((ar: string) => (
                                                                                    <button
                                                                                        key={ar}
                                                                                        type="button"
                                                                                        onClick={() => setMediaConfig((prev) => ({ ...prev, aspectRatio: ar }))}
                                                                                        className={cn(
                                                                                            "px-2 py-0.5 rounded text-[10px] border transition-all",
                                                                                            (mediaConfig.aspectRatio || cfg.defaultAspectRatio) === ar
                                                                                                ? "bg-pink-500/20 border-pink-500/40 text-pink-300"
                                                                                                : "border-white/10 text-muted-foreground hover:border-white/20"
                                                                                        )}
                                                                                    >
                                                                                        {ar}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Image Size */}
                                                                    {cfg.imageSizes && (
                                                                        <div>
                                                                            <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Size</label>
                                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                                {cfg.imageSizes.map((s: string) => (
                                                                                    <button
                                                                                        key={s}
                                                                                        type="button"
                                                                                        onClick={() => setMediaConfig((prev) => ({ ...prev, imageSize: s }))}
                                                                                        className={cn(
                                                                                            "px-2 py-0.5 rounded text-[10px] border transition-all",
                                                                                            (mediaConfig.imageSize || cfg.defaultImageSize) === s
                                                                                                ? "bg-pink-500/20 border-pink-500/40 text-pink-300"
                                                                                                : "border-white/10 text-muted-foreground hover:border-white/20"
                                                                                        )}
                                                                                    >
                                                                                        {s}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* ── Right side: Settings + Send/Stop ── */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                {/* ── Settings button (hidden in direct & media mode) ── */}
                                {mode !== "direct" && mode !== "media" && onSettingsClick && (
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
                            ) : editingMessage ? (
                                <Button
                                    type="submit"
                                    disabled={!content.trim() || disabled || isPreparingAttachments}
                                    className="h-9 px-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-all flex-shrink-0 text-xs font-medium flex items-center gap-1.5"
                                >
                                    {isPreparingAttachments ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Edit className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Update</span>
                                        </>
                                    )}
                                </Button>
                            ) : debateContinue ? (
                                <Button
                                    type="submit"
                                    disabled={disabled || isPreparingAttachments}
                                    className="h-9 px-3 rounded-full bg-orange-500 hover:bg-orange-600 text-white transition-all flex-shrink-0 text-xs font-medium flex items-center gap-1.5"
                                >
                                    {isPreparingAttachments ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <ArrowRight className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Round {debateContinue.currentRound + 1}</span>
                                        </>
                                    )}
                                </Button>
                            ) : (
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={!content.trim() || disabled || isPreparingAttachments || (mode === "direct" && !directModelId) || (mode === "media" && !mediaModelId)}
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
