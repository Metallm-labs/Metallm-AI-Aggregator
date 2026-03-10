import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

export function usePaddleConfig() {
  return useQuery<PaddleConfig>({
    queryKey: ["/api/paddle/config"],
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
    staleTime: 0,              // always consider data stale so any focus/mount refetches
    refetchInterval: 1000 * 30, // poll every 30 s as a safety net
    refetchOnWindowFocus: true, // re-fetch when user switches back to the tab
    refetchOnMount: true,       // re-fetch whenever the component mounts
  });
}

export function useCreditTransactions(limit = 50) {
  return useQuery<CreditTransaction[]>({
    queryKey: ["/api/credits/transactions", limit],
    queryFn: async () => {
      const res = await fetch(`/api/credits/transactions?limit=${limit}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
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
  variantId: string;
  minQuantity: number;
  creditRatio: number;
}

interface LsCheckoutResult {
  checkoutUrl: string;
  checkoutId: string;
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

export function useCreateLsCheckout() {
  return useMutation<LsCheckoutResult, Error, number>({
    mutationFn: async (amountUsd: number) => {
      const res = await fetch("/api/lemonsqueezy/create-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountUsd }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to create checkout" }));
        throw new Error(error.message);
      }
      return res.json();
    },
  });
}
