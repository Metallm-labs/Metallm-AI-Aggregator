// ============================================================
// Paddle Payment Integration
// ============================================================
import crypto from "crypto";
import { db } from "../../db";
import { users, paddleTransactions, creditTransactions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import * as logger from "../../logger";

const PADDLE_API_KEY = process.env.PADDLE_API_KEY || "";
const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET || "";
const PADDLE_ENVIRONMENT = process.env.PADDLE_ENVIRONMENT || "production"; // 'sandbox' or 'production'

const PADDLE_API_BASE = PADDLE_ENVIRONMENT === "sandbox"
  ? "https://sandbox-api.paddle.com"
  : "https://api.paddle.com";

// Credit ratio: 1 USD = 1 credit
const CREDIT_RATIO = 1;

// ============================================================
// Paddle API helpers
// ============================================================

export async function getPaddleTransaction(transactionId: string) {
  const res = await fetch(`${PADDLE_API_BASE}/transactions/${transactionId}`, {
    headers: {
      Authorization: `Bearer ${PADDLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Paddle API error: ${res.status} ${text}`);
  }
  return res.json();
}

// ============================================================
// Webhook signature verification
// ============================================================

export function verifyPaddleWebhook(
  rawBody: string | Buffer,
  signature: string | undefined
): boolean {
  if (!PADDLE_WEBHOOK_SECRET) {
    logger.warn("paddle", "No PADDLE_WEBHOOK_SECRET set — skipping signature verification");
    return true; // Allow in dev when no secret is set
  }

  if (!signature) return false;

  try {
    // Paddle uses ts;h1=...;h2=... format
    const parts = signature.split(";");
    const tsStr = parts.find(p => p.startsWith("ts="))?.split("=")[1];
    const h1 = parts.find(p => p.startsWith("h1="))?.split("=")[1];

    if (!tsStr || !h1) return false;

    const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const signedPayload = `${tsStr}:${body}`;

    const expectedSig = crypto
      .createHmac("sha256", PADDLE_WEBHOOK_SECRET)
      .update(signedPayload)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(h1), Buffer.from(expectedSig));
  } catch (err) {
    logger.error("paddle", `Webhook verification error: ${(err as Error).message}`);
    return false;
  }
}

// ============================================================
// Credit Management
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
  // Atomically add credits and return new balance
  const [updated] = await db
    .update(users)
    .set({
      credits: sql`${users.credits}::numeric + ${amount.toString()}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ credits: users.credits });

  const newBalance = parseFloat(updated.credits);

  // Record in ledger
  await db.insert(creditTransactions).values({
    userId,
    type: "purchase",
    amount: amount.toFixed(6),
    balanceAfter: newBalance.toFixed(4),
    description,
    metadata,
  });

  logger.info("paddle", `Added ${amount} credits to user ${userId}. New balance: ${newBalance}`);
  return newBalance;
}

export async function deductCredits(
  userId: string,
  amount: number,
  description: string,
  metadata?: any
): Promise<{ success: boolean; newBalance: number }> {
  // Atomically deduct credits (only if sufficient balance)
  const [result] = await db
    .update(users)
    .set({
      credits: sql`${users.credits}::numeric - ${amount.toString()}::numeric`,
      updatedAt: new Date(),
    })
    .where(
      sql`${users.id} = ${userId} AND ${users.credits}::numeric >= ${amount.toString()}::numeric`
    )
    .returning({ credits: users.credits });

  if (!result) {
    // Insufficient credits
    const currentBalance = await getUserCredits(userId);
    return { success: false, newBalance: currentBalance };
  }

  const newBalance = parseFloat(result.credits);

  // Record in ledger
  await db.insert(creditTransactions).values({
    userId,
    type: "usage",
    amount: (-amount).toFixed(6),
    balanceAfter: newBalance.toFixed(4),
    description,
    metadata,
  });

  return { success: true, newBalance };
}

// ============================================================
// Process completed Paddle transaction
// ============================================================

export async function processCompletedTransaction(
  userId: string,
  paddleTransactionId: string,
  amountPaid: number,
  currency: string,
  quantity: number,
  metadata?: any
): Promise<{ creditsAdded: number; newBalance: number }> {
  // Check if already processed (idempotency)
  const [existing] = await db
    .select()
    .from(paddleTransactions)
    .where(eq(paddleTransactions.paddleTransactionId, paddleTransactionId));

  if (existing) {
    logger.warn("paddle", `Transaction ${paddleTransactionId} already processed`);
    const balance = await getUserCredits(userId);
    return { creditsAdded: parseFloat(existing.creditsAdded), newBalance: balance };
  }

  // Credits = quantity * CREDIT_RATIO (1:1 since price is $1 per credit)
  const creditsToAdd = quantity * CREDIT_RATIO;

  // Record paddle transaction
  await db.insert(paddleTransactions).values({
    userId,
    paddleTransactionId,
    status: "completed",
    amount: amountPaid.toFixed(2),
    currency,
    creditsAdded: creditsToAdd.toFixed(4),
    metadata,
  });

  // Add credits to user
  const newBalance = await addCredits(
    userId,
    creditsToAdd,
    `Purchased ${creditsToAdd} credits via Paddle`,
    { paddleTransactionId, quantity }
  );

  return { creditsAdded: creditsToAdd, newBalance };
}

// ============================================================
// Token usage cost calculation
// Pricing is sourced from server/models.json (pricing.inputPerMillion / outputPerMillion).
// To update pricing, edit models.json only — no code changes needed.
// ============================================================
import modelsJson from "../../models.json";

// Build cost lookup from models.json (per-million → per-token)
const MODEL_COSTS: Record<string, { input: number; cachedInput: number; output: number; free: boolean }> =
  Object.fromEntries(
    modelsJson.models
      .filter((m) => m.pricing != null)
      .map((m) => [
        m.id,
        {
          input: (m.pricing!.inputPerMillion ?? 0) / 1_000_000,
          cachedInput: (m.pricing!.cachedInputPerMillion ?? m.pricing!.inputPerMillion ?? 0) / 1_000_000,
          output: (m.pricing!.outputPerMillion ?? 0) / 1_000_000,
          free: m.pricing!.free ?? (m.pricing!.inputPerMillion === 0 && m.pricing!.outputPerMillion === 0),
        },
      ])
  );

const MODEL_WEB_SEARCH_COSTS: Record<string, { perCall: number }> = Object.fromEntries(
  modelsJson.models
    .filter((m) => m.pricing != null)
    .map((m) => {
      const pricing: any = m.pricing;
      const explicitPerCall = typeof pricing?.webSearchPerCall === "number" ? pricing.webSearchPerCall : null;
      const toolsBasic = typeof pricing?.toolsExtra?.basicSearch === "number" ? pricing.toolsExtra.basicSearch : null;

      // Some providers expose tool costs per 1K calls; normalize to per-call credits.
      const normalizedFromTools = toolsBasic != null
        ? (toolsBasic >= 1 ? toolsBasic / 1000 : toolsBasic)
        : 0;
      const perCall = explicitPerCall != null ? explicitPerCall : normalizedFromTools;
      return [m.id, { perCall: Math.max(0, perCall) }];
    })
);

export function calculateTokenCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  cachedPromptTokens = 0
): number {
  const costs = MODEL_COSTS[modelId];
  // Free models (or unknown models not in models.json) cost nothing
  if (!costs || costs.free) return 0;
  const safeCached = Math.max(0, Math.min(cachedPromptTokens, promptTokens));
  const nonCachedPrompt = Math.max(0, promptTokens - safeCached);
  return nonCachedPrompt * costs.input + safeCached * costs.cachedInput + completionTokens * costs.output;
}

export function calculateWebSearchCost(
  modelId: string,
  options?: {
    webSearchRequested?: boolean;
    webSourcesCount?: number;
  }
): number {
  const cfg = MODEL_WEB_SEARCH_COSTS[modelId];
  if (!cfg || cfg.perCall <= 0) return 0;

  const requested = options?.webSearchRequested === true;
  const sourcesCount = Math.max(0, options?.webSourcesCount ?? 0);
  const didSearch = requested || sourcesCount > 0;
  if (!didSearch) return 0;

  const estimatedCalls = sourcesCount > 0 ? Math.max(1, Math.ceil(sourcesCount / 3)) : 1;
  return cfg.perCall * estimatedCalls;
}

export async function getCreditTransactions(userId: string, limit = 50) {
  return db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(sql`${creditTransactions.createdAt} DESC`)
    .limit(limit);
}
