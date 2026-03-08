// ============================================================
// OxaPay Crypto Payment Routes
// ============================================================
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import {
  createOxapayInvoice,
  createPendingOxapayTransaction,
  processOxapayPayment,
  expireOxapayTransaction,
  checkOxapayStatus,
  getOxapayTransaction,
  getUserCredits,
} from "./index";
import * as logger from "../../logger";
import crypto from "crypto";

// OXAPAY_MERCHANT_KEY is validated on module load in ./index.ts

function getBaseUrl(req: Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${protocol}://${host}`;
}

export function registerOxapayRoutes(app: Express) {
  // ─── Create OxaPay invoice ───
  app.post("/api/oxapay/create-invoice", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const { amount } = req.body;

      const amountNum = parseFloat(amount);
      if (!amountNum || amountNum < 1) {
        return res.status(400).json({ message: "Minimum amount is $1 USD" });
      }
      if (amountNum > 10000) {
        return res.status(400).json({ message: "Maximum amount is $10,000 USD" });
      }

      const orderId = `ox_${userId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const baseUrl = getBaseUrl(req);
      const callbackUrl = `${baseUrl}/api/oxapay/callback`;
      const returnUrl = `${baseUrl}/dashboard?payment=crypto&status=complete`;

      const invoice = await createOxapayInvoice(
        amountNum,
        orderId,
        `Add $${amountNum.toFixed(2)} to Metallm balance`,
        callbackUrl,
        returnUrl,
        user.email,
      );

      // Store pending transaction
      await createPendingOxapayTransaction(userId, invoice.trackId, orderId, amountNum);

      logger.info("oxapay", `Invoice created for user ${userId}: trackId=${invoice.trackId} amount=${amountNum}`);

      res.json({
        trackId: invoice.trackId,
        payLink: invoice.payLink,
        amount: amountNum,
      });
    } catch (err) {
      logger.error("oxapay", `Create invoice error: ${(err as Error).message}`);
      res.status(500).json({ message: `Failed to create crypto invoice: ${(err as Error).message}` });
    }
  });

  // ─── Poll payment status (client polling) ───
  app.get("/api/oxapay/status/:trackId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.id || user.claims?.sub;
      const { trackId } = req.params;

      if (!trackId || typeof trackId !== "string" || !/^[\w-]+$/.test(trackId)) {
        return res.status(400).json({ message: "Invalid trackId" });
      }

      // Verify ownership
      const tx = await getOxapayTransaction(trackId);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      if (tx.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      // Return cached status if already paid/expired
      if (tx.status === "paid" || tx.status === "expired" || tx.status === "error") {
        const balance = tx.status === "paid" ? await getUserCredits(userId) : undefined;
        return res.json({ status: tx.status, creditsAdded: parseFloat(tx.creditsAdded), balance });
      }

      // Query live status from OxaPay
      const live = await checkOxapayStatus(trackId);
      const normalizedStatus = live.status.toLowerCase();

      if (normalizedStatus === "paid" || normalizedStatus === "overpaid") {
        // Process the payment if not yet done
        if (tx.status !== "paid") {
          const result = await processOxapayPayment(trackId, live.status, live);
          return res.json({
            status: "paid",
            creditsAdded: result.creditsAdded,
            balance: result.newBalance,
          });
        }
      } else if (normalizedStatus === "expired" || normalizedStatus === "error") {
        await expireOxapayTransaction(trackId);
        return res.json({ status: normalizedStatus });
      }

      res.json({ status: normalizedStatus });
    } catch (err) {
      logger.error("oxapay", `Status check error: ${(err as Error).message}`);
      res.status(500).json({ message: "Failed to check payment status" });
    }
  });

  // ─── OxaPay Webhook Callback (no auth — called by OxaPay servers) ───
  app.post("/api/oxapay/callback", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      logger.info("oxapay", `Webhook received: ${JSON.stringify(payload)}`);

      const { trackId, status, orderId } = payload;

      if (!trackId) {
        return res.status(400).json({ message: "Missing trackId" });
      }

      // Validate trackId format — only alphanumeric and hyphens allowed
      if (typeof trackId !== "string" || !/^[\w-]+$/.test(trackId)) {
        return res.status(400).json({ message: "Invalid trackId format" });
      }

      const normalizedStatus = (status || "").toLowerCase();

      if (normalizedStatus === "paid" || normalizedStatus === "overpaid") {
        try {
          const result = await processOxapayPayment(String(trackId), status, payload);
          if (!result.alreadyProcessed) {
            logger.info("oxapay", `Payment processed: trackId=${trackId} credits=${result.creditsAdded}`);
          }
        } catch (err) {
          logger.error("oxapay", `Payment processing error for ${trackId}: ${(err as Error).message}`);
          // Still return 200 to prevent OxaPay from retrying infinitely
        }
      } else if (normalizedStatus === "expired" || normalizedStatus === "error") {
        await expireOxapayTransaction(String(trackId)).catch((e) =>
          logger.error("oxapay", `Expire error: ${e.message}`)
        );
      }

      // OxaPay expects a 200 OK response
      res.status(200).json({ result: 100 });
    } catch (err) {
      logger.error("oxapay", `Webhook error: ${(err as Error).message}`);
      res.status(200).json({ result: 100 }); // still 200 to avoid retries
    }
  });
}
