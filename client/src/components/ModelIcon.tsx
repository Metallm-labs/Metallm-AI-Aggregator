// Brand-accurate icons for each AI model provider.
// When a model provides an iconUrl (sourced from server/models.json),
// we render it as an <img>. Otherwise we fall back to the local SVGs below.

interface ModelIconProps {
    modelName: string;
    /** Direct URL to the brand icon image (e.g. SimpleIcons CDN SVG) */
    iconUrl?: string;
    className?: string;
    size?: number;
}

// ── Individual brand SVGs ───────────────────────────────────────────────────

function GeminiIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="gemini-g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4285F4" />
                    <stop offset="50%" stopColor="#9B72CB" />
                    <stop offset="100%" stopColor="#EA4335" />
                </linearGradient>
            </defs>
            <path
                d="M12 2C12 2 6.5 7.5 6.5 12C6.5 16.5 12 22 12 22C12 22 17.5 16.5 17.5 12C17.5 7.5 12 2 12 2Z"
                fill="url(#gemini-g)"
                opacity="0.9"
            />
            <path
                d="M2 12C2 12 7.5 6.5 12 6.5C16.5 6.5 22 12 22 12C22 12 16.5 17.5 12 17.5C7.5 17.5 2 12 2 12Z"
                fill="url(#gemini-g)"
                opacity="0.7"
            />
        </svg>
    );
}

function DeepSeekIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="#0066CC" />
            <ellipse cx="12" cy="13" rx="5" ry="3.5" fill="white" opacity="0.2" />
            <circle cx="9" cy="10" r="2" fill="white" />
            <circle cx="15" cy="10" r="2" fill="white" />
            <circle cx="9.5" cy="9.5" r="0.8" fill="#0066CC" />
            <circle cx="15.5" cy="9.5" r="0.8" fill="#0066CC" />
            <path d="M8 14.5 Q12 17 16 14.5" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
    );
}

function MetaLlamaIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="meta-g" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0081FB" />
                    <stop offset="100%" stopColor="#00C6FF" />
                </linearGradient>
            </defs>
            {/* Meta infinity / M shape */}
            <path
                d="M4 14C4 11 5.5 8 7.5 8C9 8 10 9.5 12 12C14 14.5 15 16 16.5 16C18.5 16 20 13 20 10"
                stroke="url(#meta-g)" strokeWidth="2.2" fill="none" strokeLinecap="round"
            />
            <path
                d="M4 10C4 13 5.5 16 7.5 16C9 16 10 14.5 12 12C14 9.5 15 8 16.5 8C18.5 8 20 11 20 14"
                stroke="url(#meta-g)" strokeWidth="2.2" fill="none" strokeLinecap="round"
            />
        </svg>
    );
}

function GemmaIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="gemma-g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#34A853" />
                    <stop offset="50%" stopColor="#4285F4" />
                    <stop offset="100%" stopColor="#FBBC05" />
                </linearGradient>
            </defs>
            <polygon
                points="12,2 20,7 20,17 12,22 4,17 4,7"
                fill="none"
                stroke="url(#gemma-g)"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <polygon
                points="12,6 16.5,8.5 16.5,15.5 12,18 7.5,15.5 7.5,8.5"
                fill="url(#gemma-g)"
                opacity="0.4"
            />
        </svg>
    );
}

function MistralIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="4" height="4" rx="0.5" fill="#FF7000" />
            <rect x="10" y="4" width="4" height="4" rx="0.5" fill="#FF7000" />
            <rect x="17" y="4" width="4" height="4" rx="0.5" fill="#FF9500" />
            <rect x="3" y="10" width="4" height="4" rx="0.5" fill="#FF7000" />
            <rect x="10" y="10" width="4" height="4" rx="0.5" fill="#FFA500" />
            <rect x="3" y="16" width="4" height="4" rx="0.5" fill="#FF9500" />
            <rect x="10" y="16" width="4" height="4" rx="0.5" fill="#FF7000" />
            <rect x="17" y="10" width="4" height="4" rx="0.5" fill="#FF9500" />
        </svg>
    );
}

function NvidiaIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="nvidia-g" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#76B900" />
                    <stop offset="100%" stopColor="#4A7A00" />
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="20" height="20" rx="3" fill="url(#nvidia-g)" />
            <path
                d="M5 15V9.5L9.5 13V9.5H11V15H9.5V13L6.5 15H5Z"
                fill="white"
                fillRule="evenodd"
            />
            <path
                d="M12.5 9.5H16C17.1 9.5 18 10.4 18 11.5V13C18 14.1 17.1 15 16 15H12.5V9.5ZM14 13.7H15.8C16.2 13.7 16.5 13.4 16.5 13V11.5C16.5 11.1 16.2 10.8 15.8 10.8H14V13.7Z"
                fill="white"
                fillRule="evenodd"
            />
        </svg>
    );
}

function QwenIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="qwen-g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6B3FE7" />
                    <stop offset="100%" stopColor="#9B5CFF" />
                </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#qwen-g)" />
            <text x="12" y="16.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white" fontFamily="system-ui">Q</text>
        </svg>
    );
}

function GLMIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="glm-g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00B4DB" />
                    <stop offset="100%" stopColor="#0083B0" />
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#glm-g)" />
            <text x="12" y="16.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white" fontFamily="system-ui">GLM</text>
        </svg>
    );
}

function DefaultModelIcon({ size = 20, color = "#888" }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill={color} opacity="0.2" stroke={color} strokeWidth="1.5" />
            <circle cx="12" cy="9" r="2.5" fill={color} />
            <path d="M7 18C7 15.2 9.2 13 12 13C14.8 13 17 15.2 17 18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

// ── Main export ─────────────────────────────────────────────────────────────

const MODEL_ICON_MAP: Record<string, (size: number) => JSX.Element> = {
    "Gemini Flash": (s) => <GeminiIcon size={s} />,
    "Gemini": (s) => <GeminiIcon size={s} />,
    "DeepSeek R1": (s) => <DeepSeekIcon size={s} />,
    "LLaMA 3.3": (s) => <MetaLlamaIcon size={s} />,
    "LLaMA": (s) => <MetaLlamaIcon size={s} />,
    "Gemma 3 27B": (s) => <GemmaIcon size={s} />,
    "Gemma 3 12B": (s) => <GemmaIcon size={s} />,
    "Gemma": (s) => <GemmaIcon size={s} />,
    "Devstral": (s) => <MistralIcon size={s} />,
    "Mistral": (s) => <MistralIcon size={s} />,
    "Nemotron": (s) => <NvidiaIcon size={s} />,
    "Qwen 2.5": (s) => <QwenIcon size={s} />,
    "Qwen": (s) => <QwenIcon size={s} />,
    "GLM 4.5": (s) => <GLMIcon size={s} />,
    "GLM": (s) => <GLMIcon size={s} />,
};

export function ModelIcon({ modelName, iconUrl, size = 20, className }: ModelIconProps) {
    // Prefer the official brand icon URL from models.json
    if (iconUrl) {
        return (
            <span className={className} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                <img
                    src={iconUrl}
                    alt={modelName}
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: "contain", display: "block" }}
                    onError={(e) => {
                        // On load failure fall back to SVG
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                        (e.currentTarget.nextSibling as HTMLElement | null)?.style.removeProperty("display");
                    }}
                />
                {/* Hidden SVG fallback revealed only if the img fails to load */}
                <span style={{ display: "none" }}>{MODEL_ICON_MAP[modelName]?.(size) ?? <DefaultModelIcon size={size} />}</span>
            </span>
        );
    }

    // No URL provided — use local SVG map
    const iconFn = MODEL_ICON_MAP[modelName];
    if (iconFn) {
        return (
            <span className={className} style={{ display: "inline-flex", alignItems: "center" }}>
                {iconFn(size)}
            </span>
        );
    }
    // Fallback: colored letter badge
    return (
        <span className={className} style={{ display: "inline-flex", alignItems: "center" }}>
            <DefaultModelIcon size={size} />
        </span>
    );
}
