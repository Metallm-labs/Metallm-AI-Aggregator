import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useCancelSubscription, useChangeSubscriptionPlan, useReactivateSubscription, useSubscriptionManage, useSubscriptionUsage } from "@/hooks/use-credits";
import { useToast } from "@/hooks/use-toast";
import { BuyCreditsDialog } from "@/components/BuyCredits";
import { ModelSettings } from "@/components/ModelSettings";
import type { ChatMode, DebateParticipant } from "@/components/ChatInput";
import type { UserPersonalization } from "@/hooks/use-personalization";
import type { UserMemorySection, UserMemoryPreference, UserMemoryItem } from "@/hooks/use-memory";
import { cn } from "@/lib/utils";
import { SUBSCRIPTION_MONTHLY_PRICE, SUBSCRIPTION_YEARLY_PRICE, type SubscriptionBillingPeriod } from "@shared/billing";
import {
  UserRound,
  Sparkles,
  SlidersHorizontal,
  MessageSquare,
  Shield,
  CreditCard,
  LogOut,
  Trash2,
  Send,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AvailableModel {
  id: string;
  displayName: string;
  role: string;
  iconUrl?: string;
  provider: string;
  tier?: 1 | 2 | 3;
}

type SettingsSection = "profile" | "billing" | "personalization" | "settings" | "feedback" | "account";

interface UserSettingsPanelProps {
  availableModels: AvailableModel[];
  currentChatMode: ChatMode;
  selectedMultiModelIds: string[];
  onMultiModelsChange: (ids: string[]) => void;
  multiEnhancerEnabled: boolean;
  onMultiEnhancerChange: (enabled: boolean) => void;
  debateParticipants: DebateParticipant[];
  onDebateConfigChange: (participants: DebateParticipant[]) => void;
  debateRounds: number;
  onDebateRoundsChange: (rounds: number) => void;
  showRolesWarning?: boolean;
  onSettingsSaved?: () => void;
  personalization: UserPersonalization;
  onPersonalizationFieldChange: (field: keyof UserPersonalization, value: string) => void;
  onSavePersonalization: () => Promise<boolean>;
  onResetPersonalization: () => void;
  onClearPersonalization: () => Promise<boolean>;
  personalizationHasChanges: boolean;
  personalizationIsLoading: boolean;
  personalizationIsSaving: boolean;
  memory: {
    preferences: UserMemoryPreference;
    summary: string;
    sections: UserMemorySection[];
    memories: UserMemoryItem[];
  };
  memoryIsLoading: boolean;
  memoryIsSaving: boolean;
  onMemoryEnabledChange: (enabled: boolean) => Promise<boolean>;
  onDeleteMemory: (memoryId: number) => Promise<boolean>;
  onClearAllMemory: () => Promise<boolean>;
}

const SECTION_META: Array<{
  id: SettingsSection;
  title: string;
  description: string;
  icon: JSX.Element;
}> = [
  {
    id: "profile",
    title: "Profile",
    description: "Basic account identity and access details.",
    icon: <UserRound className="w-4 h-4" />,
  },
  {
    id: "billing",
    title: "Billing",
    description: "Manage your subscription, billing cycle, and cancellation.",
    icon: <CreditCard className="w-4 h-4" />,
  },
  {
    id: "personalization",
    title: "Personalization",
    description: "Tell models how to talk to you and what to know about you.",
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    id: "settings",
    title: "Settings",
    description: "Smart route, multi-model, and debate controls.",
    icon: <SlidersHorizontal className="w-4 h-4" />,
  },
  {
    id: "feedback",
    title: "Feedback",
    description: "Send ideas, bugs, and product suggestions.",
    icon: <MessageSquare className="w-4 h-4" />,
  },
  {
    id: "account",
    title: "Account",
    description: "Security, sign out, and destructive actions.",
    icon: <Shield className="w-4 h-4" />,
  },
];

function normalizeSettingsMode(mode: ChatMode): "single" | "multi" | "debate" {
  if (mode === "multi" || mode === "debate") return mode;
  return "single";
}

export function UserSettingsPanel({
  availableModels,
  currentChatMode,
  selectedMultiModelIds,
  onMultiModelsChange,
  multiEnhancerEnabled,
  onMultiEnhancerChange,
  debateParticipants,
  onDebateConfigChange,
  debateRounds,
  onDebateRoundsChange,
  showRolesWarning,
  onSettingsSaved,
  personalization,
  onPersonalizationFieldChange,
  onSavePersonalization,
  onResetPersonalization,
  onClearPersonalization,
  personalizationHasChanges,
  personalizationIsLoading,
  personalizationIsSaving,
  memory,
  memoryIsLoading,
  memoryIsSaving,
  onMemoryEnabledChange,
  onDeleteMemory,
  onClearAllMemory,
}: UserSettingsPanelProps) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [settingsMode, setSettingsMode] = useState<"single" | "multi" | "debate">(normalizeSettingsMode(currentChatMode));
  const [feedback, setFeedback] = useState("");
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBillingDialog, setShowBillingDialog] = useState(false);
  const { data: subscriptionUsage, isLoading: subscriptionUsageLoading } = useSubscriptionUsage({ enabled: !!user });
  const { data: subscriptionManage, isLoading: subscriptionManageLoading } = useSubscriptionManage({ enabled: !!user });
  const changeSubscriptionPlan = useChangeSubscriptionPlan();
  const cancelSubscription = useCancelSubscription();
  const reactivateSubscription = useReactivateSubscription();
  const subscription = subscriptionManage?.subscription ?? null;
  const subscriptionStatus = subscription?.status?.toLowerCase() ?? "";
  const hasActivePlan =
    (!!subscription && !["expired", "refunded"].includes(subscriptionStatus)) ||
    Number(user?.credits ?? 0) > 0;

  useEffect(() => {
    setSettingsMode(normalizeSettingsMode(currentChatMode));
  }, [currentChatMode]);

  const activeMeta = useMemo(
    () => SECTION_META.find((section) => section.id === activeSection) ?? SECTION_META[0],
    [activeSection]
  );

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return;
    setIsSendingFeedback(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
        credentials: "include",
      });
    } catch {
      // Thank the user regardless to keep the flow smooth.
    } finally {
      toast({ description: "Thank you for the feedback." });
      setFeedback("");
      setIsSendingFeedback(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      if (typeof window !== "undefined" && user?.id) {
        window.localStorage.removeItem(`metallm.personalization:${user.id}`);
        window.localStorage.removeItem(`metallm.lastSendMode:${user.id}`);
        window.localStorage.removeItem(`metallm.lastDirectModel:${user.id}`);
      }
      toast({ description: "Account deleted. Goodbye.", variant: "destructive" });
      setTimeout(() => logout(), 1200);
    } catch {
      toast({ description: "Failed to delete account. Please try again.", variant: "destructive" });
      setIsDeleting(false);
    }
  };

  const openBillingUrl = (url: string | null | undefined, fallbackMessage: string) => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    toast({ description: fallbackMessage, variant: "destructive" });
  };

  const handlePlanSwitch = async (billingPeriod: SubscriptionBillingPeriod) => {
    try {
      const result = await changeSubscriptionPlan.mutateAsync(billingPeriod);
      if (result.redirectUrl) {
        window.open(result.redirectUrl, "_blank", "noopener,noreferrer");
        return;
      }
      toast({ description: `Plan switched to ${billingPeriod}.` });
    } catch (error) {
      toast({ description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleCancelSubscription = async () => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Cancel this subscription at the end of the current billing period?");
      if (!confirmed) return;
    }

    try {
      const result = await cancelSubscription.mutateAsync();
      if (result.redirectUrl) {
        window.open(result.redirectUrl, "_blank", "noopener,noreferrer");
        toast({ description: "Opened billing portal. Cancellation status will update after webhook sync." });
        return;
      }
      toast({ description: "Cancellation request received. Status updates via webhook." });
    } catch (error) {
      toast({ description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      const result = await reactivateSubscription.mutateAsync();
      if (result.redirectUrl) {
        window.open(result.redirectUrl, "_blank", "noopener,noreferrer");
        toast({ description: "Opened billing portal. Reactivation status will update after webhook sync." });
        return;
      }
      toast({ description: "Reactivation request received. Status updates via webhook." });
    } catch (error) {
      toast({ description: (error as Error).message, variant: "destructive" });
    }
  };

  const renderSection = () => {
    if (activeSection === "profile") {
      return (
        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative h-20 w-20 overflow-hidden rounded-[26px] border border-white/10 bg-white/5">
                {user?.profileImageUrl ? (
                  <img
                    src={user.profileImageUrl}
                    alt={user.firstName || "User"}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      (e.currentTarget.nextSibling as HTMLElement).style.display = "flex";
                    }}
                  />
                ) : null}
                <div
                  className="h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-600 text-2xl font-bold text-white"
                  style={{ display: user?.profileImageUrl ? "none" : "flex" }}
                >
                  {user?.firstName?.[0]?.toUpperCase() ?? "U"}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-2xl font-semibold text-white">
                    {user?.firstName
                      ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
                      : "User"}
                  </p>
                  {hasActivePlan ? (
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-400/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_0_20px_rgba(96,165,250,0.35)]">
                      Pro
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{user?.email ?? "No email available"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/80">
                    Auth: {user?.authProvider ?? "Unknown"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/80">
                    {user?.isVerified ? "Verified" : "Not verified"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {hasActivePlan ? (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/60">Subscription Usage</p>
              </div>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
                <div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60">This Month</p>
                    <p className="mt-2 text-3xl font-semibold text-white">
                      {subscriptionUsageLoading ? "..." : `${subscriptionUsage?.usedPercent?.toFixed(1) ?? "0.0"}%`}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {subscriptionUsageLoading ? "Loading usage..." : `${subscriptionUsage?.used?.toFixed(1) ?? "0.0"} of ${subscriptionUsage?.quota ?? 100} used`}
                    </p>
                  </div>
                </div>

                <Progress
                  value={subscriptionUsage?.usedPercent ?? 0}
                  className="mt-4 h-2.5 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-yellow-400 [&>div]:to-emerald-400"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/60">Pro Access</p>
                  <p className="mt-2 text-sm text-white/80">
                    No active plan yet. Upgrade to unlock Pro access.
                  </p>
                </div>
                <Button
                  onClick={() => setShowBillingDialog(true)}
                  className="rounded-2xl bg-white text-black hover:bg-white/90"
                >
                  Upgrade to Pro
                </Button>
              </div>
            </div>
          )}

        </div>
      );
    }

    if (activeSection === "personalization") {
      return (
        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/60">Response Persona</p>
            <p className="mt-2 text-sm text-white/80">
              These details are sent with every mode so models can answer in a way that fits you better.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs text-white/85">Nickname</label>
                <input
                  value={personalization.nickname}
                  onChange={(e) => onPersonalizationFieldChange("nickname", e.target.value)}
                  placeholder="How should models address you?"
                  className="w-full rounded-2xl border border-white/10 bg-background/70 px-4 py-3 text-sm text-white placeholder:text-muted-foreground/35 focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-white/85">Occupation</label>
                <input
                  value={personalization.occupation}
                  onChange={(e) => onPersonalizationFieldChange("occupation", e.target.value)}
                  placeholder="Student, founder, designer, engineer..."
                  className="w-full rounded-2xl border border-white/10 bg-background/70 px-4 py-3 text-sm text-white placeholder:text-muted-foreground/35 focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-xs text-white/85">Custom Instructions</label>
              <textarea
                value={personalization.customInstructions}
                onChange={(e) => onPersonalizationFieldChange("customInstructions", e.target.value)}
                placeholder="Examples: keep replies concise, be direct, give step-by-step options..."
                rows={4}
                className="w-full rounded-[24px] border border-white/10 bg-background/70 px-4 py-3 text-sm text-white placeholder:text-muted-foreground/35 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-xs text-white/85">More About You</label>
              <textarea
                value={personalization.moreAboutYou}
                onChange={(e) => onPersonalizationFieldChange("moreAboutYou", e.target.value)}
                placeholder="Anything useful models should know about your goals, style, projects, expertise, or preferences."
                rows={5}
                className="w-full rounded-[24px] border border-white/10 bg-background/70 px-4 py-3 text-sm text-white placeholder:text-muted-foreground/35 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  const ok = await onSavePersonalization();
                  toast({ description: ok ? "Personalization saved." : "Failed to save personalization.", variant: ok ? "default" : "destructive" });
                }}
                disabled={!personalizationHasChanges || personalizationIsLoading || personalizationIsSaving}
                className="rounded-2xl px-5"
              >
                {personalizationIsSaving ? "Saving..." : "Save Personalization"}
              </Button>
              <Button
                variant="ghost"
                onClick={onResetPersonalization}
                disabled={!personalizationHasChanges || personalizationIsLoading || personalizationIsSaving}
                className="rounded-2xl border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
              >
                Reset Draft
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  const ok = await onClearPersonalization();
                  toast({ description: ok ? "Personalization cleared." : "Failed to clear personalization.", variant: ok ? "default" : "destructive" });
                }}
                disabled={personalizationIsLoading || personalizationIsSaving}
                className="rounded-2xl border border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-white"
              >
                Clear All
              </Button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/60">Saved Memory</p>
                <p className="mt-2 text-sm text-white/80">
                  When this is on, the active model can naturally remember useful things you share about yourself and use them later when they actually help.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Turning it off pauses future memory use and saving, but your existing saved items stay here until you remove them.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-right">
                  <p className="text-sm text-white">{memory.preferences.enabled ? "Memory On" : "Memory Off"}</p>
                  <p className="text-xs text-muted-foreground">
                    {memory.preferences.enabled ? "Model decides naturally" : "Paused"}
                  </p>
                </div>
                <Switch
                  checked={memory.preferences.enabled}
                  disabled={memoryIsLoading || memoryIsSaving}
                  onCheckedChange={async (checked) => {
                    const ok = await onMemoryEnabledChange(checked);
                    toast({
                      description: ok
                        ? checked
                          ? "Saved memory enabled."
                          : "Saved memory paused."
                        : "Failed to update memory preference.",
                      variant: ok ? "default" : "destructive",
                    });
                  }}
                />
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60">Memory Summary</p>
              <p className="mt-3 text-sm leading-6 text-white/90">{memory.summary}</p>
            </div>

            <div className="mt-5">
              {memory.memories.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-muted-foreground">
                  No saved memory yet. Once the model starts remembering useful details, they will appear here.
                </div>
              ) : (
                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60">Saved Items</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {memory.memories.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/90"
                      >
                        <span className="max-w-[260px] truncate">{item.content}</span>
                        <button
                          type="button"
                          className="rounded-full p-1 text-muted-foreground transition hover:bg-white/10 hover:text-white"
                          disabled={memoryIsSaving}
                          onClick={async () => {
                            const ok = await onDeleteMemory(item.id);
                            toast({
                              description: ok ? "Memory deleted." : "Failed to delete memory.",
                              variant: ok ? "default" : "destructive",
                            });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                disabled={memoryIsLoading || memoryIsSaving || memory.memories.length === 0}
                onClick={async () => {
                  const ok = await onClearAllMemory();
                  toast({
                    description: ok ? "All saved memory cleared." : "Failed to clear saved memory.",
                    variant: ok ? "default" : "destructive",
                  });
                }}
                className="rounded-2xl border border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-white"
              >
                Clear All Memory
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (activeSection === "billing") {
      const hasManageableSubscription = !!subscription;
      const planInterval = subscription?.planInterval === "yearly" ? "Yearly" : subscription?.planInterval === "monthly" ? "Monthly" : "Pro";
      const planPrice = subscription?.planInterval === "yearly" ? SUBSCRIPTION_YEARLY_PRICE : SUBSCRIPTION_MONTHLY_PRICE;
      const canSwitchPlans = subscription?.planInterval === "monthly";
      const switchLabel = "Switch to Yearly";
      const nextBillingPeriod: SubscriptionBillingPeriod = "yearly";

      return (
        <div className="space-y-5">
          {hasManageableSubscription ? (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/60">Current Plan</p>
                  <div className="mt-3 flex items-center gap-3">
                    <p className="text-2xl font-semibold text-white">{planInterval}</p>
                    {subscription?.planInterval === "yearly" ? (
                      <span className="rounded-full border border-cyan-300/30 bg-cyan-400/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_0_20px_rgba(96,165,250,0.35)]">
                        20% Off
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-white/75">${planPrice} billed {subscription?.planInterval === "yearly" ? "yearly" : "monthly"}.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {subscriptionManageLoading
                      ? "Loading billing details..."
                      : subscription?.cancelAtPeriodEnd
                        ? `Cancellation scheduled${subscription.endsAt ? ` until ${new Date(subscription.endsAt).toLocaleDateString()}` : ""}.`
                        : subscription?.renewsAt
                          ? `Renews on ${new Date(subscription.renewsAt).toLocaleDateString()}.`
                          : "Manage your subscription from the billing controls below."}
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60">Status</p>
                  <p className="mt-2 text-lg font-semibold text-white">{subscription?.status || "Active"}</p>
                </div>
              </div>

              <div className={cn("mt-6 grid gap-3 md:grid-cols-2", canSwitchPlans ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
                <Button
                  onClick={() => openBillingUrl(subscription?.customerPortalUrl, "Billing portal link is not available yet.")}
                  className="rounded-2xl bg-white text-black hover:bg-white/90"
                >
                  Manage Billing
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => openBillingUrl(subscription?.updatePaymentMethodUrl, "Payment method link is not available yet.")}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                >
                  Update Payment Method
                </Button>
                {canSwitchPlans ? (
                  <Button
                    variant="ghost"
                    onClick={() => handlePlanSwitch(nextBillingPeriod)}
                    disabled={changeSubscriptionPlan.isPending}
                    className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-100 shadow-[0_0_22px_rgba(96,165,250,0.16)] hover:bg-cyan-400/15 hover:text-white"
                  >
                    {changeSubscriptionPlan.isPending ? "Updating..." : switchLabel}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={subscription?.cancelAtPeriodEnd ? handleReactivateSubscription : handleCancelSubscription}
                  disabled={cancelSubscription.isPending || reactivateSubscription.isPending}
                  className={cn(
                    "rounded-2xl border",
                    subscription?.cancelAtPeriodEnd
                      ? "border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-200 hover:bg-emerald-500/[0.1]"
                      : "border-red-400/20 bg-red-500/[0.06] text-red-200 hover:bg-red-500/[0.1]"
                  )}
                >
                  {subscription?.cancelAtPeriodEnd
                    ? reactivateSubscription.isPending
                      ? "Reactivating..."
                      : "Reactivate Subscription"
                    : cancelSubscription.isPending
                      ? "Cancelling..."
                      : "Cancel Subscription"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/60">Billing</p>
              <p className="mt-2 text-sm text-white/80">Start Pro to unlock monthly or yearly subscription access and manage billing from here.</p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">Monthly</p>
                  <p className="mt-2 text-2xl font-semibold text-white">$19</p>
                  <p className="mt-1 text-xs text-muted-foreground">Flexible month-to-month access.</p>
                </div>
                <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/[0.08] p-4 shadow-[0_0_22px_rgba(96,165,250,0.14)]">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">Yearly</p>
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_0_18px_rgba(96,165,250,0.35)]">
                      20% Off
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-white">$182</p>
                  <p className="mt-1 text-xs text-muted-foreground">Best value for a full year of Pro access.</p>
                </div>
              </div>

              <Button
                onClick={() => setShowBillingDialog(true)}
                className="mt-5 rounded-2xl bg-white text-black hover:bg-white/90"
              >
                Upgrade to Pro
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (activeSection === "settings") {
      return (
        <div className="space-y-5">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "single", label: "Smart Route" },
                { id: "multi", label: "Multi Model" },
                { id: "debate", label: "Debate" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSettingsMode(item.id as "single" | "multi" | "debate")}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-all",
                    settingsMode === item.id
                      ? "border-white/20 bg-white/12 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                      : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-white"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-white/75">
              Edit model names, roles, smart routing behavior, multi-model selection, debate setup, and role prompts from here.
            </p>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]">
            <ModelSettings
              embedded
              mode={settingsMode}
              availableModels={availableModels}
              selectedMultiModelIds={selectedMultiModelIds}
              onMultiModelsChange={onMultiModelsChange}
              multiEnhancerEnabled={multiEnhancerEnabled}
              onMultiEnhancerChange={onMultiEnhancerChange}
              debateParticipants={debateParticipants}
              onDebateConfigChange={onDebateConfigChange}
              debateRounds={debateRounds}
              onDebateRoundsChange={onDebateRoundsChange}
              showRolesWarning={showRolesWarning}
              onClose={() => undefined}
              onSave={onSettingsSaved}
            />
          </div>
        </div>
      );
    }

    if (activeSection === "feedback") {
      return (
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/60">Feedback</p>
          <p className="mt-2 text-sm text-white/80">Share bugs, UI ideas, and things that feel rough. We can keep tightening the product from here.</p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Tell us what should feel better..."
            rows={6}
            className="mt-5 w-full rounded-[24px] border border-white/10 bg-background/70 px-4 py-3 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          <Button
            size="sm"
            onClick={handleSendFeedback}
            disabled={isSendingFeedback || !feedback.trim()}
            className="mt-4 rounded-2xl px-5"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {isSendingFeedback ? "Sending..." : "Send Feedback"}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground/60">Session</p>
          <p className="mt-2 text-sm text-white/80">You can sign out here whenever you want.</p>
          <Button
            variant="ghost"
            className="mt-5 justify-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-white hover:bg-white/[0.08]"
            onClick={() => logout()}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>

        <div className="rounded-[28px] border border-red-500/20 bg-red-500/[0.05] p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-red-300/70">Danger Zone</p>
          <p className="mt-2 text-sm text-red-200/85">Deleting your account removes your conversations and stored data permanently.</p>

          <AnimatePresence initial={false}>
            {showDeleteConfirm ? (
              <motion.div
                key="delete-confirm"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-5 space-y-3 rounded-[22px] border border-red-500/25 bg-red-500/[0.06] p-4">
                  <p className="text-sm text-red-100">This cannot be undone. Are you sure you want to delete the whole account?</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      className="rounded-2xl text-white hover:bg-white/[0.08]"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="rounded-2xl bg-red-500 text-white hover:bg-red-600"
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete My Account"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <Button
                key="delete-button"
                variant="ghost"
                className="mt-5 justify-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/[0.04] px-4 py-6 text-red-300 hover:bg-red-500/[0.08]"
                onClick={handleDeleteAccount}
              >
                <Trash2 className="h-4 w-4" />
                Delete Account
              </Button>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-3">
              <div className="px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground/50">Control Center</p>
                <p className="mt-2 text-sm text-white/80">Profile, smart routing, feedback, and account work all in one place.</p>
              </div>

              <div className="mt-1 space-y-1.5">
                {SECTION_META.map((section) => {
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left transition-all",
                        isActive
                          ? "bg-white/[0.1] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.05)]"
                          : "text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                      )}
                    >
                      <div className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-2xl border",
                        isActive ? "border-white/15 bg-white/[0.08]" : "border-white/8 bg-white/[0.03]"
                      )}>
                        {section.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{section.title}</p>
                        <p className="truncate text-xs text-muted-foreground/75">{section.description}</p>
                      </div>
                      <ChevronRight className={cn("h-4 w-4 transition-transform", isActive && "translate-x-0.5")} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-5 rounded-[30px] border border-white/10 bg-white/[0.04] px-5 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.06] text-white">
                  {activeMeta.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/55">Workspace Panel</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{activeMeta.title}</h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/72">{activeMeta.description}</p>
                </div>
              </div>
            </div>

            {renderSection()}
          </div>
        </div>
      </div>

      <BuyCreditsDialog
        open={showBillingDialog}
        onOpenChange={setShowBillingDialog}
        hideTrigger
      />
    </>
  );
}
