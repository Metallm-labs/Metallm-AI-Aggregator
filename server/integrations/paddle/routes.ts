// ============================================================
// Paddle Payment Routes
// ============================================================
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import {
  getUserCredits,
  getCreditTransactions,
  processCompletedTransaction,
  verifyPaddleWebhook,
  getPaddleTransaction,
  calculateTokenCost,
  deductCredits,
} from "./index";
import * as logger from "../../logger";

const PADDLE_PRICE_ID = process.env.PADDLE_PRICE_ID || "pri_01kjvzf6dq5p2j1d5g3b4d7fmv";
const PADDLE_CLIENT_TOKEN = process.env.PADDLE_CLIENT_TOKEN || "live_ac57f7ea32464818370b70b0c5b";

export function registerPaddleRoutes(app: Express) {
  // ─── Get Paddle client config (safe to expose) ───
  app.get("/api/paddle/config", isAuthenticated, (_req: Request, res: Response) => {
    res.json({
      clientToken: PADDLE_CLIENT_TOKEN,
      priceId: PADDLE_PRICE_ID,
      environment: process.env.PADDLE_ENVIRONMENT || "production",
      minQuantity: 1,
      creditRatio: 1, // 1 USD = 1 credit
    });
  });

  // ─── Get user credit balance ───
  app.get("/api/credits/balance", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const credits = await getUserCredits(userId);
      res.json({ credits });
    } catch (err) {
      logger.error("paddle", `Error fetching balance: ${(err as Error).message}`);
      res.status(500).json({ message: "Failed to fetch credit balance" });
    }
  });

  // ─── Get credit transaction history ───
  app.get("/api/credits/transactions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const transactions = await getCreditTransactions(userId, limit);
      res.json(transactions);
    } catch (err) {
      logger.error("paddle", `Error fetching transactions: ${(err as Error).message}`);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // ─── Verify & complete transaction (called by client after Paddle checkout) ───
  app.post("/api/paddle/verify-transaction", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const { transactionId } = req.body;

      if (!transactionId) {
        return res.status(400).json({ message: "Transaction ID is required" });
      }

      // Verify with Paddle API
      const paddleData = await getPaddleTransaction(transactionId);
      const txn = paddleData.data;

      if (!txn || txn.status !== "completed") {
        return res.status(400).json({ message: "Transaction is not completed yet" });
      }

      // Extract amount and quantity from Paddle transaction
      const totalAmount = parseFloat(txn.details?.totals?.total || "0") / 100; // Paddle amounts are in cents
      const currency = txn.currency_code || "USD";
      const quantity = txn.items?.[0]?.quantity || 1;

      const result = await processCompletedTransaction(
        userId,
        transactionId,
        totalAmount,
        currency,
        quantity,
        { paddleStatus: txn.status, items: txn.items }
      );

      res.json({
        success: true,
        creditsAdded: result.creditsAdded,
        newBalance: result.newBalance,
      });
    } catch (err) {
      logger.error("paddle", `Verify transaction error: ${(err as Error).message}`);
      res.status(500).json({ message: "Failed to verify transaction" });
    }
  });

  // ─── Paddle Webhook ───
  app.post("/api/paddle/webhook", async (req: Request, res: Response) => {
    try {
      const signature = req.headers["paddle-signature"] as string | undefined;
      const rawBody = (req as any).rawBody;

      // Verify webhook signature
      if (!verifyPaddleWebhook(rawBody, signature)) {
        logger.warn("paddle", "Webhook signature verification failed");
        return res.status(401).json({ message: "Invalid signature" });
      }

      const event = req.body;
      logger.info("paddle", `Webhook received: ${event.event_type}`);

      switch (event.event_type) {
        case "transaction.completed": {
          const txnData = event.data;
          // Paddle v2 uses custom_data (snake_case), but check both
          const customData = txnData.custom_data || txnData.customData || {};
          const userId = customData?.userId || customData?.user_id;

          if (!userId) {
            logger.warn("paddle", `Transaction completed (${txnData.id}) but no userId in custom_data. Keys: ${JSON.stringify(Object.keys(txnData))}`);
            break;
          }

          const totalAmount = parseFloat(txnData.details?.totals?.total || txnData.details?.totals?.grand_total || "0") / 100;
          const currency = txnData.currency_code || "USD";
          const quantity = txnData.items?.[0]?.quantity || 1;

          await processCompletedTransaction(
            userId,
            txnData.id,
            totalAmount,
            currency,
            quantity,
            { webhookEvent: event.event_type }
          );

          logger.info("paddle", `Credits added for user ${userId} via webhook`);
          break;
        }

        case "transaction.payment_failed": {
          logger.warn("paddle", `Payment failed: ${event.data?.id}`);
          break;
        }

        default:
          logger.info("paddle", `Unhandled event type: ${event.event_type}`);
      }

      res.status(200).json({ received: true });
    } catch (err) {
      logger.error("paddle", `Webhook error: ${(err as Error).message}`);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });
}
