// ============================================================
// Lemon Squeezy Payment Integration
// ============================================================
import crypto from "crypto";
import { db } from "../../db";
import { users, creditTransactions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import * as logger from "../../logger";

export const LS_API_KEY = process.env.LEMON_SQUEEZY_API_KEY || "";
export const LS_WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || "";
export const LS_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID || "";
export const LS_VARIANT_ID = process.env.LEMON_SQUEEZY_VARIANT_ID || "";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";

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

/**
 * Create a Lemon Squeezy checkout URL for a given user.
 * The `custom_price` overrides the variant price (in cents) allowing
 * variable amounts.  We pass userId in checkout[custom] so the webhook
 * can credit the right user.
 */
export async function createLsCheckout(
  userId: string,
  userEmail: string | undefined,
  amountUsd: number,
  storeId?: string,
  variantId?: string
): Promise<{ checkoutUrl: string; checkoutId: string }> {
  const sid = storeId || LS_STORE_ID;
  const vid = variantId || LS_VARIANT_ID;

  if (!sid || !vid) {
    throw new Error("LEMON_SQUEEZY_STORE_ID and LEMON_SQUEEZY_VARIANT_ID must be configured");
  }

  const amountCents = Math.round(amountUsd * 100);

  const payload: any = {
    data: {
      type: "checkouts",
      attributes: {
        custom_price: amountCents,
        checkout_data: {
          custom: {
            userId,
            amountUsd: amountUsd.toString(),
          },
        },
        product_options: {
          redirect_url: `${process.env.APP_URL || ""}/?payment=success`,
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
  const existing = await db
    .select()
    .from(creditTransactions)
    .where(
      sql`${creditTransactions.userId} = ${userId}
          AND ${creditTransactions.metadata}->>'lsOrderId' = ${lsOrderId}`
    )
    .limit(1);

  if (existing.length > 0) {
    logger.warn("lemonsqueezy", `Order ${lsOrderId} already processed`);
    const balance = await getUserCredits(userId);
    return { creditsAdded: parseFloat(existing[0].amount), newBalance: balance };
  }

  // Credits = USD amount (1 USD = 1 credit)
  const creditsToAdd = amountUsd;

  const newBalance = await addCredits(
    userId,
    creditsToAdd,
    `Purchased ${creditsToAdd} credits via Lemon Squeezy`,
    { lsOrderId, currency, ...metadata }
  );

  return { creditsAdded: creditsToAdd, newBalance };
}

export async function getCreditTransactions(userId: string, limit = 50) {
  return db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(sql`${creditTransactions.createdAt} DESC`)
    .limit(limit);
}
