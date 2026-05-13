import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  createAccount,
  connectAccount,
  disconnectAccount,
  logoutAccount,
  deleteAccount,
  updateAccountSettings,
  listAccounts,
  getAccount,
  getAccountChats,
  getAccountChatMessages,
} from "./manager";
import * as logger from "../../logger";

function getUserId(req: Request): string | null {
  const user = req.user as any;
  return user?.id || user?.claims?.sub || null;
}

const createAccountSchema = z.object({
  systemPrompt: z.string().optional(),
  aiModel: z.string().optional(),
});

const updateSettingsSchema = z.object({
  systemPrompt: z.string().optional(),
  aiModel: z.string().optional(),
  enabled: z.boolean().optional(),
});

export function registerWhatsAppRoutes(
  app: Express,
  isAuthenticated: any,
  isVerifiedUser: any,
) {
  app.get("/api/whatsapp/accounts", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const accounts = await listAccounts(userId);
      res.json({ accounts });
    } catch (err) {
      logger.error("whatsapp", `List accounts error: ${(err as Error).message}`);
      res.status(500).json({ error: "Failed to list accounts" });
    }
  });

  app.get("/api/whatsapp/accounts/:accountId", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const account = await getAccount(userId, req.params.accountId as string);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json({ account });
    } catch (err) {
      logger.error("whatsapp", `Get account error: ${(err as Error).message}`);
      res.status(500).json({ error: "Failed to get account" });
    }
  });

  app.post("/api/whatsapp/accounts", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const body = createAccountSchema.parse(req.body);
      const result = await createAccount({
        userId,
        systemPrompt: body.systemPrompt,
        aiModel: body.aiModel,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: err.errors });
      }
      logger.error("whatsapp", `Create account error: ${(err as Error).message}`);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.post("/api/whatsapp/accounts/:accountId/connect", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const result = await connectAccount(userId, req.params.accountId as string);
      res.json(result);
    } catch (err) {
      logger.error("whatsapp", `Connect error: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/whatsapp/accounts/:accountId/disconnect", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      await disconnectAccount(userId, req.params.accountId as string);
      res.json({ ok: true });
    } catch (err) {
      logger.error("whatsapp", `Disconnect error: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/whatsapp/accounts/:accountId/logout", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      await logoutAccount(userId, req.params.accountId as string);
      res.json({ ok: true });
    } catch (err) {
      logger.error("whatsapp", `Logout error: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/whatsapp/accounts/:accountId", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      await deleteAccount(userId, req.params.accountId as string);
      res.json({ ok: true });
    } catch (err) {
      logger.error("whatsapp", `Delete error: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.patch("/api/whatsapp/accounts/:accountId/settings", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const body = updateSettingsSchema.parse(req.body);
      await updateAccountSettings(userId, req.params.accountId as string, body);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: err.errors });
      }
      logger.error("whatsapp", `Update settings error: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/whatsapp/accounts/:accountId/chats", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const chats = await getAccountChats(userId, req.params.accountId as string);
      res.json({ chats });
    } catch (err) {
      logger.error("whatsapp", `Get chats error: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/whatsapp/accounts/:accountId/chats/:chatJid/messages", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      const messages = await getAccountChatMessages(
        userId,
        req.params.accountId as string,
        decodeURIComponent(req.params.chatJid as string),
        limit,
        offset,
      );
      res.json({ messages });
    } catch (err) {
      logger.error("whatsapp", `Get messages error: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/whatsapp/accounts/:accountId/qr", isAuthenticated, isVerifiedUser, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const account = await getAccount(userId, req.params.accountId as string);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json({ qr: account.liveQr, status: account.liveStatus });
    } catch (err) {
      logger.error("whatsapp", `QR error: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  logger.ok("whatsapp", "WhatsApp API routes registered");
}
