// ============================================================
// QBitcoin (QBC) Payment Routes
// ============================================================
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import {
  getOrCreateDepositWallet,
  checkAndProcessDeposit,
  getQbcUsdPrice,
  getUserCredits,
  MIN_DEPOSIT_USD,
  SHOR_PER_QBC,
} from "./index";
import * as logger from "../../logger";

export function registerQbcRoutes(app: Express) {
  // ─── Get or create deposit wallet ───
  // Returns: { address, qbcPrice, minQbc, minUsd }
  app.post("/api/qbitcoin/wallet", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

      const [wallet, qbcPrice] = await Promise.all([
        getOrCreateDepositWallet(user.id),
        getQbcUsdPrice(),
      ]);

      const minQbc = MIN_DEPOSIT_USD / qbcPrice;

      logger.info("qbc-routes", `Deposit wallet for user ${user.id}: ${wallet.address}`);

      return res.json({
        address: wallet.address,
        qbcPrice,
        minQbc: parseFloat(minQbc.toFixed(2)),
        minUsd: MIN_DEPOSIT_USD,
      });
    } catch (err: any) {
      logger.error("qbc-routes", "wallet route error", err);
      return res.status(500).json({ error: "Failed to get QBC deposit wallet" });
    }
  });

  // ─── Check deposit status ───
  // Returns: { address, qbcPrice, minQbc, balanceQbc, confirmations, creditsAdded, status }
  app.get("/api/qbitcoin/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

      const status = await checkAndProcessDeposit(user.id);
      const currentCredits = await getUserCredits(user.id);

      return res.json({ ...status, currentCredits });
    } catch (err: any) {
      // If no wallet exists yet, return a sensible response
      if (err.message?.includes("No QBC wallet")) {
        return res.json({
          address: null,
          qbcPrice: await getQbcUsdPrice().catch(() => 0.0003),
          minQbc: 0,
          balanceQbc: 0,
          confirmations: 0,
          creditsAdded: 0,
          status: "waiting",
          currentCredits: 0,
        });
      }
      logger.error("qbc-routes", "status route error", err);
      return res.status(500).json({ error: "Failed to check QBC deposit status" });
    }
  });
}
