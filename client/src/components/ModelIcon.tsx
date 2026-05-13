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

// ── Local brand icon URL map ─────────────────────────────────────────────────
// Maps display names (from models.json) to locally-hosted SVG files in /public/icons/

const MODEL_LOCAL_URL_MAP: Record<string, string> = {
    "Gemini Flash": "/icons/gemini.svg",
    "Gemini": "/icons/gemini.svg",
    "DeepSeek R1": "/icons/deepseek.svg",
    "LLaMA 3.3": "/icons/meta.svg",
    "LLaMA": "/icons/meta.svg",
    "Gemma 3 27B": "/icons/google.svg",
    "Gemma 3 12B": "/icons/google.svg",
    "Gemma": "/icons/google.svg",
    "Devstral": "/icons/mistral.svg",
    "Mistral": "/icons/mistral.svg",
    "Nemotron": "/icons/nvidia.svg",
    "Qwen 2.5": "/icons/qwen.svg",
    "Qwen": "/icons/qwen.svg",
    "GLM 4.5": "/icons/glm.svg",
    "GLM": "/icons/glm.svg",
    "Trinity Large": "/icons/mistral.svg",
    "LLaMA 3.3 70B": "/icons/meta.svg",
    "LLaMA 4 Maverick": "/icons/meta.svg",
    "LLaMA 4 Scout": "/icons/meta.svg",
    "Kimi K2": "/icons/moonshot.svg",
    "Qwen 3 32B": "/icons/qwen.svg",
    "GPT OSS 120B": "/icons/openai.svg",
    "Groq Compound": "/icons/groq.svg",
    "Zhipu GLM-5": "/icons/glm.svg",
    "GLM-5": "/icons/glm.svg",
};

// Generic placeholder for models not in the map
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

export function ModelIcon({ modelName, iconUrl, size = 20, className }: ModelIconProps) {
    // Prefer the explicit iconUrl passed in, then look up the local map by display name
    let src = iconUrl || MODEL_LOCAL_URL_MAP[modelName];
    
    if (!src && modelName) {
        const lower = modelName.toLowerCase();
        if (lower.includes("gemini")) src = "/icons/gemini.svg";
        else if (lower.includes("llama")) src = "/icons/meta.svg";
        else if (lower.includes("gpt")) src = "/icons/openai.svg";
        else if (lower.includes("claude")) src = "/icons/anthropic.svg";
        else if (lower.includes("grok")) src = "/icons/grok.svg";
        else if (lower.includes("qwen")) src = "/icons/qwen.svg";
        else if (lower.includes("gemma")) src = "/icons/google.svg";
        else if (lower.includes("mistral") || lower.includes("devstral") || lower.includes("trinity")) src = "/icons/mistral.svg";
        else if (lower.includes("nemotron")) src = "/icons/nvidia.svg";
        else if (lower.includes("glm")) src = "/icons/glm.svg";
        else if (lower.includes("kimi") || lower.includes("moonshot")) src = "/icons/moonshot.svg";
        else if (lower.includes("groq")) src = "/icons/groq.svg";
        else if (lower.includes("deepseek")) src = "/icons/deepseek.svg";
    }

    if (src) {
        return (
            <span className={className} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                <img
                    src={src}
                    alt={modelName}
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: "contain", display: "block" }}
                />
            </span>
        );
    }
    // Unknown model — generic placeholder
    return (
        <span className={className} style={{ display: "inline-flex", alignItems: "center" }}>
            <DefaultModelIcon size={size} />
        </span>
    );
}
