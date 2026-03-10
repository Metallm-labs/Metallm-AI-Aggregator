// ============================================================
// Lemon Squeezy Payment Routes
// ============================================================
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import {
  createLsCheckout,
  verifyLsWebhook,
  processLsOrder,
  getCreditTransactions,
  getUserCredits,
  LS_STORE_ID,
  LS_VARIANT_ID,
} from "./index";
import * as logger from "../../logger";

export function registerLemonSqueezyRoutes(app: Express) {
  // ─── Get Lemon Squeezy config (safe to expose) ───
  app.get("/api/lemonsqueezy/config", isAuthenticated, (_req: Request, res: Response) => {
    res.json({
      storeId: LS_STORE_ID,
      variantId: LS_VARIANT_ID,
      minQuantity: 1,
      creditRatio: 1, // 1 USD = 1 credit
    });
  });

  // ─── Create a Lemon Squeezy checkout ───
  app.post("/api/lemonsqueezy/create-checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const email: string | undefined = user.email;
      const { amount } = req.body;

      const parsed = parseFloat(amount);
      if (!parsed || parsed < 1) {
        return res.status(400).json({ message: "Amount must be at least $1" });
      }

      const { checkoutUrl, checkoutId } = await createLsCheckout(userId, email, parsed);
      res.json({ checkoutUrl, checkoutId });
    } catch (err) {
      logger.error("lemonsqueezy", `Create checkout error: ${(err as Error).message}`);
      res.status(500).json({ message: "Failed to create checkout" });
    }
  });

  // ─── Get user credit balance ───
  app.get("/api/credits/balance", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const credits = await getUserCredits(userId);
      res.json({ credits });
    } catch (err) {
      logger.error("lemonsqueezy", `Error fetching balance: ${(err as Error).message}`);
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
      logger.error("lemonsqueezy", `Error fetching transactions: ${(err as Error).message}`);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // ─── Lemon Squeezy Webhook ───
  app.post("/api/lemonsqueezy/webhook", async (req: Request, res: Response) => {
    try {
      const signature = req.headers["x-signature"] as string | undefined;
      const rawBody = (req as any).rawBody;

      if (!verifyLsWebhook(rawBody, signature)) {
        logger.warn("lemonsqueezy", "Webhook signature verification failed");
        return res.status(401).json({ message: "Invalid signature" });
      }

      const event = req.body;
      const eventName: string = event.meta?.event_name || "";
      logger.info("lemonsqueezy", `Webhook received: ${eventName}`);

      switch (eventName) {
        case "order_created": {
          const orderData = event.data?.attributes;
          const customUserId: string | undefined =
            event.meta?.custom_data?.userId ||
            event.meta?.custom_data?.user_id ||
            orderData?.first_order_item?.custom_data?.userId;

          if (!customUserId) {
            logger.warn("lemonsqueezy", `order_created without userId in custom_data`);
            break;
          }

          // Only credit paid orders
          if (orderData?.status !== "paid") {
            logger.info("lemonsqueezy", `Order ${event.data?.id} status is ${orderData?.status}, skipping`);
            break;
          }

          // amount_total is in cents
          const amountUsd = (orderData?.total ?? 0) / 100;
          const currency: string = orderData?.currency || "USD";
          const lsOrderId = String(event.data?.id);

          await processLsOrder(customUserId, lsOrderId, amountUsd, currency, {
            webhookEvent: eventName,
          });

          logger.info("lemonsqueezy", `Credits added for user ${customUserId} via webhook (order ${lsOrderId})`);
          break;
        }

        case "subscription_payment_success": {
          // Future: handle subscription renewals
          logger.info("lemonsqueezy", `Subscription payment success: ${event.data?.id}`);
          break;
        }

        default:
          logger.info("lemonsqueezy", `Unhandled event: ${eventName}`);
      }

      res.status(200).json({ received: true });
    } catch (err) {
      logger.error("lemonsqueezy", `Webhook error: ${(err as Error).message}`);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });
}
