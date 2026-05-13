export const SUBSCRIPTION_MONTHLY_PRICE = 19;
export const SUBSCRIPTION_YEARLY_DISCOUNT_PERCENT = 20;
export const SUBSCRIPTION_USAGE_CAP = 100;
export type SubscriptionBillingPeriod = "monthly" | "yearly";

export const SUBSCRIPTION_YEARLY_PRICE = 182;

export const SUBSCRIPTION_YEARLY_MONTHLY_EQUIVALENT = Number(
  (SUBSCRIPTION_YEARLY_PRICE / 12).toFixed(2)
);

export function usdToSubscriptionUsage(usdAmount: number): number {
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) return 0;
  return Math.min(
    SUBSCRIPTION_USAGE_CAP,
    (usdAmount / SUBSCRIPTION_MONTHLY_PRICE) * SUBSCRIPTION_USAGE_CAP
  );
}
