// ============================================================
// OxaPay Crypto Payment Integration
// ============================================================
import crypto from "crypto";
import { db } from "../../db";
import { users, oxapayTransactions, creditTransactions } from "@shared/schema";
import { eq, sql, and, lte, inArray } from "drizzle-orm";
import * as logger from "../../logger";
import { sendEmail } from "../auth/email";

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

  // Notify admin of successful payment
  const notifyEmail = process.env.WELCOME_EMAIL || "welcome@metallm.tech";
  const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, existing.userId));
  sendEmail({
    to: notifyEmail,
    subject: `New Crypto Payment — $${amountUsd.toFixed(2)} USD (OxaPay)`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#333;">
        <h2 style="margin-bottom:8px;">💳 New OxaPay Payment Received</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;">User</td><td style="padding:6px 0;">${userRow?.email ?? existing.userId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Amount</td><td style="padding:6px 0;font-weight:bold;">$${amountUsd.toFixed(2)} USD</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Credits Added</td><td style="padding:6px 0;">${creditsToAdd}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">New Balance</td><td style="padding:6px 0;">${newBalance.toFixed(4)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Track ID</td><td style="padding:6px 0;font-family:monospace;">${trackId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Order ID</td><td style="padding:6px 0;font-family:monospace;">${existing.orderId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Payment Method</td><td style="padding:6px 0;">Crypto (OxaPay)</td></tr>
        </table>
      </div>`,
    text: `New OxaPay payment from ${userRow?.email ?? existing.userId}: $${amountUsd.toFixed(2)} USD | Credits: ${creditsToAdd} | TrackID: ${trackId}`,
  }).catch((e) => logger.error("oxapay", `Notification email failed: ${e.message}`));

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
// Cleanup: delete waiting/expired OxaPay rows older than 30 min
// ============================================================

export async function cleanupExpiredOxapayTransactions(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
  try {
    const deleted = await db
      .delete(oxapayTransactions)
      .where(
        and(
          inArray(oxapayTransactions.status, ["waiting", "expired"]),
          lte(oxapayTransactions.createdAt, cutoff)
        )
      )
      .returning({ id: oxapayTransactions.id });

    if (deleted.length > 0) {
      logger.info("oxapay", `Cleaned up ${deleted.length} expired pending transaction(s)`);
    }
  } catch (err) {
    logger.error("oxapay", `Cleanup error: ${(err as Error).message}`);
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredOxapayTransactions, 10 * 60 * 1000);
// Also run once at startup (with a small delay to let DB connect)
setTimeout(cleanupExpiredOxapayTransactions, 15_000);

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
