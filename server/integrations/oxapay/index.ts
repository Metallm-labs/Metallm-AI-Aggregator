// ============================================================
// OxaPay Crypto Payment Integration
// ============================================================
import crypto from "crypto";
import { db } from "../../db";
import { users, oxapayTransactions, creditTransactions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import * as logger from "../../logger";

const OXAPAY_ENVIRONMENT = process.env.OXAPAY_ENVIRONMENT || "production"; // 'sandbox' | 'production'

const OXAPAY_MERCHANT_KEY = OXAPAY_ENVIRONMENT === "sandbox"
  ? process.env.OXAPAY_MERCHANT_KEY_SANDBOX
  : process.env.OXAPAY_MERCHANT_KEY;

if (!OXAPAY_MERCHANT_KEY) {
  throw new Error(
    OXAPAY_ENVIRONMENT === "sandbox"
      ? "OXAPAY_MERCHANT_KEY_SANDBOX env variable is not set"
      : "OXAPAY_MERCHANT_KEY env variable is not set"
  );
}

const OXAPAY_API_BASE = OXAPAY_ENVIRONMENT === "sandbox"
  ? "https://sandbox.oxapay.com"
  : "https://api.oxapay.com";

logger.info("oxapay", `Environment: ${OXAPAY_ENVIRONMENT} | API: ${OXAPAY_API_BASE}`);

// Credit ratio: 1 USD = 1 credit
const CREDIT_RATIO = 1;

// ============================================================
// OxaPay API Helpers
// ============================================================

export interface OxapayInvoice {
  trackId: string;
  payLink: string;
}

export async function createOxapayInvoice(
  amountUsd: number,
  orderId: string,
  description: string,
  callbackUrl: string,
  returnUrl: string,
  email?: string
): Promise<OxapayInvoice> {
  const body: Record<string, any> = {
    merchant: OXAPAY_MERCHANT_KEY,
    amount: amountUsd,
    currency: "USD",
    lifeTime: 30, // 30 minutes to complete payment
    feePaidByPayer: 0, // merchant pays the fee
    underPaidCover: 2.5, // allow 2.5% underpayment
    callbackUrl,
    returnUrl,
    orderId,
    description,
  };

  if (email) {
    body.email = email;
  }

  const res = await fetch(`${OXAPAY_API_BASE}/merchants/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OxaPay API error: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (data.result !== 100) {
    throw new Error(`OxaPay invoice creation failed: ${data.message || data.result}`);
  }

  return {
    trackId: String(data.trackId),
    payLink: data.payLink,
  };
}

export async function checkOxapayStatus(trackId: string): Promise<{
  status: string;
  amount?: number;
  currency?: string;
}> {
  const res = await fetch(`${OXAPAY_API_BASE}/merchants/inquiry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchant: OXAPAY_MERCHANT_KEY,
      trackId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OxaPay inquiry error: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.result !== 100) {
    throw new Error(`OxaPay inquiry failed: ${data.message || data.result}`);
  }

  return {
    status: data.status || "Waiting",
    amount: data.payAmount,
    currency: data.payCurrency,
  };
}

// ============================================================
// Database Helpers
// ============================================================

export async function createPendingOxapayTransaction(
  userId: string,
  trackId: string,
  orderId: string,
  amountUsd: number
): Promise<void> {
  await db.insert(oxapayTransactions).values({
    userId,
    trackId,
    orderId,
    status: "waiting",
    amountUsd: amountUsd.toFixed(2),
    creditsAdded: "0",
  });
}

export async function processOxapayPayment(
  trackId: string,
  paidStatus: string,
  metadata?: any
): Promise<{ creditsAdded: number; newBalance: number; alreadyProcessed: boolean }> {
  // Look up the pending transaction
  const [existing] = await db
    .select()
    .from(oxapayTransactions)
    .where(eq(oxapayTransactions.trackId, trackId));

  if (!existing) {
    throw new Error(`OxaPay transaction not found: ${trackId}`);
  }

  // Already processed — idempotency guard
  if (existing.status === "paid") {
    logger.warn("oxapay", `Transaction ${trackId} already processed`);
    const balance = await getUserCredits(existing.userId);
    return {
      creditsAdded: parseFloat(existing.creditsAdded),
      newBalance: balance,
      alreadyProcessed: true,
    };
  }

  const amountUsd = parseFloat(existing.amountUsd);
  const creditsToAdd = amountUsd * CREDIT_RATIO;

  // Mark as paid in our DB
  await db
    .update(oxapayTransactions)
    .set({ status: "paid", creditsAdded: creditsToAdd.toFixed(4), updatedAt: new Date(), metadata })
    .where(eq(oxapayTransactions.trackId, trackId));

  // Add credits to the user
  const newBalance = await addCredits(
    existing.userId,
    creditsToAdd,
    `Purchased ${creditsToAdd} credits via Crypto (OxaPay)`,
    { trackId, orderId: existing.orderId },
  );

  return { creditsAdded: creditsToAdd, newBalance, alreadyProcessed: false };
}

export async function expireOxapayTransaction(trackId: string): Promise<void> {
  await db
    .update(oxapayTransactions)
    .set({ status: "expired", updatedAt: new Date() })
    .where(eq(oxapayTransactions.trackId, trackId));
}

export async function getOxapayTransaction(trackId: string) {
  const [tx] = await db
    .select()
    .from(oxapayTransactions)
    .where(eq(oxapayTransactions.trackId, trackId));
  return tx;
}

// ============================================================
// Credit helpers (mirrors paddle/index.ts)
// ============================================================

export async function getUserCredits(userId: string): Promise<number> {
  const [user] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
  return user ? parseFloat(user.credits) : 0;
}

async function addCredits(
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

  const newBalance = parseFloat(updated.credits);

  await db.insert(creditTransactions).values({
    userId,
    type: "purchase",
    amount: amount.toFixed(6),
    balanceAfter: newBalance.toFixed(4),
    description,
    metadata,
  });

  logger.info("oxapay", `Added ${amount} credits to user ${userId}. New balance: ${newBalance}`);
  return newBalance;
}
