import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Bot,
  CheckCircle2,
  Clock3,
  Loader2,
  Mic,
  MessageSquare,
  Moon,
  Phone,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Save,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  Menu,
  Paperclip,
  Sun,
  Trash2,
  X,
  UserCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  WS_WHATSAPP_LINKED_EVENT,
  WS_BOOTSTRAP_LOG_EVENT,
  WS_BOOTSTRAP_COMPLETE_EVENT,
  WS_BUSINESS_AGENT_UPDATE_EVENT,
  WS_WHATSAPP_CONNECTED_EVENT,
  WS_WHATSAPP_DISCONNECTED_EVENT,
  WS_WHATSAPP_QR_EVENT,
  useWebSocket,
} from "@/hooks/use-websocket";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";
type ViewTab = "chat" | "settings";
const BUSINESS_AGENT_THEME_STORAGE_KEY = "business-agent-theme";

type AgentFiles = {
  identityMd: string;
  soulMd: string;
  agentsMd: string;
  userMd: string;
  bootstrapMd: string;
  toolsMd: string;
  productsMd: string;
};

type WhatsAppAccountInfo = {
  accountId: string;
  isPrimary: boolean;
  status: "linked" | "pending";
  phone: string | null;
};

type AgentSession = {
  id: string;
  name: string;
  businessName: string;
  businessPrompt: string;
  phone: string;
  status: "linked" | "pending";
  enabled: boolean;
  humanTakeoverEnabled: boolean;
  cooldownSeconds: number;
  dmPolicyOpen: boolean;
  readReceiptsEnabled: boolean;
  disappearingMessagesEnabled: boolean;
  disappearingMessagesDuration: number;
  files: AgentFiles;
  accounts?: WhatsAppAccountInfo[];
  maxAccounts?: number;
  voiceEnabled?: boolean;
  subscription?: {
    status: string;
    planCode: "trial" | "starter" | "pro" | "enterprise";
    planName: string;
    isOnTrial: boolean;
    isPaid: boolean;
    limitMessages: number;
    usedMessages: number;
    remainingMessages: number;
    usagePercent: number;
    priceMonthly: number;
    checkoutPending: boolean;
    subscriptionId: string | null;
    checkoutId: string | null;
    variantId: string | null;
    periodStart: string | null;
    periodEnd: string | null;
  };
  trial?: {
    isOnTrial: boolean;
    limitMessages: number;
    usedMessages: number;
    remainingMessages: number;
  };
  updatedAtMs?: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestampLabel?: string;
};

type ChatAttachment = {
  id: string;
  dataUrl: string;
  mimeType: string;
  fileName: string;
};

type CreateMediaAsset = {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  description: string;
  byteSize: number;
};

type BusinessPlanCode = "starter" | "pro" | "enterprise";

type BusinessPricingPlan = {
  code: BusinessPlanCode;
  name: string;
  description: string;
  priceMonthly: number;
  messageLimit: number;
  features: string[];
  highlighted?: boolean;
  dark?: boolean;
};

const BUSINESS_PRICING_PLANS: BusinessPricingPlan[] = [
  {
    code: "starter",
    name: "Starter",
    description: "Best for trying it out",
    priceMonthly: 59,
    messageLimit: 800,
    features: [
      "1 WhatsApp number",
      "800 messages / month",
      "AI handles customer chats",
      "Order capture (basic)",
      "Standard support",
    ],
  },
  {
    code: "pro",
    name: "Pro",
    description: "For growing restaurants",
    priceMonthly: 129,
    messageLimit: 3500,
    highlighted: true,
    features: [
      "Up to 3 WhatsApp numbers",
      "3,500 messages / month",
      "Voice messages (speech-to-text)",
      "Faster AI response priority",
      "Order handling + better flow",
      "Priority support",
    ],
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "For high-volume businesses",
    priceMonthly: 299,
    messageLimit: 10000,
    dark: true,
    features: [
      "Up to 5 WhatsApp numbers",
      "10,000 messages / month",
      "Voice messages (speech-to-text)",
      "Fastest AI response priority",
      "High-volume order handling",
      "VIP support",
    ],
  },
];

function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const raw = error.message.replace(/^\d+\s*:\s*/, "").trim();
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Keep raw message when backend did not return JSON.
  }

  return raw;
}

const MAX_CHAT_ATTACHMENTS = 8;
const MAX_CREATE_MEDIA_ASSETS = 3;
const MAX_CREATE_MEDIA_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CREATE_MEDIA_TOTAL_BYTES = MAX_CREATE_MEDIA_ASSETS * MAX_CREATE_MEDIA_FILE_BYTES;

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    content: match[2],
  };
}

type AgentChatSession = {
  key: string;
  updatedAtMs?: number;
  contactLabel?: string;
};

type AgentBusinessProfile = {
  businessName: string;
  businessType: string;
  phone: string;
  email: string;
  website: string;
  regions: string[];
  languages: string[];
};

type CountryOption = {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  languages: string[];
};

const COUNTRY_API_ENDPOINT = "https://restcountries.com/v3.1/all?fields=name,cca2,idd,languages";

const FALLBACK_COUNTRY_OPTIONS: CountryOption[] = [
  { code: "PK", name: "Pakistan", flag: "🇵🇰", dialCode: "+92", languages: ["Urdu", "English"] },
  { code: "IN", name: "India", flag: "🇮🇳", dialCode: "+91", languages: ["Hindi", "English"] },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", dialCode: "+44", languages: ["English"] },
  { code: "US", name: "United States", flag: "🇺🇸", dialCode: "+1", languages: ["English"] },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", dialCode: "+971", languages: ["Arabic", "English"] },
];

function countryCodeToFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) {
    return "🌍";
  }
  const chars = [...code].map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65));
  return chars.join("");
}

function normalizeDialCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "").trim();
}

function buildPhoneWithCountryCode(countryCode: string, localNumber: string): string {
  const code = normalizeDialCode(countryCode);
  const digits = normalizePhoneDigits(localNumber);
  if (!code && !digits) {
    return "";
  }
  if (!code) {
    return digits;
  }
  if (!digits) {
    return code;
  }
  return `${code}${digits}`;
}

async function fetchCountryOptions(): Promise<CountryOption[]> {
  const response = await fetch(COUNTRY_API_ENDPOINT);
  if (!response.ok) {
    throw new Error("Failed to load countries");
  }

  const payload = (await response.json()) as Array<{
    name?: { common?: string };
    cca2?: string;
    idd?: { root?: string; suffixes?: string[] };
    languages?: Record<string, string>;
  }>;

  const options = payload
    .map((country): CountryOption | null => {
      const name = country.name?.common?.trim();
      const code = (country.cca2 || "").trim().toUpperCase();
      const root = country.idd?.root || "";
      const suffix = Array.isArray(country.idd?.suffixes) ? country.idd?.suffixes[0] || "" : "";
      const dialCode = normalizeDialCode(`${root}${suffix}`);
      const languages = Object.values(country.languages || {}).filter(Boolean);

      if (!name || !code || !dialCode) {
        return null;
      }

      return {
        code,
        name,
        flag: countryCodeToFlag(code),
        dialCode,
        languages,
      };
    })
    .filter((entry): entry is CountryOption => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const uniqueByCode = new Map<string, CountryOption>();
  for (const option of options) {
    if (!uniqueByCode.has(option.code)) {
      uniqueByCode.set(option.code, option);
    }
  }
  return [...uniqueByCode.values()];
}

function resolveSidebarSessionLabel(session: AgentChatSession, agentId?: string | null): string {
  const key = session.key.trim();
  const mainKey = agentId ? `agent:${agentId}:main` : "";
  if (key === mainKey || key.toLowerCase().endsWith(":main")) {
    return "Main";
  }
  if (isBootstrapChatSession(key, agentId)) {
    return "Bootstrap";
  }

  const fromPayload = (session.contactLabel || "").trim();
  if (fromPayload) {
    return fromPayload;
  }

  const prefix = agentId ? `agent:${agentId}:` : "agent:";
  const scoped = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  const segments = scoped.split(":").filter(Boolean);
  const phoneLike = [...segments].reverse().find((segment) => /^\+?\d{7,15}$/.test(segment));
  if (phoneLike) {
    return phoneLike;
  }

  return segments[segments.length - 1] || "Contact";
}

function isMainChatSession(sessionKey: string, agentId?: string | null): boolean {
  const key = sessionKey.trim().toLowerCase();
  if (key.endsWith(":main")) {
    return true;
  }
  if (!agentId) {
    return false;
  }
  return key === `agent:${agentId}:main`.toLowerCase();
}

function isBootstrapChatSession(sessionKey: string, agentId?: string | null): boolean {
  const key = sessionKey.trim().toLowerCase();
  if (!agentId) {
    return key.endsWith(":bootstrap") || key.includes(":bootstrap-") || key.includes(":bootstrap:");
  }
  const prefix = `agent:${agentId}:bootstrap`.toLowerCase();
  return key === prefix || key.startsWith(`${prefix}-`) || key.startsWith(`${prefix}:`);
}

function isControlChatSession(sessionKey: string, agentId?: string | null): boolean {
  return isMainChatSession(sessionKey, agentId) || isBootstrapChatSession(sessionKey, agentId);
}

const normalizePhone = (value: string): string => value.replace(/[^\d+]/g, "").trim();

function extractQrText(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return null;

  const maybeRecord = payload as Record<string, unknown>;
  const direct = ["qrDataUrl", "qr", "qrCode", "code", "terminal", "data"]
    .map((key) => maybeRecord[key])
    .find((value) => typeof value === "string" && value.trim().length > 0);

  if (typeof direct === "string") return direct;
  return JSON.stringify(payload, null, 2);
}

async function fetchSessions(): Promise<AgentSession[]> {
  const response = await fetch("/api/business-agent/sessions", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to load sessions");
  }
  const payload = (await response.json()) as { sessions: AgentSession[] };
  return Array.isArray(payload.sessions) ? payload.sessions : [];
}

async function fetchSessionDetails(sessionId: string): Promise<AgentSession> {
  const response = await fetch(`/api/business-agent/sessions/${sessionId}`, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to load session details");
  }
  return (await response.json()) as AgentSession;
}

async function fetchChatSessions(sessionId: string): Promise<AgentChatSession[]> {
  const response = await fetch(`/api/business-agent/sessions/${sessionId}/chat/sessions`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to load chat sessions");
  }
  const payload = (await response.json()) as { sessions?: AgentChatSession[] };
  return Array.isArray(payload.sessions) ? payload.sessions : [];
}

async function fetchChat(
  sessionId: string,
  chatSessionKey?: string | null,
): Promise<{ messages: ChatMessage[]; subscription?: AgentSession["subscription"] }> {
  const encodedSessionKey = chatSessionKey?.trim()
    ? `?chatSessionKey=${encodeURIComponent(chatSessionKey.trim())}`
    : "";
  const response = await fetch(`/api/business-agent/sessions/${sessionId}/chat${encodedSessionKey}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to load chat");
  }
  const payload = (await response.json()) as {
    messages?: ChatMessage[];
    subscription?: AgentSession["subscription"];
  };
  return {
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    subscription: payload.subscription,
  };
}

async function fetchBusinessProfile(sessionId: string): Promise<AgentBusinessProfile | null> {
  const response = await fetch(`/api/business-agent/sessions/${sessionId}/profile`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to load business profile");
  }
  const payload = (await response.json()) as { profile?: AgentBusinessProfile | null };
  return payload.profile || null;
}

export default function BusinessAgent() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  // Keep a live WS connection on this page so broadcastToUser("whatsapp_linked") can reach us.
  useWebSocket();

  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    const stored = window.localStorage.getItem(BUSINESS_AGENT_THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  });
  const [tab, setTab] = useState<ViewTab>("chat");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<BusinessPlanCode | null>(null);

  const [newBusinessName, setNewBusinessName] = useState("");
  const [newBusinessType, setNewBusinessType] = useState("");
  const [selectedPhoneCountryCode, setSelectedPhoneCountryCode] = useState("+1");
  const [newPhoneLocal, setNewPhoneLocal] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newRegions, setNewRegions] = useState<string[]>([]);
  const [newLanguages, setNewLanguages] = useState<string[]>([]);
  const [regionSearch, setRegionSearch] = useState("");
  const [languageSearch, setLanguageSearch] = useState("");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>(FALLBACK_COUNTRY_OPTIONS);
  const [isCountryDirectoryLoading, setIsCountryDirectoryLoading] = useState(true);
  const [newBusinessPrompt, setNewBusinessPrompt] = useState("");
  const [newMediaAssets, setNewMediaAssets] = useState<CreateMediaAsset[]>([]);
  const [createStep, setCreateStep] = useState(0);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [activeProfile, setActiveProfile] = useState<AgentBusinessProfile | null>(null);

  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [agentChatSessions, setAgentChatSessions] = useState<AgentChatSession[]>([]);
  const [activeChatSessionKey, setActiveChatSessionKey] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const [activeFile, setActiveFile] = useState<keyof AgentFiles>("identityMd");

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);

  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [isQrRefreshing, setIsQrRefreshing] = useState(false);

  const [creationPhase, setCreationPhase] = useState<"idle" | "creating" | "personalizing">("idle");
  const [bootstrapLog, setBootstrapLog] = useState<string>("");
  const [isBusy, setIsBusy] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const createMediaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login?redirect=/business-agent");
    }
  }, [isLoading, setLocation, user]);

  useEffect(() => {
    if (!user?.isVerified) return;

    let cancelled = false;
    const load = async () => {
      try {
        const list = await fetchSessions();
        if (cancelled) return;
        setSessions(list);
        setActiveSessionId((prev) => prev ?? list[0]?.id ?? null);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          toast({ title: "Load failed", description: "Could not load agents.", variant: "destructive" });
        }
      } finally {
        if (!cancelled) {
          setIsInitialLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [toast, user?.isVerified]);

  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      setAgentChatSessions([]);
      setActiveChatSessionKey(null);
      setChatMessages([]);
      setChatAttachments([]);
      return;
    }

    let cancelled = false;
    const loadSession = async () => {
      try {
        const details = await fetchSessionDetails(activeSessionId);
        if (cancelled) return;
        setActiveSession(details);

        const chatSessions = await fetchChatSessions(activeSessionId);
        if (cancelled) return;
        setAgentChatSessions(chatSessions);

        setActiveChatSessionKey((current) => {
          if (current && current.includes(activeSessionId) && chatSessions.some((entry) => entry.key === current)) {
            return current;
          }
          return chatSessions[0]?.key || `agent:${activeSessionId}:main`;
        });
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          toast({ title: "Session error", description: "Could not load session data.", variant: "destructive" });
        }
      }
    };

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, toast]);

  useEffect(() => {
    if (!activeSessionId || !activeChatSessionKey) return;

    let cancelled = false;
    const loadChatForSession = async () => {
      try {
        if (!cancelled) {
          setIsChatLoading(true);
          setChatMessages([]);
          setChatAttachments([]);
        }
        const chat = await fetchChat(activeSessionId, activeChatSessionKey);
        if (!cancelled) {
          setChatMessages(chat.messages);
          syncSessionSubscription(activeSessionId, chat.subscription);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          toast({ title: "Session error", description: "Could not load selected chat session.", variant: "destructive" });
        }
      } finally {
        if (!cancelled) {
          setIsChatLoading(false);
        }
      }
    };

    void loadChatForSession();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, activeChatSessionKey, toast]);

  useEffect(() => {
    if (tab !== "chat") return;
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages, tab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(BUSINESS_AGENT_THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Listen for whatsapp_linked WS event (pushed by server after user scans QR).
  // Zero HTTP polling — the WS event is the source of truth.
  useEffect(() => {
    if (!showQrPanel) return;

    const sessionId = activeSession?.id;
    if (!sessionId) return;

    const handleLinked = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string }>).detail;
      if (detail?.sessionId !== sessionId) return;

      // Trust the WS event — the gateway just confirmed connected:true.
      // Do NOT re-fetch status; the gateway cache may still say "pending" for several seconds.
      setActiveSession((prev) => {
        if (!prev) return prev;
        const accounts = prev.accounts?.map((acc) =>
          acc.isPrimary ? { ...acc, status: "linked" as const } : acc,
        );
        return { ...prev, status: "linked", accounts };
      });
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: "linked" } : s)),
      );
      setShowQrPanel(false);
      toast({ title: "WhatsApp linked!", description: "Your WhatsApp is now connected." });
    };

    window.addEventListener(WS_WHATSAPP_LINKED_EVENT, handleLinked);
    return () => window.removeEventListener(WS_WHATSAPP_LINKED_EVENT, handleLinked);
  }, [showQrPanel, activeSession?.id, toast]);

  // Bootstrap log streaming — single-line update (replaces previous)
  useEffect(() => {
    if (creationPhase !== "personalizing") return;

    const handleLog = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId: string; message: string }>).detail;
      if (!detail?.message) return;
      setBootstrapLog(detail.message);
    };

    const finishBootstrap = (toastTitle: string, toastDesc: string) => {
      setBootstrapLog("Personalization complete!");
      setTimeout(async () => {
        setCreationPhase("idle");
        setBootstrapLog("");
        setTab("chat");
        toast({ title: toastTitle, description: toastDesc });
        await refreshSessionList();
        if (activeSessionId) {
          try {
            const freshDetails = await fetchSessionDetails(activeSessionId);
            setActiveSession(freshDetails);
          } catch {}
        }
      }, 1500);
    };

    const handleComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId: string; error?: string }>).detail;
      finishBootstrap(
        "Agent ready",
        detail?.error ? "Bootstrap had an error but your agent is ready." : "Your agent has been personalized.",
      );
    };

    // Safety fallback: if WS event never arrives, auto-transition after 5 minutes
    const fallbackTimer = setTimeout(() => {
      finishBootstrap("Agent ready", "Your agent has been personalized.");
    }, 5 * 60 * 1000);

    window.addEventListener(WS_BOOTSTRAP_LOG_EVENT, handleLog);
    window.addEventListener(WS_BOOTSTRAP_COMPLETE_EVENT, handleComplete);
    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener(WS_BOOTSTRAP_LOG_EVENT, handleLog);
      window.removeEventListener(WS_BOOTSTRAP_COMPLETE_EVENT, handleComplete);
    };
  }, [creationPhase, toast, activeSessionId]);

  // Real-time business agent update — new message arrived, subscription changed
  useEffect(() => {
    const handleAgentUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{
        agentId: string;
        accountId: string;
        chatJid: string;
        senderName: string;
        subscription: AgentSession["subscription"];
      }>).detail;
      if (!detail) return;

      const agentId = detail.agentId;

      if (detail.subscription) {
        syncSessionSubscription(agentId, detail.subscription);
      }

      // Auto-refresh chat messages and chat session list for the active agent
      if (activeSessionId === agentId && activeChatSessionKey) {
        fetchChat(agentId, activeChatSessionKey).then((chat) => {
          setChatMessages(chat.messages);
          if (chat.subscription) syncSessionSubscription(agentId, chat.subscription);
        }).catch(() => {});
        fetchChatSessions(agentId).then((sessions) => {
          setAgentChatSessions(sessions);
        }).catch(() => {});
      }
    };

    window.addEventListener(WS_BUSINESS_AGENT_UPDATE_EVENT, handleAgentUpdate);
    return () => window.removeEventListener(WS_BUSINESS_AGENT_UPDATE_EVENT, handleAgentUpdate);
  }, [activeSessionId, activeChatSessionKey]);

  // Real-time WhatsApp connection status updates
  useEffect(() => {
    const handleConnected = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId: string; phone: string }>).detail;
      if (!detail?.accountId || !activeSession) return;

      const isPrimaryMatch = activeSession.accounts?.some(
        (acc) => acc.accountId === detail.accountId,
      ) || !activeSession.accounts?.length;

      if (isPrimaryMatch) {
        setActiveSession((prev) => {
          if (!prev) return prev;
          const accounts = prev.accounts?.map((acc) =>
            acc.accountId === detail.accountId || (acc.isPrimary && !prev.accounts?.length)
              ? { ...acc, status: "linked" as const, phone: detail.phone || acc.phone }
              : acc,
          );
          return { ...prev, status: "linked", accounts };
        });
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSessionId ? { ...s, status: "linked" } : s)),
        );
        setShowQrPanel(false);
        toast({ title: "WhatsApp connected!", description: `Connected as ${detail.phone || "unknown"}.` });
      }
    };

    const handleDisconnected = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId: string; reason: string }>).detail;
      if (!detail?.accountId || !activeSession) return;

      const isPrimaryMatch = activeSession.accounts?.some(
        (acc) => acc.accountId === detail.accountId,
      ) || !activeSession.accounts?.length;

      if (isPrimaryMatch) {
        setActiveSession((prev) => {
          if (!prev) return prev;
          const accounts = prev.accounts?.map((acc) =>
            acc.accountId === detail.accountId || (acc.isPrimary && !prev.accounts?.length)
              ? { ...acc, status: "pending" as const }
              : acc,
          );
          return { ...prev, status: "pending", accounts };
        });
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSessionId ? { ...s, status: "pending" } : s)),
        );
        toast({ title: "WhatsApp disconnected", description: detail.reason || "Connection lost.", variant: "destructive" });
      }
    };

    const handleQr = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId: string; qr: string }>).detail;
      if (!detail?.qr || !activeSession) return;

      if (showQrPanel) {
        setQrPreview(detail.qr);
      }
    };

    window.addEventListener(WS_WHATSAPP_CONNECTED_EVENT, handleConnected);
    window.addEventListener(WS_WHATSAPP_DISCONNECTED_EVENT, handleDisconnected);
    window.addEventListener(WS_WHATSAPP_QR_EVENT, handleQr);
    return () => {
      window.removeEventListener(WS_WHATSAPP_CONNECTED_EVENT, handleConnected);
      window.removeEventListener(WS_WHATSAPP_DISCONNECTED_EVENT, handleDisconnected);
      window.removeEventListener(WS_WHATSAPP_QR_EVENT, handleQr);
    };
  }, [activeSession, activeSessionId, showQrPanel, toast]);

  // Auto-restart QR session when WhatsApp disconnects while QR panel is open.
  // No polling — relies on WS events. On disconnect, restarts session once to get a fresh QR.
  useEffect(() => {
    if (!showQrPanel || !activeSession?.id) return;
    const sessionId = activeSession.id;

    const handleDisconnectRestart = async (event: Event) => {
      const detail = (event as CustomEvent<{ accountId: string; reason: string }>).detail;
      if (!detail) return;
      // Don't restart if user explicitly logged out
      if (detail.reason === "logged_out") return;
      // Auto-restart to generate a fresh QR
      try {
        const resp = await fetch(`/api/business-agent/sessions/${sessionId}/qr/start`, {
          method: "POST",
          credentials: "include",
        });
        if (resp.ok) {
          const payload = await resp.json() as { qr?: unknown };
          const freshQr = extractQrText(payload?.qr);
          if (freshQr) setQrPreview(freshQr);
        }
      } catch {}
    };

    window.addEventListener(WS_WHATSAPP_DISCONNECTED_EVENT, handleDisconnectRestart);
    return () => window.removeEventListener(WS_WHATSAPP_DISCONNECTED_EVENT, handleDisconnectRestart);
  }, [showQrPanel, activeSession?.id]);

  const pageTone =
    theme === "light"
      ? {
          shell: "bg-[#f6f7fb] text-[#0f172a]",
          panel: "bg-white border-slate-200",
          muted: "text-slate-600",
          strong: "text-slate-900",
          soft: "bg-slate-50 border-slate-200",
          outlineBtn: "border-slate-300 text-slate-700 bg-white hover:bg-slate-100",
          ghostBtn: "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
          destructiveOutlineBtn: "border-red-300 text-red-600 bg-white hover:bg-red-50",
        }
      : {
          shell: "bg-[#060b17] text-slate-100",
          panel: "bg-slate-900/70 border-slate-800",
          muted: "text-slate-400",
          strong: "text-white",
          soft: "bg-slate-900 border-slate-800",
          outlineBtn: "",
          ghostBtn: "",
          destructiveOutlineBtn: "",
        };

  const settingsHeadingTone = theme === "light" ? "text-slate-900" : "text-slate-100";
  const settingsBodyTone = theme === "light" ? "text-slate-700" : pageTone.muted;
  const settingsInputTone =
    theme === "light"
      ? "!bg-white !text-slate-900 !placeholder:text-slate-400 border-slate-300"
      : "!bg-slate-950/70 !text-slate-100 !placeholder:text-slate-500 border-slate-700";

  const hasAgent = useMemo(() => sessions.length > 0, [sessions.length]);
  const activeChatContactLabel = useMemo(() => {
    if (!activeChatSessionKey) return "";
    const current = agentChatSessions.find((entry) => entry.key === activeChatSessionKey);
    return (current?.contactLabel || "").trim();
  }, [activeChatSessionKey, agentChatSessions]);
  const activeDisplayLabel = useMemo(() => {
    if (activeChatContactLabel) return activeChatContactLabel;
    if (!activeSession) return "Business Agent";
    const candidates = [activeSession.businessName, activeSession.name, activeSession.id].map((value) => value?.trim()).filter(Boolean);
    return candidates[0] || "Business Agent";
  }, [activeSession, activeChatContactLabel]);
  const isWhatsAppConnected = activeSession?.status === "linked";
  const canEditAgentFilesFromCurrentSession = useMemo(() => {
    if (!activeSessionId || !activeChatSessionKey) return false;
    return isControlChatSession(activeChatSessionKey, activeSessionId);
  }, [activeChatSessionKey, activeSessionId]);
  const languageOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const country of countryOptions) {
      for (const language of country.languages) {
        const normalized = language.trim();
        if (normalized) {
          unique.add(normalized);
        }
      }
    }
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [countryOptions]);
  const normalizedCreatePhone = useMemo(
    () => buildPhoneWithCountryCode(selectedPhoneCountryCode, newPhoneLocal),
    [newPhoneLocal, selectedPhoneCountryCode],
  );
  const filteredRegionOptions = useMemo(() => {
    const query = regionSearch.trim().toLowerCase();
    if (!query) {
      return countryOptions;
    }
    return countryOptions.filter((country) =>
      country.name.toLowerCase().includes(query) ||
      country.code.toLowerCase().includes(query) ||
      country.dialCode.includes(query),
    );
  }, [countryOptions, regionSearch]);
  const filteredLanguageOptions = useMemo(() => {
    const query = languageSearch.trim().toLowerCase();
    if (!query) {
      return languageOptions;
    }
    return languageOptions.filter((language) => language.toLowerCase().includes(query));
  }, [languageOptions, languageSearch]);

  useEffect(() => {
    let cancelled = false;

    const loadCountries = async () => {
      try {
        setIsCountryDirectoryLoading(true);
        const options = await fetchCountryOptions();
        if (cancelled || options.length === 0) {
          return;
        }
        setCountryOptions(options);
        setSelectedPhoneCountryCode((current) => {
          if (options.some((option) => option.dialCode === current)) {
            return current;
          }
          return options[0].dialCode;
        });
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          toast({
            title: "Country directory unavailable",
            description: "Using fallback country and language list for now.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsCountryDirectoryLoading(false);
        }
      }
    };

    void loadCountries();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (countryOptions.length === 0) {
      return;
    }
    setNewRegions((current) => current.filter((region) => countryOptions.some((option) => option.name === region)));
  }, [countryOptions]);

  useEffect(() => {
    if (languageOptions.length === 0) {
      return;
    }
    setNewLanguages((current) => current.filter((language) => languageOptions.includes(language)));
  }, [languageOptions]);

  const refreshSessionList = async (preferredSessionId?: string | null) => {
    const list = await fetchSessions();
    setSessions(list);
    setActiveSessionId((current) => {
      const nextId = preferredSessionId === undefined ? current : preferredSessionId;
      if (nextId && list.some((session) => session.id === nextId)) {
        return nextId;
      }
      return list[0]?.id ?? null;
    });
    return list;
  };

  const updateSessionDraft = (updater: (current: AgentSession) => AgentSession) => {
    setActiveSession((current) => (current ? updater(current) : current));
  };

  const syncSessionSubscription = (sessionId: string, subscription?: AgentSession["subscription"]) => {
    if (!subscription) return;
    setActiveSession((current) => (current && current.id === sessionId ? { ...current, subscription } : current));
    setSessions((current) =>
      current.map((session) => (session.id === sessionId ? { ...session, subscription } : session)),
    );
  };

  const handleCreateAgent = async () => {
    if (!newBusinessName.trim() || !newBusinessType.trim() || !normalizePhone(normalizedCreatePhone) || newRegions.length === 0 || newLanguages.length === 0) {
      toast({
        title: "Complete required fields",
        description: "Business name, type, WhatsApp number, regions, and languages are required.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsBusy(true);
      setCreationPhase("creating");

      // The backend creates the agent quickly, but then waits up to 120s for personalization.
      // We'll show 'Creating your agent' for the first 3 seconds, then switch to 'Personalizing'.
      const phaseTimer = setTimeout(() => {
        setCreationPhase("personalizing");
      }, 3000);

      const response = await apiRequest("POST", "/api/business-agent/sessions", {
        name: newBusinessName.trim(),
        businessName: newBusinessName.trim(),
        businessType: newBusinessType.trim(),
        phone: normalizePhone(normalizedCreatePhone),
        email: newEmail.trim() || undefined,
        website: newWebsite.trim() || undefined,
        regions: newRegions,
        languages: newLanguages,
        businessPrompt: newBusinessPrompt.trim() || undefined,
        mediaAssets: newMediaAssets
          .map((asset) => {
            const parsed = dataUrlToBase64(asset.dataUrl);
            if (!parsed) {
              return null;
            }
            return {
              fileName: asset.fileName,
              mimeType: asset.mimeType || parsed.mimeType,
              content: parsed.content,
              description: asset.description.trim() || undefined,
            };
          })
          .filter((asset): asset is NonNullable<typeof asset> => asset !== null),
      });
      const payload = (await response.json()) as { session?: AgentSession };
      await refreshSessionList();
      if (payload?.session?.id) {
        setActiveSessionId(payload.session.id);
      }
      clearTimeout(phaseTimer);
      setCreationPhase("personalizing");
      setBootstrapLog("");
      setNewBusinessName("");
      setNewBusinessType("");
      setNewPhoneLocal("");
      setNewEmail("");
      setNewWebsite("");
      setNewRegions([]);
      setNewLanguages([]);
      setRegionSearch("");
      setLanguageSearch("");
      setNewBusinessPrompt("");
      setNewMediaAssets([]);
      setCreateStep(0);
      // Don't switch to chat tab yet — wait for bootstrap_complete WS event
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Could not create agent.";
      const userMessage = message.replace(/^\d+\s*:\s*/, "").trim() || "Could not create agent.";
      toast({ title: "Create failed", description: userMessage, variant: "destructive" });
      setCreationPhase("idle");
    } finally {
      setIsBusy(false);
    }
  };

  const currentSubscription = useMemo(() => {
    const subscription = activeSession?.subscription;
    if (subscription) {
      return subscription;
    }

    const trial = activeSession?.trial;
    if (!trial) {
      return null;
    }

    const limit = Math.max(1, trial.limitMessages || 20);
    const used = Math.max(0, trial.usedMessages || 0);
    return {
      status: "trialing",
      planCode: "trial" as const,
      planName: "Trial",
      isOnTrial: true,
      isPaid: false,
      limitMessages: limit,
      usedMessages: used,
      remainingMessages: Math.max(0, trial.remainingMessages),
      usagePercent: Math.min(100, Math.round((used / limit) * 100)),
      priceMonthly: 0,
      checkoutPending: false,
      subscriptionId: null,
      checkoutId: null,
      variantId: null,
      periodStart: null,
      periodEnd: null,
    };
  }, [activeSession?.subscription, activeSession?.trial]);

  const isMessageLimitReached = Boolean(currentSubscription && currentSubscription.remainingMessages <= 0);

  const toggleSelection = (value: string, selected: string[], setSelected: (values: string[]) => void) => {
    if (selected.includes(value)) {
      setSelected(selected.filter((entry) => entry !== value));
      return;
    }
    setSelected([...selected, value]);
  };

  const handleCreateMediaSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const availableSlots = Math.max(0, MAX_CREATE_MEDIA_ASSETS - newMediaAssets.length);
    if (availableSlots <= 0) {
      toast({
        title: "Media limit reached",
        description: `You can upload up to ${MAX_CREATE_MEDIA_ASSETS} files while creating an agent.`,
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    const selectedFiles = Array.from(files).slice(0, availableSlots);
    const oversizedFile = selectedFiles.find((f) => f.size > MAX_CREATE_MEDIA_FILE_BYTES);
    if (oversizedFile) {
      toast({
        title: "File too large",
        description: `"${oversizedFile.name}" exceeds 5 MB. Please use a smaller file.`,
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }
    const existingBytes = newMediaAssets.reduce((sum, asset) => sum + asset.byteSize, 0);
    const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (existingBytes + selectedBytes > MAX_CREATE_MEDIA_TOTAL_BYTES) {
      toast({
        title: "Media too large",
        description: `Total media upload limit is ${MAX_CREATE_MEDIA_ASSETS * 5} MB.`,
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }
    const additions: CreateMediaAsset[] = [];
    let pending = 0;

    for (const file of selectedFiles) {
      pending += 1;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (result) {
          additions.push({
            id: generateAttachmentId(),
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            dataUrl: result,
            description: "",
            byteSize: file.size,
          });
        }

        pending -= 1;
        if (pending === 0 && additions.length > 0) {
          setNewMediaAssets((prev) => [...prev, ...additions]);
        }
      });
      reader.readAsDataURL(file);
    }

    event.target.value = "";
  };

  const handleOpenProfile = async () => {
    if (!activeSession?.id) {
      toast({ title: "No agent selected", description: "Select an agent first." });
      return;
    }

    try {
      setShowProfilePanel(true);
      setIsProfileLoading(true);
      const profile = await fetchBusinessProfile(activeSession.id);
      setActiveProfile(profile);
    } catch (error) {
      console.error(error);
      toast({ title: "Profile error", description: "Could not load business profile.", variant: "destructive" });
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handleConnectWhatsApp = async () => {
    if (!activeSession) return;
    try {
      setIsBusy(true);
      setIsQrRefreshing(true);
      const response = await apiRequest("POST", `/api/business-agent/sessions/${activeSession.id}/qr/start`);
      const payload = (await response.json()) as { qr?: unknown };
      const qrText = extractQrText(payload.qr);

      if (qrText && qrText.toLowerCase().includes("already linked")) {
        setActiveSession({ ...activeSession, status: "linked" });
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSession.id ? { ...s, status: "linked" } : s)),
        );
        toast({ title: "Already Linked", description: "WhatsApp is already connected." });
        return;
      }

      setQrPreview(qrText);
      setShowQrPanel(true);
      toast({ title: "QR ready", description: "Scan this QR in WhatsApp → Linked Devices." });
    } catch (error) {
      console.error(error);
      toast({ title: "Connect failed", description: "Could not start WhatsApp linking.", variant: "destructive" });
    } finally {
      setIsBusy(false);
      setIsQrRefreshing(false);
    }
  };

  const handleCheckLinked = async () => {
    if (!activeSession) return;
    try {
      setIsBusy(true);
      const response = await apiRequest("POST", `/api/business-agent/sessions/${activeSession.id}/qr/wait`);
      const payload = (await response.json()) as { connected: boolean; files?: AgentFiles };
      if (payload.connected) {
        updateSessionDraft((session) => ({
          ...session,
          status: "linked",
          files: payload.files || session.files,
        }));
        await refreshSessionList();
        toast({ title: "Linked", description: "WhatsApp is connected." });
      } else {
        toast({ title: "Pending", description: "Still waiting for WhatsApp link." });
      }
    } catch (error) {
      console.error(error);
      toast({ title: "Check failed", description: "Could not verify link state.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  };

  const handleLogoutWhatsApp = async () => {
    if (!activeSession) return;
    try {
      setIsBusy(true);
      await apiRequest("POST", `/api/business-agent/sessions/${activeSession.id}/logout`);
      setShowQrPanel(false);
      setQrPreview(null);
      updateSessionDraft((session) => ({ ...session, status: "pending" }));
      setSessions((prev) => prev.map((session) => (session.id === activeSession.id ? { ...session, status: "pending" } : session)));
      toast({ title: "Logged out", description: "WhatsApp disconnected successfully." });
    } catch (error) {
      console.error(error);
      toast({ title: "Logout failed", description: "Could not disconnect WhatsApp.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  };

  const handleChangeWhatsApp = async () => {
    if (!activeSession) return;
    try {
      setIsBusy(true);
      // Best effort: disconnect previous connection first so user can pair a new one.
      try {
        await apiRequest("POST", `/api/business-agent/sessions/${activeSession.id}/logout`);
      } catch {
        // Ignore logout errors here and continue attempting QR flow.
      }

      setShowQrPanel(false);
      setQrPreview(null);
      updateSessionDraft((session) => ({ ...session, status: "pending" }));
      setSessions((prev) => prev.map((session) => (session.id === activeSession.id ? { ...session, status: "pending" } : session)));
      await handleConnectWhatsApp();
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveControls = async () => {
    if (!activeSession) return;
    try {
      setIsBusy(true);
      await apiRequest("PUT", `/api/business-agent/sessions/${activeSession.id}/controls`, {
        name: activeSession.name,
        phone: activeSession.phone,
        enabled: activeSession.enabled,
        humanTakeoverEnabled: activeSession.humanTakeoverEnabled,
        cooldownSeconds: activeSession.cooldownSeconds,
        dmPolicyOpen: activeSession.dmPolicyOpen,
        readReceiptsEnabled: activeSession.readReceiptsEnabled,
        disappearingMessagesEnabled: activeSession.disappearingMessagesEnabled,
        disappearingMessagesDuration: activeSession.disappearingMessagesDuration,
      });
      await refreshSessionList();
      toast({ title: "Saved", description: "Settings updated." });
    } catch (error) {
      console.error(error);
      toast({ title: "Save failed", description: "Could not save settings.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartUpgradeCheckout = async (planCode: BusinessPlanCode) => {
    if (!activeSession) return;
    try {
      setIsUpgradeLoading(true);
      setCheckoutPlan(planCode);
      const response = await apiRequest(
        "POST",
        `/api/business-agent/sessions/${activeSession.id}/subscription/checkout`,
        { planCode },
      );
      const payload = (await response.json()) as {
        checkoutUrl?: string;
        subscription?: AgentSession["subscription"];
      };
      syncSessionSubscription(activeSession.id, payload.subscription);

      if (payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }

      throw new Error("Checkout URL missing");
    } catch (error) {
      console.error(error);
      toast({
        title: "Upgrade failed",
        description: extractApiErrorMessage(error, "Could not start upgrade checkout."),
        variant: "destructive",
      });
    } finally {
      setIsUpgradeLoading(false);
      setCheckoutPlan(null);
    }
  };

  const handleToggleAgentEnabled = async (checked: boolean) => {
    if (!activeSession) return;

    const previous = activeSession.enabled;
    updateSessionDraft((session) => ({ ...session, enabled: checked }));

    try {
      setIsBusy(true);
      await apiRequest("PUT", `/api/business-agent/sessions/${activeSession.id}/controls`, {
        name: activeSession.name,
        phone: activeSession.phone,
        enabled: checked,
        humanTakeoverEnabled: activeSession.humanTakeoverEnabled,
        cooldownSeconds: activeSession.cooldownSeconds,
        dmPolicyOpen: activeSession.dmPolicyOpen,
        readReceiptsEnabled: activeSession.readReceiptsEnabled,
      });
      await refreshSessionList(activeSession.id);
      toast({
        title: checked ? "Agent enabled" : "Agent disabled",
        description: checked
          ? "Auto replies are now active."
          : "Auto replies have been stopped.",
      });
    } catch (error) {
      console.error(error);
      updateSessionDraft((session) => ({ ...session, enabled: previous }));
      toast({ title: "Update failed", description: "Could not change agent status.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveFile = async () => {
    if (!activeSession) return;
    if (!activeChatSessionKey || !isControlChatSession(activeChatSessionKey, activeSession.id)) {
      toast({
        title: "Control session required",
        description: "Switch to Main or Bootstrap session to update agent files.",
      });
      return;
    }

    const fileNameMap: Record<keyof AgentFiles, string> = {
      identityMd: "identity.md",
      soulMd: "soul.md",
      agentsMd: "agents.md",
      userMd: "user.md",
      bootstrapMd: "bootstrap.md",
      toolsMd: "tools.md",
      productsMd: "products.md",
    };

    try {
      setIsBusy(true);
      await apiRequest("PUT", `/api/business-agent/sessions/${activeSession.id}/files/${fileNameMap[activeFile]}`, {
        content: activeSession.files[activeFile],
        chatSessionKey: activeChatSessionKey,
      });
      toast({ title: "Saved", description: "File updated." });
    } catch (error) {
      console.error(error);
      toast({ title: "Save failed", description: "Could not save file.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSendChat = async () => {
    if (!activeSession || !activeChatSessionKey) return;
    if (isMessageLimitReached) {
      toast({
        title: "Message limit reached",
        description: "Your current plan limit is reached. Upgrade to continue sending messages.",
        variant: "destructive",
      });
      return;
    }
    const message = chatInput.trim();
    const hasAttachments = chatAttachments.length > 0;
    if (!message && !hasAttachments) return;

    const apiAttachments = chatAttachments
      .map((att) => {
        const parsed = dataUrlToBase64(att.dataUrl);
        if (!parsed) {
          return null;
        }
        return {
          type: "image",
          mimeType: parsed.mimeType,
          fileName: att.fileName,
          content: parsed.content,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    setChatMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: message || `[Image attachment x${apiAttachments.length}]`,
      },
    ]);
    setChatInput("");
    setChatAttachments([]);

    try {
      setIsChatSending(true);
      const response = await apiRequest("POST", `/api/business-agent/sessions/${activeSession.id}/chat`, {
        message,
        chatSessionKey: activeChatSessionKey,
        attachments: apiAttachments,
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        messages?: ChatMessage[];
        subscription?: AgentSession["subscription"];
      };
      if (Array.isArray(payload.messages)) {
        setChatMessages(payload.messages);
      }
      syncSessionSubscription(activeSession.id, payload.subscription);
      const chatSessions = await fetchChatSessions(activeSession.id);
      setAgentChatSessions(chatSessions);
    } catch (error) {
      console.error(error);
      toast({
        title: "Chat failed",
        description: extractApiErrorMessage(error, "Could not send message to agent."),
        variant: "destructive",
      });
    } finally {
      setIsChatSending(false);
    }
  };

  const handleChatKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!isChatSending && (chatInput.trim() || chatAttachments.length > 0)) {
      void handleSendChat();
    }
  };

  const handleChatFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const current = chatAttachments;
    const availableSlots = Math.max(0, MAX_CHAT_ATTACHMENTS - current.length);
    if (availableSlots <= 0) {
      toast({
        title: "Attachment limit reached",
        description: `You can attach up to ${MAX_CHAT_ATTACHMENTS} images per message.`,
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    const additions: ChatAttachment[] = [];
    let pending = 0;

    const selectedFiles = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, availableSlots);

    if (selectedFiles.length === 0) {
      toast({
        title: "Unsupported file type",
        description: "Only image attachments are supported in Business Agent chat.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    for (const file of selectedFiles) {
      pending += 1;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (result) {
          additions.push({
            id: generateAttachmentId(),
            dataUrl: result,
            mimeType: file.type,
            fileName: file.name,
          });
        }

        pending -= 1;
        if (pending === 0 && additions.length > 0) {
          setChatAttachments((prev) => [...prev, ...additions]);
        }
      });
      reader.readAsDataURL(file);
    }

    event.target.value = "";
  };

  const handleDeleteAgent = async () => {
    if (!activeSession) return;

    const confirmed = window.confirm(
      `Delete ${activeSession.businessName || activeSession.name || "this agent"}? This will unlink WhatsApp, delete its chat session, and remove its agent data.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsBusy(true);
      await apiRequest("DELETE", `/api/business-agent/sessions/${activeSession.id}`);
      setShowQrPanel(false);
      setQrPreview(null);
      setChatMessages([]);
      setAgentChatSessions([]);
      setActiveChatSessionKey(null);
      setActiveSession(null);
      await refreshSessionList(null);
      setTab("chat");
      toast({ title: "Agent deleted", description: "WhatsApp, session history, and agent data were removed." });
    } catch (error) {
      console.error(error);
      toast({ title: "Delete failed", description: "Could not delete this agent.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteChatSession = async (chatSessionKey: string) => {
    if (!activeSessionId) return;
    if (isControlChatSession(chatSessionKey, activeSessionId)) {
      toast({ title: "Protected", description: "Main and Bootstrap sessions cannot be deleted." });
      return;
    }

    const sessionLabel = resolveSidebarSessionLabel(
      { key: chatSessionKey, contactLabel: "", updatedAtMs: undefined },
      activeSessionId,
    );
    const confirmed = window.confirm(`Delete ${sessionLabel} chat session and transcript?`);
    if (!confirmed) {
      return;
    }

    try {
      setIsBusy(true);
      await apiRequest("DELETE", `/api/business-agent/sessions/${activeSessionId}/chat/sessions`, {
        chatSessionKey,
      });

      const nextSessions = await fetchChatSessions(activeSessionId);
      setAgentChatSessions(nextSessions);

      if (activeChatSessionKey === chatSessionKey) {
        const fallback =
          nextSessions.find((entry) => isMainChatSession(entry.key, activeSessionId))?.key ||
          nextSessions[0]?.key ||
          `agent:${activeSessionId}:main`;
        setActiveChatSessionKey(fallback);
      }

      toast({ title: "Deleted", description: "Chat session deleted successfully." });
    } catch (error) {
      console.error(error);
      toast({ title: "Delete failed", description: "Could not delete chat session.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading || !user) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!user.isVerified) {
    return (
      <div className={cn("min-h-screen p-6 md:p-10", pageTone.shell)}>
        <div className="mx-auto max-w-3xl">
          <Card className={cn("border", pageTone.panel)}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ShieldCheck className="h-6 w-6" />
                Verify Your Account First
              </CardTitle>
              <CardDescription className={pageTone.muted}>
                Business Agent setup is available after email verification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation("/login?mode=verify&redirect=/business-agent")}>Go to Verification</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isInitialLoading) {
    return <div className={cn("min-h-screen", pageTone.shell)} />;
  }

  // Show personalizing/creating screen on top of everything — even if sessions already loaded
  if (creationPhase !== "idle") {
    return (
      <div className={cn("min-h-screen", pageTone.shell)}>
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-8 text-center">
          <Loader2 className={cn("h-16 w-16 animate-spin mb-6", theme === "light" ? "text-slate-900" : "text-white")} />
          <h2 className={cn("max-w-3xl text-2xl font-semibold leading-tight sm:text-3xl md:text-3xl", pageTone.strong)}>
            {creationPhase === "creating" ? "Creating your agent..." : "Personalizing your agent..."}
          </h2>
          <p className={cn("mt-4 text-sm md:text-base max-w-md", pageTone.muted)}>
            {creationPhase === "creating"
              ? "Setting up the workspace using default structures."
              : "The agent is evaluating tools and filling out its configuration files..."}
          </p>
          {creationPhase === "personalizing" && bootstrapLog && (
            <p className={cn("mt-6 text-xs font-mono animate-pulse", pageTone.muted)}>
              {bootstrapLog}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!hasAgent) {
    const isStepValid = (() => {
      switch (createStep) {
        case 0:
          return newBusinessName.trim().length > 0;
        case 1:
          return newBusinessType.trim().length > 0;
        case 2:
          return normalizeDialCode(selectedPhoneCountryCode).length > 0 && normalizePhoneDigits(newPhoneLocal).length >= 6;
        case 3:
          return !newEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
        case 4:
          return !newWebsite.trim() || /^https?:\/\//.test(newWebsite.trim());
        case 5:
          return !isCountryDirectoryLoading && newRegions.length > 0;
        case 6:
          return !isCountryDirectoryLoading && newLanguages.length > 0;
        case 7:
          return newMediaAssets.length === 0 || newMediaAssets.every((asset) => asset.description.trim().length > 0);
        default:
          return true;
      }
    })();

    const stepTitle = [
      "What is your business name?",
      "What type of business do you run?",
      "Which WhatsApp number should connect?",
      "What is your business email? (Optional)",
      "What is your website? (Optional)",
      "Which regions do you serve?",
      "Which languages should agent use?",
      "Add media (menu, banner, product images) and extra instructions",
    ][createStep] || "Create your agent";

    return (
      <div className={cn("min-h-screen", pageTone.shell)}>
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 md:px-10">
          <div className="flex items-center justify-between text-sm">
            <p className={cn("tracking-[0.2em] uppercase", pageTone.muted)}>Create Your Agent</p>
            <p className={cn("font-medium", pageTone.muted)}>Step {Math.min(createStep + 1, 8)} / 8</p>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-10 text-center">
            <h2 className={cn("max-w-3xl text-2xl font-semibold leading-tight sm:text-3xl md:text-4xl", pageTone.strong)}>
              {stepTitle}
            </h2>

            {createStep <= 4 ? (
              <div className="w-full max-w-2xl">
                {createStep === 0 ? (
                  <Input
                    value={newBusinessName}
                    onChange={(event) => setNewBusinessName(event.target.value)}
                    placeholder="Type your business name"
                    className={cn(
                      "h-14 border-0 border-b-2 rounded-none bg-transparent px-0 text-center text-lg shadow-none focus-visible:ring-0",
                      theme === "light" ? "border-slate-300 text-slate-900 placeholder:text-slate-400" : "border-slate-700 text-slate-100 placeholder:text-slate-500",
                    )}
                  />
                ) : null}

                {createStep === 1 ? (
                  <Input
                    value={newBusinessType}
                    onChange={(event) => setNewBusinessType(event.target.value)}
                    placeholder="Type your business type"
                    className={cn(
                      "h-14 border-0 border-b-2 rounded-none bg-transparent px-0 text-center text-lg shadow-none focus-visible:ring-0",
                      theme === "light" ? "border-slate-300 text-slate-900 placeholder:text-slate-400" : "border-slate-700 text-slate-100 placeholder:text-slate-500",
                    )}
                  />
                ) : null}

                {createStep === 2 ? (
                  <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
                    <div>
                      <Label className={cn("mb-2 block text-left text-xs uppercase tracking-[0.15em]", pageTone.muted)}>
                        Country Code
                      </Label>
                      <select
                        value={selectedPhoneCountryCode}
                        onChange={(event) => setSelectedPhoneCountryCode(event.target.value)}
                        className={cn(
                          "h-12 w-full rounded-xl border px-3 text-sm",
                          theme === "light"
                            ? "border-slate-300 bg-white text-slate-900"
                            : "border-slate-700 bg-slate-950 text-slate-100",
                        )}
                      >
                        {countryOptions.map((country) => (
                          <option key={`${country.code}-${country.dialCode}`} value={country.dialCode}>
                            {country.flag} {country.name} ({country.dialCode})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className={cn("mb-2 block text-left text-xs uppercase tracking-[0.15em]", pageTone.muted)}>
                        WhatsApp Number
                      </Label>
                      <Input
                        value={newPhoneLocal}
                        onChange={(event) => setNewPhoneLocal(normalizePhoneDigits(event.target.value))}
                        placeholder="3001234567"
                        inputMode="numeric"
                        className={cn(
                          "h-12 rounded-xl border px-3 text-left text-base",
                          theme === "light"
                            ? "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                            : "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500",
                        )}
                      />
                      <p className={cn("mt-2 text-left text-xs", pageTone.muted)}>
                        Full number: {normalizedCreatePhone || `${selectedPhoneCountryCode}...`}
                      </p>
                    </div>
                  </div>
                ) : null}

                {createStep === 3 ? (
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    placeholder="Type business email (optional)"
                    className={cn(
                      "h-14 border-0 border-b-2 rounded-none bg-transparent px-0 text-center text-lg shadow-none focus-visible:ring-0",
                      theme === "light" ? "border-slate-300 text-slate-900 placeholder:text-slate-400" : "border-slate-700 text-slate-100 placeholder:text-slate-500",
                    )}
                  />
                ) : null}

                {createStep === 4 ? (
                  <>
                    <Input
                      value={newWebsite}
                      onChange={(event) => setNewWebsite(event.target.value)}
                      placeholder="Type website URL (optional)"
                      className={cn(
                        "h-14 border-0 border-b-2 rounded-none bg-transparent px-0 text-center text-lg shadow-none focus-visible:ring-0",
                        theme === "light" ? "border-slate-300 text-slate-900 placeholder:text-slate-400" : "border-slate-700 text-slate-100 placeholder:text-slate-500",
                      )}
                    />
                    <p className={cn("mt-3 text-sm", pageTone.muted)}>
                      Recommended: With a website, your agent will be more accurate and personalized.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {createStep === 5 ? (
              <div className="w-full max-w-3xl">
                <p className={cn("mb-4 text-sm", pageTone.muted)}>Select one or more countries</p>
                {isCountryDirectoryLoading ? (
                  <p className={cn("text-sm", pageTone.muted)}>Loading countries...</p>
                ) : (
                  <>
                    <Input
                      value={regionSearch}
                      onChange={(event) => setRegionSearch(event.target.value)}
                      placeholder="Search country by name, code, or dial code"
                      className={cn(
                        "mb-4 h-11 rounded-xl",
                        theme === "light"
                          ? "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                          : "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500",
                      )}
                    />
                    {filteredRegionOptions.length === 0 ? (
                      <p className={cn("text-sm", pageTone.muted)}>No countries found for this search.</p>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {filteredRegionOptions.map((country) => {
                          const selected = newRegions.includes(country.name);
                          return (
                            <button
                              key={country.code}
                              type="button"
                              onClick={() => toggleSelection(country.name, newRegions, setNewRegions)}
                              className={cn(
                                "px-1 pb-1 text-sm transition border-b-2",
                                selected
                                  ? "border-primary text-primary"
                                  : theme === "light"
                                    ? "border-transparent text-slate-600 hover:text-slate-900"
                                    : "border-transparent text-slate-400 hover:text-slate-100",
                              )}
                            >
                              {country.flag} {country.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {createStep === 6 ? (
              <div className="w-full max-w-3xl">
                <p className={cn("mb-4 text-sm", pageTone.muted)}>Select one or more languages</p>
                {isCountryDirectoryLoading ? (
                  <p className={cn("text-sm", pageTone.muted)}>Loading languages...</p>
                ) : (
                  <>
                    <Input
                      value={languageSearch}
                      onChange={(event) => setLanguageSearch(event.target.value)}
                      placeholder="Search language"
                      className={cn(
                        "mb-4 h-11 rounded-xl",
                        theme === "light"
                          ? "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                          : "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500",
                      )}
                    />
                    {filteredLanguageOptions.length === 0 ? (
                      <p className={cn("text-sm", pageTone.muted)}>No languages found for this search.</p>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {filteredLanguageOptions.map((language) => {
                          const selected = newLanguages.includes(language);
                          return (
                            <button
                              key={language}
                              type="button"
                              onClick={() => toggleSelection(language, newLanguages, setNewLanguages)}
                              className={cn(
                                "px-1 pb-1 text-sm transition border-b-2",
                                selected
                                  ? "border-primary text-primary"
                                  : theme === "light"
                                    ? "border-transparent text-slate-600 hover:text-slate-900"
                                    : "border-transparent text-slate-400 hover:text-slate-100",
                              )}
                            >
                              {language}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {createStep === 7 ? (
              <div className="w-full max-w-3xl space-y-5">
                <Textarea
                  rows={4}
                  value={newBusinessPrompt}
                  onChange={(event) => setNewBusinessPrompt(event.target.value)}
                  placeholder="Type extra business instructions (optional)"
                  className={cn(
                    "resize-none border-0 border-b-2 rounded-none bg-transparent px-0 text-center text-base shadow-none focus-visible:ring-0",
                    theme === "light" ? "border-slate-300 text-slate-900 placeholder:text-slate-400" : "border-slate-700 text-slate-100 placeholder:text-slate-500",
                  )}
                />

                <div className={cn("rounded-2xl border p-4 text-left", pageTone.soft)}>
                  <input
                    ref={createMediaInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.xml,.html,.xls,.xlsx,.pptx,.md,.rtf,.webp"
                    multiple
                    className="hidden"
                    onChange={handleCreateMediaSelect}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={cn("text-sm", pageTone.muted)}>
                      Add menu images, deal banners, or product media. These will be saved in agent workspace assets.
                    </p>
                    <Button type="button" variant="outline" className={pageTone.outlineBtn} onClick={() => createMediaInputRef.current?.click()}>
                      Add Media
                    </Button>
                  </div>

                  {newMediaAssets.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {newMediaAssets.map((asset) => (
                        <div key={asset.id} className={cn("rounded-xl border p-3", pageTone.panel)}>
                          <div className="flex items-start gap-3">
                            {asset.mimeType.startsWith("image/") ? (
                              <img src={asset.dataUrl} alt={asset.fileName} className="h-14 w-14 rounded-lg object-cover" />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-lg border text-xs">FILE</div>
                            )}
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="truncate text-sm font-medium">{asset.fileName}</p>
                              <Input
                                value={asset.description}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setNewMediaAssets((prev) =>
                                    prev.map((entry) =>
                                      entry.id === asset.id ? { ...entry, description: value } : entry,
                                    ),
                                  );
                                }}
                                placeholder="Description (required) — e.g. Ramadan menu front page"
                                className={settingsInputTone}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              className={pageTone.ghostBtn}
                              onClick={() => {
                                setNewMediaAssets((prev) => prev.filter((entry) => entry.id !== asset.id));
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between py-2">
            <Button
              type="button"
              variant="ghost"
              className={pageTone.ghostBtn}
              onClick={() => setCreateStep((prev) => Math.max(0, prev - 1))}
              disabled={createStep === 0 || isBusy}
            >
              Back
            </Button>

            {createStep < 7 ? (
              <Button
                type="button"
                onClick={() => setCreateStep((prev) => Math.min(7, prev + 1))}
                disabled={!isStepValid || isBusy}
              >
                Next
              </Button>
            ) : (
              <Button onClick={handleCreateAgent} disabled={isBusy || !isStepValid}>
                Create Agent
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-screen overflow-hidden", pageTone.shell)}>
      <div className="mx-auto flex h-full max-w-[1480px] flex-col lg:flex-row">
        {isSidebarOpen ? (
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          />
        ) : null}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[85%] max-w-xs border-r p-4 transition-transform duration-200 lg:static lg:z-auto lg:w-80 lg:max-w-none lg:translate-x-0 lg:border-b-0 lg:p-5",
            pageTone.panel,
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-full flex-col gap-4">
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="flex items-center justify-between">
                <h1 className={cn("text-lg font-semibold", pageTone.strong)}>Metallm Business Agent</h1>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className={cn("rounded-lg border p-2 lg:hidden", pageTone.soft)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!isWhatsAppConnected ? (
                <div className={cn("rounded-2xl border border-amber-300/60 bg-amber-50 px-3 py-3 dark:border-amber-500/40 dark:bg-amber-500/10") }>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">WhatsApp not connected</p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Please connect your WhatsApp to start automations.</p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2 h-8 rounded-lg"
                    onClick={() => {
                      setTab("settings");
                      setIsSidebarOpen(false);
                    }}
                  >
                    Open Settings
                  </Button>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTab("chat")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                    tab === "chat" ? "border-primary bg-primary/10 text-primary" : pageTone.soft,
                  )}
                >
                  <MessageSquare className="h-4 w-4" />
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setTab("settings")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                    tab === "settings" ? "border-primary bg-primary/10 text-primary" : pageTone.soft,
                  )}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <p className={cn("text-xs uppercase tracking-[0.2em]", pageTone.muted)}>Sessions</p>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {[...agentChatSessions]
                    .sort((a, b) => {
                      const aMain = isMainChatSession(a.key, activeSessionId);
                      const bMain = isMainChatSession(b.key, activeSessionId);
                      if (aMain !== bMain) {
                        return aMain ? -1 : 1;
                      }
                      const aBootstrap = isBootstrapChatSession(a.key, activeSessionId);
                      const bBootstrap = isBootstrapChatSession(b.key, activeSessionId);
                      if (aBootstrap !== bBootstrap) {
                        return aBootstrap ? -1 : 1;
                      }
                      const left = a.updatedAtMs ?? 0;
                      const right = b.updatedAtMs ?? 0;
                      if (right !== left) {
                        return right - left;
                      }
                      return a.key.localeCompare(b.key);
                    })
                    .map((chatSession) => {
                    const isActive = chatSession.key === activeChatSessionKey;
                    const sessionLabel = resolveSidebarSessionLabel(chatSession, activeSessionId);
                    const isProtectedSession = isControlChatSession(chatSession.key, activeSessionId);
                    return (
                      <button
                        key={chatSession.key}
                        type="button"
                        onClick={() => {
                          setActiveChatSessionKey(chatSession.key);
                          setTab("chat");
                          setIsSidebarOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                          isActive ? "border-primary bg-primary/10" : pageTone.soft,
                        )}
                        >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{sessionLabel}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!isProtectedSession && !isBusy) {
                              void handleDeleteChatSession(chatSession.key);
                            }
                          }}
                          disabled={isProtectedSession || isBusy}
                          title={isProtectedSession ? "Main and Bootstrap sessions are pinned" : "Delete session"}
                          className={cn(
                            "ml-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border transition",
                            isProtectedSession || isBusy
                              ? "cursor-not-allowed opacity-40"
                              : "hover:bg-red-500/10 hover:text-red-600",
                            pageTone.soft,
                          )}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </button>
                    );
                    })}
                  {agentChatSessions.length === 0 ? (
                    <p className={cn("rounded-2xl border px-4 py-3 text-xs", pageTone.muted)}>No chat sessions yet.</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => {
                  void handleOpenProfile();
                }}
                className={cn("flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left", pageTone.soft)}
              >
                <UserCircle2 className="h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Signed in account</span>
                  <span className={cn("block truncate text-xs", pageTone.muted)}>{user.email ?? "-"}</span>
                </span>
              </button>
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-5 md:p-8">
          {currentSubscription?.isOnTrial ? (
            <div className="mb-3 rounded-xl border border-sky-300/70 bg-sky-50 px-3 py-2 text-sky-900 dark:border-sky-400/40 dark:bg-sky-500/10 dark:text-sky-100">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">You are on trial period</p>
                  <p className="mt-1 text-xs">
                    {currentSubscription.remainingMessages} of {currentSubscription.limitMessages} messages remaining
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-lg bg-[#25D366] text-white hover:bg-[#128C7E]"
                  onClick={() => setShowPricingModal(true)}
                >
                  Upgrade
                </Button>
              </div>
            </div>
          ) : null}

          {!isWhatsAppConnected ? (
            <div className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">WhatsApp is not connected. Please connect your WhatsApp.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn("h-8 rounded-lg", pageTone.outlineBtn)}
                  onClick={() => setTab("settings")}
                >
                  Go to Settings
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl border", pageTone.soft)}
              aria-label="Open sessions sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className={cn("truncate text-sm font-semibold", pageTone.strong)}>{activeDisplayLabel}</p>
              <p className={cn("truncate text-xs", pageTone.muted)}>{activeSession?.status === "linked" ? "WhatsApp linked" : "WhatsApp pending"}</p>
            </div>
          </div>

          {tab === "chat" ? (
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden">
                <div className="border-b border-black/5 pb-3 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className={cn("mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl", pageTone.strong)}>
                        {activeDisplayLabel}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs", pageTone.soft)}>
                        <Sparkles className="h-3.5 w-3.5" />
                        {activeSession?.status === "linked" ? "WhatsApp linked" : "WhatsApp pending"}
                      </span>
                      <span className={cn("inline-flex items-center rounded-full border px-3 py-1.5 text-xs", pageTone.soft)}>
                        {chatMessages.length} messages
                      </span>
                    </div>
                  </div>

                </div>

                <div ref={chatScrollRef} className="flex-1 space-y-5 overflow-y-auto px-1 py-6">
                  {isChatLoading ? (
                    <div className="space-y-4 px-1 py-2">
                      <div className="flex justify-end">
                        <div className="h-12 w-[52%] animate-pulse rounded-[24px] bg-slate-200 dark:bg-slate-700" />
                      </div>
                      <div className="flex justify-start">
                        <div className="h-16 w-[68%] animate-pulse rounded-[24px] bg-slate-200 dark:bg-slate-700" />
                      </div>
                      <div className="flex justify-end">
                        <div className="h-12 w-[44%] animate-pulse rounded-[24px] bg-slate-200 dark:bg-slate-700" />
                      </div>
                    </div>
                  ) : null}

                  {!isChatLoading && chatMessages.length === 0 ? (
                    <div className="mx-auto flex max-w-xl flex-col items-center justify-center px-4 py-20 text-center">
                      <div className={cn("mb-5 rounded-full border p-4", pageTone.soft)}>
                        <MessageSquare className="h-6 w-6" />
                      </div>
                      <p className="text-xl font-semibold">Give instruction to your agent</p>
                      <p className={cn("mt-2 text-sm leading-6", pageTone.muted)}>
                        Ask for customer replies, support templates, lead follow-ups, summaries, or next-step suggestions.
                      </p>
                    </div>
                  ) : null}

                  {chatMessages.map((message, idx) => (
                    <div key={`${message.role}-${idx}`} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                      <div className="max-w-[820px]">
                        <p className={cn("mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]", pageTone.muted)}>
                          {message.role === "user" ? "Customer" : activeSession?.name || "Agent"}
                        </p>
                        <div
                          className={cn(
                            "rounded-[24px] px-5 py-4 text-base font-medium leading-7",
                            message.role === "user"
                              ? theme === "dark"
                                ? "border border-cyan-300/50 bg-cyan-500/25 text-white"
                                : "border border-primary/30 bg-primary/25 text-slate-950"
                              : theme === "dark"
                                ? "bg-slate-800/70 text-slate-50"
                                : "bg-slate-100/90 text-slate-900",
                          )}
                        >
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                        {message.timestampLabel ? (
                          <p className={cn("mt-2 px-1 text-[11px]", pageTone.muted)}>{message.timestampLabel}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {isChatSending ? (
                    <div className="flex justify-start">
                      <div className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs", pageTone.soft)}>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Agent is typing...
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-black/5 pt-5 dark:border-white/10">
                  {chatAttachments.length > 0 ? (
                    <div className="mx-auto mb-3 flex w-full max-w-4xl flex-wrap gap-2">
                      {chatAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className={cn("group relative h-16 w-16 overflow-hidden rounded-xl border", pageTone.soft)}
                        >
                          <img src={attachment.dataUrl} alt={attachment.fileName} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            aria-label="Remove attachment"
                            onClick={() => {
                              setChatAttachments((prev) => prev.filter((entry) => entry.id !== attachment.id));
                            }}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className={cn("mx-auto flex w-full max-w-4xl items-end gap-2 rounded-[22px] border px-3 py-2 shadow-sm sm:gap-3 sm:rounded-[28px] sm:px-4 sm:py-3", pageTone.panel)}>
                    <input
                      ref={chatFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleChatFileSelect}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn("h-10 w-10 rounded-xl", pageTone.ghostBtn)}
                      onClick={() => chatFileInputRef.current?.click()}
                      disabled={isMessageLimitReached || isChatSending || !activeSession || !activeChatSessionKey}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Textarea
                      rows={2}
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder="Give instruction to your agent..."
                      className="min-h-[52px] border-0 bg-transparent text-sm shadow-none focus-visible:ring-0 sm:min-h-[56px] sm:text-base"
                      disabled={isMessageLimitReached}
                    />
                    <Button
                      onClick={handleSendChat}
                      disabled={
                        isMessageLimitReached ||
                        isChatSending ||
                        (!chatInput.trim() && chatAttachments.length === 0)
                      }
                      className="h-11 rounded-xl px-4 sm:h-12 sm:rounded-2xl sm:px-5"
                    >
                      {isChatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                    </Button>
                  </div>

                  {isMessageLimitReached ? (
                    <div className="mx-auto mt-2 w-full max-w-4xl rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                      Message limit reached for your {currentSubscription?.planName || "current"} plan. Upgrade to continue.
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {tab === "settings" && activeSession ? (
            <div className="h-full space-y-5 overflow-y-auto pr-1">
              <Card className={cn("border", pageTone.panel)}>
                <CardHeader>
                  <CardTitle className={cn("flex items-center gap-2 text-xl", settingsHeadingTone)}>
                    <Power className="h-5 w-5" />
                    Agent Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className={settingsHeadingTone}>Agent Name</Label>
                    <Input
                      value={activeSession.name}
                      onChange={(event) => updateSessionDraft((session) => ({ ...session, name: event.target.value }))}
                      className={settingsInputTone}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className={settingsHeadingTone}>WhatsApp Number</Label>
                    <Input
                      value={activeSession.phone}
                      onChange={(event) =>
                        updateSessionDraft((session) => ({ ...session, phone: normalizePhone(event.target.value) }))
                      }
                      className={settingsInputTone}
                    />
                  </div>

                  <div className={cn("rounded-lg border p-3", pageTone.soft)}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className={cn("font-medium", settingsHeadingTone)}>
                          <Phone className="mr-1.5 inline h-4 w-4" />
                          WhatsApp Accounts
                        </p>
                        <p className={cn("text-sm", settingsBodyTone)}>
                          {(activeSession.accounts?.length || 1)} / {activeSession.maxAccounts || 1} accounts
                        </p>
                      </div>
                      {(activeSession.maxAccounts || 1) > (activeSession.accounts?.length || 1) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn("rounded-xl", pageTone.outlineBtn)}
                          disabled={isBusy}
                          onClick={async () => {
                            try {
                              setIsBusy(true);
                              const res = await apiRequest("POST", `/api/business-agent/sessions/${activeSession.id}/accounts`);
                              const data = await res.json();
                              if (data.ok) {
                                toast({ title: "Account added", description: "New WhatsApp account created. Connect it via QR." });
                                await refreshSessionList();
                                const updated = await apiRequest("GET", `/api/business-agent/sessions/${activeSession.id}`);
                                const updatedSession = await updated.json();
                                setActiveSession(updatedSession);
                              } else {
                                toast({ title: "Cannot add", description: data.reason === "account-limit-reached" ? `Your ${data.planCode} plan allows up to ${data.maxAccounts} accounts.` : "Failed to add account.", variant: "destructive" });
                              }
                            } catch {
                              toast({ title: "Error", description: "Failed to add WhatsApp account.", variant: "destructive" });
                            } finally {
                              setIsBusy(false);
                            }
                          }}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Add Account
                        </Button>
                      ) : (activeSession.maxAccounts || 1) <= 1 ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 rounded-lg bg-[#25D366] text-white hover:bg-[#128C7E]"
                          onClick={() => setShowPricingModal(true)}
                        >
                          Upgrade for more
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      {(activeSession.accounts && activeSession.accounts.length > 0 ? activeSession.accounts : [{ accountId: "", isPrimary: true, status: activeSession.status, phone: activeSession.phone }]).map((acc, idx) => (
                        <div key={acc.accountId || idx} className={cn("flex items-center justify-between rounded-lg border p-2.5", pageTone.soft)}>
                          <div className="flex items-center gap-2 min-w-0">
                            {acc.status === "linked" ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                            ) : (
                              <QrCode className="h-4 w-4 shrink-0 text-amber-500" />
                            )}
                            <div className="min-w-0">
                              <p className={cn("text-sm font-medium truncate", pageTone.strong)}>
                                {acc.phone || (acc.isPrimary ? "Primary Account" : "New Account")}
                                {acc.isPrimary && <span className={cn("ml-1.5 text-xs", pageTone.muted)}>(primary)</span>}
                              </p>
                              <p className={cn("text-xs", pageTone.muted)}>
                                {acc.status === "linked" ? "Connected" : "Not connected"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {acc.isPrimary ? (
                              acc.status !== "linked" ? (
                                <Button onClick={handleConnectWhatsApp} disabled={isBusy} size="sm" className="h-7 rounded-lg text-xs">
                                  Connect
                                </Button>
                              ) : (
                                <>
                                  <Button onClick={handleLogoutWhatsApp} disabled={isBusy} size="sm" variant="outline" className={cn("h-7 rounded-lg text-xs", pageTone.outlineBtn)}>
                                    Logout
                                  </Button>
                                  <Button onClick={handleChangeWhatsApp} disabled={isBusy} size="sm" className="h-7 rounded-lg text-xs">
                                    Change
                                  </Button>
                                </>
                              )
                            ) : (
                              <>
                                {acc.status !== "linked" ? (
                                  <Button
                                    size="sm"
                                    className="h-7 rounded-lg text-xs"
                                    disabled={isBusy}
                                    onClick={async () => {
                                      try {
                                        setIsBusy(true);
                                        const res = await apiRequest("POST", `/api/business-agent/sessions/${activeSession.id}/accounts/${acc.accountId}/qr`);
                                        const data = await res.json();
                                        if (data.qr) {
                                          setQrPreview(typeof data.qr === "string" ? data.qr : null);
                                          setShowQrPanel(true);
                                          toast({ title: "QR ready", description: "Scan this QR in WhatsApp → Linked Devices." });
                                        }
                                      } catch {
                                        toast({ title: "Error", description: "Failed to get QR code.", variant: "destructive" });
                                      } finally {
                                        setIsBusy(false);
                                      }
                                    }}
                                  >
                                    Connect
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={cn("h-7 w-7 rounded-lg p-0 text-red-500 hover:bg-red-50 hover:text-red-600", theme === "light" ? "border-red-300 bg-white" : "")}
                                  disabled={isBusy}
                                  onClick={async () => {
                                    if (!confirm("Remove this WhatsApp account?")) return;
                                    try {
                                      setIsBusy(true);
                                      await apiRequest("DELETE", `/api/business-agent/sessions/${activeSession.id}/accounts/${acc.accountId}`);
                                      toast({ title: "Removed", description: "WhatsApp account removed." });
                                      const updated = await apiRequest("GET", `/api/business-agent/sessions/${activeSession.id}`);
                                      const updatedSession = await updated.json();
                                      setActiveSession(updatedSession);
                                    } catch {
                                      toast({ title: "Error", description: "Failed to remove account.", variant: "destructive" });
                                    } finally {
                                      setIsBusy(false);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {activeSession.voiceEnabled ? (
                    <div className={cn("flex items-center gap-2 rounded-lg border p-3", pageTone.soft)}>
                      <Mic className="h-5 w-5 text-emerald-500" />
                      <div>
                        <p className={cn("font-medium", settingsHeadingTone)}>Voice Messages</p>
                        <p className={cn("text-sm", settingsBodyTone)}>Speech-to-text is active. Customers can send voice messages and your agent will understand them.</p>
                      </div>
                    </div>
                  ) : (
                    <div className={cn("flex items-center justify-between rounded-lg border p-3", pageTone.soft)}>
                      <div className="flex items-center gap-2">
                        <Mic className="h-5 w-5 text-slate-400" />
                        <div>
                          <p className={cn("font-medium", settingsHeadingTone)}>Voice Messages</p>
                          <p className={cn("text-sm", settingsBodyTone)}>Upgrade to Pro or Enterprise to enable voice message support.</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-lg bg-[#25D366] text-white hover:bg-[#128C7E]"
                        onClick={() => setShowPricingModal(true)}
                      >
                        Upgrade
                      </Button>
                    </div>
                  )}

                  {currentSubscription ? (
                    <div className={cn("rounded-lg border p-3", pageTone.soft)}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className={cn("font-medium", settingsHeadingTone)}>Message Tracking</p>
                          <p className={cn("text-sm", settingsBodyTone)}>
                            Plan: {currentSubscription.planName} • {currentSubscription.usedMessages}/{currentSubscription.limitMessages} used
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-medium", settingsBodyTone)}>
                            {currentSubscription.remainingMessages} remaining
                          </span>
                          {currentSubscription.isOnTrial || !currentSubscription.isPaid ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 rounded-lg bg-[#25D366] text-white hover:bg-[#128C7E]"
                              onClick={() => setShowPricingModal(true)}
                            >
                              Upgrade
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            currentSubscription.remainingMessages <= 0 ? "bg-red-500" : "bg-[#25D366]",
                          )}
                          style={{ width: `${Math.max(0, Math.min(100, currentSubscription.usagePercent))}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className={cn("flex items-center justify-between rounded-lg border p-3", pageTone.soft)}>
                    <div>
                      <p className={cn("font-medium", settingsHeadingTone)}>Theme</p>
                      <p className={cn("text-sm", settingsBodyTone)}>Switch between light and dark workspace.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Sun className="h-4 w-4" />
                      <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
                      <Moon className="h-4 w-4" />
                    </div>
                  </div>

                  <div className={cn("flex items-center justify-between rounded-lg border p-3", pageTone.soft)}>
                    <div>
                      <p className={cn("font-medium", settingsHeadingTone)}>Agent On/Off</p>
                      <p className={cn("text-sm", settingsBodyTone)}>Turn automated replies on or off.</p>
                    </div>
                    <Switch
                      checked={activeSession.enabled}
                      onCheckedChange={(checked) => {
                        void handleToggleAgentEnabled(checked);
                      }}
                      disabled={isBusy}
                    />
                  </div>

                  <div className={cn("flex items-center justify-between rounded-lg border p-3", pageTone.soft)}>
                    <div>
                      <p className={cn("font-medium", settingsHeadingTone)}>Human Takeover</p>
                      <p className={cn("text-sm", settingsBodyTone)}>Pause bot replies after human responds.</p>
                    </div>
                    <Switch
                      checked={activeSession.humanTakeoverEnabled}
                      onCheckedChange={(checked) =>
                        updateSessionDraft((session) => ({ ...session, humanTakeoverEnabled: checked }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className={cn("flex items-center gap-2", settingsHeadingTone)}>
                      <Clock3 className="h-4 w-4" />
                      Takeover Cooldown (seconds)
                    </Label>
                    <Input
                      type="number"
                      min={60}
                      step={60}
                      value={activeSession.cooldownSeconds}
                      onChange={(event) =>
                        updateSessionDraft((session) => ({
                          ...session,
                          cooldownSeconds: Math.max(60, Number(event.target.value) || 60),
                        }))
                      }
                      className={settingsInputTone}
                    />
                  </div>

                  <div className={cn("flex items-center justify-between rounded-lg border p-3", pageTone.soft)}>
                    <div>
                      <p className={cn("font-medium", settingsHeadingTone)}>Read Receipts</p>
                      <p className={cn("text-sm", settingsBodyTone)}>Send blue ticks to customers when messages are read.</p>
                    </div>
                    <Switch
                      checked={activeSession.readReceiptsEnabled !== false}
                      onCheckedChange={(checked) => updateSessionDraft((session) => ({ ...session, readReceiptsEnabled: checked }))}
                    />
                  </div>

                  <div className={cn("rounded-lg border p-3", pageTone.soft)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={cn("font-medium", settingsHeadingTone)}>Disappearing Messages</p>
                        <p className={cn("text-sm", settingsBodyTone)}>Auto-delete messages after a set time period.</p>
                      </div>
                      <Switch
                        checked={activeSession.disappearingMessagesEnabled === true}
                        onCheckedChange={(checked) =>
                          updateSessionDraft((session) => ({
                            ...session,
                            disappearingMessagesEnabled: checked,
                            disappearingMessagesDuration: checked ? (session.disappearingMessagesDuration || 86400) : session.disappearingMessagesDuration,
                          }))
                        }
                      />
                    </div>
                    {activeSession.disappearingMessagesEnabled && (
                      <div className="mt-3 flex gap-2">
                        {[
                          { label: "24 hours", value: 86400 },
                          { label: "7 days", value: 604800 },
                          { label: "90 days", value: 7776000 },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              updateSessionDraft((session) => ({
                                ...session,
                                disappearingMessagesDuration: opt.value,
                              }))
                            }
                            className={cn(
                              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                              activeSession.disappearingMessagesDuration === opt.value
                                ? "border-primary bg-primary text-primary-foreground"
                                : cn("hover:bg-muted", pageTone.soft),
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button onClick={handleSaveControls} disabled={isBusy}>
                    <Save className="mr-2 h-4 w-4" />
                    Save Settings
                  </Button>

                  <div className={cn("rounded-2xl border border-red-200/70 p-4 dark:border-red-900/70", pageTone.soft)}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-red-600 dark:text-red-300">Delete Agent</p>
                        <p className={cn("text-sm", pageTone.muted)}>
                          Unlink WhatsApp, delete this agent&apos;s sessions, and remove its saved data.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleDeleteAgent}
                        disabled={isBusy}
                        className="rounded-xl"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Agent
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={cn("border", pageTone.panel)}>
                <CardHeader>
                  <CardTitle className={cn("flex items-center gap-2 text-xl", settingsHeadingTone)}>
                    <Bot className="h-5 w-5" />
                    Agent Files
                  </CardTitle>
                  <CardDescription className={settingsBodyTone}>
                    {!canEditAgentFilesFromCurrentSession
                      ? "Switch chat session to Main or Bootstrap to update agent files."
                      : "Edit files from the OpenClaw workspace. WhatsApp linking is not required for file prep."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant={activeFile === "identityMd" ? "default" : "outline"} className={activeFile !== "identityMd" ? pageTone.outlineBtn : ""} onClick={() => setActiveFile("identityMd")}>IDENTITY.md</Button>
                    <Button type="button" size="sm" variant={activeFile === "soulMd" ? "default" : "outline"} className={activeFile !== "soulMd" ? pageTone.outlineBtn : ""} onClick={() => setActiveFile("soulMd")}>SOUL.md</Button>
                    <Button type="button" size="sm" variant={activeFile === "agentsMd" ? "default" : "outline"} className={activeFile !== "agentsMd" ? pageTone.outlineBtn : ""} onClick={() => setActiveFile("agentsMd")}>AGENTS.md</Button>
                    <Button type="button" size="sm" variant={activeFile === "userMd" ? "default" : "outline"} className={activeFile !== "userMd" ? pageTone.outlineBtn : ""} onClick={() => setActiveFile("userMd")}>USER.md</Button>
                    <Button type="button" size="sm" variant={activeFile === "bootstrapMd" ? "default" : "outline"} className={activeFile !== "bootstrapMd" ? pageTone.outlineBtn : ""} onClick={() => setActiveFile("bootstrapMd")}>BOOTSTRAP.md</Button>
                    <Button type="button" size="sm" variant={activeFile === "toolsMd" ? "default" : "outline"} className={activeFile !== "toolsMd" ? pageTone.outlineBtn : ""} onClick={() => setActiveFile("toolsMd")}>TOOLS.md</Button>
                    <Button type="button" size="sm" variant={activeFile === "productsMd" ? "default" : "outline"} className={activeFile !== "productsMd" ? pageTone.outlineBtn : ""} onClick={() => setActiveFile("productsMd")}>PRODUCTS.md</Button>
                  </div>

                  <Textarea
                    rows={10}
                    value={activeSession.files[activeFile]}
                    onChange={(event) =>
                      updateSessionDraft((session) => ({
                        ...session,
                        files: {
                          ...session.files,
                          [activeFile]: event.target.value,
                        },
                      }))
                    }
                    className={settingsInputTone}
                  />

                  <Button
                    onClick={handleSaveFile}
                    disabled={isBusy || !canEditAgentFilesFromCurrentSession}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save File
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </main>

        {showPricingModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className={cn("w-full max-w-6xl border rounded-[24px]", pageTone.panel)}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className={cn("text-2xl", pageTone.strong)}>Simple, transparent pricing.</CardTitle>
                    <CardDescription className={pageTone.muted}>
                      Need more messages? Add 1,000 messages for $10.
                    </CardDescription>
                  </div>
                  <Button type="button" variant="ghost" className={pageTone.ghostBtn} onClick={() => setShowPricingModal(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {BUSINESS_PRICING_PLANS.map((plan) => {
                    const isCurrentPlan = currentSubscription?.planCode === plan.code && currentSubscription?.isPaid;
                    return (
                      <div
                        key={plan.code}
                        className={cn(
                          "rounded-2xl border p-5",
                          plan.dark
                            ? "border-slate-800 bg-slate-900 text-white"
                            : plan.highlighted
                              ? "border-[#25D366] bg-white shadow-[0_10px_30px_rgba(37,211,102,0.15)]"
                              : "border-slate-200 bg-white",
                        )}
                      >
                        <div className="mb-3">
                          <p className={cn("text-lg font-bold", plan.dark ? "text-white" : "text-slate-900")}>{plan.name}</p>
                          <p className={cn("text-xs", plan.dark ? "text-slate-300" : "text-slate-500")}>{plan.description}</p>
                        </div>
                        <div className="mb-4 flex items-end gap-1">
                          <span className={cn("text-3xl font-extrabold", plan.dark ? "text-white" : "text-slate-900")}>
                            ${plan.priceMonthly}
                          </span>
                          <span className={cn("mb-1 text-sm", plan.dark ? "text-slate-300" : "text-slate-500")}>/month</span>
                        </div>
                        <ul className="mb-5 space-y-2">
                          {plan.features.map((feature) => (
                            <li key={feature} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#25D366]" />
                              <span className={plan.dark ? "text-slate-200" : "text-slate-700"}>{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <Button
                          type="button"
                          className={cn(
                            "w-full",
                            plan.highlighted
                              ? "bg-[#25D366] text-white hover:bg-[#128C7E]"
                              : plan.dark
                                ? "bg-white text-slate-900 hover:bg-slate-200"
                                : "bg-white border border-slate-300 text-slate-900 hover:bg-slate-50",
                          )}
                          variant={plan.highlighted || plan.dark ? "default" : "outline"}
                          onClick={() => {
                            void handleStartUpgradeCheckout(plan.code);
                          }}
                          disabled={isUpgradeLoading || isCurrentPlan}
                        >
                          {isCurrentPlan
                            ? "Current Plan"
                            : isUpgradeLoading && checkoutPlan === plan.code
                              ? "Opening checkout..."
                              : "Upgrade"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {showQrPanel ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className={cn("w-full max-w-lg border rounded-[24px]", pageTone.panel)}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <QrCode className="h-5 w-5" />
                  Scan WhatsApp QR
                </CardTitle>
                <CardDescription className={pageTone.muted}>
                  Open WhatsApp → Linked Devices → Link a Device and scan this QR.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative flex min-h-40 items-center justify-center rounded-lg border border-dashed p-3">
                  {isQrRefreshing && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60 dark:bg-black/40">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                  {qrPreview?.startsWith("data:image/") ? (
                    <img src={qrPreview} alt="WhatsApp QR Code" className="max-h-72 rounded-md" />
                  ) : (
                    <span className={cn("max-h-72 overflow-auto whitespace-pre-wrap text-xs font-mono", pageTone.muted)}>
                      {qrPreview || "Press Connect WhatsApp to generate QR."}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleCheckLinked} disabled={isBusy}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Check Linked
                  </Button>
                  <Button variant="outline" className={pageTone.outlineBtn} disabled={isBusy || isQrRefreshing} onClick={handleConnectWhatsApp}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    New QR
                  </Button>
                  <Button variant="ghost" className={pageTone.ghostBtn} onClick={() => setShowQrPanel(false)}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {showProfilePanel ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className={cn("w-full max-w-2xl border rounded-[24px]", pageTone.panel)}>
              <CardHeader>
                <CardTitle className={cn("text-xl", pageTone.strong)}>Business Profile</CardTitle>
                <CardDescription className={pageTone.muted}>
                  Saved onboarding details for this business agent.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isProfileLoading ? (
                  <div className={cn("inline-flex items-center gap-2 text-sm", pageTone.muted)}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading profile...
                  </div>
                ) : null}

                {!isProfileLoading && !activeProfile ? (
                  <p className={cn("text-sm", pageTone.muted)}>No saved business profile found for this agent.</p>
                ) : null}

                {!isProfileLoading && activeProfile ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className={cn("rounded-xl border p-3", pageTone.soft)}>
                      <p className={cn("text-xs uppercase tracking-[0.15em]", pageTone.muted)}>Business Name</p>
                      <p className={cn("mt-1 text-sm font-semibold", pageTone.strong)}>{activeProfile.businessName}</p>
                    </div>
                    <div className={cn("rounded-xl border p-3", pageTone.soft)}>
                      <p className={cn("text-xs uppercase tracking-[0.15em]", pageTone.muted)}>Business Type</p>
                      <p className={cn("mt-1 text-sm font-semibold", pageTone.strong)}>{activeProfile.businessType}</p>
                    </div>
                    <div className={cn("rounded-xl border p-3", pageTone.soft)}>
                      <p className={cn("text-xs uppercase tracking-[0.15em]", pageTone.muted)}>WhatsApp Number</p>
                      <p className={cn("mt-1 text-sm font-semibold", pageTone.strong)}>{activeProfile.phone || "-"}</p>
                    </div>
                    <div className={cn("rounded-xl border p-3", pageTone.soft)}>
                      <p className={cn("text-xs uppercase tracking-[0.15em]", pageTone.muted)}>Email</p>
                      <p className={cn("mt-1 text-sm font-semibold", pageTone.strong)}>{activeProfile.email || "-"}</p>
                    </div>
                    <div className={cn("rounded-xl border p-3 sm:col-span-2", pageTone.soft)}>
                      <p className={cn("text-xs uppercase tracking-[0.15em]", pageTone.muted)}>Website</p>
                      <p className={cn("mt-1 text-sm font-semibold break-all", pageTone.strong)}>{activeProfile.website || "-"}</p>
                    </div>
                    <div className={cn("rounded-xl border p-3", pageTone.soft)}>
                      <p className={cn("text-xs uppercase tracking-[0.15em]", pageTone.muted)}>Regions</p>
                      <p className={cn("mt-1 text-sm font-semibold", pageTone.strong)}>{activeProfile.regions.join(", ") || "-"}</p>
                    </div>
                    <div className={cn("rounded-xl border p-3", pageTone.soft)}>
                      <p className={cn("text-xs uppercase tracking-[0.15em]", pageTone.muted)}>Languages</p>
                      <p className={cn("mt-1 text-sm font-semibold", pageTone.strong)}>{activeProfile.languages.join(", ") || "-"}</p>
                    </div>
                  </div>
                ) : null}

                <div className="pt-2">
                  <Button variant="ghost" className={pageTone.ghostBtn} onClick={() => setShowProfilePanel(false)}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
