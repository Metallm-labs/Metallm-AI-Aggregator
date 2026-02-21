// ============================================================
// Shared types used across server providers
// ============================================================

export interface WebSource {
    title: string;
    url: string;
}

export type ModelProvider = "gemini" | "openrouter" | "openai" | "anthropic" | "grok";

export interface ModelConfig {
    id: string;
    displayName: string;
    role: string;
    systemPrompt: string;
    icon: string;
    /** URL to the brand icon image (e.g. SimpleIcons CDN SVG) */
    iconUrl?: string;
    color: string;
    provider: ModelProvider;
}
