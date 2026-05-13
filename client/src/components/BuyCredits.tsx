import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, Coins, CreditCard, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  usePaddleConfig,
  useCreditTransactions,
  useVerifyTransaction,
  useCreateLsCheckout,
} from "@/hooks/use-credits";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  SUBSCRIPTION_MONTHLY_PRICE,
  SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT,
  SUBSCRIPTION_YEARLY_MONTHLY_EQUIVALENT,
  SUBSCRIPTION_YEARLY_PRICE,
} from "@shared/billing";

declare global {
  interface Window {
    Paddle?: any;
    gtag?: (...args: any[]) => void;
  }
}

type BillingPeriod = "monthly" | "yearly";

const PLAN_OPTIONS = [
  {
    id: "monthly" as const,
    label: "Monthly",
    amount: SUBSCRIPTION_MONTHLY_PRICE,
    headline: `$${SUBSCRIPTION_MONTHLY_PRICE}/month`,
    subline: "Best for flexible access",
  },
  {
    id: "yearly" as const,
    label: "Yearly",
    amount: SUBSCRIPTION_YEARLY_PRICE,
    headline: `$${SUBSCRIPTION_YEARLY_PRICE}/year`,
    subline: `${SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT}% off • $${SUBSCRIPTION_YEARLY_MONTHLY_EQUIVALENT}/month`,
  },
];

function formatCredits(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}

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
    if (!clientToken) return;
    if (window.Paddle && loaded) return;

    const initPaddle = () => {
      if (!window.Paddle) return;
      try {
        if (environment === "sandbox") {
          window.Paddle.Environment.set("sandbox");
        }
        window.Paddle.Initialize({
          token: clientToken,
          eventCallback: (event: any) => {
            eventRef.current?.(event);
          },
        });
        setLoaded(true);
      } catch (e) {
        setError((e as Error).message);
      }
    };

    if (window.Paddle) {
      initPaddle();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onerror = () => setError("Failed to load payment system");
    script.onload = () => initPaddle();
    document.head.appendChild(script);
  }, [clientToken, environment, loaded]);

  return { loaded, error };
}

interface BuyCreditsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  intent?: "generic" | "continue";
}

export function BuyCreditsDialog({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  intent = "generic",
}: BuyCreditsDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [showHistory, setShowHistory] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const selectedPlan = PLAN_OPTIONS.find((plan) => plan.id === billingPeriod) ?? PLAN_OPTIONS[0];

  const { data: config } = usePaddleConfig({ enabled: open });
  const { data: transactions } = useCreditTransactions(50, { enabled: open && showHistory });
  const verifyTransaction = useVerifyTransaction();
  const createLsCheckout = useCreateLsCheckout();
  const { user } = useAuth();
  const { toast } = useToast();

  const handlePaddleEvent = useCallback((event: any) => {
    if (event?.name !== "checkout.completed") return;
    const transactionId = event?.data?.transaction_id || event?.data?.id;
    if (!transactionId) return;

    setCheckoutComplete(true);
    setVerifying(true);
    setOpen(true);
    verifyTransaction.mutate(transactionId, {
      onSuccess: () => {
        setVerifying(false);
        if (typeof window.gtag === "function") {
          window.gtag("event", "conversion", {
            send_to: "AW-18126600047/uYRLCL7_26QcEO_ut8ND",
            value: selectedPlan.amount,
            currency: "USD",
            transaction_id: transactionId,
          });
        }
        toast({
          title: "Plan Activated",
          description: `${selectedPlan.label} subscription checkout completed successfully.`,
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
          description: "Your payment was received and is being finalized.",
        });
        setTimeout(() => {
          setCheckoutComplete(false);
          setOpen(false);
        }, 2000);
      },
    });
  }, [selectedPlan.label, setOpen, toast, verifyTransaction]);

  const { loaded: paddleLoaded, error: paddleError } = usePaddleScript(
    config?.clientToken,
    config?.environment,
    handlePaddleEvent,
  );

  const handlePaddleCheckout = useCallback(() => {
    if (!window.Paddle || !config) {
      toast({
        title: "Error",
        description: paddleError || "Payment system not ready. Please try again.",
        variant: "destructive",
      });
      return;
    }

    const checkoutParams: any = {
      items: [{ priceId: config.priceId, quantity: selectedPlan.amount }],
      customData: { userId: user?.id },
      settings: { displayMode: "overlay", theme: "dark" },
    };

    if (user?.email) {
      checkoutParams.customer = { email: user.email };
    }

    try {
      window.Paddle.Checkout.open(checkoutParams);
      setOpen(false);
    } catch (e) {
      toast({
        title: "Error",
        description: `Checkout failed: ${(e as Error).message}`,
        variant: "destructive",
      });
    }
  }, [config, paddleError, selectedPlan.amount, setOpen, toast, user]);

  const handleLsCheckout = useCallback(async () => {
    try {
      const { checkoutUrl } = await createLsCheckout.mutateAsync(selectedPlan.id);
      window.open(checkoutUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  }, [createLsCheckout, selectedPlan.id, toast]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <button className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/[0.08]">
            <Coins className="h-4 w-4 text-yellow-400" />
            <span>Plans</span>
          </button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-lg border-white/10 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Coins className="h-5 w-5 text-yellow-400" />
            {showHistory ? "Billing History" : intent === "continue" ? "Choose a Subscription to Continue" : "Choose Your Subscription"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {showHistory ? "View your billing history" : "Choose a subscription plan for AI access"}
          </DialogDescription>
        </DialogHeader>

        {showHistory ? (
          <div className="max-h-80 space-y-3 overflow-y-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(false)}
              className="text-xs text-muted-foreground"
            >
              ← Back to plans
            </Button>
            {transactions?.map((tx) => (
              <div
                key={tx.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-3",
                  tx.type === "purchase" ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{tx.description || tx.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-medium", parseFloat(tx.amount) >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {parseFloat(tx.amount) >= 0 ? "+" : ""}
                    {parseFloat(tx.amount).toFixed(4)}
                  </p>
                  <p className="text-xs text-muted-foreground">After: {formatCredits(parseFloat(tx.balanceAfter))}</p>
                </div>
              </div>
            ))}
            {(!transactions || transactions.length === 0) && (
              <p className="py-8 text-center text-sm text-muted-foreground">No billing history yet</p>
            )}
          </div>
        ) : checkoutComplete ? (
          <div className="flex flex-col items-center gap-4 py-8">
            {verifying ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Verifying payment...</p>
              </>
            ) : (
              <>
                <CheckCircle className="h-10 w-10 text-emerald-400" />
                <p className="text-sm font-medium text-emerald-400">Subscription activated successfully.</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {intent === "continue" && (
              <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/12 via-yellow-500/6 to-transparent p-3.5">
                <p className="text-sm font-semibold text-white">Pick a subscription to continue</p>
                <p className="mt-1 text-xs leading-5 text-white/65">
                  Unlock flagship and advanced models, continue your chat without interruptions, and track usage from your profile settings.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-sm text-muted-foreground">Billing cycle</label>
              <div className="grid gap-3 sm:grid-cols-2">
                {PLAN_OPTIONS.map((plan) => {
                  const active = billingPeriod === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setBillingPeriod(plan.id)}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition-all",
                        active
                          ? "border-yellow-400/40 bg-yellow-500/10 shadow-[0_0_0_1px_rgba(250,204,21,0.12)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white">{plan.label}</p>
                            {plan.id === "yearly" ? (
                              <span className="rounded-full border border-cyan-300/30 bg-cyan-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_0_18px_rgba(96,165,250,0.35)]">
                                Save $46
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xl font-bold text-yellow-300">{plan.headline}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{plan.subline}</p>
                        </div>
                        {active ? <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-400" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-yellow-500/20 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-yellow-200/80">Billed today</span>
                <span className="text-xl font-bold text-yellow-400">${selectedPlan.amount.toFixed(2)}</span>
              </div>
              <p className="mt-1 text-xs text-yellow-200/60">
                {billingPeriod === "yearly"
                  ? `Annual billing with ${SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT}% discount applied.`
                  : "Monthly billing for ongoing access."}
              </p>
            </div>

            <Button
              onClick={handleLsCheckout}
              disabled={createLsCheckout.isPending}
              className="h-11 w-full bg-gradient-to-r from-yellow-500 to-amber-500 font-semibold text-black hover:from-yellow-400 hover:to-amber-400"
            >
              {createLsCheckout.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening checkout...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Start {selectedPlan.label} for ${selectedPlan.amount.toFixed(2)}
                </>
              )}
            </Button>

            {config ? (
              <Button
                onClick={handlePaddleCheckout}
                disabled={!paddleLoaded}
                variant="outline"
                className="h-11 w-full border-white/10 text-white hover:bg-white/[0.05]"
              >
                {paddleLoaded ? "Pay with Paddle overlay" : "Preparing Paddle..."}
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(true)}
              className="w-full gap-2 text-muted-foreground hover:text-white"
            >
              <History className="h-4 w-4" />
              View Billing History
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
