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
  resolveUserSubscription,
  changeLsSubscriptionPlan,
  cancelLsSubscription,
  reactivateLsSubscription,
  processLsSubscriptionRenewal,
  upsertUserSubscriptionFromWebhook,
  LS_STORE_ID,
  LS_MONTHLY_VARIANT_ID,
  LS_YEARLY_VARIANT_ID,
  LS_STARTER_VARIANT_ID,
  LS_PRO_VARIANT_ID,
  LS_ENTERPRISE_VARIANT_ID,
} from "./index";
import { syncBusinessAgentSubscriptionFromLemonWebhook } from "../business-agent";
import { SUBSCRIPTION_MONTHLY_PRICE, SUBSCRIPTION_YEARLY_PRICE, type SubscriptionBillingPeriod } from "@shared/billing";
import * as logger from "../../logger";

function getLsCustomUserId(event: any): string | undefined {
  return (
    event?.meta?.custom_data?.userId ||
    event?.meta?.custom_data?.user_id ||
    event?.data?.attributes?.first_subscription_item?.custom_data?.userId ||
    event?.data?.attributes?.first_subscription_item?.custom_data?.user_id
  );
}

function getLsCustomScope(event: any): string | undefined {
  return (
    event?.meta?.custom_data?.subscriptionScope ||
    event?.meta?.custom_data?.subscription_scope ||
    event?.data?.attributes?.first_subscription_item?.custom_data?.subscriptionScope ||
    event?.data?.attributes?.first_subscription_item?.custom_data?.subscription_scope
  );
}

function getLsVariantId(event: any): string {
  return String(
    event?.data?.attributes?.variant_id ||
      event?.data?.attributes?.first_subscription_item?.variant_id ||
      event?.data?.attributes?.first_order_item?.variant_id ||
      "",
  ).trim();
}

function isBusinessAgentBillingEvent(event: any): boolean {
  const scope = String(getLsCustomScope(event) || "").trim().toLowerCase();
  if (scope === "business_agent") {
    return true;
  }

  const variantId = getLsVariantId(event);
  if (!variantId) {
    return false;
  }

  const businessVariantIds = new Set(
    [LS_STARTER_VARIANT_ID, LS_PRO_VARIANT_ID, LS_ENTERPRISE_VARIANT_ID]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );

  return businessVariantIds.has(variantId);
}

export function registerLemonSqueezyRoutes(app: Express) {
  // ─── Get Lemon Squeezy config (safe to expose) ───
  app.get("/api/lemonsqueezy/config", isAuthenticated, (_req: Request, res: Response) => {
    res.json({
      storeId: LS_STORE_ID,
      monthlyVariantId: LS_MONTHLY_VARIANT_ID,
      yearlyVariantId: LS_YEARLY_VARIANT_ID,
      minQuantity: 1,
      creditRatio: 1, // 1 USD = 1 credit
    });
  });

  app.get("/api/subscription/manage", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const email: string | undefined = user.email;
      const subscription = await resolveUserSubscription(userId, email);

      if (!subscription) {
        return res.json({
          subscription: null,
          plans: {
            monthlyPrice: SUBSCRIPTION_MONTHLY_PRICE,
            yearlyPrice: SUBSCRIPTION_YEARLY_PRICE,
          },
        });
      }

      res.json({
        subscription: {
          subscriptionId: subscription.subscriptionId,
          status: subscription.status,
          planInterval: subscription.planInterval,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          customerPortalUrl: subscription.customerPortalUrl,
          updateSubscriptionUrl: subscription.updateSubscriptionUrl,
          updatePaymentMethodUrl: subscription.updatePaymentMethodUrl,
          renewsAt: subscription.renewsAt,
          endsAt: subscription.endsAt,
          paymentProcessor: subscription.paymentProcessor,
        },
        plans: {
          monthlyPrice: SUBSCRIPTION_MONTHLY_PRICE,
          yearlyPrice: SUBSCRIPTION_YEARLY_PRICE,
        },
      });
    } catch (err) {
      logger.error("lemonsqueezy", `Get subscription manage error: ${(err as Error).message}`);
      res.status(500).json({ message: "Failed to load subscription details" });
    }
  });

  app.post("/api/subscription/change-plan", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const email: string | undefined = user.email;
      const { billingPeriod } = req.body as { billingPeriod?: SubscriptionBillingPeriod };

      if (billingPeriod !== "monthly" && billingPeriod !== "yearly") {
        return res.status(400).json({ message: "Invalid billing period" });
      }

      const result = await changeLsSubscriptionPlan(userId, email, billingPeriod);
      res.json(result);
    } catch (err) {
      logger.error("lemonsqueezy", `Change subscription plan error: ${(err as Error).message}`);
      res.status(500).json({ message: (err as Error).message || "Failed to update subscription plan" });
    }
  });

  app.post("/api/subscription/cancel", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const email: string | undefined = user.email;
      const subscription = await cancelLsSubscription(userId, email);
      res.json({
        subscription,
        redirectUrl: subscription.customerPortalUrl,
        mode: "webhook_only",
      });
    } catch (err) {
      logger.error("lemonsqueezy", `Cancel subscription error: ${(err as Error).message}`);
      res.status(500).json({ message: (err as Error).message || "Failed to cancel subscription" });
    }
  });

  app.post("/api/subscription/reactivate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const email: string | undefined = user.email;
      const subscription = await reactivateLsSubscription(userId, email);
      res.json({
        subscription,
        redirectUrl: subscription.customerPortalUrl,
        mode: "webhook_only",
      });
    } catch (err) {
      logger.error("lemonsqueezy", `Reactivate subscription error: ${(err as Error).message}`);
      res.status(500).json({ message: (err as Error).message || "Failed to reactivate subscription" });
    }
  });

  // ─── Create a Lemon Squeezy checkout ───
  app.post("/api/lemonsqueezy/create-checkout", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const email: string | undefined = user.email;
      const { billingPeriod } = req.body;

      if (billingPeriod !== "monthly" && billingPeriod !== "yearly") {
        return res.status(400).json({ message: "Invalid billing period" });
      }

      const { checkoutUrl, checkoutId } = await createLsCheckout(userId, email, billingPeriod);
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
          const isBusinessBilling = isBusinessAgentBillingEvent(event);
          if (isBusinessBilling) {
            logger.info("lemonsqueezy", `Skipping wallet credit processing for business-agent order ${event.data?.id || "unknown"}`);
            break;
          }

          const orderData = event.data?.attributes;
          const customUserId = getLsCustomUserId(event) || orderData?.first_order_item?.custom_data?.userId;

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

        case "customer_updated": {
          const customer = event.data?.attributes;
          logger.info(
            "lemonsqueezy",
            `Customer updated: ${event.data?.id} (${customer?.email || "unknown email"})`
          );
          break;
        }

        case "subscription_created":
        case "subscription_updated":
        case "subscription_cancelled":
        case "subscription_resumed":
        case "subscription_expired":
        case "subscription_paused":
        case "subscription_unpaused": {
          const subscription = event.data?.attributes;
          const isBusinessBilling = isBusinessAgentBillingEvent(event);
          await syncBusinessAgentSubscriptionFromLemonWebhook(event);
          if (!isBusinessBilling) {
            await upsertUserSubscriptionFromWebhook(event);
          }
          const customUserId = getLsCustomUserId(event);
          logger.info(
            "lemonsqueezy",
            `${eventName}: subscription ${event.data?.id} status=${subscription?.status || "unknown"} user=${customUserId || "unknown"} businessScope=${isBusinessBilling}`
          );
          break;
        }

        case "subscription_payment_success": {
          const isBusinessBilling = isBusinessAgentBillingEvent(event);
          await syncBusinessAgentSubscriptionFromLemonWebhook(event);

          if (isBusinessBilling) {
            logger.info(
              "lemonsqueezy",
              `Skipping wallet renewal processing for business-agent subscription payment ${event.data?.id || "unknown"}`,
            );
            break;
          }

          const invoice = event.data?.attributes;
          const subscriptionId = invoice?.subscription_id ? String(invoice.subscription_id) : "";
          const invoiceId = event.data?.id ? String(event.data.id) : "";
          const orderId = invoice?.order_id ? String(invoice.order_id) : null;
          const amountUsd = Number(((invoice?.subtotal ?? invoice?.total ?? 0) / 100).toFixed(2));
          const currency = invoice?.currency || "USD";

          if (subscriptionId && invoiceId) {
            const renewal = await processLsSubscriptionRenewal(
              subscriptionId,
              invoiceId,
              orderId,
              amountUsd,
              currency
            );
            logger.info(
              "lemonsqueezy",
              `Subscription payment success processed: subscription=${subscriptionId} user=${renewal.userId} balance=${renewal.newBalance} skipped=${renewal.skipped}`
            );
          }

          logger.info(
            "lemonsqueezy",
            `Subscription payment success: ${event.data?.id} subscription=${invoice?.subscription_id || "unknown"} order=${invoice?.order_id || "unknown"}`
          );
          break;
        }

        case "subscription_payment_failed":
        case "subscription_payment_recovered": {
          const invoice = event.data?.attributes;
          logger.info(
            "lemonsqueezy",
            `${eventName}: ${event.data?.id} subscription=${invoice?.subscription_id || "unknown"} order=${invoice?.order_id || "unknown"}`
          );
          break;
        }

        default:
          logger.info("lemonsqueezy", `Ignoring unsupported event: ${eventName}`);
      }

      res.status(200).json({ received: true });
    } catch (err) {
      logger.error("lemonsqueezy", `Webhook error: ${(err as Error).message}`);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });
}
