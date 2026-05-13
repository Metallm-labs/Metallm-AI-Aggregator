import { randomUUID } from "crypto";
import { mkdirSync, existsSync, rmSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { whatsappAccounts, whatsappMessages } from "@shared/schema";
import {
  startSession,
  stopSession,
  logoutSession,
  getSessionState,
  getSessionQr,
  getSessionPhone,
  setSessionReadReceipts,
  setSessionDisappearingMessages,
  type NormalizedInboundMessage,
  type ConnectionState,
} from "./session";
import { handleInboundMessage, activateHumanTakeover } from "./agent";
import { broadcastToUser } from "../../ws";
import * as logger from "../../logger";

const AUTH_ROOT = join(homedir(), ".metallm", "whatsapp-auth");
const DEFAULT_COOLDOWN_SECONDS = 300; // 5 minutes

function loadWorkspaceMetadata(workspacePath: string): Record<string, any> {
  if (!workspacePath) return {};
  const resolved = workspacePath.startsWith("~")
    ? join(homedir(), workspacePath.slice(2))
    : workspacePath;
  const metaPath = join(resolved, "session-metadata.json");
  try {
    if (existsSync(metaPath)) {
      return JSON.parse(readFileSync(metaPath, "utf8"));
    }
  } catch {}
  return {};
}

function resolveAuthDir(accountId: string): string {
  const dir = join(AUTH_ROOT, accountId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function generateAccountId(userId: string): string {
  const slug = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const nonce = randomUUID().replace(/-/g, "").slice(0, 8);
  return `wa_${slug}_${nonce}`;
}

async function updateAccountStatus(accountId: string, status: ConnectionState, extra?: Record<string, unknown>): Promise<void> {
  const updates: Record<string, unknown> = { status, updatedAt: new Date() };
  if (extra) Object.assign(updates, extra);
  await db
    .update(whatsappAccounts)
    .set(updates)
    .where(eq(whatsappAccounts.accountId, accountId));
}

function startSessionForAccount(
  accountId: string,
  userId: string,
  authDir: string,
  workspacePath?: string | null,
): void {
  startSession(accountId, authDir, {
    onQr: (qr) => {
      updateAccountStatus(accountId, "qr_pending").catch(() => {});
      broadcastToUser(userId, "whatsapp_qr", { accountId, qr });
    },
    onConnected: (phone, pushName) => {
      updateAccountStatus(accountId, "connected", { phone, pushName }).catch(() => {});
      broadcastToUser(userId, "whatsapp_connected", { accountId, phone, pushName });
      // Apply settings from workspace metadata
      const meta = workspacePath ? loadWorkspaceMetadata(workspacePath) : {};
      setSessionReadReceipts(accountId, meta.readReceiptsEnabled !== false);
      const disappearDuration = meta.disappearingMessagesEnabled ? (typeof meta.disappearingMessagesDuration === "number" ? meta.disappearingMessagesDuration : 0) : 0;
      setSessionDisappearingMessages(accountId, disappearDuration);
      logger.ok("whatsapp", `Account ${accountId} connected as ${phone}`);
    },
    onDisconnected: (reason) => {
      const disableReasons = ["logged_out", "max_reconnect"];
      const extra = disableReasons.includes(reason) ? { enabled: false } : undefined;
      updateAccountStatus(accountId, "disconnected", extra).catch(() => {});
      broadcastToUser(userId, "whatsapp_disconnected", { accountId, reason });
    },
    onMessage: (msg: NormalizedInboundMessage) => {
      handleInboundMessage(accountId, msg).catch((err) => {
        logger.error("whatsapp", `Agent handler error for ${accountId}: ${(err as Error).message}`);
      });
    },
    onOwnerMessage: (chatJid: string) => {
      // Owner manually replied — activate human takeover cooldown
      const meta = workspacePath ? loadWorkspaceMetadata(workspacePath) : {};
      const enabled = meta.humanTakeoverEnabled !== false; // default: true
      const cooldown = typeof meta.cooldownSeconds === "number" ? meta.cooldownSeconds : DEFAULT_COOLDOWN_SECONDS;

      if (enabled) {
        activateHumanTakeover(accountId, chatJid, cooldown);
        broadcastToUser(userId, "whatsapp_human_takeover", {
          accountId,
          chatJid,
          cooldownSeconds: cooldown,
        });
      }
    },
  }).catch((err) => {
    logger.error("whatsapp", `Failed to start session ${accountId}: ${(err as Error).message}`);
    updateAccountStatus(accountId, "disconnected").catch(() => {});
  });
}

export async function createAccount(params: {
  userId: string;
  systemPrompt?: string;
  aiModel?: string;
  workspacePath?: string;
}): Promise<{ accountId: string; authDir: string }> {
  const accountId = generateAccountId(params.userId);
  const authDir = resolveAuthDir(accountId);

  await db.insert(whatsappAccounts).values({
    userId: params.userId,
    accountId,
    status: "disconnected",
    enabled: true,
    systemPrompt: params.systemPrompt || null,
    aiModel: params.aiModel || "anthropic/claude-sonnet-4-5",
    workspacePath: params.workspacePath || null,
    authDir,
  });

  logger.info("whatsapp", `Created account ${accountId} for user ${params.userId}`);
  return { accountId, authDir };
}

export async function connectAccount(userId: string, accountId: string): Promise<{ qr: string | null }> {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(and(eq(whatsappAccounts.userId, userId), eq(whatsappAccounts.accountId, accountId)))
    .limit(1);

  if (!account) throw new Error("Account not found");

  // Re-enable the account if it was disabled due to max retries
  if (!account.enabled) {
    await db.update(whatsappAccounts).set({ enabled: true }).where(eq(whatsappAccounts.accountId, accountId));
  }

  const currentState = getSessionState(accountId);
  if (currentState === "connected") {
    return { qr: null };
  }

  if (currentState === "qr_pending") {
    return { qr: getSessionQr(accountId) };
  }

  startSessionForAccount(accountId, userId, account.authDir, account.workspacePath);

  // Poll until QR is available, session connects, or timeout (up to 8s).
  // This handles both normal startup and the case where Baileys does a quick
  // reconnect cycle before generating the first QR.
  const maxWaitMs = 8_000;
  const pollMs = 300;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const state = getSessionState(accountId);
    if (state === "connected") return { qr: null };
    const qr = getSessionQr(accountId);
    if (qr) return { qr };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  // If session died during wait (e.g. stale creds caused instant logout),
  // auth dir was cleared — retry once to get a fresh QR
  const stateAfterWait = getSessionState(accountId);
  if (stateAfterWait === "disconnected" && !getSessionQr(accountId)) {
    startSessionForAccount(accountId, userId, account.authDir, account.workspacePath);
    const retryStart = Date.now();
    while (Date.now() - retryStart < maxWaitMs) {
      const state = getSessionState(accountId);
      if (state === "connected") return { qr: null };
      const qr = getSessionQr(accountId);
      if (qr) return { qr };
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  return { qr: getSessionQr(accountId) };
}

export async function disconnectAccount(userId: string, accountId: string): Promise<void> {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(and(eq(whatsappAccounts.userId, userId), eq(whatsappAccounts.accountId, accountId)))
    .limit(1);

  if (!account) throw new Error("Account not found");
  await stopSession(accountId);
  await updateAccountStatus(accountId, "disconnected");
}

export async function logoutAccount(userId: string, accountId: string): Promise<void> {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(and(eq(whatsappAccounts.userId, userId), eq(whatsappAccounts.accountId, accountId)))
    .limit(1);

  if (!account) throw new Error("Account not found");
  await logoutSession(accountId);
  await updateAccountStatus(accountId, "disconnected", { phone: null, pushName: null });
}

export async function deleteAccount(userId: string, accountId: string): Promise<void> {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(and(eq(whatsappAccounts.userId, userId), eq(whatsappAccounts.accountId, accountId)))
    .limit(1);

  if (!account) throw new Error("Account not found");

  // Logout from WhatsApp servers (clears remote session)
  try {
    await logoutSession(accountId);
  } catch {}

  // Stop local session
  await stopSession(accountId);

  // Delete auth directory from disk
  try {
    if (account.authDir && existsSync(account.authDir)) {
      rmSync(account.authDir, { recursive: true, force: true });
    }
  } catch {}

  // Delete all messages and account from DB
  await db.delete(whatsappMessages).where(eq(whatsappMessages.accountId, accountId));
  await db.delete(whatsappAccounts).where(eq(whatsappAccounts.accountId, accountId));

  logger.info("whatsapp", `Deleted account ${accountId} (logged out, auth cleared, messages purged)`);
}

export async function updateAccountSettings(
  userId: string,
  accountId: string,
  settings: {
    systemPrompt?: string;
    aiModel?: string;
    enabled?: boolean;
  },
): Promise<void> {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(and(eq(whatsappAccounts.userId, userId), eq(whatsappAccounts.accountId, accountId)))
    .limit(1);

  if (!account) throw new Error("Account not found");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (settings.systemPrompt !== undefined) updates.systemPrompt = settings.systemPrompt;
  if (settings.aiModel !== undefined) updates.aiModel = settings.aiModel;
  if (settings.enabled !== undefined) updates.enabled = settings.enabled;

  await db
    .update(whatsappAccounts)
    .set(updates)
    .where(eq(whatsappAccounts.accountId, accountId));
}

export function updateReadReceipts(accountId: string, enabled: boolean): void {
  setSessionReadReceipts(accountId, enabled);
}

export function updateDisappearingMessages(accountId: string, duration: number): void {
  setSessionDisappearingMessages(accountId, duration);
}

export async function listAccounts(userId: string) {
  const accounts = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.userId, userId));

  return accounts.map((a) => ({
    ...a,
    liveStatus: getSessionState(a.accountId),
    livePhone: getSessionPhone(a.accountId),
  }));
}

export async function getAccount(userId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(and(eq(whatsappAccounts.userId, userId), eq(whatsappAccounts.accountId, accountId)))
    .limit(1);

  if (!account) return null;

  return {
    ...account,
    liveStatus: getSessionState(account.accountId),
    livePhone: getSessionPhone(account.accountId),
    liveQr: getSessionQr(account.accountId),
  };
}

export async function getAccountChats(userId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(and(eq(whatsappAccounts.userId, userId), eq(whatsappAccounts.accountId, accountId)))
    .limit(1);

  if (!account) throw new Error("Account not found");

  const result = await pool.query(
    `SELECT DISTINCT ON (chat_jid)
       chat_jid,
       body as last_body,
       direction as last_direction,
       sender_name as last_sender_name,
       created_at as last_at,
       (SELECT wm3.sender_name FROM whatsapp_messages wm3 WHERE wm3.account_id = wm.account_id AND wm3.chat_jid = wm.chat_jid AND wm3.direction = 'inbound' AND wm3.sender_name IS NOT NULL LIMIT 1) as contact_name,
       (SELECT COUNT(*) FROM whatsapp_messages wm2 WHERE wm2.account_id = wm.account_id AND wm2.chat_jid = wm.chat_jid) as msg_count
     FROM whatsapp_messages wm
     WHERE account_id = $1
     ORDER BY chat_jid, created_at DESC`,
    [accountId],
  );

  return result.rows;
}

export async function getAccountChatMessages(
  userId: string,
  accountId: string,
  chatJid: string,
  limit = 50,
  offset = 0,
) {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(and(eq(whatsappAccounts.userId, userId), eq(whatsappAccounts.accountId, accountId)))
    .limit(1);

  if (!account) throw new Error("Account not found");

  const result = await pool.query(
    `SELECT id, direction, sender_jid, sender_name, body, media_type, created_at
     FROM whatsapp_messages
     WHERE account_id = $1 AND chat_jid = $2
     ORDER BY created_at ASC
     LIMIT $3 OFFSET $4`,
    [accountId, chatJid, limit, offset],
  );

  return result.rows;
}

export async function bootAllAccounts(): Promise<void> {
  logger.info("whatsapp", "Booting all enabled WhatsApp accounts...");

  const accounts = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.enabled, true));

  if (accounts.length === 0) {
    logger.info("whatsapp", "No enabled WhatsApp accounts to boot");
    return;
  }

  let booted = 0;
  for (const account of accounts) {
    // Only auto-boot accounts that have auth credentials (were previously connected)
    // Accounts without creds.json never connected — they need user to click Connect
    const credsPath = join(account.authDir, "creds.json");
    if (!existsSync(credsPath)) {
      logger.info("whatsapp", `Skipping ${account.accountId} — no auth credentials (needs manual connect)`);
      continue;
    }

    try {
      startSessionForAccount(account.accountId, account.userId, account.authDir, account.workspacePath);
      logger.info("whatsapp", `Booting session for ${account.accountId}`);
      booted++;
    } catch (err) {
      logger.error("whatsapp", `Failed to boot ${account.accountId}: ${(err as Error).message}`);
    }
  }

  logger.ok("whatsapp", `Initiated boot for ${booted}/${accounts.length} account(s) (skipped ${accounts.length - booted} without credentials)`);
}
