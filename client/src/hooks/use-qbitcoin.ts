import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface QbcWalletInfo {
  address: string;
  qbcPrice: number;
  minQbc: number;
  minUsd: number;
}

export interface QbcDepositStatus {
  address: string | null;
  qbcPrice: number;
  minQbc: number;
  balanceShor: string;
  balanceQbc: number;
  confirmations: number;
  creditsAdded: number;
  currentCredits: number;
  status: "waiting" | "confirming" | "confirmed" | "error";
}

/** POST /api/qbitcoin/wallet  — get or create the user's QBC deposit address */
export function useQbcWallet() {
  const queryClient = useQueryClient();

  return useMutation<QbcWalletInfo, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/qbitcoin/wallet", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to get QBC deposit wallet");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qbitcoin/status"] });
    },
  });
}

/** GET /api/qbitcoin/status  — poll for deposit confirmations */
export function useQbcStatus(enabled: boolean) {
  return useQuery<QbcDepositStatus>({
    queryKey: ["/api/qbitcoin/status"],
    queryFn: async () => {
      const res = await fetch("/api/qbitcoin/status", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to check QBC status");
      }
      return res.json();
    },
    enabled,
    refetchInterval: enabled ? 10_000 : false, // poll every 10 s when active
    staleTime: 0,
  });
}
