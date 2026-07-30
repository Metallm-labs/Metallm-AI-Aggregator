import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { readFileSync } from "fs";
import { resolve } from "path";
import Parser from "rss-parser";
import { storage } from "./storage";
import { db } from "./db";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { UserChatModeUsageData, UserPersonalizationData } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated, isVerifiedUser } from "./integrations/auth";
import { api } from "@shared/routes";
import { businessProfiles, creditTransactions, sendMessageSchema } from "@shared/schema";
import {
  SUBSCRIPTION_MONTHLY_PRICE,
  SUBSCRIPTION_USAGE_CAP,
  SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT,
  SUBSCRIPTION_YEARLY_MONTHLY_EQUIVALENT,
  SUBSCRIPTION_YEARLY_PRICE,
  usdToSubscriptionUsage,
} from "@shared/billing";
import { z } from "zod";
import {
  DEFAULT_MODELS,
  DEFAULT_MAIN_MODEL_ID,
  MEDIA_MODELS,
  callModel,
  callModelStream,
  callGemini,
  analyzeAndRoute,
  type ChatMessage,
  type ModelConfig,
  type WebSource,
  type TokenUsage,
} from "./openrouter";
import { generateImage, estimateMediaCostForCredits } from "./providers/openrouter-media";
import { generateGrokImage } from "./providers/grok-media";
import { generateOpenAIImage } from "./providers/openai-media";
import { broadcastToUser } from "./ws";
import { calculateTokenCost, calculateWebSearchCost, deductCredits, getUserCredits } from "./integrations/paddle";
import { registerPaddleRoutes } from "./integrations/paddle/routes";
import { registerLemonSqueezyRoutes } from "./integrations/lemonsqueezy/routes";
import { registerWhatsAppRoutes, bootAllAccounts } from "./integrations/whatsapp";
import {
  isBusinessControlChatSessionKey,
  createBusinessSession,
  deleteBusinessSessionChatSession,
  deleteBusinessSession,
  getCurrentSessionQr,
  getBusinessSessionChat,
  getBusinessSession,
  getBusinessSessionSubscription,
  listBusinessSessions,
  listBusinessSessionChatSessions,
  logoutBusinessSession,
  refreshBusinessSessionQr,
  saveBusinessSessionFile,
  sendBusinessSessionChat,
  createBusinessSessionSubscriptionCheckout,
  updateBusinessSessionControls,
  waitBusinessSessionLink,
  listBusinessSessionAccounts,
  addBusinessSessionAccount,
  removeBusinessSessionAccount,
  refreshBusinessSessionAccountQr,
} from "./integrations/business-agent";
import {
  buildUserMemoryPromptContext,
  buildUserMemorySummary,
  deriveUserMemoryChangeSet,
  getUserMemoryCategoryLabel,
  groupUserMemories,
  isSingletonMemoryCategory,
  previewUserMemoryChanges,
  type UserMemoryCategory,
  type UserMemoryChangeSet,
  type UserMemoryData,
  type UserMemoryPreferenceData,
} from "./user-memory";

// PAYMENT_PROVIDER controls which payment gateway handles card/fiat payments.
// Set to "lemonsqueezy" or "paddle" in your .env file.
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || "paddle").toLowerCase();
import { sendEmail } from "./integrations/auth/email";
import { callGroq, callGroqStream } from "./providers/groq";
import { registerAdminRoutes } from "./admin-routes";

const MODEL_REGISTRY = new Map(DEFAULT_MODELS.map((model) => [model.id, model] as const));

function getRegistryModel(modelId: string): ModelConfig | null {
  const normalizedId = typeof modelId === "string" ? modelId.trim() : "";
  return normalizedId ? (MODEL_REGISTRY.get(normalizedId) ?? null) : null;
}

function getRegistryModelsByIds(modelIds: string[]): ModelConfig[] {
  const resolved: ModelConfig[] = [];
  const seen = new Set<string>();

  for (const modelId of modelIds) {
    const model = getRegistryModel(modelId);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    resolved.push(model);
  }

  return resolved;
}

function hasSameModelList(a: ModelConfig[], b: ModelConfig[]): boolean {
  return a.length === b.length && a.every((model, index) => model.id === b[index]?.id);
}

function normalizeUserModelSettings(
  defaults: { models: ModelConfig[]; mainModelId: string },
  stored?: { models: ModelConfig[]; mainModelId: string }
): { models: ModelConfig[]; mainModelId: string } {
  const fallbackModels = defaults.models.length > 0 ? defaults.models : DEFAULT_MODELS;
  const fallbackMain = defaults.mainModelId || DEFAULT_MAIN_MODEL_ID || fallbackModels[0]?.id || "";

  if (!stored || !Array.isArray(stored.models) || stored.models.length === 0) {
    return { models: fallbackModels, mainModelId: fallbackMain };
  }

  // Always source model definitions from models.json only.
  // Stored user settings may preserve order/main-model preference, but never
  // revive removed models or override registry-defined model metadata.
  const registryModels = new Map(fallbackModels.map((model) => [model.id, model] as const));
  const storedIds = stored.models
    .map((model) => (typeof model?.id === "string" ? model.id.trim() : ""))
    .filter((id): id is string => !!id && registryModels.has(id));
  const orderedStoredModels = getRegistryModelsByIds(storedIds);
  const remainingDefaultModels = fallbackModels.filter((model) => !storedIds.includes(model.id));
  const models = [...orderedStoredModels, ...remainingDefaultModels];

  const mainModelId = typeof stored.mainModelId === "string" && stored.mainModelId.trim()
    ? stored.mainModelId.trim()
    : fallbackMain;
  const mainExists = models.some((m) => m.id === mainModelId);
  return { models, mainModelId: mainExists ? mainModelId : (models[0]?.id || fallbackMain) };
}


async function getUserModelContext(req: any): Promise<{ userId: string; models: ModelConfig[]; mainModelId: string; mainModel: ModelConfig }> {
  const user = req.user as any;
  const userId = user?.id || user?.claims?.sub;
  if (!userId) throw new Error("Unauthorized");

  const stored = await storage.getUserModelSettings(userId);
  const normalized = normalizeUserModelSettings(
    { models: [...DEFAULT_MODELS], mainModelId: DEFAULT_MAIN_MODEL_ID },
    stored
  );
  if (
    stored &&
    (!hasSameModelList(stored.models, normalized.models) || stored.mainModelId !== normalized.mainModelId)
  ) {
    await storage.upsertUserModelSettings(userId, normalized.models, normalized.mainModelId);
  }
  const mainModel = normalized.models.find((m) => m.id === normalized.mainModelId) || normalized.models[0] || DEFAULT_MODELS[0];
  return { userId, models: normalized.models, mainModelId: normalized.mainModelId, mainModel };
}

interface UserAttachmentMeta {
  name: string;
  type: string;
  size: number;
  isImage: boolean;
  previewDataUrl?: string;
  fullDataUrl?: string;
}

type RuntimeMode = "single" | "direct" | "multi" | "debate" | "media";
type AccessControlledMode = "single" | "direct" | "multi" | "debate" | "media";

interface HistoryMessage {
  id: number;
  role: string;
  content: string;
  modelName: string | null;
  metadata?: any;
}

const CONTEXT_HISTORY_LIMIT = 30;
const OTHER_MODEL_SUMMARY_LIMIT = 700;
const METALLM_DOC_PATH = resolve(process.cwd(), "metallm.md");
const BUSINESS_CREATE_MEDIA_TOTAL_LIMIT_BYTES = 10 * 1024 * 1024;
const FREE_MODE_LIMITS: Record<AccessControlledMode, number> = {
  direct: 5,
  single: 1,
  multi: 1,
  debate: 1,
  media: 1,
};
const FREE_ELIGIBLE_PROVIDERS = new Set<ModelConfig["provider"]>(["groq", "openrouter"]);
const GOOGLE_OAUTH_CONFIGURED = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const MOBILE_AUTH_PROVIDER = "server-session";
const METALLM_DOC_FALLBACK = `# Metallm AI Aggregator
Metallm is a multi-model AI chat platform where users can switch between single routing, direct model chat, multi-model comparison, and debate mode in one conversation.

Core behavior:
- Users can switch modes and models without creating a new chat.
- Responses from multiple models can exist in one shared conversation timeline.
- Image attachments are forwarded to model providers as native multimodal input parts.
- The active model must identify itself correctly and must not impersonate other models.
`;

function loadMetallmPlatformGuide(): string {
  try {
    const raw = readFileSync(METALLM_DOC_PATH, "utf8").trim();
    return raw || METALLM_DOC_FALLBACK;
  } catch {
    return METALLM_DOC_FALLBACK;
  }
}

const METALLM_PLATFORM_GUIDE = loadMetallmPlatformGuide();

function estimateBase64DecodedBytes(base64: string): number {
  const clean = base64.replace(/\s+/g, "");
  if (!clean) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

const businessSessionCreateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  businessName: z.string().trim().min(1).max(120),
  businessType: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  website: z.string().trim().url().max(300).optional().or(z.literal("")),
  regions: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
  languages: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
  businessPrompt: z.string().trim().max(5000).optional(),
  mediaAssets: z
    .array(
      z.object({
        fileName: z.string().trim().min(1).max(300),
        mimeType: z.string().trim().min(1).max(160),
        content: z.string().trim().min(1).max(8_000_000),
        description: z.string().trim().max(400).optional(),
      }),
    )
    .max(5)
    .optional(),
}).refine((value) => {
  const assets = value.mediaAssets || [];
  const totalBytes = assets.reduce((sum, asset) => sum + estimateBase64DecodedBytes(asset.content), 0);
  return totalBytes <= BUSINESS_CREATE_MEDIA_TOTAL_LIMIT_BYTES;
}, {
  message: "Total media size must be 10MB or less",
  path: ["mediaAssets"],
});

const businessProfileUpdateSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  businessType: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  website: z.string().trim().url().max(300).optional().or(z.literal("")),
  regions: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
  languages: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
});

const businessSessionMutationScopeSchema = z.object({
  chatSessionKey: z.string().trim().min(1).max(500),
});

const compareModelsRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  models: z.array(z.string().trim().min(1).max(120)).min(2).max(4).optional(),
});

const businessSessionControlsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30),
  enabled: z.boolean(),
  humanTakeoverEnabled: z.boolean(),
  cooldownSeconds: z.number().int().min(60).max(86400),
  dmPolicyOpen: z.boolean(),
  readReceiptsEnabled: z.boolean(),
  disappearingMessagesEnabled: z.boolean(),
  disappearingMessagesDuration: z.number().int().min(0).max(7776000),
});

const businessSessionFileSchema = z.object({
  fileName: z.enum(["identity.md", "soul.md", "agents.md", "user.md", "bootstrap.md", "policy.md", "tools.md", "products.md"]),
});

const BUSINESS_AGENT_FILE_NAME_MAP = {
  "identity.md": "IDENTITY.md",
  "soul.md": "SOUL.md",
  "agents.md": "AGENTS.md",
  "user.md": "USER.md",
  "bootstrap.md": "BOOTSTRAP.md",
  "policy.md": "AGENTS.md",
  "tools.md": "TOOLS.md",
  "products.md": "PRODUCTS.md",
} as const;

const businessSessionFileBodySchema = z.object({
  content: z.string().max(200_000),
  chatSessionKey: z.string().trim().min(1).max(500),
});

const businessSessionChatBodySchema = z.object({
  message: z.string().trim().max(20_000).default(""),
  attachments: z
    .array(
      z.object({
        type: z.string().trim().min(1).max(40),
        mimeType: z.string().trim().min(1).max(160),
        fileName: z.string().trim().min(1).max(300).optional(),
        content: z.string().trim().min(1).max(8_000_000),
      }),
    )
    .max(8)
    .optional(),
}).refine((value) => value.message.length > 0 || (value.attachments?.length ?? 0) > 0, {
  message: "Message or attachment is required",
});

const businessSessionChatDeleteSchema = z.object({
  chatSessionKey: z.string().trim().min(1).max(500),
});

const businessSessionUpgradeSchema = z.object({
  planCode: z.enum(["starter", "pro", "enterprise"]),
});

type ProviderMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  | { type: "input_file"; input_file: { filename?: string; mime_type?: string; file_data?: string; data?: string } };

function sanitizeAttachments(value: unknown): UserAttachmentMeta[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const obj = item as Partial<UserAttachmentMeta> | null | undefined;
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.name !== "string" || !obj.name.trim()) return null;
      if (typeof obj.type !== "string") return null;
      if (typeof obj.size !== "number" || !Number.isFinite(obj.size) || obj.size < 0) return null;
      if (typeof obj.isImage !== "boolean") return null;
      const previewDataUrl =
        typeof obj.previewDataUrl === "string" && obj.previewDataUrl.length <= 20_000
          ? obj.previewDataUrl
          : undefined;
      const fullDataUrl =
        typeof obj.fullDataUrl === "string" && obj.fullDataUrl.length <= 6_000_000
          ? obj.fullDataUrl
          : undefined;
      return {
        name: obj.name.slice(0, 300),
        type: obj.type.slice(0, 120),
        size: Math.round(obj.size),
        isImage: obj.isImage,
        previewDataUrl,
        fullDataUrl,
      } as UserAttachmentMeta;
    })
    .filter((x): x is UserAttachmentMeta => !!x)
    .slice(0, 12);
}

function normalizeMessageContent(content: string): string {
  return content.replace(/^\[[^\]]+\]:\s*/, "").trim();
}

function extractAttachmentsFromMetadata(metadata: unknown): UserAttachmentMeta[] {
  if (!metadata || typeof metadata !== "object") return [];
  return sanitizeAttachments((metadata as any).attachments);
}

function buildProviderUserContent(text: string, attachments: UserAttachmentMeta[]): string | ProviderMessagePart[] {
  const cleanText = text.trim();
  const fileParts = attachments
    .filter((a) => !a.isImage)
    .filter((a) => typeof a.fullDataUrl === "string" && a.fullDataUrl.startsWith("data:"))
    .map((a) => ({
      type: "input_file" as const,
      input_file: {
        filename: a.name,
        mime_type: a.type,
        file_data: a.fullDataUrl,
        data: a.fullDataUrl,
      },
    }));

  const imageParts = attachments
    .filter((a) => a.isImage)
    .map((a) => a.fullDataUrl || a.previewDataUrl)
    .filter((url): url is string => typeof url === "string" && url.startsWith("data:image/"))
    .map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } }));

  const parts: ProviderMessagePart[] = [{ type: "text", text: cleanText }, ...imageParts, ...fileParts];
  if (parts.length === 1) return cleanText;
  return parts;
}

function buildContextMessagesForModel(
  history: HistoryMessage[],
  activeModelName: string
): ChatMessage[] {
  const contextMessages: ChatMessage[] = [];

  for (const message of history.slice(-CONTEXT_HISTORY_LIMIT)) {
    const clean = normalizeMessageContent(message.content);
    if (!clean) continue;

    if (message.role === "user") {
      const attachments = extractAttachmentsFromMetadata(message.metadata);
      contextMessages.push({ role: "user", content: buildProviderUserContent(clean, attachments) });
      continue;
    }

    if (message.role !== "assistant") continue;

    if (message.modelName && message.modelName !== activeModelName) {
      contextMessages.push({
        role: "user",
        content:
          `[System note: A different AI model "${message.modelName}" answered earlier in this same chat. ` +
          `This is context only, not your own prior response.]\n\n` +
          `${message.modelName}'s reply: ${clean.slice(0, OTHER_MODEL_SUMMARY_LIMIT)}${clean.length > OTHER_MODEL_SUMMARY_LIMIT ? "..." : ""}`,
      });
      contextMessages.push({
        role: "assistant",
        content: "(Understood. That was another model's response in this shared chat.)",
      });
    } else {
      contextMessages.push({ role: "assistant", content: clean });
    }
  }

  return contextMessages;
}

function listPriorModelNames(history: HistoryMessage[], currentModelName: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const message of history) {
    if (message.role !== "assistant") continue;
    if (!message.modelName || message.modelName === currentModelName) continue;
    if (seen.has(message.modelName)) continue;
    seen.add(message.modelName);
    names.push(message.modelName);
  }
  return names;
}

function describeMode(mode: RuntimeMode): string {
  if (mode === "direct") return "Direct mode: user explicitly selected one model.";
  if (mode === "single") return "Smart route mode: one model is chosen to answer this turn.";
  if (mode === "multi") return "Multi mode: several models answer the same user turn.";
  return "Debate mode: multiple models argue with different stances.";
}

function buildMetallmSystemPrompt(
  basePrompt: string,
  model: Pick<ModelConfig, "id" | "displayName" | "provider" | "role">,
  mode: RuntimeMode,
  history: HistoryMessage[],
  personalization?: UserPersonalizationContext | null,
  memoryContext?: string,
  firstTurnOnboarding?: string,
): string {
  const priorModels = listPriorModelNames(history, model.displayName);
  const priorModelText = priorModels.length > 0 ? priorModels.join(", ") : "None yet";

  return `${basePrompt}

METALLM RUNTIME CONTEXT (authoritative):
- Platform: Metallm AI Aggregator.
- Current mode: ${mode}. ${describeMode(mode)}
- You are currently: ${model.displayName} (id: ${model.id}, provider: ${model.provider}, specialty: ${model.role}).
- Other models that already responded earlier in this same conversation: ${priorModelText}.
- This is a shared multi-model conversation. Never claim to be a different model.
- If asked which model the user is talking to, answer with your exact model identity above.
- If asked what platform this is, answer: Metallm AI Aggregator.
- Treat "Metallm", "MetaLLM", "MetalLM", and close misspellings as this platform by default.
- If the user asks about platform, mode, features, models, memory, or your role/job in this chat, answer from this runtime context first.
- Do not switch to external "MetaLLM" research definitions unless the user explicitly asks about papers, publications, or external projects.
${buildUserPersonalizationContext(personalization ?? null)}${memoryContext ?? ""}${firstTurnOnboarding ?? ""}

METALLM PLATFORM GUIDE:
${METALLM_PLATFORM_GUIDE}`;
}

function resolveRuntimeMode(mode: unknown, targetModelId: unknown): RuntimeMode {
  if (mode === "media") return "media";
  if (mode === "multi") return "multi";
  if (mode === "debate") return "debate";
  if (typeof targetModelId === "string" && targetModelId.trim()) return "direct";
  return "single";
}

type UserAccessState = {
  status: "unrestricted" | "free_trial" | "wallet_required";
  currentCredits: number;
  hasPurchasedCredits: boolean;
  modeUsage: UserChatModeUsageData;
  remainingByMode: Record<AccessControlledMode, number>;
};

async function getUserAccessState(userId: string, currentCredits?: number): Promise<UserAccessState> {
  const resolvedCredits = typeof currentCredits === "number" ? currentCredits : await getUserCredits(userId);
  const [hasPurchasedCredits, modeUsage] = await Promise.all([
    storage.hasPurchasedCredits(userId),
    storage.getUserChatModeUsage(userId),
  ]);

  const remainingByMode = {
    direct: Math.max(0, FREE_MODE_LIMITS.direct - modeUsage.direct),
    single: Math.max(0, FREE_MODE_LIMITS.single - modeUsage.single),
    multi: Math.max(0, FREE_MODE_LIMITS.multi - modeUsage.multi),
    debate: Math.max(0, FREE_MODE_LIMITS.debate - modeUsage.debate),
    media: Math.max(0, FREE_MODE_LIMITS.media - modeUsage.media),
  };

  if (resolvedCredits > 0) {
    return {
      status: "unrestricted",
      currentCredits: resolvedCredits,
      hasPurchasedCredits,
      modeUsage,
      remainingByMode,
    };
  }

  if (!hasPurchasedCredits) {
    return {
      status: "free_trial",
      currentCredits: resolvedCredits,
      hasPurchasedCredits,
      modeUsage,
      remainingByMode,
    };
  }

  return {
    status: "wallet_required",
    currentCredits: resolvedCredits,
    hasPurchasedCredits,
    modeUsage,
    remainingByMode,
  };
}

function isOpenRouterFreeTrialModel(model: Pick<ModelConfig, "id" | "pricing">): boolean {
  if (typeof model.id === "string" && model.id.toLowerCase().endsWith(":free")) {
    return true;
  }

  const pricing = (model as any).pricing;
  if (!pricing || typeof pricing !== "object") return false;

  if (pricing.free === true) return true;

  const input = typeof pricing.inputPerMillion === "number" ? pricing.inputPerMillion : null;
  const output = typeof pricing.outputPerMillion === "number" ? pricing.outputPerMillion : null;
  return input === 0 && output === 0;
}

function isModelFreeEligible(model: Pick<ModelConfig, "id" | "provider" | "pricing">): boolean {
  if (!FREE_ELIGIBLE_PROVIDERS.has(model.provider)) return false;
  if (model.provider === "groq") return true;
  if (model.provider === "openrouter") return isOpenRouterFreeTrialModel(model);
  return false;
}

function getSelectableModelsForAccess(models: ModelConfig[], access: UserAccessState): ModelConfig[] {
  if (access.status === "unrestricted") return models;
  if (access.status === "free_trial") return models.filter(isModelFreeEligible);
  return [];
}

function getPreferredAccessibleMainModel(models: ModelConfig[], mainModelId: string, access: UserAccessState): ModelConfig {
  const selectable = getSelectableModelsForAccess(models, access);
  const preferred = selectable.find((model) => model.id === mainModelId);
  return preferred || selectable[0] || models[0] || DEFAULT_MODELS[0];
}

function getTotalModeUsageCount(modeUsage: UserChatModeUsageData): number {
  return modeUsage.direct + modeUsage.single + modeUsage.multi + modeUsage.debate + modeUsage.media;
}

function buildFirstTurnOnboardingInstruction(): string {
  return `

FIRST TURN ONBOARDING:
- This is the user's first-ever prompt after signing up for Metallm.
- Before answering the actual request, start with one short, natural welcome to Metallm.
- Keep it brief: 3-4 short sentences maximum before the real answer.
- Mention a few core features naturally: Direct model chat, Smart Route, Multi mode, Debate mode, and saved memory/personalization.
- Then answer the user's actual request normally.
- Do this only for this turn.`;
}

function buildWalletTopUpMessage(mode: AccessControlledMode, access: UserAccessState): string {
  if (access.status === "wallet_required") {
    return "Top up your wallet to continue with flagship and advanced models.";
  }

  if (mode === "direct") {
    return "Your 5 free direct prompts are finished. Top up your wallet to continue and unlock flagship and advanced models.";
  }

  if (mode === "single") {
    return "Your free Smart Route prompt is finished. Top up your wallet to continue and unlock flagship and advanced models.";
  }

  if (mode === "multi") {
    return "Your free Multi prompt is finished. Top up your wallet to continue and unlock flagship and advanced models.";
  }

  if (mode === "media") {
    return "Image generation is a Pro feature. upgrade to  unlock image models.";
  }

  return "Your free Debate prompt is finished. Top up your wallet to continue and unlock flagship and advanced models.";
}

function buildWalletTopUpError(mode: AccessControlledMode, access: UserAccessState, currentCredits: number) {
  return {
    message: buildWalletTopUpMessage(mode, access),
    code: "wallet_top_up_required",
    credits: currentCredits,
    access: {
      status: access.status,
      remainingByMode: access.remainingByMode,
      limits: FREE_MODE_LIMITS,
    },
  };
}

function getModelAccessDescriptor(model: ModelConfig, access: UserAccessState) {
  if (access.status === "unrestricted") {
    return { isSelectable: true, accessLabel: null as string | null };
  }

  if (access.status === "free_trial") {
    return isModelFreeEligible(model)
      ? { isSelectable: true, accessLabel: null as string | null }
      : { isSelectable: false, accessLabel: "Top up wallet" };
  }

  return { isSelectable: false, accessLabel: "Top up wallet" };
}

function getMediaModelAccessDescriptor(access: UserAccessState) {
  if (access.status === "unrestricted") {
    return { isSelectable: true, accessLabel: null as string | null };
  }

  return { isSelectable: false, accessLabel: "Pro" };
}

function shouldForceMetallmFocus(content: string): boolean {
  const normalized = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /\b(meta\s*llm|metallm|matellm|metal\s*lm)\b/.test(normalized);
}

type DebateRoundControlPayload = {
  topic?: string;
  round?: number;
  totalRounds?: number;
  globalInstruction?: string;
  targetedInstructions?: Array<{ modelId?: string; modelName?: string; mention?: string; instruction?: string }>;
  participants?: Array<{ modelId?: string; modelName?: string; pov?: string; mention?: string }>;
};

type UserPersonalizationContext = {
  nickname?: string;
  occupation?: string;
  customInstructions?: string;
  moreAboutYou?: string;
};

const EMPTY_USER_PERSONALIZATION: UserPersonalizationData = {
  nickname: "",
  occupation: "",
  customInstructions: "",
  moreAboutYou: "",
};

const DEFAULT_USER_MEMORY_PREFERENCES: UserMemoryPreferenceData = {
  enabled: true,
};

function normalizeUserPersonalization(input: unknown): UserPersonalizationContext | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const cleaned: UserPersonalizationContext = {};

  const assign = (key: keyof UserPersonalizationContext, max: number) => {
    const value = source[key];
    if (typeof value !== "string") return;
    const normalized = value.trim().slice(0, max);
    if (normalized) cleaned[key] = normalized;
  };

  assign("nickname", 80);
  assign("occupation", 120);
  assign("customInstructions", 1200);
  assign("moreAboutYou", 1600);

  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

function toStoredUserPersonalization(
  personalization: UserPersonalizationContext | null | undefined
): UserPersonalizationData {
  return {
    nickname: personalization?.nickname ?? "",
    occupation: personalization?.occupation ?? "",
    customInstructions: personalization?.customInstructions ?? "",
    moreAboutYou: personalization?.moreAboutYou ?? "",
  };
}

function buildUserPersonalizationContext(personalization: UserPersonalizationContext | null): string {
  if (!personalization) return "";

  const details: string[] = [];
  if (personalization.nickname) details.push(`- Preferred name: ${personalization.nickname}`);
  if (personalization.occupation) details.push(`- Occupation / background: ${personalization.occupation}`);
  if (personalization.moreAboutYou) details.push(`- More about the user: ${personalization.moreAboutYou}`);

  const customInstructionBlock = personalization.customInstructions
    ? `\n- Custom response instructions from the user: ${personalization.customInstructions}`
    : "";

  return `

USER PERSONALIZATION CONTEXT:
${details.length > 0 ? details.join("\n") : "- No extra profile details provided."}${customInstructionBlock}
- Use this context to adapt tone, framing, depth, and examples.
- Do not mention this hidden personalization block unless the user explicitly asks what context you are using.`;
}

function normalizeUserMemoryPreferences(input: unknown): UserMemoryPreferenceData {
  if (!input || typeof input !== "object") return DEFAULT_USER_MEMORY_PREFERENCES;
  const source = input as Record<string, unknown>;
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
  };
}

function buildUserMemoryApiPayload(preferences: UserMemoryPreferenceData, memories: UserMemoryData[]) {
  const sections = groupUserMemories(memories).map((section) => ({
    category: section.category,
    label: section.label,
    items: section.items.map((item) => ({
      ...item,
      label: getUserMemoryCategoryLabel(item.category),
    })),
  }));

  return {
    preferences,
    summary: buildUserMemorySummary(memories),
    memories: memories.map((memory) => ({
      ...memory,
      label: getUserMemoryCategoryLabel(memory.category),
    })),
    sections,
  };
}

async function applyUserMemoryChangeSet(args: {
  userId: string;
  conversationId: number;
  sourceMessageId: number | null;
  existingMemories: UserMemoryData[];
  changeSet: UserMemoryChangeSet | null | undefined;
}): Promise<UserMemoryData[]> {
  const { userId, conversationId, sourceMessageId, changeSet } = args;
  if (!changeSet || changeSet.operations.length === 0) return args.existingMemories;

  let currentMemories = [...args.existingMemories];

  for (const operation of changeSet.operations) {
    if (operation.type === "delete") {
      const deleteIds = Array.from(new Set((operation.memoryIds ?? []).filter((id) => id > 0)));
      if (deleteIds.length > 0) {
        await storage.deleteUserMemories(userId, deleteIds);
        currentMemories = currentMemories.filter((memory) => !deleteIds.includes(memory.id));
      } else if (operation.category) {
        await storage.deleteUserMemoriesByCategory(userId, operation.category);
        currentMemories = currentMemories.filter((memory) => memory.category !== operation.category);
      }
      continue;
    }

    const category = operation.category as UserMemoryCategory;
    const content = operation.content?.trim();
    if (!category || !content) continue;

    const requestedDeleteIds = Array.from(new Set((operation.replaceIds ?? []).filter((id) => id > 0)));
    const singletonDeleteIds = isSingletonMemoryCategory(category)
      ? currentMemories.filter((memory) => memory.category === category).map((memory) => memory.id)
      : [];
    const deleteIds = Array.from(new Set([...requestedDeleteIds, ...singletonDeleteIds]));

    if (deleteIds.length > 0) {
      await storage.deleteUserMemories(userId, deleteIds);
      currentMemories = currentMemories.filter((memory) => !deleteIds.includes(memory.id));
    }

    const duplicate = currentMemories.find(
      (memory) => memory.category === category && memory.content.toLowerCase() === content.toLowerCase()
    );
    if (duplicate) continue;

    const created = await storage.createUserMemory({
      userId,
      category,
      content,
      source: "model",
      sourceConversationId: conversationId,
      sourceMessageId,
    });
    currentMemories = [created, ...currentMemories];
  }

  return currentMemories;
}

function toMentionHandle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseDebateRoundControl(content: string): DebateRoundControlPayload | null {
  const startMarker = "[METALLM_DEBATE_ROUND_CONTROL]";
  const endMarker = "[/METALLM_DEBATE_ROUND_CONTROL]";
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) return null;

  const rawJson = content.slice(start + startMarker.length, end).trim();
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === "object" ? parsed as DebateRoundControlPayload : null;
  } catch {
    return null;
  }
}

// SSE Helper
function sendSSE(res: Response, event: string, data: any) {
  if (res.writableEnded || (res as any).destroyed) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Force an immediate flush when available (e.g. compression/proxy-aware response objects).
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
  }
}

type WordStreamState = {
  carry: string;
};

function createWordStreamState(): WordStreamState {
  return { carry: "" };
}

function streamChunkAsWords(res: Response, modelName: string, chunk: string, state: WordStreamState): void {
  if (!chunk) return;

  const combined = `${state.carry}${chunk}`;
  const lastWhitespaceIndex = Math.max(
    combined.lastIndexOf(" "),
    combined.lastIndexOf("\n"),
    combined.lastIndexOf("\t"),
    combined.lastIndexOf("\r")
  );

  if (lastWhitespaceIndex < 0) {
    state.carry = combined;
    return;
  }

  const flushable = combined.slice(0, lastWhitespaceIndex + 1);
  state.carry = combined.slice(lastWhitespaceIndex + 1);

  const parts = flushable.match(/\S+\s*|\s+/g) || [];
  for (const part of parts) {
    if (part) sendSSE(res, "chunk", { modelName, content: part });
  }
}

function flushWordStream(res: Response, modelName: string, state: WordStreamState): void {
  if (!state.carry) return;
  sendSSE(res, "chunk", { modelName, content: state.carry });
  state.carry = "";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // Setup Payment Routes — controlled by PAYMENT_PROVIDER env variable
  if (PAYMENT_PROVIDER === "paddle") {
    registerPaddleRoutes(app);
  } else {
    // Default: Lemon Squeezy
    registerLemonSqueezyRoutes(app);
  }


  // Setup WhatsApp Agent Routes (direct Baileys — no OpenClaw dependency)
  registerWhatsAppRoutes(app, isAuthenticated, isVerifiedUser);

  // Setup Admin Routes
  registerAdminRoutes(app);

  // Delay boot to let the DB pool warm up (avoids connection timeout on startup)
  setTimeout(() => {
    bootAllAccounts().catch((err) => {
      console.error("WhatsApp boot error:", (err as Error).message);
    });
  }, 3000);

  app.get("/api/business-agent/sessions", isAuthenticated, isVerifiedUser, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const sessions = await listBusinessSessions(userId);
      res.json({ sessions });
    } catch (error) {
      console.error("Business sessions list error:", error);
      res.status(500).json({ message: "Failed to load business sessions" });
    }
  });

  app.get(
    "/api/business-agent/sessions/:id",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const session = await getBusinessSession(userId, sessionId);
        if (!session) {
          return res.status(404).json({ message: "Session not found" });
        }
        res.json(session);
      } catch (error) {
        console.error("Business session details error:", error);
        res.status(500).json({ message: "Failed to load session details" });
      }
    },
  );

  app.post("/api/business-agent/sessions", isAuthenticated, isVerifiedUser, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const existingBusinessProfile = await db
        .select({ id: businessProfiles.id })
        .from(businessProfiles)
        .where(eq(businessProfiles.userId, userId))
        .limit(1);
      if (existingBusinessProfile.length > 0) {
        return res.status(409).json({
          message: "Only one business profile is allowed per user. Delete the existing profile before creating a new one.",
        });
      }

      const parsed = businessSessionCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid session payload" });
      }

      const created = await createBusinessSession({
        userId,
        name: (parsed.data.name?.trim() || parsed.data.businessName.trim()),
        businessName: parsed.data.businessName.trim(),
        businessPrompt:
          parsed.data.businessPrompt?.trim() ||
          [
            `Business type: ${parsed.data.businessType.trim()}`,
            `Primary WhatsApp: ${parsed.data.phone.trim()}`,
            parsed.data.email?.trim() ? `Email: ${parsed.data.email.trim()}` : "",
            parsed.data.website?.trim() ? `Website: ${parsed.data.website.trim()}` : "",
            `Regions: ${parsed.data.regions.join(", ")}`,
            `Languages: ${parsed.data.languages.join(", ")}`,
          ]
            .filter(Boolean)
            .join("\n"),
        phone: parsed.data.phone.trim(),
        profile: {
          businessType: parsed.data.businessType.trim(),
          email: parsed.data.email?.trim() || "",
          website: parsed.data.website?.trim() || "",
          regions: parsed.data.regions,
          languages: parsed.data.languages,
          mediaAssets: parsed.data.mediaAssets,
        },
      });

      if (created?.session?.id) {
        await db
          .insert(businessProfiles)
          .values({
            userId,
            agentId: created.session.id,
            businessName: parsed.data.businessName.trim(),
            businessType: parsed.data.businessType.trim(),
            whatsappNumber: parsed.data.phone.trim(),
            email: parsed.data.email?.trim() || null,
            website: parsed.data.website?.trim() || null,
            regions: parsed.data.regions,
            languages: parsed.data.languages,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [businessProfiles.userId, businessProfiles.agentId],
            set: {
              businessName: parsed.data.businessName.trim(),
              businessType: parsed.data.businessType.trim(),
              whatsappNumber: parsed.data.phone.trim(),
              email: parsed.data.email?.trim() || null,
              website: parsed.data.website?.trim() || null,
              regions: parsed.data.regions,
              languages: parsed.data.languages,
              updatedAt: new Date(),
            },
          });
      }

      res.json(created);
    } catch (error) {
      console.error("Business session create error:", error);
      const message = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "Failed to create session";
      res.status(500).json({ message });
    }
  });

  app.put(
    "/api/business-agent/sessions/:id/profile",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const parsed = businessProfileUpdateSchema
          .merge(businessSessionMutationScopeSchema)
          .safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid business profile payload" });
        }

        if (!isBusinessControlChatSessionKey(sessionId, parsed.data.chatSessionKey)) {
          return res.status(403).json({ message: "Only the main or bootstrap session can update business profile" });
        }

        const payload = parsed.data;
        await db
          .insert(businessProfiles)
          .values({
            userId,
            agentId: sessionId,
            businessName: payload.businessName,
            businessType: payload.businessType,
            whatsappNumber: payload.phone,
            email: payload.email?.trim() || null,
            website: payload.website?.trim() || null,
            regions: payload.regions,
            languages: payload.languages,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [businessProfiles.userId, businessProfiles.agentId],
            set: {
              businessName: payload.businessName,
              businessType: payload.businessType,
              whatsappNumber: payload.phone,
              email: payload.email?.trim() || null,
              website: payload.website?.trim() || null,
              regions: payload.regions,
              languages: payload.languages,
              updatedAt: new Date(),
            },
          });

        res.json({ ok: true });
      } catch (error) {
        console.error("Business profile update error:", error);
        res.status(500).json({ message: "Failed to update business profile" });
      }
    },
  );

  app.get(
    "/api/business-agent/sessions/:id/profile",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const [profile] = await db
          .select()
          .from(businessProfiles)
          .where(and(eq(businessProfiles.userId, userId), eq(businessProfiles.agentId, sessionId)))
          .limit(1);

        res.json({
          profile: profile
            ? {
                businessName: profile.businessName,
                businessType: profile.businessType,
                phone: profile.whatsappNumber || "",
                email: profile.email || "",
                website: profile.website || "",
                regions: Array.isArray(profile.regions) ? profile.regions : [],
                languages: Array.isArray(profile.languages) ? profile.languages : [],
              }
            : null,
        });
      } catch (error) {
        console.error("Business profile fetch error:", error);
        res.status(500).json({ message: "Failed to load business profile" });
      }
    },
  );

  app.put(
    "/api/business-agent/sessions/:id/controls",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const parsed = businessSessionControlsSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid controls payload" });
        }

        const updated = await updateBusinessSessionControls(userId, sessionId, parsed.data);
        if (!updated) {
          return res.status(404).json({ message: "Session not found" });
        }
        res.json({ session: updated });
      } catch (error) {
        console.error("Business controls update error:", error);
        res.status(500).json({ message: "Failed to update controls" });
      }
    },
  );

  app.put(
    "/api/business-agent/sessions/:id/files/:fileName",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const fileParsed = businessSessionFileSchema.safeParse({ fileName: req.params.fileName });
        if (!fileParsed.success) {
          return res.status(400).json({ message: "Invalid file name" });
        }

        const bodyParsed = businessSessionFileBodySchema.safeParse(req.body);
        if (!bodyParsed.success) {
          return res.status(400).json({ message: "Invalid file payload" });
        }

        const result = await saveBusinessSessionFile({
          userId,
          sessionId,
          fileName: BUSINESS_AGENT_FILE_NAME_MAP[fileParsed.data.fileName],
          content: bodyParsed.data.content,
          chatSessionKey: bodyParsed.data.chatSessionKey,
        });

        if (!result) {
          return res.status(404).json({ message: "Session not found" });
        }

        if (!result.ok && result.reason === "main-session-required") {
          return res.status(403).json({ message: "Only the main or bootstrap session can update agent files" });
        }

        res.json(result);
      } catch (error) {
        console.error("Business file save error:", error);
        res.status(500).json({ message: "Failed to save file" });
      }
    },
  );

  app.post(
    "/api/business-agent/sessions/:id/qr/start",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const qr = await refreshBusinessSessionQr(userId, sessionId);
        if (!qr) {
          return res.status(404).json({ message: "Session not found" });
        }

        // Return the QR immediately so the browser can render it.
        res.json(qr);

        // Background task: mirror the CLI "web.login.wait" step.
        // This blocks on the gateway until WhatsApp confirms the scan (up to 120 s),
        // then pushes a whatsapp_linked WebSocket event so the UI updates without polling.
        void waitBusinessSessionLink(userId, sessionId)
          .then((result) => {
            if (result?.connected) {
              broadcastToUser(userId, "whatsapp_linked", { sessionId });
            }
          })
          .catch((err) => {
            console.error("Business QR background wait error:", err);
          });
      } catch (error) {
        console.error("Business QR refresh error:", error);
        res.status(500).json({ message: "Failed to refresh QR" });
      }
    },
  );

  // Returns the current cached QR (force=false) without restarting the WA session.
  // Used by the frontend polling loop to pick up a fresh QR without disrupting the
  // active login that was started by /qr/start.
  app.get(
    "/api/business-agent/sessions/:id/qr/current",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const qr = await getCurrentSessionQr(userId, sessionId);
        if (!qr) {
          return res.status(404).json({ message: "Session not found" });
        }

        res.json(qr);
      } catch (error) {
        console.error("Business QR current error:", error);
        res.status(500).json({ message: "Failed to get current QR" });
      }
    },
  );

  app.post(
    "/api/business-agent/sessions/:id/qr/wait",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const result = await waitBusinessSessionLink(userId, sessionId);
        if (!result) {
          return res.status(404).json({ message: "Session not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Business QR wait error:", error);
        res.status(500).json({ message: "Failed while waiting for QR link" });
      }
    },
  );

  app.post(
    "/api/business-agent/sessions/:id/logout",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const result = await logoutBusinessSession(userId, sessionId);
        if (!result) {
          return res.status(404).json({ message: "Session not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Business logout error:", error);
        res.status(500).json({ message: "Failed to logout session" });
      }
    },
  );

  app.delete(
    "/api/business-agent/sessions/:id",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const result = await deleteBusinessSession(userId, sessionId);
        if (!result) {
          return res.status(404).json({ message: "Session not found" });
        }

        await db
          .delete(businessProfiles)
          .where(
            and(eq(businessProfiles.userId, userId), eq(businessProfiles.agentId, sessionId)),
          );

        res.json(result);
      } catch (error) {
        console.error("Business delete error:", error);
        res.status(500).json({ message: "Failed to delete session" });
      }
    },
  );

  // ── Multi-account routes ────────────────────────────────────

  app.get(
    "/api/business-agent/sessions/:id/accounts",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const accounts = await listBusinessSessionAccounts(userId, sessionId);
        if (!accounts) return res.status(404).json({ message: "Session not found" });

        res.json({ accounts });
      } catch (error) {
        console.error("Business accounts list error:", error);
        res.status(500).json({ message: "Failed to list accounts" });
      }
    },
  );

  app.post(
    "/api/business-agent/sessions/:id/accounts",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const result = await addBusinessSessionAccount(userId, sessionId);
        if (!result.ok) {
          const status = result.reason === "session-not-found" ? 404 : 403;
          return res.status(status).json(result);
        }

        res.json(result);
      } catch (error) {
        console.error("Business add account error:", error);
        res.status(500).json({ message: "Failed to add account" });
      }
    },
  );

  app.delete(
    "/api/business-agent/sessions/:id/accounts/:accountId",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;
        if (!sessionId || !accountId) return res.status(400).json({ message: "Invalid params" });

        const result = await removeBusinessSessionAccount(userId, sessionId, accountId);
        if (!result.ok) {
          return res.status(400).json(result);
        }

        res.json(result);
      } catch (error) {
        console.error("Business remove account error:", error);
        res.status(500).json({ message: "Failed to remove account" });
      }
    },
  );

  app.post(
    "/api/business-agent/sessions/:id/accounts/:accountId/qr",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;
        if (!sessionId || !accountId) return res.status(400).json({ message: "Invalid params" });

        const result = await refreshBusinessSessionAccountQr(userId, sessionId, accountId);
        if (!result) return res.status(404).json({ message: "Account not found" });

        res.json(result);
      } catch (error) {
        console.error("Business account QR error:", error);
        res.status(500).json({ message: "Failed to get QR" });
      }
    },
  );

  app.get(
    "/api/business-agent/sessions/:id/chat/sessions",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const result = await listBusinessSessionChatSessions(userId, sessionId);
        if (!result) {
          return res.status(404).json({ message: "Session not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Business chat sessions list error:", error);
        res.status(500).json({ message: "Failed to load chat sessions" });
      }
    },
  );

  app.delete(
    "/api/business-agent/sessions/:id/chat/sessions",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const parsed = businessSessionChatDeleteSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid chat session delete payload" });
        }

        const result = await deleteBusinessSessionChatSession({
          userId,
          sessionId,
          chatSessionKey: parsed.data.chatSessionKey,
        });

        if (!result) {
          return res.status(404).json({ message: "Session not found" });
        }

        if (!result.ok && result.reason === "protected-session") {
          return res.status(400).json({ message: "Main and bootstrap sessions cannot be deleted" });
        }

        res.json({ ok: true });
      } catch (error) {
        console.error("Business chat session delete error:", error);
        res.status(500).json({ message: "Failed to delete chat session" });
      }
    },
  );

  app.get(
    "/api/business-agent/sessions/:id/subscription",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const result = await getBusinessSessionSubscription(userId, sessionId);
        if (!result) {
          return res.status(404).json({ message: "Session not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Business subscription load error:", error);
        res.status(500).json({ message: "Failed to load subscription" });
      }
    },
  );

  app.post(
    "/api/business-agent/sessions/:id/subscription/checkout",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const parsed = businessSessionUpgradeSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid upgrade payload" });
        }

        const checkout = await createBusinessSessionSubscriptionCheckout({
          userId,
          userEmail: user?.email,
          sessionId,
          planCode: parsed.data.planCode,
        });

        if (!checkout) {
          return res.status(404).json({ message: "Session not found" });
        }

        res.json(checkout);
      } catch (error) {
        console.error("Business checkout create error:", error);
        const message = error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Failed to start checkout";
        res.status(500).json({ message });
      }
    },
  );

  app.get(
    "/api/business-agent/sessions/:id/chat",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const chatSessionKey =
          typeof req.query.chatSessionKey === "string" ? req.query.chatSessionKey : undefined;
        const result = await getBusinessSessionChat(userId, sessionId, chatSessionKey);
        if (!result) {
          return res.status(404).json({ message: "Session not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Business chat load error:", error);
        res.status(500).json({ message: "Failed to load chat" });
      }
    },
  );

  app.post(
    "/api/business-agent/sessions/:id/chat",
    isAuthenticated,
    isVerifiedUser,
    async (req, res) => {
      try {
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        if (!sessionId) return res.status(400).json({ message: "Invalid session id" });

        const parsed = businessSessionChatBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid chat payload" });
        }

        const result = await sendBusinessSessionChat({
          userId,
          sessionId,
          message: parsed.data.message,
          attachments: parsed.data.attachments,
          chatSessionKey:
            typeof (req.body as Record<string, unknown>).chatSessionKey === "string"
              ? ((req.body as Record<string, unknown>).chatSessionKey as string)
              : undefined,
        });

        if (!result) {
          return res.status(404).json({ message: "Session not found" });
        }

        if (!result.ok && result.reason === "message-limit-exceeded") {
          return res.status(403).json({
            message: "Message limit reached for your current plan. Please upgrade to continue.",
            subscription: result.subscription,
          });
        }

        res.json(result);
      } catch (error) {
        console.error("Business chat send error:", error);
        res.status(500).json({ message: "Failed to send chat message" });
      }
    },
  );

  app.get("/api/subscription/usage", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const now = new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

      const [usageRow] = await db
        .select({
          usedUsd: sql<string>`coalesce(sum(abs(${creditTransactions.amount}::numeric)), 0)::text`,
        })
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, userId),
            eq(creditTransactions.type, "usage"),
            gte(creditTransactions.createdAt, periodStart),
            lt(creditTransactions.createdAt, periodEnd)
          )
        );

      const spentUsd = Number.parseFloat(usageRow?.usedUsd ?? "0");
      const used = Number(usdToSubscriptionUsage(spentUsd).toFixed(1));
      const remaining = Number(Math.max(0, SUBSCRIPTION_USAGE_CAP - used).toFixed(1));
      const usedPercent = Number(((used / SUBSCRIPTION_USAGE_CAP) * 100).toFixed(1));

      res.json({
        quota: SUBSCRIPTION_USAGE_CAP,
        used,
        remaining,
        usedPercent,
        spentUsd: Number(spentUsd.toFixed(4)),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        monthlyPrice: SUBSCRIPTION_MONTHLY_PRICE,
        yearlyPrice: SUBSCRIPTION_YEARLY_PRICE,
        yearlyMonthlyEquivalent: SUBSCRIPTION_YEARLY_MONTHLY_EQUIVALENT,
        yearlyDiscountPercent: SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT,
      });
    } catch (error) {
      console.error("Subscription usage error:", error);
      res.status(500).json({ message: "Failed to load subscription usage" });
    }
  });

  // =============================================
  // === Feedback API ===
  // =============================================
  app.post("/api/feedback", isAuthenticated, async (req: any, res) => {
    try {
      const { feedback } = req.body;
      if (!feedback || typeof feedback !== "string" || !feedback.trim()) {
        return res.status(400).json({ message: "Feedback is required" });
      }
      const userId = req.user?.id || req.user?.claims?.sub || "unknown";
      const userEmail = req.user?.email || "unknown";
      const userName = req.user?.firstName
        ? `${req.user.firstName}${req.user.lastName ? " " + req.user.lastName : ""}`
        : "Unknown";

      const feedbackEmail = process.env.FEEDBACK_EMAIL;
      if (!feedbackEmail) throw new Error("FEEDBACK_EMAIL env variable is not set");

      await sendEmail({
        to: feedbackEmail,
        subject: `[Feedback] from ${userName} <${userEmail}>`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px 20px; color: #333;">
            <h2 style="margin-bottom: 4px;">New Feedback Received</h2>
            <p style="margin-top: 0; color: #666;">Submitted via the MetaLLM dashboard</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
            <p><strong>From:</strong> ${userName}</p>
            <p><strong>Email:</strong> ${userEmail}</p>
            <p><strong>User ID:</strong> ${userId}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
            <p><strong>Message:</strong></p>
            <blockquote style="background:#f9f9f9;border-left:4px solid #ccc;margin:8px 0;padding:12px 16px;white-space:pre-wrap;">${feedback.trim()}</blockquote>
          </div>
        `,
        text: `New Feedback from ${userName} (${userEmail}):\n\n${feedback.trim()}`,
      });

      res.json({ message: "Feedback received" });
    } catch (error) {
      console.error("Feedback error:", error);
      res.status(500).json({ message: "Failed to send feedback" });
    }
  });

  // =============================================

  app.get("/api/personalization", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const personalization = await storage.getUserPersonalization(userId);
      res.json({ personalization: personalization ?? EMPTY_USER_PERSONALIZATION });
    } catch {
      res.status(500).json({ message: "Failed to load personalization" });
    }
  });

  app.put("/api/personalization", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const normalized = normalizeUserPersonalization(req.body);
      if (!normalized) {
        await storage.clearUserPersonalization(userId);
        return res.json({ personalization: EMPTY_USER_PERSONALIZATION });
      }

      const personalization = await storage.upsertUserPersonalization(
        userId,
        toStoredUserPersonalization(normalized)
      );
      res.json({ personalization });
    } catch {
      res.status(400).json({ message: "Invalid personalization payload" });
    }
  });

  app.delete("/api/personalization", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      await storage.clearUserPersonalization(userId);
      res.json({ personalization: EMPTY_USER_PERSONALIZATION });
    } catch {
      res.status(500).json({ message: "Failed to clear personalization" });
    }
  });

  app.get("/api/memory", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [preferences, memories] = await Promise.all([
        storage.getUserMemoryPreferences(userId),
        storage.getUserMemories(userId),
      ]);

      res.json(buildUserMemoryApiPayload(preferences, memories));
    } catch {
      res.status(500).json({ message: "Failed to load memory" });
    }
  });

  app.put("/api/memory/preferences", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const nextPreferences = normalizeUserMemoryPreferences(req.body);
      const preferences = await storage.upsertUserMemoryPreferences(userId, nextPreferences);
      const memories = await storage.getUserMemories(userId);
      res.json(buildUserMemoryApiPayload(preferences, memories));
    } catch {
      res.status(400).json({ message: "Invalid memory preferences" });
    }
  });

  app.delete("/api/memory/:memoryId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const memoryId = Number(req.params.memoryId);
      if (!Number.isFinite(memoryId) || memoryId <= 0) {
        return res.status(400).json({ message: "Invalid memory id" });
      }

      const existing = await storage.getUserMemories(userId);
      if (!existing.some((memory) => memory.id === memoryId)) {
        return res.status(404).json({ message: "Memory not found" });
      }

      await storage.deleteUserMemories(userId, [memoryId]);
      const [preferences, memories] = await Promise.all([
        storage.getUserMemoryPreferences(userId),
        storage.getUserMemories(userId),
      ]);
      res.json(buildUserMemoryApiPayload(preferences, memories));
    } catch {
      res.status(500).json({ message: "Failed to delete memory" });
    }
  });

  app.delete("/api/memory", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.id || user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      await storage.clearUserMemories(userId);
      const preferences = await storage.getUserMemoryPreferences(userId);
      res.json(buildUserMemoryApiPayload(preferences, []));
    } catch {
      res.status(500).json({ message: "Failed to clear memory" });
    }
  });

  app.get("/api/mobile/bootstrap", async (req, res) => {
    try {
      const authenticated = Boolean((req as any).isAuthenticated?.() && (req as any).user);
      const guestModels = normalizeUserModelSettings(
        { models: [...DEFAULT_MODELS], mainModelId: DEFAULT_MAIN_MODEL_ID },
        undefined
      );

      const modelPayload = authenticated
        ? await (async () => {
            const ctx = await getUserModelContext(req as any);
            const access = await getUserAccessState(ctx.userId);
            const userModels = access.status === "unrestricted"
              ? ctx.models.filter((model) => model.tier !== 3)
              : ctx.models;
            return {
              models: userModels.map((model) => ({
                ...model,
                ...getModelAccessDescriptor(model, access),
              })),
              mainModelId: ctx.mainModelId,
              access: {
                status: access.status,
                remainingByMode: access.remainingByMode,
                limits: FREE_MODE_LIMITS,
                allowedProviders: Array.from(FREE_ELIGIBLE_PROVIDERS),
              },
            };
          })()
        : {
            models: guestModels.models.map((model) => ({
              ...model,
              isSelectable: true,
              accessLabel: null,
            })),
            mainModelId: guestModels.mainModelId,
            access: {
              status: "guest",
              remainingByMode: FREE_MODE_LIMITS,
              limits: FREE_MODE_LIMITS,
              allowedProviders: Array.from(FREE_ELIGIBLE_PROVIDERS),
            },
          };

      const user = authenticated ? (req as any).user : null;

      res.json({
        app: {
          name: "MetaLLM",
          environment: process.env.NODE_ENV || "development",
          supportEmail: process.env.SUPPORT_EMAIL || "support@metallm.tech",
          websiteUrl: process.env.PUBLIC_APP_URL || "https://metallm.tech",
          mobileTargets: {
            android: true,
            ios: true,
          },
        },
        auth: {
          provider: MOBILE_AUTH_PROVIDER,
          usesSupabase: false,
          googleOAuthEnabled: GOOGLE_OAUTH_CONFIGURED,
          requiresServerSession: true,
        },
        payments: {
          provider: PAYMENT_PROVIDER,
          directServerCheckout: true,
          cryptoProviders: [],
        },
        features: {
          chatModes: ["single", "direct", "multi", "debate"],
          webSearch: true,
          attachments: true,
          memory: true,
          personalization: true,
          dynamicModels: true,
          serverDrivenPayments: true,
        },
        session: {
          authenticated,
          user: user
            ? {
                id: user.id || user.claims?.sub || null,
                email: user.email || null,
                firstName: user.firstName || null,
                lastName: user.lastName || null,
                profileImageUrl: user.profileImageUrl || null,
              }
            : null,
        },
        models: modelPayload.models,
        mainModelId: modelPayload.mainModelId,
        access: modelPayload.access,
      });
    } catch (error) {
      console.error("Mobile bootstrap error:", error);
      res.status(500).json({ message: "Failed to load mobile bootstrap" });
    }
  });

  // Get available models with their roles
  app.get("/api/models", async (_req, res) => {
    try {
      if ((_req as any).isAuthenticated?.() && (_req as any).user) {
        const ctx = await getUserModelContext(_req as any);
        const access = await getUserAccessState(ctx.userId);
        const userModels = access.status === "unrestricted"
          ? ctx.models.filter((model) => model.tier !== 3)
          : ctx.models;
        return res.json({
          models: userModels.map((model) => ({
            ...model,
            ...getModelAccessDescriptor(model, access),
          })),
          mainModelId: ctx.mainModelId,
          access: {
            status: access.status,
            remainingByMode: access.remainingByMode,
            limits: FREE_MODE_LIMITS,
            allowedProviders: Array.from(FREE_ELIGIBLE_PROVIDERS),
          },
        });
      }

      const normalized = normalizeUserModelSettings(
        { models: [...DEFAULT_MODELS], mainModelId: DEFAULT_MAIN_MODEL_ID },
        undefined
      );
      return res.json({
        models: normalized.models.map((model) => ({
          ...model,
          isSelectable: true,
          accessLabel: null,
        })),
        mainModelId: normalized.mainModelId,
        access: {
          status: "guest",
          remainingByMode: FREE_MODE_LIMITS,
          limits: FREE_MODE_LIMITS,
          allowedProviders: Array.from(FREE_ELIGIBLE_PROVIDERS),
        },
      });
    } catch {
      res.status(500).json({ message: "Failed to load models" });
    }
  });

  // =============================================
  // === MEDIA MODELS ENDPOINT ===
  // =============================================
  app.get("/api/media/models", async (_req, res) => {
    try {
      const isAuthed = (_req as any).isAuthenticated?.() && (_req as any).user;
      if (isAuthed) {
        const user = (_req as any).user;
        const userId = user.id || user.claims?.sub;
        const access = await getUserAccessState(userId);
        return res.json({
          image: MEDIA_MODELS.image.map((model) => ({
            ...model,
            ...getMediaModelAccessDescriptor(access),
          })),
          access: {
            status: access.status,
            remainingByMode: access.remainingByMode,
            limits: FREE_MODE_LIMITS,
          },
        });
      }

      res.json({
        image: MEDIA_MODELS.image.map((model) => ({
          ...model,
          isSelectable: false,
          accessLabel: "Pro",
        })),
        access: {
          status: "guest",
          remainingByMode: FREE_MODE_LIMITS,
          limits: FREE_MODE_LIMITS,
        },
      });
    } catch {
      res.status(500).json({ message: "Failed to load media models" });
    }
  });

  // =============================================
  // === GENERATE IMAGE ===
  // =============================================
  app.post("/api/media/generate-image", isAuthenticated, isVerifiedUser, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const { modelId, prompt, aspectRatio, imageSize, conversationId } = req.body;

      if (!modelId || !prompt) {
        return res.status(400).json({ message: "modelId and prompt are required" });
      }

      const mediaModel = MEDIA_MODELS.image.find((m) => m.id === modelId);
      if (!mediaModel) {
        return res.status(400).json({ message: `Image model "${modelId}" not found` });
      }

      const userCredits = await getUserCredits(userId);
      const access = await getUserAccessState(userId, userCredits);
      if (access.status !== "unrestricted") {
        return res.status(402).json(buildWalletTopUpError("media", access, userCredits));
      }
      if (access.status === "unrestricted" && userCredits <= 0) {
        return res.status(402).json({ message: "Insufficient credits.", credits: userCredits });
      }

      let result: { images: { url: string; b64Data?: string }[]; modelId: string; estimatedCost: number };

      if (mediaModel.provider === "grok") {
        result = await generateGrokImage({ modelId, prompt, aspectRatio, resolution: imageSize });
      } else if (mediaModel.provider === "openai") {
        result = await generateOpenAIImage({ modelId, prompt, aspectRatio, imageSize });
      } else {
        result = await generateImage({ modelId, prompt, aspectRatio, imageSize });
      }

      // Override provider's hardcoded cost with models.json pricing
      const pricing = mediaModel.pricing;
      if (pricing) {
        if (pricing.perImage) {
          result.estimatedCost = pricing.perImage;
        } else if (pricing.outputPerMegapixel || pricing.inputPerMegapixel) {
          const sizeMultipliers: Record<string, number> = { "1K": 1, "2K": 4, "4K": 16 };
          const megapixels = (sizeMultipliers[imageSize || "1K"] || 1);
          const outCost = (pricing.outputPerMegapixel || 0) * megapixels;
          const inCost = (pricing.inputPerMegapixel || 0) * megapixels;
          result.estimatedCost = outCost + inCost;
        } else if (pricing.inputPerMillion && pricing.outputPerMillion) {
          const usage = (result as any).usage;
          const inputTokens = usage?.input_tokens || usage?.prompt_tokens || 800;
          const outputTokens = usage?.output_tokens || usage?.completion_tokens || 4000;
          result.estimatedCost = (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;
        }
      }

      if (conversationId) {
        try {
          const conv = await storage.getConversation(Number(conversationId));
          if (conv && conv.userId === userId) {
            await storage.addMessage({
              conversationId: Number(conversationId),
              role: "user",
              content: prompt,
              modelName: null,
              metadata: { mode: "media", mediaType: "image", modelId },
            });
            await storage.addMessage({
              conversationId: Number(conversationId),
              role: "assistant",
              content: `Generated image using ${mediaModel.displayName}`,
              modelName: mediaModel.displayName,
              metadata: {
                mode: "media",
                mediaType: "image",
                modelId,
                status: "completed",
                prompt,
                aspectRatio,
                imageSize,
                images: result.images,
                provider: mediaModel.provider,
                iconUrl: mediaModel.iconUrl,
              },
            });
          }
        } catch (dbErr) {
          console.error("Failed to save media messages to conversation:", dbErr);
        }
      }

      if (access.status === "unrestricted" && result.estimatedCost > 0) {
        const deductResult = await deductCredits(userId, result.estimatedCost, `Image: ${mediaModel.displayName}`, {
          modelId,
          mediaType: "image",
          cost: result.estimatedCost,
        });
        return res.json({ ...result, newBalance: deductResult.newBalance });
      }

      res.json(result);
    } catch (error) {
      console.error("Image generation error:", error);
      res.status(500).json({ message: `Image generation failed: ${(error as Error).message}` });
    }
  });


  app.post("/api/tools/model-compare/stream", async (req, res) => {
    try {
      const { prompt, modelId, mode, opponentResponse, opponentModelId } = req.body;
      if (!prompt || !modelId || typeof prompt !== "string" || typeof modelId !== "string") {
        return res.status(400).json({ message: "Invalid request. 'prompt' and 'modelId' are required." });
      }
      const selectedModel = getRegistryModel(modelId);
      if (!selectedModel || selectedModel.provider !== "groq") {
        return res.status(400).json({ message: "Selected model is not available in server/models.json" });
      }

      let systemPrompt = "You are helping users compare model outputs side-by-side. Answer clearly with concise structure, and focus on correctness over verbosity.";
      let finalPrompt = prompt;

      if (mode === "debate" && opponentResponse) {
          systemPrompt = "You are in a rigorous AI debate. You must argue the opposing perspective. Be completely unbiased regarding your own baseline inclinations. Your goal is to critically analyze your opponent's perspective, highlight potential flaws or alternative angles logically, and present a compelling counter-viewpoint. It is crucial that you differentiate your stance from the first model.";
          finalPrompt = `Original prompt topic:\n${prompt}\n\n[Opponent Model (${opponentModelId})'s Perspective]:\n${opponentResponse}\n\nPlease critically analyze their response and intelligently argue an opposing perspective. Note: The first model has completed their response, so you are aware of their full argument.`;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });

      await callGroqStream(
        selectedModel.id,
        [{ role: "user", content: finalPrompt }],
        (chunk) => {
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        },
        { systemPrompt, maxTokens: 1500, temperature: 0.4 }
      );

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      console.error(`Streaming error for model ${req.body?.modelId}:`, error);
      res.write(`data: ${JSON.stringify({ error: error.message || "Unknown error" })}\n\n`);
      res.end();
    }
  });

  app.post("/api/tools/model-compare", async (req, res) => {
    try {
      const parsed = compareModelsRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }

      const { prompt } = parsed.data;
      const defaultGroqModels = [
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-120b",
        "qwen/qwen3-32b",
      ];
      const allowedGroqModels = new Set(
        DEFAULT_MODELS.filter((model) => model.provider === "groq").map((model) => model.id),
      );
      const requestedModels = (parsed.data.models ?? defaultGroqModels).filter((id) => allowedGroqModels.has(id));
      const uniqueModels = Array.from(new Set(requestedModels)).slice(0, 4);

      if (uniqueModels.length < 2) {
        return res.status(400).json({ message: "At least two valid Groq models are required" });
      }

      const systemPrompt =
        "You are helping users compare model outputs side-by-side. Answer clearly with concise structure, and focus on correctness over verbosity.";

      const comparisons = await Promise.all(
        uniqueModels.map(async (modelId) => {
          const startedAt = Date.now();
          try {
            const response = await callGroq(
              modelId,
              [{ role: "user", content: prompt }],
              { maxTokens: 600, temperature: 0.4, systemPrompt },
            );
            return {
              modelId,
              status: "success" as const,
              response: response?.trim() || "(No response content)",
              latencyMs: Date.now() - startedAt,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown model error";
            return {
              modelId,
              status: "error" as const,
              response: "",
              error: message,
              latencyMs: Date.now() - startedAt,
            };
          }
        }),
      );

      return res.json({
        prompt,
        comparedAt: new Date().toISOString(),
        results: comparisons,
      });
    } catch (error) {
      return res.status(500).json({ message: "Failed to compare model responses" });
    }
  });

  // Update model roles/configs
  app.put("/api/models", isAuthenticated, async (req, res) => {
    try {
      const ctx = await getUserModelContext(req as any);
      const { models, mainModelId } = req.body ?? {};

      // Reset to defaults for this user if body is empty / missing both fields.
      const isReset = !models && !mainModelId;
      if (isReset) {
        await storage.clearUserModelSettings(ctx.userId);
        const normalized = normalizeUserModelSettings(
          { models: [...DEFAULT_MODELS], mainModelId: DEFAULT_MAIN_MODEL_ID },
          undefined
        );
        return res.json({ models: normalized.models, mainModelId: normalized.mainModelId });
      }

      const nextModels: ModelConfig[] =
        Array.isArray(models) && models.length > 0
          ? getRegistryModelsByIds(
              (models as Array<ModelConfig | string>)
                .map((model) => typeof model === "string" ? model : model?.id || "")
            )
          : ctx.models;
      const nextMain: string =
        typeof mainModelId === "string" && mainModelId.trim().length > 0 ? mainModelId.trim() : ctx.mainModelId;

      const normalized = normalizeUserModelSettings(
        { models: [...DEFAULT_MODELS], mainModelId: DEFAULT_MAIN_MODEL_ID },
        { models: nextModels, mainModelId: nextMain }
      );

      await storage.upsertUserModelSettings(ctx.userId, normalized.models, normalized.mainModelId);
      res.json({ models: normalized.models, mainModelId: normalized.mainModelId });
    } catch (err) {
      res.status(400).json({ message: "Invalid model configuration" });
    }
  });

  // =============================================
  // === Chat Conversations API ===
  // =============================================

  // List conversations
  app.get("/api/chat/conversations", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const conversations = await storage.getConversations(userId, limit, offset);
      res.json(conversations);
    } catch (err) {
      console.error("Error fetching conversations:", err);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Create new conversation
  app.post("/api/chat/conversations", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const { title } = req.body;
      const conversation = await storage.createConversation({ userId, title: title || "New Chat" });
      res.status(201).json(conversation);
    } catch (err) {
      console.error("Error creating conversation:", err);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // Rename conversation
  app.put("/api/chat/conversations/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      const updatedConversation = await storage.updateConversationTitle(conversationId, title.slice(0, 120));
      res.json(updatedConversation);
    } catch (err) {
      console.error("Error renaming conversation:", err);
      res.status(500).json({ message: "Failed to rename conversation" });
    }
  });

  app.post("/api/chat/conversations/:id/rename", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";

      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      const updatedConversation = await storage.updateConversationTitle(conversationId, title.slice(0, 120));
      res.json(updatedConversation);
    } catch (err) {
      console.error("Error renaming conversation:", err);
      res.status(500).json({ message: "Failed to rename conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/chat/conversations/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      await storage.deleteConversation(conversationId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting conversation:", err);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  // Get conversation with messages
  app.get("/api/chat/conversations/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);

      const conversation = await storage.getConversationWithMessages(
        conversationId,
        Math.min(Number(req.query.messageLimit) || 100, 500),
        req.query.beforeId ? Number(req.query.beforeId) : undefined
      );
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      res.json(conversation);
    } catch (err) {
      console.error("Error fetching conversation:", err);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // Delete messages after a specific message (edit functionality)
  app.delete("/api/chat/conversations/:id/messages/:messageId/after", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);
      const messageId = Number(req.params.messageId);

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      await storage.deleteMessagesAfter(conversationId, messageId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting messages:", err);
      res.status(500).json({ message: "Failed to delete messages" });
    }
  });

  // =============================================
  // === ROUTING ENDPOINT (Step 1: Analyze + Enhanced Prompt) ===
  // =============================================
  app.post("/api/chat/conversations/:id/route", isAuthenticated, isVerifiedUser, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      const { content, mode, selectedModelIds, debateConfig } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Content is required" });
      }

      if (mode === "single") {
        const ctx = await getUserModelContext(req as any);
        const currentCredits = await getUserCredits(userId);
        const access = await getUserAccessState(userId, currentCredits);
        if (access.status !== "unrestricted" && access.remainingByMode.single <= 0) {
          return res.status(402).json(buildWalletTopUpError("single", access, currentCredits));
        }
        if (access.status === "wallet_required") {
          return res.status(402).json(buildWalletTopUpError("single", access, currentCredits));
        }

        const routableModels = getSelectableModelsForAccess(ctx.models, access);
        const routingMainModel = getPreferredAccessibleMainModel(ctx.models, ctx.mainModelId, access);
        // Analyze and route using main model
        const routing = await analyzeAndRoute(content, routableModels, routingMainModel);

        res.json({
          routingType: routing.type,
          targetModel: routing.targetModel ? {
            id: routing.targetModel.id,
            displayName: routing.targetModel.displayName,
            role: routing.targetModel.role,
            provider: routing.targetModel.provider,
          } : null,
          reason: routing.reason,
          enhancedPrompt: routing.enhancedPrompt,
          originalPrompt: content,
        });
      } else if (mode === "multi") {
        const ctx = await getUserModelContext(req as any);
        const currentCredits = await getUserCredits(userId);
        const access = await getUserAccessState(userId, currentCredits);
        if (access.status !== "unrestricted" && access.remainingByMode.multi <= 0) {
          return res.status(402).json(buildWalletTopUpError("multi", access, currentCredits));
        }
        if (access.status === "wallet_required") {
          return res.status(402).json(buildWalletTopUpError("multi", access, currentCredits));
        }
        const eligibleModels = getSelectableModelsForAccess(ctx.models, access);
        const routingMainModel = getPreferredAccessibleMainModel(ctx.models, ctx.mainModelId, access);
        // Filter to only selected models
        let selectedModels = eligibleModels;
        if (Array.isArray(selectedModelIds) && selectedModelIds.length > 0) {
          const requestedIds = (selectedModelIds as string[]).map((id) => id.trim()).filter(Boolean);
          const registrySelectedModels = getRegistryModelsByIds(requestedIds);
          if (registrySelectedModels.length !== requestedIds.length) {
            return res.status(400).json({ message: "One or more selected models are not available in server/models.json" });
          }

          selectedModels = eligibleModels.filter((m) => requestedIds.includes(m.id));
          if (selectedModels.length !== requestedIds.length) {
            return res.status(400).json({ message: "One or more selected models are not available for this account" });
          }
        }

        // Generate a tailored prompt for each model based on its role/specialty
        const perModelPromptReq = `You are an expert prompt engineer. A user has submitted a request that will be answered by multiple AI models simultaneously, each with a unique specialty. Your job is to write a focused version of the user's prompt for EACH model — adjusting only the APPROACH and FRAMING to match that model's specialty role.

User request: "${content}"

Models to tailor for:
${selectedModels.map((m, i) => `${i + 1}. id="${m.id}" name="${m.displayName}" specialty="${m.role}"`).join("\n")}

STRICT RULES — follow exactly:
1. NEVER change the language — always write the prompt in the SAME language as the user's original request
2. NEVER change the topic — the underlying question must remain identical to what the user asked
3. ONLY adjust the angle, depth, and framing to suit the model's specialty (e.g. ask a reasoning model to reason step-by-step, ask a coding model to focus on implementation)
4. Keep prompts concise — do NOT pad, embellish, or add unrelated content
5. Return ONLY a valid JSON array — no markdown fences, no preamble, no explanation

Format: [{"modelId":"<exact id>","prompt":"<tailored prompt>"}]`;

        let perModelPrompts: { modelId: string; displayName: string; prompt: string }[] =
          selectedModels.map((m) => ({ modelId: m.id, displayName: m.displayName, prompt: content }));

        try {
          const raw = await callModel(routingMainModel, [{ role: "user", content: perModelPromptReq }], {
            maxTokens: 2500,
            temperature: 0.3,
          });

          // Robustly extract JSON array — handles preamble text, markdown fences, etc.
          let parsed: any[] | null = null;

          // Attempt 1: JSON array inside markdown fences
          const fenceMatch = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
          if (fenceMatch) {
            try { parsed = JSON.parse(fenceMatch[1]); } catch { /* continue */ }
          }

          // Attempt 2: First [...] block in the response
          if (!parsed) {
            const bracketMatch = raw.match(/(\[[\s\S]*\])/);
            if (bracketMatch) {
              try { parsed = JSON.parse(bracketMatch[1]); } catch { /* continue */ }
            }
          }

          // Attempt 3: Strip fences and try the whole thing
          if (!parsed) {
            const jsonStr = raw.replace(/```json|```/g, "").trim();
            try { parsed = JSON.parse(jsonStr); } catch { /* continue */ }
          }

          if (Array.isArray(parsed)) {
            perModelPrompts = parsed.map((p: any) => {
              const m = selectedModels.find((m) => m.id === p.modelId);
              return { modelId: p.modelId, displayName: m?.displayName ?? p.modelId, prompt: String(p.prompt || content) };
            });
          }
        } catch (e) {
          console.error("Per-model prompt generation failed, using raw content:", e);
        }

        res.json({
          routingType: "multi",
          models: selectedModels.map((m) => ({
            id: m.id,
            displayName: m.displayName,
            role: m.role,
            provider: m.provider,
          })),
          enhancedPrompt: perModelPrompts[0]?.prompt ?? content,
          perModelPrompts,
          originalPrompt: content,
        });
      } else {
        const ctx = await getUserModelContext(req as any);
        const currentCredits = await getUserCredits(userId);
        const access = await getUserAccessState(userId, currentCredits);
        if (access.status !== "unrestricted" && access.remainingByMode.debate <= 0) {
          return res.status(402).json(buildWalletTopUpError("debate", access, currentCredits));
        }
        if (access.status === "wallet_required") {
          return res.status(402).json(buildWalletTopUpError("debate", access, currentCredits));
        }
        const eligibleModels = getSelectableModelsForAccess(ctx.models, access);
        // Debate mode — NO prompt enhancement, NO per-model tailoring.
        // Send the EXACT same user prompt to both debaters.
        // Custom roles from debateConfig completely override default model roles.

        // 1. Build the debater list — debateConfig (with custom role) wins.
        type DebaterEntry = ModelConfig & { customSystemPrompt?: string };
        let debateModels: DebaterEntry[];
        if (Array.isArray(debateConfig) && debateConfig.length >= 2) {
          const requestedIds = debateConfig
            .map((p: { modelId: string }) => typeof p?.modelId === "string" ? p.modelId.trim() : "")
            .filter(Boolean);
          const registryDebateModels = getRegistryModelsByIds(requestedIds);
          if (registryDebateModels.length !== requestedIds.length) {
            return res.status(400).json({ message: "One or more debate models are not available in server/models.json" });
          }

          debateModels = debateConfig.map((p: { modelId: string; customRole?: string; customSystemPrompt?: string }) => {
            const base = eligibleModels.find((m) => m.id === p.modelId);
            if (!base) {
              throw new Error(`Debate model "${p.modelId}" is not available for this account`);
            }
            return {
              ...base,
              // COMPLETELY replace default role with custom role if provided
              role: p.customRole && p.customRole.trim() ? p.customRole.trim() : base.role,
              systemPrompt: p.customSystemPrompt || "",
              customSystemPrompt: p.customSystemPrompt,
            };
          });
        } else if (Array.isArray(selectedModelIds) && selectedModelIds.length >= 2) {
          const requestedIds = (selectedModelIds as string[]).map((id) => id.trim()).filter(Boolean);
          const registryDebateModels = getRegistryModelsByIds(requestedIds);
          if (registryDebateModels.length !== requestedIds.length) {
            return res.status(400).json({ message: "One or more debate models are not available in server/models.json" });
          }

          debateModels = eligibleModels.filter((m) => requestedIds.includes(m.id));
          if (debateModels.length < 2) {
            return res.status(400).json({ message: "At least two selected debate models must be available for this account" });
          }
        } else {
          debateModels = eligibleModels.slice(0, 3) as any;
        }

        // 2. NO enhancement — use exact user prompt as-is
        const enhancedPrompt = content;

        // 3. Same prompt for all debaters — no tailoring, no stance generation
        const perModelPrompts: { modelId: string; displayName: string; prompt: string; stance: string }[] =
          debateModels.map((m) => ({
            modelId: m.id,
            displayName: m.displayName,
            prompt: content,  // exact same user prompt
            stance: m.role,   // their assigned role IS their stance
          }));

        res.json({
          routingType: "debate",
          enhancedPrompt,
          originalPrompt: content,
          models: debateModels.map((m) => ({ id: m.id, displayName: m.displayName, role: m.role, provider: m.provider })),
          perModelPrompts,
        });
      }
    } catch (err) {
      console.error("Routing error:", err);
      const message = err instanceof Error ? err.message : "Routing analysis failed";
      const status = typeof message === "string" && message.includes("not available") ? 400 : 500;
      res.status(status).json({ message: `Routing analysis failed: ${message}` });
    }
  });

  // =============================================
  // === SEND MESSAGE (Step 2: With approved prompt) ===
  // =============================================
  app.post("/api/chat/conversations/:id/messages", isAuthenticated, isVerifiedUser, async (req, res) => {
    try {
      let requestAborted = false;
      const requestAbortController = new AbortController();
      req.on("close", () => {
        requestAborted = true;
        requestAbortController.abort();
      });
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const conversationId = Number(req.params.id);

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });
      if (conversation.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      const {
        content,
        mode,
        enhancedPrompt,
        targetModelId,
        webSearch,
        selectedModelIds,
        debateConfig,
        perModelPrompts,
        attachments,
        skipUserMessage,
        personalization,
      } = req.body;
      const ctx = await getUserModelContext(req as any);
      if (!content) return res.status(400).json({ message: "Content is required" });
      const userCredits = await getUserCredits(userId);
      const access = await getUserAccessState(userId, userCredits);
      const requestedMode = resolveRuntimeMode(mode, targetModelId);
      const accessMode: AccessControlledMode = requestedMode;
      const isFirstPromptAfterSignup = !skipUserMessage && getTotalModeUsageCount(access.modeUsage) === 0;
      const firstTurnOnboarding = isFirstPromptAfterSignup ? buildFirstTurnOnboardingInstruction() : "";
      if (access.status === "wallet_required") {
        return res.status(402).json(buildWalletTopUpError(accessMode, access, userCredits));
      }
      if (access.status === "free_trial" && access.remainingByMode[accessMode] <= 0) {
        return res.status(402).json(buildWalletTopUpError(accessMode, access, userCredits));
      }
      const userPersonalization = normalizeUserPersonalization(personalization);
      const [userMemoryPreferences, storedUserMemories] = await Promise.all([
        storage.getUserMemoryPreferences(userId),
        storage.getUserMemories(userId),
      ]);
      const activeSingleModel =
        requestedMode === "single" || requestedMode === "direct"
          ? (targetModelId
              ? (() => {
                  const requestedModel = getRegistryModel(targetModelId);
                  if (!requestedModel) {
                    throw new Error(`Selected model "${targetModelId}" is not available in server/models.json`);
                  }
                  const accessibleModel = ctx.models.find((model) => model.id === requestedModel.id);
                  if (!accessibleModel) {
                    throw new Error(`Selected model "${targetModelId}" is not available for this account`);
                  }
                  return accessibleModel;
                })()
              : getPreferredAccessibleMainModel(ctx.models, ctx.mainModelId, access))
          : null;
      const memoryEnabledForThisTurn = !!activeSingleModel && userMemoryPreferences.enabled;
      let userMemoriesForPrompt = storedUserMemories;

      // Check credit balance before processing when free trial rules don't apply
      if (access.status === "unrestricted" && userCredits <= 0) {
        return res.status(402).json({ message: "Insufficient credits. Please purchase credits to continue.", credits: userCredits });
      }

      const cleanAttachments = sanitizeAttachments(attachments);
      const approvedUserContent =
        mode === "single" && typeof enhancedPrompt === "string" && enhancedPrompt.trim().length > 0
          ? enhancedPrompt.trim()
          : content;
      const memoryUserInput = buildProviderUserContent(approvedUserContent, cleanAttachments);
      // The prompt to actually send to the model (user-approved enhanced prompt)
      const promptBase = enhancedPrompt || content;
      const promptToSend = shouldForceMetallmFocus(approvedUserContent)
        ? `[IMPORTANT: The user is asking about the Metallm platform in this chat. Use the provided runtime/platform context. Do not answer about external "MetaLLM" projects unless explicitly requested.]\n\n${promptBase}`
        : promptBase;

      // Setup SSE first (needed regardless of skipUserMessage)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      req.socket.setNoDelay(true);
      res.flushHeaders();

      // On retry (skipUserMessage=true) the user message already exists in DB — skip creating it
      let userMessage: Awaited<ReturnType<typeof storage.addMessage>> | null = null;
      let isFirstMessage = false;
      if (!skipUserMessage) {
        // Check message count BEFORE saving the user message (so 0 = first ever message)
        const messageCount = await storage.getMessageCount(conversationId);
        isFirstMessage = messageCount === 0;

        // Save the clean user-visible message and attachment metadata.
        userMessage = await storage.addMessage({
          conversationId,
          role: "user",
          content: approvedUserContent,
          modelName: null,
          metadata: {
            attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
            mode: requestedMode,
            retryRequest: {
              mode: requestedMode === "direct" ? "direct" : requestedMode === "single" ? "smart" : requestedMode,
              directModelId:
                requestedMode === "direct" && typeof targetModelId === "string" && targetModelId.trim()
                  ? targetModelId
                  : undefined,
              selectedMultiModelIds:
                requestedMode === "multi" && Array.isArray(selectedModelIds)
                  ? selectedModelIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                  : undefined,
              debateParticipants:
                requestedMode === "debate" && Array.isArray(debateConfig)
                  ? debateConfig
                      .map((participant) => {
                        if (!participant || typeof participant !== "object") return null;
                        return {
                          modelId:
                            typeof participant.modelId === "string" && participant.modelId.trim()
                              ? participant.modelId
                              : "",
                          customRole: typeof participant.customRole === "string" ? participant.customRole : "",
                          customSystemPrompt:
                            typeof participant.customSystemPrompt === "string" ? participant.customSystemPrompt : "",
                        };
                      })
                      .filter((participant) => participant && participant.modelId)
                  : undefined,
              debateRounds:
                requestedMode === "debate" && typeof req.body.totalRounds === "number"
                  ? Math.max(1, Math.round(req.body.totalRounds))
                  : undefined,
              webSearchEnabled: webSearch === true,
            },
          },
        });
        sendSSE(res, "user_message", userMessage);
      }

      // Get conversation history for context
      const history = await storage.getMessages(conversationId, 12);
      let historyForContext: HistoryMessage[];
      if (skipUserMessage) {
        // Retry: the user message is already in DB. Exclude it from context
        // since it will be appended as the final `promptToSend` to the model.
        const lastUserInHistory = [...history].reverse().find((m) => m.role === "user");
        historyForContext = (lastUserInHistory
          ? history.filter((m) => m.id !== lastUserInHistory.id)
          : history) as HistoryMessage[];
      } else {
        historyForContext = history.filter((m) => m.id !== userMessage!.id) as HistoryMessage[];
      }

      // =============================================
      // === TITLE: instant — first 3-4 words of user message ===
      // =============================================
      let titlePromise: Promise<void> = Promise.resolve();
      if (isFirstMessage) {
        titlePromise = (async () => {
          try {
            const words = approvedUserContent.trim().split(/\s+/).slice(0, 4);
            const title = words.join(" ").replace(/[^\w\s'\-]/g, "").trim().slice(0, 60);
            if (title) {
              await storage.updateConversationTitle(conversationId, title);
              sendSSE(res, "title_update", { title });
            }
          } catch (e) {
            console.error("Title update error:", e);
          }
        })();
      }

      const runtimeMode = requestedMode;

      // ===========================================
      // === SINGLE MODE ===
      // ============================================
      if (mode === "single") {
        // Find target model
        const targetModel: ModelConfig = activeSingleModel || ctx.mainModel;
        if (access.status === "free_trial" && !isModelFreeEligible(targetModel)) {
          return res.status(402).json(buildWalletTopUpError("direct", access, userCredits));
        }

        const modelName = targetModel.displayName;
        if (memoryEnabledForThisTurn && !skipUserMessage) {
          try {
            // For rate-limited/expensive providers (bedrock, openai, anthropic, grok),
            // use the cheapest available Groq model for memory analysis to avoid
            // burning limited tokens on a background task.
            const MEMORY_PREFERRED_PROVIDERS = new Set(["groq", "openrouter"]);
            const memoryModel: ModelConfig = MEMORY_PREFERRED_PROVIDERS.has(targetModel.provider)
              ? targetModel
              : (ctx.models.find((m) => m.provider === "groq" && m.tier === 3) ??
                 ctx.models.find((m) => m.provider === "groq") ??
                 targetModel);
            const pendingUserMemoryChangeSet = await deriveUserMemoryChangeSet({
              model: memoryModel,
              userInput: memoryUserInput,
              existingMemories: storedUserMemories,
            });

            if (pendingUserMemoryChangeSet.operations.length > 0) {
              sendSSE(res, "memory_status", { modelName, phase: "updating" });
              userMemoriesForPrompt = previewUserMemoryChanges(storedUserMemories, pendingUserMemoryChangeSet);
              await applyUserMemoryChangeSet({
                userId,
                conversationId,
                sourceMessageId: userMessage?.id ?? null,
                existingMemories: storedUserMemories,
                changeSet: pendingUserMemoryChangeSet,
              });
            }
          } catch (error) {
            console.error("Memory pre-update error:", error);
          }
        }
        const userMemoryPromptContext = memoryEnabledForThisTurn
          ? buildUserMemoryPromptContext(userMemoryPreferences, userMemoriesForPrompt)
          : "";
        sendSSE(res, "model_start", {
          modelName,
          modelId: targetModel.id,
          role: targetModel.role,
          provider: targetModel.provider,
          iconUrl: targetModel.iconUrl,
        });

        // directMode = user explicitly picked a model; skip grounding/thinking formatting
        const isDirectMode = !!targetModelId;
        const runtimeMode: RuntimeMode = isDirectMode ? "direct" : "single";
        const contextMessages = buildContextMessagesForModel(historyForContext, modelName);
        const systemPrompt = buildMetallmSystemPrompt(
          targetModel.systemPrompt,
          targetModel,
          runtimeMode,
          historyForContext,
          userPersonalization,
          userMemoryPromptContext,
          firstTurnOnboarding,
        );

        let fullContent = "";
        let streamedContent = "";
        let modelSources: WebSource[] = [];
        let tokenUsage: TokenUsage | undefined;
        const wordStreamState = createWordStreamState();
        try {
          const currentUserContent = buildProviderUserContent(promptToSend, cleanAttachments);
          const result = await callModelStream(
            targetModel,
            [...contextMessages, { role: "user", content: currentUserContent }],
            (chunk) => {
              streamedContent += chunk;
              streamChunkAsWords(res, modelName, chunk, wordStreamState);
            },
            {
              systemPrompt,
              maxTokens: (targetModel as any).maxOutputTokens ?? 16384,
              webSearch: !!webSearch,
              directMode: isDirectMode,
              abortSignal: requestAbortController.signal,
              onStatus: (event, data) => {
                sendSSE(res, "web_search_status", { modelName, phase: event, ...data });
              },
            }
          );
          flushWordStream(res, modelName, wordStreamState);
          fullContent = requestAborted ? `${streamedContent}${wordStreamState.carry}`.trimEnd() : result.content;
          modelSources = requestAborted ? [] : result.sources;
          tokenUsage = requestAborted ? undefined : result.tokenUsage;
          // Stream any sources to client immediately so UI can show them
          if (!requestAborted && modelSources.length > 0) {
            sendSSE(res, "web_sources", { modelName, sources: modelSources });
          }
        } catch (e) {
          flushWordStream(res, modelName, wordStreamState);
          console.error(`${modelName} error:`, e);
          if (requestAborted) {
            fullContent = `${streamedContent}${wordStreamState.carry}`.trimEnd();
          } else {
            fullContent = `Sorry, I encountered an error processing your request. Error: ${(e as Error).message}`;
            sendSSE(res, "chunk", { modelName, content: fullContent });
          }
        }

        if (!fullContent.trim()) {
          if (!requestAborted) {
            sendSSE(res, "done", {});
            res.end();
          }
          return;
        }

        const assistantMessage = await storage.addMessage({
          conversationId,
          role: "assistant",
          content: fullContent,
          modelName,
          metadata: {
            modelId: targetModel.id,
            role: targetModel.role,
            provider: targetModel.provider,
            iconUrl: targetModel.iconUrl,
            billingMode: access.status === "unrestricted" ? "paid" : "free_trial",
            enhancedPrompt: enhancedPrompt && enhancedPrompt !== content ? enhancedPrompt : undefined,
            hasAttachments: cleanAttachments.length > 0,
            webSearch: modelSources.length > 0,
            sources: modelSources.length > 0 ? modelSources : undefined,
            tokenUsage: tokenUsage ?? undefined,
          },
        });
        if (tokenUsage) {
          broadcastToUser(userId, "token_update", {
            modelName,
            conversationId,
            messageId: assistantMessage.id,
            billable: access.status === "unrestricted",
            tokenUsage,
          });
        }
        // Deduct credits based on token usage
        if (tokenUsage && access.status === "unrestricted") {
          const tokenCost = calculateTokenCost(
            targetModel.id,
            tokenUsage.promptTokens,
            tokenUsage.completionTokens,
            tokenUsage.cachedPromptTokens ?? 0
          );
          const webSearchCost = calculateWebSearchCost(targetModel.id, {
            webSearchRequested: !!webSearch,
            webSourcesCount: modelSources.length,
          });
          const cost = tokenCost + webSearchCost;
          if (cost > 0) {
            const deductResult = await deductCredits(userId, cost, `Chat: ${targetModel.displayName}`, {
              modelId: targetModel.id,
              promptTokens: tokenUsage.promptTokens,
              completionTokens: tokenUsage.completionTokens,
              tokenCost,
              webSearchCost,
              cost,
            });
            sendSSE(res, "credit_update", { cost, tokenCost, webSearchCost, newBalance: deductResult.newBalance });
            broadcastToUser(userId, "credit_update", { cost, tokenCost, webSearchCost, newBalance: deductResult.newBalance });
          }
        }
        sendSSE(res, "model_complete", { modelName, message: assistantMessage, tokenUsage });
        if (requestAborted) return;

        // ===========================================
        // === MULTI MODE ===
        // ===========================================
        // ===========================================
        // === MULTI MODE ===
        // ===========================================
      } else if (mode === "multi") {
        const modelResponses: { modelName: string; content: string; role: string }[] = [];
        let modelsToRun = ctx.models;
        if (Array.isArray(selectedModelIds) && selectedModelIds.length > 0) {
          const requestedIds = selectedModelIds
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
            .map((id) => id.trim());
          const registrySelectedModels = getRegistryModelsByIds(requestedIds);
          if (registrySelectedModels.length !== requestedIds.length) {
            return res.status(400).json({ message: "One or more selected models are not available in server/models.json" });
          }

          modelsToRun = ctx.models.filter((m) => requestedIds.includes(m.id));
          if (modelsToRun.length !== requestedIds.length) {
            return res.status(400).json({ message: "One or more selected models are not available for this account" });
          }
        }
        const accessibleModelsToRun = access.status === "free_trial"
          ? modelsToRun.filter(isModelFreeEligible)
          : modelsToRun;
        const finalModelsToRun = accessibleModelsToRun.length > 0
          ? accessibleModelsToRun
          : getSelectableModelsForAccess(ctx.models, access);
        const promises = finalModelsToRun.map(async (model) => {
          sendSSE(res, "model_start", {
            modelName: model.displayName,
            modelId: model.id,
            role: model.role,
            provider: model.provider,
            iconUrl: model.iconUrl,
          });
          const contextMessages = buildContextMessagesForModel(historyForContext, model.displayName);
          const systemPrompt = buildMetallmSystemPrompt(
            model.systemPrompt,
            model,
            "multi",
            historyForContext,
            userPersonalization,
            undefined,
            "",
          );

          // Use per-model tailored prompt if provided, else fall back to the general enhanced prompt
          const modelPrompt = Array.isArray(perModelPrompts)
            ? (perModelPrompts.find((p: any) => p.modelId === model.id)?.prompt ?? promptToSend)
            : promptToSend;

          let fullContent = "";
          let streamedContent = "";
          let multiSources: WebSource[] = [];
          let multiTokenUsage: TokenUsage | undefined;
          const wordStreamState = createWordStreamState();
          try {
            const modelUserContent = buildProviderUserContent(modelPrompt, cleanAttachments);
            const result = await callModelStream(
              model,
              [...contextMessages, { role: "user", content: modelUserContent }],
              (chunk) => {
                streamedContent += chunk;
                streamChunkAsWords(res, model.displayName, chunk, wordStreamState);
              },
              {
                systemPrompt,
                maxTokens: (model as any).maxOutputTokens ?? 16384,
                webSearch: !!webSearch,
                abortSignal: requestAbortController.signal,
                onStatus: (event, data) => {
                  sendSSE(res, "web_search_status", { modelName: model.displayName, phase: event, ...data });
                },
              }
            );
            flushWordStream(res, model.displayName, wordStreamState);
            fullContent = requestAborted ? `${streamedContent}${wordStreamState.carry}`.trimEnd() : result.content;
            multiSources = requestAborted ? [] : result.sources;
            multiTokenUsage = requestAborted ? undefined : result.tokenUsage;
            if (!requestAborted && multiSources.length > 0) {
              sendSSE(res, "web_sources", { modelName: model.displayName, sources: multiSources });
            }
          } catch (e) {
            flushWordStream(res, model.displayName, wordStreamState);
            console.error(`${model.displayName} error:`, e);
            if (requestAborted) {
              fullContent = `${streamedContent}${wordStreamState.carry}`.trimEnd();
            } else {
              fullContent = `[${model.displayName}] Error: ${(e as Error).message}`;
              sendSSE(res, "chunk", { modelName: model.displayName, content: fullContent });
            }
          }

          if (!fullContent.trim()) return;

          modelResponses.push({
            modelName: model.displayName,
            content: fullContent,
            role: model.role,
          });
          const assistantMessage = await storage.addMessage({
            conversationId,
            role: "assistant",
            content: fullContent,
            modelName: model.displayName,
            metadata: {
              modelId: model.id,
              role: model.role,
              provider: model.provider,
              iconUrl: model.iconUrl,
              isMultiModelResponse: true,
              billingMode: access.status === "unrestricted" ? "paid" : "free_trial",
              webSearch: multiSources.length > 0,
              sources: multiSources.length > 0 ? multiSources : undefined,
              tokenUsage: multiTokenUsage ?? undefined,
            },
          });
          if (multiTokenUsage) {
            broadcastToUser(userId, "token_update", {
              modelName: model.displayName,
              conversationId,
              messageId: assistantMessage.id,
              billable: access.status === "unrestricted",
              tokenUsage: multiTokenUsage,
            });
          }
          // Deduct credits based on token usage
          if (multiTokenUsage && access.status === "unrestricted") {
            const tokenCost = calculateTokenCost(
              model.id,
              multiTokenUsage.promptTokens,
              multiTokenUsage.completionTokens,
              multiTokenUsage.cachedPromptTokens ?? 0
            );
            const webSearchCost = calculateWebSearchCost(model.id, {
              webSearchRequested: !!webSearch,
              webSourcesCount: multiSources.length,
            });
            const cost = tokenCost + webSearchCost;
            if (cost > 0) {
              const deductResult = await deductCredits(userId, cost, `Multi: ${model.displayName}`, {
                modelId: model.id,
                promptTokens: multiTokenUsage.promptTokens,
                completionTokens: multiTokenUsage.completionTokens,
                tokenCost,
                webSearchCost,
                cost,
              });
              sendSSE(res, "credit_update", { cost, tokenCost, webSearchCost, newBalance: deductResult.newBalance });
              broadcastToUser(userId, "credit_update", { cost, tokenCost, webSearchCost, newBalance: deductResult.newBalance });
            }
          }
          sendSSE(res, "model_complete", { modelName: model.displayName, message: assistantMessage, tokenUsage: multiTokenUsage });
        });

        await Promise.all(promises);
        if (requestAborted) return res.end();

        // Main model (Gemini) summarizes all responses
        const summaryModelName = "✨ Summary";
        sendSSE(res, "model_start", { modelName: summaryModelName, isSummary: true });

        const summaryPrompt = `You are MetallmAI, an advanced AI orchestrator. Multiple AI models have analyzed the following user query. Review all their responses and provide:

1. **Unified Answer**: A comprehensive, synthesized answer combining the best insights
2. **Key Insights**: Highlight the most important points from each model
3. **Conclusion**: A final, actionable conclusion

User Query: "${content}"

Model Responses:
${modelResponses.map(r => `\n--- ${r.modelName} (${r.role}) ---\n${r.content.substring(0, 1500)}`).join("\n")}

Provide a well-structured summary. Do NOT just repeat - synthesize and add value.`;

        let summaryContent = "";
        let streamedSummaryContent = "";
        let summaryTokenUsage: TokenUsage | undefined;
        const summaryWordStreamState = createWordStreamState();
        try {
          const mainModel = access.status === "free_trial"
            ? getPreferredAccessibleMainModel(ctx.models, ctx.mainModelId, access)
            : ctx.mainModel;
          const summarySystemPrompt = buildMetallmSystemPrompt(
            mainModel.systemPrompt,
            mainModel,
            "multi",
            historyForContext,
            userPersonalization,
            undefined,
            firstTurnOnboarding,
          );
          const summaryResult = await callModelStream(
            mainModel,
            [{ role: "user", content: summaryPrompt }],
            (chunk) => {
              streamedSummaryContent += chunk;
              streamChunkAsWords(res, summaryModelName, chunk, summaryWordStreamState);
            },
            {
              maxTokens: (mainModel as any).maxOutputTokens ?? 16384,
              systemPrompt: summarySystemPrompt,
              abortSignal: requestAbortController.signal,
            }
          );
          flushWordStream(res, summaryModelName, summaryWordStreamState);
          summaryContent = requestAborted ? `${streamedSummaryContent}${summaryWordStreamState.carry}`.trimEnd() : summaryResult.content;
          summaryTokenUsage = requestAborted ? undefined : summaryResult.tokenUsage;
        } catch (e) {
          flushWordStream(res, summaryModelName, summaryWordStreamState);
          console.error("Summary error:", e);
          if (requestAborted) {
            summaryContent = `${streamedSummaryContent}${summaryWordStreamState.carry}`.trimEnd();
          } else {
            summaryContent = "Failed to generate summary. Please review individual model responses above.";
            sendSSE(res, "chunk", { modelName: summaryModelName, content: summaryContent });
          }
        }

        if (!summaryContent.trim()) return res.end();

        const summaryMessage = await storage.addMessage({
          conversationId,
          role: "assistant",
          content: summaryContent,
          modelName: summaryModelName,
          metadata: {
            isSummary: true,
            modelCount: modelResponses.length,
            billingMode: access.status === "unrestricted" ? "paid" : "free_trial",
            tokenUsage: summaryTokenUsage ?? undefined,
          },
        });
        if (summaryTokenUsage) {
          broadcastToUser(userId, "token_update", {
            modelName: summaryModelName,
            conversationId,
            messageId: summaryMessage.id,
            billable: access.status === "unrestricted",
            tokenUsage: summaryTokenUsage,
          });
        }

        // Deduct credits for summary generation
        if (summaryTokenUsage && access.status === "unrestricted") {
          const mainModel = ctx.mainModel;
          const summaryCost = calculateTokenCost(mainModel.id, summaryTokenUsage.promptTokens, summaryTokenUsage.completionTokens);
          if (summaryCost > 0) {
            const deductResult = await deductCredits(userId, summaryCost, "Multi summary", {
              modelId: mainModel.id, promptTokens: summaryTokenUsage.promptTokens, completionTokens: summaryTokenUsage.completionTokens, cost: summaryCost,
            });
            sendSSE(res, "credit_update", { cost: summaryCost, newBalance: deductResult.newBalance });
            broadcastToUser(userId, "credit_update", { cost: summaryCost, newBalance: deductResult.newBalance });
          }
        }

        sendSSE(res, "model_complete", { modelName: summaryModelName, message: summaryMessage, isSummary: true, tokenUsage: summaryTokenUsage });

        // ===========================================
        // === DEBATE MODE ===
        // ===========================================
      } else if (mode === "debate") {
        // Single round per server call — the client handles multi-round via betweenRoundState
        const serverRound = 1;

        // Build debaters with CUSTOM roles completely overriding defaults
        let debaters: (ModelConfig & { customRole?: string; customSystemPrompt?: string })[];
        const eligibleDebateModels = access.status === "free_trial"
          ? ctx.models.filter(isModelFreeEligible)
          : ctx.models;
        if (Array.isArray(debateConfig) && debateConfig.length >= 2) {
          const requestedIds = debateConfig
            .map((p: { modelId: string }) => typeof p?.modelId === "string" ? p.modelId.trim() : "")
            .filter(Boolean);
          const registryDebateModels = getRegistryModelsByIds(requestedIds);
          if (registryDebateModels.length !== requestedIds.length) {
            return res.status(400).json({ message: "One or more debate models are not available in server/models.json" });
          }

          debaters = debateConfig.map((p: { modelId: string; customRole?: string; customSystemPrompt?: string }) => {
            const base = eligibleDebateModels.find((m) => m.id === p.modelId);
            if (!base) {
              throw new Error(`Debate model "${p.modelId}" is not available for this account`);
            }
            return {
              ...base,
              // COMPLETELY replace model's default role with user's custom role
              role: p.customRole && p.customRole.trim() ? p.customRole.trim() : base.role,
              systemPrompt: "",  // ignore default system prompt — debate has its own
              customRole: p.customRole?.trim() || undefined,
              // Preserve custom system prompt from user's debate config
              customSystemPrompt: p.customSystemPrompt?.trim() || undefined,
            };
          });
        } else if (Array.isArray(perModelPrompts) && perModelPrompts.length >= 2) {
          const requestedIds = perModelPrompts
            .map((p: any) => typeof p?.modelId === "string" ? p.modelId.trim() : "")
            .filter(Boolean);
          const registryDebateModels = getRegistryModelsByIds(requestedIds);
          if (registryDebateModels.length !== requestedIds.length) {
            return res.status(400).json({ message: "One or more debate models are not available in server/models.json" });
          }

          debaters = perModelPrompts
            .map((p: any) => {
              const base = eligibleDebateModels.find((m) => m.id === p.modelId);
              if (!base) return null;
              return { ...base, role: p.stance || base.role };
            })
            .filter(Boolean) as typeof debaters;
          if (debaters.length < 2) debaters = eligibleDebateModels.slice(0, 3) as any;
        } else {
          debaters = eligibleDebateModels.slice(0, 3) as any;
        }

        // Determine round number from request body (client tracks this)
        const clientRoundNumber = typeof req.body.roundNumber === "number" ? req.body.roundNumber : 1;
        const totalRounds = typeof req.body.totalRounds === "number" ? req.body.totalRounds : 1;

        const controlPayload = parseDebateRoundControl(content);
        const historyUserMessages = history
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
          .filter((c) => !c.includes("[METALLM_DEBATE_ROUND_CONTROL]"));

        const debateTopic =
          (typeof controlPayload?.topic === "string" && controlPayload.topic.trim()) ||
          historyUserMessages[0] ||
          content;

        const globalRoundInstruction =
          typeof controlPayload?.globalInstruction === "string"
            ? controlPayload.globalInstruction.trim()
            : "";

        const targetedRoundInstructions = new Map<string, string>();
        const mentionToModelId = new Map<string, string>();
        for (const d of debaters) {
          mentionToModelId.set(toMentionHandle(d.displayName), d.id);
          mentionToModelId.set(toMentionHandle(d.role), d.id);
        }

        if (Array.isArray(controlPayload?.targetedInstructions)) {
          for (const item of controlPayload!.targetedInstructions!) {
            const modelIdFromPayload = typeof item?.modelId === "string" ? item.modelId : undefined;
            const mentionHandle = typeof item?.mention === "string" ? toMentionHandle(item.mention) : "";
            const resolvedId = modelIdFromPayload || mentionToModelId.get(mentionHandle);
            const instruction = typeof item?.instruction === "string" ? item.instruction.trim() : "";
            if (!resolvedId || !instruction) continue;
            const previous = targetedRoundInstructions.get(resolvedId);
            targetedRoundInstructions.set(resolvedId, previous ? `${previous}\n\n${instruction}` : instruction);
          }
        }
        const hasTargetedInstructions = targetedRoundInstructions.size > 0;

        // Determine debate phase from round number and total
        function getDebatePhase(round: number, total: number): "opening" | "rebuttal" | "closing" {
          if (total <= 1) return "opening";
          if (round === 1) return "opening";
          if (round === total) return "closing";
          return "rebuttal";
        }
        const debatePhase = getDebatePhase(clientRoundNumber, totalRounds);

        // Build the opponent info string for each debater
        function getOpponentInfo(currentDebater: typeof debaters[number], allDebaters: typeof debaters): string {
          return allDebaters
            .filter(d => d.id !== currentDebater.id)
            .map(d => `"${d.displayName}" arguing as "${d.role}"`)
            .join(", ");
        }

        // Build aggressive debate system prompt — this REPLACES the default metallm system prompt
        function buildDebateSystemPrompt(
          debater: typeof debaters[number],
          allDebaters: typeof debaters,
          phase: "opening" | "rebuttal" | "closing",
          round: number,
          total: number,
        ): string {
          const opponentInfo = getOpponentInfo(debater, allDebaters);
          const roleInstruction = debater.role
            ? `You ARE "${debater.role}". This is your IDENTITY in this debate. You believe in this position with absolute conviction. Every word you say must reflect this role. FORGET any default AI assistant personality — you are ONLY "${debater.role}" now.`
            : `You are ${debater.displayName} with your own strong opinions.`;

          // Inject user-provided custom instructions for this debater (if any)
          const customInstructions = (debater as any).customSystemPrompt?.trim();
          const customInstructionsBlock = customInstructions
            ? `\n\n=== USER CUSTOM INSTRUCTIONS FOR YOUR ROLE ===\n${customInstructions}\n=== END CUSTOM INSTRUCTIONS ===`
            : "";
          const personalizationBlock = userPersonalization
            ? `\n\n=== USER PERSONALIZATION CONTEXT ===\n${[
                userPersonalization.nickname ? `Preferred name: ${userPersonalization.nickname}` : "",
                userPersonalization.occupation ? `Occupation / background: ${userPersonalization.occupation}` : "",
                userPersonalization.moreAboutYou ? `More about the user: ${userPersonalization.moreAboutYou}` : "",
                userPersonalization.customInstructions ? `Custom response instructions: ${userPersonalization.customInstructions}` : "",
              ].filter(Boolean).join("\n")}\nUse this to tailor tone, framing, examples, and assumptions for the user while staying in your debate role.\n=== END USER PERSONALIZATION CONTEXT ===`
            : "";
          const userMemoryBlock = "";

          const phaseInstructions: Record<string, string> = {
            opening: `THIS IS YOUR OPENING ARGUMENT (Round ${round} of ${total}).
- State your position clearly and forcefully
- Present your 2-3 strongest arguments with concrete evidence or logic
- Set the tone — be bold, provocative, and unapologetic
- Make your opponent WANT to respond
- Do NOT acknowledge the other side's potential merit — that's weakness`,

            rebuttal: `THIS IS A REBUTTAL ROUND (Round ${round} of ${total}).
- You MUST directly attack your opponent's specific arguments from the previous round
- Quote or reference their exact points and tear them apart
- Expose logical fallacies, weak evidence, and contradictions in their reasoning
- Present counter-evidence that demolishes their position
- Do NOT repeat your opening arguments — advance NEW points
- Be relentless — every sentence should be a counter-punch`,

            closing: `THIS IS YOUR CLOSING ARGUMENT (Round ${round} of ${total} — FINAL ROUND).
- Make your final, strongest case for YOUR position — leave no ambiguity
- Show how YOUR core arguments have been consistent and well-supported throughout
- Highlight the weakest points in your opponent's reasoning that were never resolved
- Deliver a compelling final statement that cements your perspective
- Be memorable — this is your last word, make it count
- Do NOT introduce brand new arguments — synthesize and conclude
- Do NOT declare yourself the winner — let the strength of your argument speak for itself`,
          };

          return `=== METALLM AGGRESSIVE DEBATE MODE ===

YOU ARE IN A COMPETITIVE DEBATE. THIS IS NOT A POLITE AI CONFERENCE. THIS IS A FIERCE, AGGRESSIVE DEBATE.

${roleInstruction}

Your opponent(s): ${opponentInfo}

DEBATE STRUCTURE:
- Total rounds: ${total}
- Current round: ${round}
- Phase: ${phase.toUpperCase()}

${phaseInstructions[phase]}

=== MANDATORY RULES (VIOLATION = PENALTY) ===

1. ROLE LOCK: You are ONLY "${debater.role}". Do NOT break character. Do NOT say "as an AI" or "I don't have opinions". You HAVE strong opinions — that's your job here.

2. NO COPYING: NEVER repeat, paraphrase, or agree with your opponent's arguments. If you find yourself agreeing, FIND A WAY TO DISAGREE. This is a debate, not a discussion.

3. SHORT & SHARP: Keep your response focused and punchy. 150-250 words MAX. No filler, no hedging, no "on the other hand". Every sentence must advance YOUR position.

4. ATTACK MODE: Directly challenge your opponent. Use their role when addressing their points. Be specific — vague disagreement is weak.

5. NO FENCE-SITTING: Do NOT say "both sides have valid points" or "it depends". Pick your side and FIGHT for it.

6. EVIDENCE & LOGIC: Back your claims with reasoning, examples, data, or analogies. Bare assertions are penalties.

7. COUNTER-PUNCHING: In rebuttal/closing rounds, you MUST reference and dismantle specific opponent arguments. Generic responses = penalty.

8. UNIQUE VOICE: Your argument style must reflect your role "${debater.role}". Bring that perspective's unique insights, not generic debate points.

PENALTIES (invisible judge is scoring):
- Repeating opponent's points: -10 points
- Breaking character: -15 points
- Being too agreeable/diplomatic: -10 points
- Going over word limit: -5 points
- Failing to address opponent's arguments (in rebuttal/closing): -20 points
- Using "as an AI" or similar disclaimers: -25 points
- Generic filler without substance: -10 points

BONUS POINTS:
- Devastating counter-argument: +15 points
- Creative analogy or example: +10 points
- Exposing opponent's logical fallacy: +20 points
- Memorable closing line: +10 points
- Using role-specific expertise effectively: +15 points

Platform: Metallm AI Aggregator — Debate Mode
You are: ${debater.displayName} (${debater.id})
Your debate role: ${debater.role}${customInstructionsBlock}${personalizationBlock}${userMemoryBlock}

NOW ARGUE. BE FIERCE. MAKE YOUR CASE.`;
        }

        // Collect previous messages for rebuttal context
        const previousDebateMessages = history
          .filter(m => m.role === "assistant" && m.metadata && (m.metadata as any).debateRound)
          .map(m => `[${m.modelName} — Round ${(m.metadata as any).debateRound}]: ${m.content}`)
          .join("\n\n");

        let currentRoundDebateMessages = "";

        for (const debater of debaters) {
          const perModelEntry = Array.isArray(perModelPrompts)
            ? (perModelPrompts as any[]).find((p) => p.modelId === debater.id)
            : null;

          const stance = perModelEntry?.stance || debater.role;
          sendSSE(res, "model_start", {
            modelName: debater.displayName,
            modelId: debater.id,
            round: clientRoundNumber,
            totalRounds,
            phase: debatePhase,
            stance,
            iconUrl: debater.iconUrl,
          });

          // Build the debate-specific system prompt (completely replaces default)
          const debateSystemPrompt = buildDebateSystemPrompt(
            debater,
            debaters,
            debatePhase,
            clientRoundNumber,
            totalRounds,
          );

          // Build the user message — same debate topic for all debaters, plus optional user directives.
          let debatePrompt: string;
          const privateInstruction = targetedRoundInstructions.get(debater.id)?.trim() || "";
          const instructionLines: string[] = [];
          if (globalRoundInstruction) {
            instructionLines.push(`GLOBAL USER INSTRUCTIONS (apply to all debaters):\n${globalRoundInstruction}`);
          }
          if (privateInstruction) {
            instructionLines.push(`PRIVATE USER INSTRUCTION FOR YOU ONLY:\n${privateInstruction}`);
          } else if (hasTargetedInstructions) {
            instructionLines.push("PRIVATE USER INSTRUCTION FOR YOU ONLY: None. Ignore private instructions addressed to other debaters.");
          }

          const instructionBlock = instructionLines.length > 0
            ? `\n\nUSER ROUND DIRECTIVES:\n${instructionLines.join("\n\n")}`
            : "";

          if (clientRoundNumber === 1) {
            // Opening round — no opponent arguments should be assumed.
            debatePrompt =
              `TOPIC FROM USER (NOT AN OPPONENT ARGUMENT): ${debateTopic}` +
              `\n\nROUND ${clientRoundNumber}/${totalRounds} (${debatePhase.toUpperCase()})` +
              `\nThere are no opponent arguments yet. Do not treat the topic text as opponent speech.` +
              `\n\nDeliver your opening argument as "${stance}".` +
              instructionBlock;
          } else {
            const opponentContextSections: string[] = [];
            if (previousDebateMessages) {
              opponentContextSections.push(`PREVIOUS ROUNDS:\n${previousDebateMessages}`);
            }
            if (currentRoundDebateMessages) {
              opponentContextSections.push(`CURRENT ROUND ARGUMENTS SO FAR:\n${currentRoundDebateMessages}`);
            }

            const opponentContext = opponentContextSections.length > 0
              ? opponentContextSections.join("\n\n")
              : "No opponent arguments captured yet for this round.";

            debatePrompt =
              `TOPIC FROM USER (NOT AN OPPONENT ARGUMENT): ${debateTopic}` +
              `\n\nROUND ${clientRoundNumber}/${totalRounds} (${debatePhase.toUpperCase()})` +
              `\n\nOPPONENT ARGUMENT CONTEXT:\n${opponentContext}` +
              `\n\nYou are "${stance}". Respond to opponent arguments only from the context section above.` +
              instructionBlock;
          }

          let fullContent = "";
          let streamedContent = "";
          let debateTokenUsage: TokenUsage | undefined;
          const wordStreamState = createWordStreamState();
          try {
            const debateUserContent = buildProviderUserContent(debatePrompt, cleanAttachments);
            const debateResult = await callModelStream(
              debater,
              [{ role: "user", content: debateUserContent }],
              (chunk) => {
                streamedContent += chunk;
                streamChunkAsWords(res, debater.displayName, chunk, wordStreamState);
              },
              {
                systemPrompt: debateSystemPrompt,
                maxTokens: debater.maxOutputTokens ?? 16384,
                abortSignal: requestAbortController.signal,
              }
            );
            flushWordStream(res, debater.displayName, wordStreamState);
            fullContent = requestAborted ? `${streamedContent}${wordStreamState.carry}`.trimEnd() : debateResult.content;
            debateTokenUsage = requestAborted ? undefined : debateResult.tokenUsage;
          } catch (e) {
            flushWordStream(res, debater.displayName, wordStreamState);
            console.error(`${debater.displayName} debate error:`, e);
            if (requestAborted) {
              fullContent = `${streamedContent}${wordStreamState.carry}`.trimEnd();
            } else {
              fullContent = `[${debater.displayName}] Error in debate round.`;
              sendSSE(res, "chunk", { modelName: debater.displayName, content: fullContent });
            }
          }

          if (!fullContent.trim()) return;

          currentRoundDebateMessages += `\n[${debater.displayName} — ${stance} — Round ${clientRoundNumber}]: ${fullContent}\n`;

          const assistantMessage = await storage.addMessage({
            conversationId,
            role: "assistant",
            content: fullContent,
            modelName: debater.displayName,
            metadata: {
              modelId: debater.id,
              role: debater.role,
              iconUrl: debater.iconUrl,
              debateRound: clientRoundNumber,
              debatePhase,
              totalRounds,
              stance,
              billingMode: access.status === "unrestricted" ? "paid" : "free_trial",
              tokenUsage: debateTokenUsage ?? undefined,
            },
          });
          if (debateTokenUsage) {
            broadcastToUser(userId, "token_update", {
              modelName: debater.displayName,
              conversationId,
              messageId: assistantMessage.id,
              billable: access.status === "unrestricted",
              tokenUsage: debateTokenUsage,
            });
          }
          // Deduct credits based on token usage for debate
          if (debateTokenUsage && access.status === "unrestricted") {
            const cost = calculateTokenCost(debater.id, debateTokenUsage.promptTokens, debateTokenUsage.completionTokens);
            if (cost > 0) {
              const deductResult = await deductCredits(userId, cost, `Debate: ${debater.displayName}`, {
                modelId: debater.id, promptTokens: debateTokenUsage.promptTokens, completionTokens: debateTokenUsage.completionTokens, cost,
              });
              sendSSE(res, "credit_update", { cost, newBalance: deductResult.newBalance });
              broadcastToUser(userId, "credit_update", { cost, newBalance: deductResult.newBalance });
            }
          }
          sendSSE(res, "model_complete", { modelName: debater.displayName, message: assistantMessage, tokenUsage: debateTokenUsage });
        }
        if (requestAborted) return res.end();
      }

      // Wait for parallel title generation to finish before closing SSE
      await titlePromise;

      if (!requestAborted) {
        sendSSE(res, "done", {});
        res.end();
      }

    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      } else if (err instanceof Error && err.message.includes("not available")) {
        res.status(400).json({ message: err.message });
      } else {
        console.error("Chat error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // =============================================
  // === Legacy Metallm API ===
  // =============================================

  app.post(api.metallm.submit.path, isAuthenticated, isVerifiedUser, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const input = api.metallm.submit.input.parse(req.body);
      const query = await storage.createQuery({ ...input, userId });

      const ctx = await getUserModelContext(req as any);
      const mainModel = ctx.mainModel;
      const result = await callModel(mainModel, [
        { role: "user", content: `Respond to: "${input.prompt}"` }
      ]);

      const updatedQuery = await storage.updateQuerySummary(query.id, result);
      const fullQuery = await storage.getQueryWithResponses(updatedQuery.id);
      res.status(201).json(fullQuery);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      } else {
        console.error("Processing error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.metallm.list.path, isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const userId = user.id || user.claims?.sub;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const queries = await storage.getQueries(userId, limit, offset);
    res.json(queries);
  });

  app.get(api.metallm.get.path, isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const userId = user.id || user.claims?.sub;
    const query = await storage.getQueryWithResponses(Number(req.params.id));
    if (!query) return res.status(404).json({ message: "Query not found" });
    if (query.userId !== userId) return res.status(401).json({ message: "Unauthorized" });
    res.json(query);
  });

  const rssParser = new Parser();
  app.get("/api/blogs", async (req, res) => {
    try {
      const feed = await rssParser.parseURL("https://medium.com/feed/@metallm");
      res.json(feed.items || []);
    } catch (error) {
      console.error("Error fetching Medium feed:", error);
      res.status(500).json({ error: "Failed to fetch blogs" });
    }
  });

  // IndexNow — submit URLs for fast indexing
  app.post("/api/indexnow/submit", async (req, res) => {
    try {
      const { submitToIndexNow } = await import("./indexnow");
      const urls = req.body?.urls as string[] | undefined;
      const result = await submitToIndexNow(urls);
      res.json(result);
    } catch (error) {
      console.error("IndexNow submit error:", error);
      res.status(500).json({ success: false, error: "Internal error" });
    }
  });

  // Auto-submit to IndexNow on server start (delayed to avoid startup congestion)
  setTimeout(async () => {
    try {
      const { submitToIndexNow } = await import("./indexnow");
      await submitToIndexNow();
    } catch (err) {
      console.error("IndexNow auto-submit error:", err);
    }
  }, 15000);

  return httpServer;
}
