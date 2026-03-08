import { useState, useEffect, useCallback, useRef } from "react";
import { Coins, Plus, Minus, CreditCard, Loader2, CheckCircle, X, AlertTriangle, History, Bitcoin, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { usePaddleConfig, useCreditBalance, useCreditTransactions, useVerifyTransaction, useCreateCryptoInvoice, useCheckCryptoStatus } from "@/hooks/use-credits";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    Paddle?: any;
  }
}

// Show up to 4 decimal places, strip trailing zeros (e.g. 4.9800 → "4.98", 5.0000 → "5")
function formatCredits(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}

// Load Paddle.js script and initialize once
function usePaddleScript(
  clientToken: string | undefined,
  environment: string | undefined,
  onEvent?: (event: any) => void,
) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  useEffect(() => {
    if (!clientToken) {
      console.warn("[Paddle] No clientToken yet — waiting for config");
      return;
    }
    console.log("[Paddle] Config received:", { environment, clientToken: clientToken?.slice(0, 12) + "...", loaded });
    if (window.Paddle && loaded) {
      console.log("[Paddle] Already initialized, skipping");
      return;
    }

    const initPaddle = () => {
      if (!window.Paddle) {
        console.error("[Paddle] window.Paddle not found after script load");
        return;
      }
      try {
        if (environment === "sandbox") {
          console.log("[Paddle] Setting sandbox environment");
          window.Paddle.Environment.set("sandbox");
        } else {
          console.log("[Paddle] Production environment — no Environment.set call");
        }
        window.Paddle.Initialize({
          token: clientToken,
          eventCallback: (event: any) => {
            console.log("[Paddle Event]", event?.name, event?.data);
            eventRef.current?.(event);
          },
        });
        console.log("[Paddle] Initialized OK — env:", environment, "token prefix:", clientToken?.slice(0, 8));
        setLoaded(true);
      } catch (e) {
        console.error("[Paddle] Init error:", e);
        setError((e as Error).message);
      }
    };

    if (window.Paddle) {
      console.log("[Paddle] Script already on page, re-initializing");
      initPaddle();
      return;
    }

    console.log("[Paddle] Loading paddle.js script...");
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onerror = () => {
      console.error("[Paddle] Failed to load paddle.js script");
      setError("Failed to load payment system");
    };
    script.onload = () => {
      console.log("[Paddle] Script loaded, initializing...");
      initPaddle();
    };
    document.head.appendChild(script);
  }, [clientToken, environment]);

  return { loaded, error };
}

export function CreditBadge({ className }: { className?: string }) {
  const { data: balance } = useCreditBalance();
  const credits = balance?.credits ?? 0;

  return (
    <div className={cn("flex items-center gap-1.5 text-sm", className)}>
      <Coins className="w-4 h-4 text-yellow-400" />
      <span className={cn(
        "font-medium",
        credits <= 1 ? "text-red-400" : credits <= 5 ? "text-yellow-400" : "text-emerald-400"
      )}>
        {formatCredits(credits)}
      </span>
    </div>
  );
}

export function BuyCreditsDialog() {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(5);
  const [showHistory, setShowHistory] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Crypto (OxaPay) state
  const [cryptoTrackId, setCryptoTrackId] = useState<string | null>(null);
  const [cryptoPayLink, setCryptoPayLink] = useState<string | null>(null);
  const [cryptoPolling, setCryptoPolling] = useState(false);

  const { data: config } = usePaddleConfig();
  const { data: balance } = useCreditBalance();
  const { data: transactions } = useCreditTransactions();
  const verifyTransaction = useVerifyTransaction();
  const createCryptoInvoice = useCreateCryptoInvoice();
  const { data: cryptoStatus } = useCheckCryptoStatus(cryptoTrackId, cryptoPolling);
  const { user } = useAuth();
  const { toast } = useToast();

  const minQuantity = 1;

  // Handle crypto payment status changes
  useEffect(() => {
    if (!cryptoStatus) return;
    if (cryptoStatus.status === "paid") {
      setCryptoPolling(false);
      toast({
        title: "Crypto Payment Confirmed!",
        description: `$${cryptoStatus.creditsAdded?.toFixed(2) ?? quantity.toFixed(2)} added to your balance.`,
      });
      setTimeout(() => {
        setCryptoTrackId(null);
        setCryptoPayLink(null);
        setOpen(false);
      }, 2500);
    } else if (cryptoStatus.status === "expired" || cryptoStatus.status === "error") {
      setCryptoPolling(false);
      toast({
        title: "Payment Expired",
        description: "The crypto payment window has expired. Please try again.",
        variant: "destructive",
      });
      setCryptoTrackId(null);
      setCryptoPayLink(null);
    }
  }, [cryptoStatus, toast, quantity]);

  // Handle Paddle events (checkout completion)
  const handlePaddleEvent = useCallback((event: any) => {
    console.log("[Paddle Event RAW]", JSON.stringify(event, null, 2));
    if (event?.name === "checkout.completed") {
      const transactionId = event?.data?.transaction_id || event?.data?.id;
      if (transactionId) {
        setCheckoutComplete(true);
        setVerifying(true);
        setOpen(true);
        verifyTransaction.mutate(transactionId, {
          onSuccess: (result) => {
            setVerifying(false);
            toast({
              title: "Balance Added!",
              description: `$${result.creditsAdded.toFixed(4)} added. New balance: $${result.newBalance.toFixed(4)}`,
            });
            setTimeout(() => {
              setCheckoutComplete(false);
              setOpen(false);
            }, 2500);
          },
          onError: () => {
            setVerifying(false);
            toast({
              title: "Payment Received",
              description: "Your payment was received. Balance will be updated shortly.",
            });
            setTimeout(() => {
              setCheckoutComplete(false);
              setOpen(false);
            }, 2000);
          },
        });
      }
    } else if (event?.name === "checkout.error") {
      console.error("[Paddle] Checkout error event:", JSON.stringify(event, null, 2));
    }
  }, [verifyTransaction, toast]);

  const { loaded: paddleLoaded, error: paddleError } = usePaddleScript(config?.clientToken, config?.environment, handlePaddleEvent);

  const handleBuyCredits = useCallback(() => {
    console.log("[Paddle] handleBuyCredits — config:", config, "loaded:", paddleLoaded, "error:", paddleError);
    if (!window.Paddle || !config) {
      console.error("[Paddle] Paddle not ready", { windowPaddle: !!window.Paddle, config });
      toast({ title: "Error", description: paddleError || "Payment system not ready. Please try again.", variant: "destructive" });
      return;
    }

    const checkoutParams: any = {
      items: [{ priceId: config.priceId, quantity }],
      customData: { userId: user?.id },
      settings: { displayMode: "overlay", theme: "dark" },
    };
    // Only pass customer.email if we have one
    if (user?.email) {
      checkoutParams.customer = { email: user.email };
    }
    console.log("[Paddle] Opening checkout with:", JSON.stringify(checkoutParams, null, 2));
    console.log("[Paddle] window.Paddle keys:", Object.keys(window.Paddle ?? {}));

    try {
      window.Paddle.Checkout.open(checkoutParams);
      // Close our dialog so Paddle overlay is fully accessible
      setOpen(false);
    } catch (e) {
      console.error("[Paddle] Checkout.open threw:", e);
      toast({ title: "Error", description: `Checkout failed: ${(e as Error).message}`, variant: "destructive" });
    }
  }, [config, quantity, user, toast, paddleError, paddleLoaded]);

  const handleCryptoPayment = useCallback(async () => {
    try {
      const result = await createCryptoInvoice.mutateAsync(quantity);
      setCryptoTrackId(result.trackId);
      setCryptoPayLink(result.payLink);
      setCryptoPolling(true);
      // Open payment page in new tab
      window.open(result.payLink, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  }, [quantity, createCryptoInvoice, toast]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5 transition-colors group">
          <span className={cn(
            "text-xs font-semibold tabular-nums",
            (balance?.credits ?? 0) <= 1 ? "text-red-400" : (balance?.credits ?? 0) <= 5 ? "text-yellow-400" : "text-emerald-400"
          )}>
            ${(balance?.credits ?? 0).toFixed(4)}
          </span>
          <Plus className="w-3 h-3 text-muted-foreground group-hover:text-white transition-colors" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Coins className="w-5 h-5 text-yellow-400" />
            {showHistory ? "Transaction History" : "Add Balance"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {showHistory ? "View your transaction history" : "Add balance to use AI models"}
          </DialogDescription>
        </DialogHeader>

        {showHistory ? (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(false)}
              className="text-xs text-muted-foreground"
            >
              ← Back to purchase
            </Button>
            {transactions?.map((tx) => (
              <div
                key={tx.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  tx.type === "purchase" ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{tx.description || tx.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-medium", parseFloat(tx.amount) >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {parseFloat(tx.amount) >= 0 ? "+" : ""}{parseFloat(tx.amount).toFixed(4)}
                  </p>
                  <p className="text-xs text-muted-foreground">Bal: {formatCredits(parseFloat(tx.balanceAfter))}</p>
                </div>
              </div>
            ))}
            {(!transactions || transactions.length === 0) && (
              <p className="text-center text-muted-foreground text-sm py-8">No transactions yet</p>
            )}
          </div>
        ) : checkoutComplete ? (
          <div className="flex flex-col items-center gap-4 py-8">
            {verifying ? (
              <>
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Verifying payment...</p>
              </>
            ) : (
              <>
                <CheckCircle className="w-10 h-10 text-emerald-400" />
                <p className="text-sm text-emerald-400 font-medium">Balance topped up successfully!</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Balance */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
              <span className="text-sm text-muted-foreground">Current Balance</span>
              <span className="text-lg font-bold text-white">
                ${(balance?.credits ?? 0).toFixed(4)}
              </span>
            </div>

            {/* Amount Selector */}
            <div className="space-y-3">
              <label className="text-sm text-muted-foreground">Amount to add (min $1)</label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(minQuantity, quantity - 1))}
                  disabled={quantity <= minQuantity}
                  className="border-white/10 hover:bg-white/5"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <div className="flex-1 text-center">
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || minQuantity;
                      setQuantity(Math.max(minQuantity, val));
                    }}
                    min={minQuantity}
                    className="w-full text-center text-2xl font-bold bg-transparent border-none text-white focus:outline-none"
                  />
                  <p className="text-xs text-muted-foreground">dollars</p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                  className="border-white/10 hover:bg-white/5"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2">
                {[1, 5, 10, 25].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setQuantity(amt)}
                    className={cn(
                      "flex-1 py-1.5 text-xs rounded-lg border transition-all",
                      quantity === amt
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                    )}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Summary */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/20">
              <div className="flex items-center justify-between">
                <span className="text-sm text-yellow-200/80">Total</span>
                <span className="text-xl font-bold text-yellow-400">${quantity.toFixed(2)} USD</span>
              </div>
              <p className="text-xs text-yellow-200/50 mt-1">$1 = 1 credit • Deducted based on token usage</p>
            </div>

            {/* Add Balance Button */}
            <Button
              onClick={handleBuyCredits}
              disabled={!paddleLoaded || !!paddleError}
              className="w-full bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-semibold h-12"
            >
              {paddleError ? (
                <>
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Payment system error
                </>
              ) : !paddleLoaded ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading payment system...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Add ${quantity.toFixed(2)} to Balance
                </>
              )}
            </Button>

            {paddleError && (
              <p className="text-xs text-red-400 text-center">{paddleError}</p>
            )}

            {/* ── Crypto Payment (OxaPay) ── */}
            {cryptoTrackId && cryptoPayLink ? (
              /* Pending crypto payment — show status */
              <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Bitcoin className="w-5 h-5 text-purple-400" />
                  <p className="text-sm font-medium text-purple-300">Crypto Payment Pending</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 animate-pulse text-yellow-400" />
                  <span>
                    {cryptoStatus?.status === "confirming"
                      ? "Confirming on blockchain…"
                      : "Waiting for your payment…"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-purple-500/30 hover:border-purple-400 text-purple-300 gap-1.5"
                    onClick={() => window.open(cryptoPayLink, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Payment Page
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-red-400"
                    onClick={() => {
                      setCryptoTrackId(null);
                      setCryptoPayLink(null);
                      setCryptoPolling(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  This window auto-updates when payment is detected.
                </p>
              </div>
            ) : (
              /* Pay with Crypto button */
              <div className="relative">
                <div className="absolute inset-x-0 -top-3 flex items-center">
                  <div className="flex-1 border-t border-white/10" />
                  <span className="px-2 text-xs text-muted-foreground">or</span>
                  <div className="flex-1 border-t border-white/10" />
                </div>
                <Button
                  onClick={handleCryptoPayment}
                  disabled={createCryptoInvoice.isPending}
                  variant="outline"
                  className="w-full mt-1 border-purple-500/30 hover:border-purple-400 hover:bg-purple-500/10 text-purple-300 hover:text-purple-200 gap-2 h-11"
                >
                  {createCryptoInvoice.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating invoice…
                    </>
                  ) : (
                    <>
                      <Bitcoin className="w-4 h-4" />
                      Pay with Crypto
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* History link */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(true)}
              className="w-full text-muted-foreground hover:text-white gap-2"
            >
              <History className="w-4 h-4" />
              View Transaction History
            </Button>

            {/* Low balance warning */}
            {(balance?.credits ?? 0) <= 1 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-300">
                  Your balance is low. Add balance to continue using AI models without interruption.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
