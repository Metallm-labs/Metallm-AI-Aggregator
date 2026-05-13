import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SubscriptionBillingPeriod } from "@shared/billing";

interface PaddleConfig {
  clientToken: string;
  priceId: string;
  environment: string;
  minQuantity: number;
  creditRatio: number;
}

interface CreditBalance {
  credits: number;
}

export interface SubscriptionUsage {
  quota: number;
  used: number;
  remaining: number;
  usedPercent: number;
  spentUsd: number;
  periodStart: string;
  periodEnd: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyMonthlyEquivalent: number;
  yearlyDiscountPercent: number;
}

interface CreditTransaction {
  id: number;
  userId: string;
  type: string;
  amount: string;
  balanceAfter: string;
  description: string | null;
  metadata: any;
  createdAt: string;
}

interface VerifyResult {
  success: boolean;
  creditsAdded: number;
  newBalance: number;
}

export function usePaddleConfig(options?: { enabled?: boolean }) {
  return useQuery<PaddleConfig>({
    queryKey: ["/api/paddle/config"],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await fetch("/api/paddle/config", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Paddle config");
      return res.json();
    },
    staleTime: 1000 * 60 * 30, // 30 min
  });
}

export function useCreditBalance() {
  return useQuery<CreditBalance>({
    queryKey: ["/api/credits/balance"],
    queryFn: async () => {
      const res = await fetch("/api/credits/balance", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch balance");
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useCreditTransactions(limit = 50, options?: { enabled?: boolean }) {
  return useQuery<CreditTransaction[]>({
    queryKey: ["/api/credits/transactions", limit],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await fetch(`/api/credits/transactions?limit=${limit}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    staleTime: 1000 * 30,
  });
}

export function useSubscriptionUsage(options?: { enabled?: boolean }) {
  return useQuery<SubscriptionUsage>({
    queryKey: ["/api/subscription/usage"],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await fetch("/api/subscription/usage", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch subscription usage");
      return res.json();
    },
    staleTime: 1000 * 30,
  });
}

export function useVerifyTransaction() {
  const queryClient = useQueryClient();

  return useMutation<VerifyResult, Error, string>({
    mutationFn: async (transactionId: string) => {
      const res = await fetch("/api/paddle/verify-transaction", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Verification failed" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      // Refresh balance after successful verification
      queryClient.invalidateQueries({ queryKey: ["/api/credits/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
    },
  });
}

export function updateCreditBalance(queryClient: ReturnType<typeof useQueryClient>, newBalance: number) {
  queryClient.setQueryData(["/api/credits/balance"], { credits: newBalance });
}

// ============================================================
// OxaPay (Crypto) Hooks
// ============================================================

interface OxapayInvoiceResult {
  trackId: string;
  payLink: string;
  amount: number;
}

interface OxapayStatusResult {
  status: string; // waiting | confirming | paid | expired | error
  creditsAdded?: number;
  balance?: number;
}

export function useCreateCryptoInvoice() {
  return useMutation<OxapayInvoiceResult, Error, number>({
    mutationFn: async (amountUsd: number) => {
      const res = await fetch("/api/oxapay/create-invoice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountUsd }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to create invoice" }));
        throw new Error(error.message);
      }
      return res.json();
    },
  });
}

export function useCheckCryptoStatus(trackId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();

  return useQuery<OxapayStatusResult>({
    queryKey: ["/api/oxapay/status", trackId],
    queryFn: async () => {
      const res = await fetch(`/api/oxapay/status/${trackId}`, { credentials: "include" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to check status" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    enabled: !!trackId && enabled,
    refetchInterval: (query: any) => {
      const data = query.state.data as OxapayStatusResult | undefined;
      if (!data) return 3000;
      const done = data.status === "paid" || data.status === "expired" || data.status === "error";
      return done ? false : 4000; // poll every 4s until done
    },
    onSuccess: (data: OxapayStatusResult) => {
      if (data.status === "paid" && data.balance !== undefined) {
        queryClient.setQueryData(["/api/credits/balance"], { credits: data.balance });
        queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
      }
    },
  } as any);
}

// ============================================================
// Lemon Squeezy Hooks
// ============================================================

interface LsConfig {
  storeId: string;
  monthlyVariantId: string;
  yearlyVariantId: string;
  minQuantity: number;
  creditRatio: number;
}

interface LsCheckoutResult {
  checkoutUrl: string;
  checkoutId: string;
}

export interface SubscriptionManageData {
  subscription: {
    subscriptionId: string;
    status: string;
    planInterval: string;
    cancelAtPeriodEnd: boolean;
    customerPortalUrl: string | null;
    updateSubscriptionUrl: string | null;
    updatePaymentMethodUrl: string | null;
    renewsAt: string | null;
    endsAt: string | null;
    paymentProcessor: string | null;
  } | null;
  plans: {
    monthlyPrice: number;
    yearlyPrice: number;
  };
}

interface ChangeSubscriptionPlanResult {
  redirectUrl: string | null;
  subscription: SubscriptionManageData["subscription"];
}

interface SubscriptionMutationResult {
  subscription: SubscriptionManageData["subscription"];
  redirectUrl?: string | null;
  mode?: "webhook_only";
}

export function useLsConfig() {
  return useQuery<LsConfig>({
    queryKey: ["/api/lemonsqueezy/config"],
    queryFn: async () => {
      const res = await fetch("/api/lemonsqueezy/config", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Lemon Squeezy config");
      return res.json();
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useSubscriptionManage(options?: { enabled?: boolean }) {
  return useQuery<SubscriptionManageData>({
    queryKey: ["/api/subscription/manage"],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await fetch("/api/subscription/manage", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch subscription details");
      return res.json();
    },
    staleTime: 1000 * 30,
  });
}

export function useCreateLsCheckout() {
  return useMutation<LsCheckoutResult, Error, SubscriptionBillingPeriod>({
    mutationFn: async (billingPeriod: SubscriptionBillingPeriod) => {
      const res = await fetch("/api/lemonsqueezy/create-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingPeriod }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to create checkout" }));
        throw new Error(error.message);
      }
      return res.json();
    },
  });
}

export function useChangeSubscriptionPlan() {
  const queryClient = useQueryClient();

  return useMutation<ChangeSubscriptionPlanResult, Error, SubscriptionBillingPeriod>({
    mutationFn: async (billingPeriod: SubscriptionBillingPeriod) => {
      const res = await fetch("/api/subscription/change-plan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingPeriod }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to update subscription plan" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/manage"] });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation<SubscriptionMutationResult, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to cancel subscription" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/manage"] });
    },
  });
}

export function useReactivateSubscription() {
  const queryClient = useQueryClient();

  return useMutation<SubscriptionMutationResult, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/subscription/reactivate", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to reactivate subscription" }));
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/manage"] });
    },
  });
}
