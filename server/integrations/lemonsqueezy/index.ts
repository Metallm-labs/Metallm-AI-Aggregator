// ============================================================
// Lemon Squeezy Payment Integration
// ============================================================
import crypto from "crypto";
import { db } from "../../db";
import { users, creditTransactions, userSubscriptions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import {
  SUBSCRIPTION_MONTHLY_PRICE,
  SUBSCRIPTION_YEARLY_PRICE,
  type SubscriptionBillingPeriod,
} from "@shared/billing";
import * as logger from "../../logger";

export const LS_API_KEY = process.env.LEMON_SQUEEZY_API_KEY || "";
export const LS_WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || "";
export const LS_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID || "";
export const LS_MONTHLY_VARIANT_ID = process.env.LEMON_SQUEEZY_MONTHLY_VARIANT_ID || "";
export const LS_YEARLY_VARIANT_ID = process.env.LEMON_SQUEEZY_YEARLY_VARIANT_ID || "";
export const LS_STARTER_VARIANT_ID = process.env.LEMON_SQUEEZY_STARTER_VARIANT_ID || "";
export const LS_PRO_VARIANT_ID = process.env.LEMON_SQUEEZY_PRO_VARIANT_ID || "";
export const LS_ENTERPRISE_VARIANT_ID = process.env.LEMON_SQUEEZY_ENTERPRISE_VARIANT_ID || "";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";
const LS_ACTIVE_SUBSCRIPTION_STATUSES = new Set(["on_trial", "active", "past_due", "unpaid", "paused", "cancelled"]);

interface LsSubscriptionAttributes {
  customer_id?: number | string | null;
  order_id?: number | string | null;
  product_id?: number | string | null;
  variant_id?: number | string | null;
  variant_name?: string | null;
  status?: string | null;
  cancelled?: boolean | null;
  test_mode?: boolean | null;
  renews_at?: string | null;
  ends_at?: string | null;
  payment_processor?: string | null;
  user_email?: string | null;
  urls?: {
    customer_portal?: string | null;
    customer_portal_update_subscription?: string | null;
    update_customer_portal?: string | null;
    update_payment_method?: string | null;
  } | null;
}

interface LsSubscriptionResource {
  id: string;
  attributes: LsSubscriptionAttributes;
}

interface LsSingleSubscriptionResponse {
  data: LsSubscriptionResource;
}

interface LsListSubscriptionsResponse {
  data: LsSubscriptionResource[];
}

export interface ResolvedLsSubscription {
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
}

function getAppBaseUrl(): string {
  return (process.env.APP_URL || "").trim().replace(/\/+$/, "");
}

function getVariantIdForPeriod(period: SubscriptionBillingPeriod): string {
  if (period === "yearly") {
    return LS_YEARLY_VARIANT_ID;
  }
  return LS_MONTHLY_VARIANT_ID;
}

function getAmountForPeriod(period: SubscriptionBillingPeriod): number {
  return period === "yearly" ? SUBSCRIPTION_YEARLY_PRICE : SUBSCRIPTION_MONTHLY_PRICE;
}

function inferPlanInterval(variantId: string | number | null | undefined, variantName: string | null | undefined): string {
  const normalizedVariantId = variantId == null ? "" : String(variantId);
  const normalizedName = (variantName || "").toLowerCase();

  if (normalizedVariantId && normalizedVariantId === LS_YEARLY_VARIANT_ID) return "yearly";
  if (normalizedVariantId && normalizedVariantId === LS_MONTHLY_VARIANT_ID) return "monthly";
  if (normalizedName.includes("year")) return "yearly";
  if (normalizedName.includes("month")) return "monthly";
  return "unknown";
}

function getLsUpdateSubscriptionUrl(attrs: LsSubscriptionAttributes): string | null {
  return attrs.urls?.customer_portal_update_subscription || attrs.urls?.update_customer_portal || null;
}

function normalizeLsSubscription(resource: LsSubscriptionResource): ResolvedLsSubscription {
  const attrs = resource.attributes || {};
  return {
    subscriptionId: String(resource.id),
    status: attrs.status || "unknown",
    planInterval: inferPlanInterval(attrs.variant_id, attrs.variant_name),
    cancelAtPeriodEnd: Boolean(attrs.cancelled),
    customerPortalUrl: attrs.urls?.customer_portal || null,
    updateSubscriptionUrl: getLsUpdateSubscriptionUrl(attrs),
    updatePaymentMethodUrl: attrs.urls?.update_payment_method || null,
    renewsAt: attrs.renews_at || null,
    endsAt: attrs.ends_at || null,
    paymentProcessor: attrs.payment_processor || null,
  };
}

async function saveResolvedSubscription(userId: string, resource: LsSubscriptionResource) {
  const attrs = resource.attributes || {};
  const normalized = normalizeLsSubscription(resource);

  const [saved] = await db
    .insert(userSubscriptions)
    .values({
      userId,
      provider: "lemonsqueezy",
      subscriptionId: normalized.subscriptionId,
      customerId: attrs.customer_id ? String(attrs.customer_id) : null,
      orderId: attrs.order_id ? String(attrs.order_id) : null,
      productId: attrs.product_id ? String(attrs.product_id) : null,
      variantId: attrs.variant_id ? String(attrs.variant_id) : null,
      planInterval: normalized.planInterval,
      status: normalized.status,
      cancelAtPeriodEnd: normalized.cancelAtPeriodEnd,
      testMode: Boolean(attrs.test_mode),
      customerPortalUrl: normalized.customerPortalUrl,
      updateSubscriptionUrl: normalized.updateSubscriptionUrl,
      renewsAt: normalized.renewsAt ? new Date(normalized.renewsAt) : null,
      endsAt: normalized.endsAt ? new Date(normalized.endsAt) : null,
      metadata: {
        paymentProcessor: normalized.paymentProcessor,
        updatePaymentMethodUrl: normalized.updatePaymentMethodUrl,
      },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSubscriptions.userId,
      set: {
        provider: "lemonsqueezy",
        subscriptionId: normalized.subscriptionId,
        customerId: attrs.customer_id ? String(attrs.customer_id) : null,
        orderId: attrs.order_id ? String(attrs.order_id) : null,
        productId: attrs.product_id ? String(attrs.product_id) : null,
        variantId: attrs.variant_id ? String(attrs.variant_id) : null,
        planInterval: normalized.planInterval,
        status: normalized.status,
        cancelAtPeriodEnd: normalized.cancelAtPeriodEnd,
        testMode: Boolean(attrs.test_mode),
        customerPortalUrl: normalized.customerPortalUrl,
        updateSubscriptionUrl: normalized.updateSubscriptionUrl,
        renewsAt: normalized.renewsAt ? new Date(normalized.renewsAt) : null,
        endsAt: normalized.endsAt ? new Date(normalized.endsAt) : null,
        metadata: {
          paymentProcessor: normalized.paymentProcessor,
          updatePaymentMethodUrl: normalized.updatePaymentMethodUrl,
        },
        updatedAt: new Date(),
      },
    })
    .returning();

  return saved;
}

function pickBestSubscription(resources: LsSubscriptionResource[]): LsSubscriptionResource | null {
  if (!Array.isArray(resources) || resources.length === 0) return null;

  const preferred = resources.find((resource) => LS_ACTIVE_SUBSCRIPTION_STATUSES.has(resource.attributes?.status || ""));
  return preferred || resources[0] || null;
}

// ============================================================
// Lemon Squeezy API helpers
// ============================================================

export async function lsApiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${LS_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${LS_API_KEY}`,
      Accept: "application/vnd.api+json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lemon Squeezy API error: ${res.status} ${text}`);
  }
  return res.json();
}

export async function lsApiPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${LS_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LS_API_KEY}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lemon Squeezy API error: ${res.status} ${text}`);
  }
  return res.json();
}

export async function lsApiPatch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${LS_API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${LS_API_KEY}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lemon Squeezy API error: ${res.status} ${text}`);
  }
  return res.json();
}

export async function lsApiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${LS_API_BASE}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${LS_API_KEY}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lemon Squeezy API error: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Create a Lemon Squeezy checkout URL for a given user.
 * The `custom_price` overrides the variant price (in cents) allowing
 * variable amounts.  We pass userId in checkout[custom] so the webhook
 * can credit the right user.
 */
export async function createLsCheckout(
  userId: string,
  userEmail: string | undefined,
  billingPeriod: SubscriptionBillingPeriod,
  storeId?: string,
  variantId?: string
): Promise<{ checkoutUrl: string; checkoutId: string }> {
  const sid = storeId || LS_STORE_ID;
  const vid = variantId || getVariantIdForPeriod(billingPeriod);

  if (!sid) {
    throw new Error("LEMON_SQUEEZY_STORE_ID must be configured");
  }

  if (!vid) {
    throw new Error(
      billingPeriod === "yearly"
        ? "LEMON_SQUEEZY_YEARLY_VARIANT_ID must be configured"
        : "LEMON_SQUEEZY_MONTHLY_VARIANT_ID must be configured"
    );
  }

  const amountUsd = getAmountForPeriod(billingPeriod);
  const amountCents = Math.round(amountUsd * 100);

  const payload: any = {
    data: {
      type: "checkouts",
      attributes: {
        custom_price: amountCents,
        checkout_data: {
          custom: {
            userId,
            billingPeriod,
            amountUsd: amountUsd.toString(),
          },
        },
        product_options: {
          redirect_url: `${getAppBaseUrl()}/chat?payment=success&amount=${amountUsd}`,
        },
        checkout_options: {
          embed: false,
        },
      },
      relationships: {
        store: {
          data: { type: "stores", id: sid },
        },
        variant: {
          data: { type: "variants", id: vid },
        },
      },
    },
  };

  if (userEmail) {
    payload.data.attributes.checkout_data.email = userEmail;
  }

  const result = await lsApiPost<any>("/checkouts", payload);
  return {
    checkoutUrl: result.data.attributes.url,
    checkoutId: result.data.id,
  };
}

export async function createLsVariantCheckout(params: {
  userId: string;
  userEmail?: string;
  variantId: string;
  customData?: Record<string, string>;
  redirectPath?: string;
}): Promise<{ checkoutUrl: string; checkoutId: string }> {
  const sid = LS_STORE_ID;
  if (!sid) {
    throw new Error("LEMON_SQUEEZY_STORE_ID must be configured");
  }

  const variantId = (params.variantId || "").trim();
  if (!variantId) {
    throw new Error("Lemon Squeezy variant id is required");
  }

  const baseUrl = getAppBaseUrl();
  const redirectUrl = params.redirectPath?.trim() && baseUrl
    ? `${baseUrl}${params.redirectPath.startsWith("/") ? params.redirectPath : `/${params.redirectPath}`}`
    : `${baseUrl}/business-agent?payment=success`;

  const payload: any = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          custom: {
            userId: params.userId,
            ...(params.customData || {}),
          },
        },
        product_options: {
          redirect_url: redirectUrl,
        },
        checkout_options: {
          embed: false,
        },
      },
      relationships: {
        store: {
          data: { type: "stores", id: sid },
        },
        variant: {
          data: { type: "variants", id: variantId },
        },
      },
    },
  };

  if (params.userEmail) {
    payload.data.attributes.checkout_data.email = params.userEmail;
  }

  const result = await lsApiPost<any>("/checkouts", payload);
  return {
    checkoutUrl: result.data.attributes.url,
    checkoutId: result.data.id,
  };
}

// ============================================================
// Webhook signature verification
// ============================================================

export function verifyLsWebhook(
  rawBody: string | Buffer,
  signature: string | undefined
): boolean {
  if (!LS_WEBHOOK_SECRET) {
    logger.warn("lemonsqueezy", "No LEMON_SQUEEZY_WEBHOOK_SECRET set — skipping signature verification");
    return true;
  }

  if (!signature) {
    logger.warn("lemonsqueezy", "No X-Signature header received");
    return false;
  }

  try {
    const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const expectedSig = crypto
      .createHmac("sha256", LS_WEBHOOK_SECRET)
      .update(body)
      .digest("hex");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    logger.error("lemonsqueezy", `Webhook verification error: ${(err as Error).message}`);
    return false;
  }
}

// ============================================================
// Credit Management (shared helpers — same logic as Paddle)
// ============================================================

export async function getUserCredits(userId: string): Promise<number> {
  const [user] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
  return user ? parseFloat(user.credits) : 0;
}

export async function addCredits(
  userId: string,
  amount: number,
  description: string,
  metadata?: any
): Promise<number> {
  const [updated] = await db
    .update(users)
    .set({
      credits: sql`${users.credits}::numeric + ${amount.toString()}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ credits: users.credits });

  if (!updated) {
    throw new Error(`User not found in DB: "${userId}" — cannot add credits`);
  }

  const newBalance = parseFloat(updated.credits);

  await db.insert(creditTransactions).values({
    userId,
    type: "purchase",
    amount: amount.toFixed(6),
    balanceAfter: newBalance.toFixed(4),
    description,
    metadata,
  });

  logger.info("lemonsqueezy", `Added ${amount} credits to user ${userId}. New balance: ${newBalance}`);
  return newBalance;
}

export async function setCreditsBalance(
  userId: string,
  targetBalance: number,
  description: string,
  metadata?: any
): Promise<{ delta: number; newBalance: number }> {
  const previousBalance = await getUserCredits(userId);
  const normalizedTarget = Number(Math.max(0, targetBalance).toFixed(4));

  const [updated] = await db
    .update(users)
    .set({
      credits: normalizedTarget.toFixed(4),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ credits: users.credits });

  if (!updated) {
    throw new Error(`User not found in DB: "${userId}" — cannot reset credits`);
  }

  const newBalance = parseFloat(updated.credits);
  const delta = Number((newBalance - previousBalance).toFixed(6));

  await db.insert(creditTransactions).values({
    userId,
    type: "purchase",
    amount: delta.toFixed(6),
    balanceAfter: newBalance.toFixed(4),
    description,
    metadata: {
      previousBalance,
      targetBalance: newBalance,
      ...metadata,
    },
  });

  logger.info("lemonsqueezy", `Reset credits for user ${userId}. Previous balance: ${previousBalance}, new balance: ${newBalance}`);
  return { delta, newBalance };
}

async function hasProcessedLsBillingEvent(
  userId: string,
  keys: { lsOrderId?: string | null; lsSubscriptionInvoiceId?: string | null }
): Promise<boolean> {
  const predicates = [];

  if (keys.lsOrderId) {
    predicates.push(sql`${creditTransactions.metadata}->>'lsOrderId' = ${keys.lsOrderId}`);
  }
  if (keys.lsSubscriptionInvoiceId) {
    predicates.push(sql`${creditTransactions.metadata}->>'lsSubscriptionInvoiceId' = ${keys.lsSubscriptionInvoiceId}`);
  }

  if (predicates.length === 0) return false;

  const [existing] = await db
    .select({ id: creditTransactions.id })
    .from(creditTransactions)
    .where(
      sql`${creditTransactions.userId} = ${userId} AND (${sql.join(predicates, sql` OR `)})`
    )
    .limit(1);

  return !!existing;
}

// ============================================================
// Process a completed Lemon Squeezy order (idempotent)
// ============================================================

export async function processLsOrder(
  userId: string,
  lsOrderId: string,
  amountUsd: number,
  currency: string,
  metadata?: any
): Promise<{ creditsAdded: number; newBalance: number }> {
  // Idempotency check — store the order id in metadata query
  if (await hasProcessedLsBillingEvent(userId, { lsOrderId })) {
    logger.warn("lemonsqueezy", `Order ${lsOrderId} already processed`);
    const balance = await getUserCredits(userId);
    return { creditsAdded: amountUsd, newBalance: balance };
  }

  const { newBalance } = await setCreditsBalance(
    userId,
    amountUsd,
    `Subscription activated via Lemon Squeezy`,
    { lsOrderId, currency, subscriptionBalanceReset: true, ...metadata }
  );

  return { creditsAdded: amountUsd, newBalance };
}

export async function getCreditTransactions(userId: string, limit = 50) {
  return db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(sql`${creditTransactions.createdAt} DESC`)
    .limit(limit);
}

export async function fetchLsSubscription(subscriptionId: string): Promise<LsSubscriptionResource> {
  const result = await lsApiGet<LsSingleSubscriptionResponse>(`/subscriptions/${subscriptionId}`);
  return result.data;
}

export async function listLsSubscriptionsByEmail(email: string): Promise<LsSubscriptionResource[]> {
  const result = await lsApiGet<LsListSubscriptionsResponse>(
    `/subscriptions?filter[user_email]=${encodeURIComponent(email)}&page[size]=10`
  );
  return Array.isArray(result.data) ? result.data : [];
}

export async function upsertUserSubscriptionFromWebhook(event: any) {
  const attrs = event?.data?.attributes || {};
  const subscriptionId = event?.data?.id ? String(event.data.id) : "";
  const customUserId =
    event?.meta?.custom_data?.userId ||
    event?.meta?.custom_data?.user_id ||
    attrs?.first_subscription_item?.custom_data?.userId ||
    attrs?.first_subscription_item?.custom_data?.user_id;

  if (!customUserId || !subscriptionId) {
    return null;
  }
  return saveResolvedSubscription(String(customUserId), {
    id: subscriptionId,
    attributes: {
      ...attrs,
      variant_name:
        inferPlanInterval(attrs?.variant_id, attrs?.variant_name) === "unknown"
          ? event?.meta?.custom_data?.billingPeriod || attrs?.variant_name
          : attrs?.variant_name,
    },
  });
}

export async function getUserSubscription(userId: string) {
  const [subscription] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId))
    .limit(1);

  return subscription;
}

export async function getUserSubscriptionByProviderId(subscriptionId: string) {
  const [subscription] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.subscriptionId, subscriptionId))
    .limit(1);

  return subscription;
}

export async function resolveUserSubscription(userId: string, userEmail?: string) {
  const stored = await getUserSubscription(userId);

  if (!stored) return null;

  return {
    subscriptionId: stored.subscriptionId,
    status: stored.status,
    planInterval: stored.planInterval,
    cancelAtPeriodEnd: stored.cancelAtPeriodEnd,
    customerPortalUrl: stored.customerPortalUrl,
    updateSubscriptionUrl: stored.updateSubscriptionUrl,
    updatePaymentMethodUrl:
      typeof stored.metadata === "object" && stored.metadata && "updatePaymentMethodUrl" in stored.metadata
        ? ((stored.metadata as any).updatePaymentMethodUrl ? String((stored.metadata as any).updatePaymentMethodUrl) : null)
        : null,
    renewsAt: stored.renewsAt ? stored.renewsAt.toISOString() : null,
    endsAt: stored.endsAt ? stored.endsAt.toISOString() : null,
    paymentProcessor:
      typeof stored.metadata === "object" && stored.metadata && "paymentProcessor" in stored.metadata
        ? ((stored.metadata as any).paymentProcessor ? String((stored.metadata as any).paymentProcessor) : null)
        : null,
  };
}

export async function changeLsSubscriptionPlan(
  userId: string,
  userEmail: string | undefined,
  billingPeriod: SubscriptionBillingPeriod
) {
  const current = await resolveUserSubscription(userId, userEmail);
  if (!current) {
    throw new Error("No active subscription found for this account");
  }

  if (current.planInterval === "yearly" && billingPeriod === "monthly") {
    throw new Error("Yearly subscriptions cannot switch to monthly. You can cancel instead.");
  }

  if (current.planInterval === billingPeriod) {
    return { redirectUrl: null, subscription: current };
  }

  // Webhook-first mode: do not mutate subscription state via API.
  // Route users to Lemon customer portal and let webhook sync final state.
  const redirectUrl = current.updateSubscriptionUrl || current.customerPortalUrl;
  if (!redirectUrl) {
    throw new Error("Plan change is managed via Lemon Squeezy portal. Portal URL is not available.");
  }

  return { redirectUrl, subscription: current };
}

export async function cancelLsSubscription(userId: string, userEmail?: string) {
  const current = await resolveUserSubscription(userId, userEmail);
  if (!current) {
    throw new Error("No active subscription found for this account");
  }

  // Webhook-first mode: cancellation is handled in Lemon portal and reflected by webhook events.
  return current;
}

export async function processLsSubscriptionRenewal(
  subscriptionId: string,
  invoiceId: string,
  orderId: string | null,
  amountUsd: number,
  currency: string
) {
  const stored = await getUserSubscriptionByProviderId(subscriptionId);
  if (!stored) {
    throw new Error(`No stored user mapping found for subscription ${subscriptionId}`);
  }

  if (await hasProcessedLsBillingEvent(stored.userId, { lsOrderId: orderId, lsSubscriptionInvoiceId: invoiceId })) {
    logger.warn("lemonsqueezy", `Renewal already processed for subscription ${subscriptionId} invoice ${invoiceId}`);
    const balance = await getUserCredits(stored.userId);
    return { userId: stored.userId, creditsAdded: amountUsd, newBalance: balance, skipped: true as const };
  }

  const cycleCredits =
    stored.planInterval === "yearly"
      ? SUBSCRIPTION_YEARLY_PRICE
      : stored.planInterval === "monthly"
        ? SUBSCRIPTION_MONTHLY_PRICE
        : amountUsd;

  const { newBalance } = await setCreditsBalance(
    stored.userId,
    cycleCredits,
    `Subscription renewed via Lemon Squeezy`,
    {
      lsOrderId: orderId,
      lsSubscriptionInvoiceId: invoiceId,
      subscriptionId,
      currency,
      chargedAmountUsd: amountUsd,
      billingPeriod: stored.planInterval,
      subscriptionBalanceReset: true,
      renewal: true,
    }
  );

  return { userId: stored.userId, creditsAdded: cycleCredits, newBalance, skipped: false as const };
}

export async function reactivateLsSubscription(userId: string, userEmail?: string) {
  const current = await resolveUserSubscription(userId, userEmail);
  if (!current) {
    throw new Error("No subscription found for this account");
  }

  if (current.status !== "cancelled") {
    throw new Error("This subscription is not in a cancellable grace period");
  }

  // Webhook-first mode: reactivation is handled in Lemon portal and reflected by webhook events.
  return current;
}
