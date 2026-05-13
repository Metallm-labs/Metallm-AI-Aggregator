import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  type WASocket,
} from "baileys";
import { Boom } from "@hapi/boom";
import { mkdirSync, readFileSync, existsSync, rmSync } from "fs";
import { extname } from "path";
import pino from "pino";
import QRCode from "qrcode";
import * as logger from "../../logger";

const baileysLogger = pino({ level: "silent" });

export type ConnectionState = "disconnected" | "connecting" | "qr_pending" | "connected";

export type SessionEvents = {
  onQr: (qr: string) => void;
  onConnected: (phone: string, pushName: string) => void;
  onDisconnected: (reason: string) => void;
  onMessage: (msg: NormalizedInboundMessage) => void;
  onOwnerMessage: (chatJid: string) => void;
};

export type NormalizedInboundMessage = {
  messageId: string;
  chatJid: string;
  senderJid: string;
  senderName: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  isGroup: boolean;
  quotedMessage?: { body: string; senderJid: string };
  rawKey?: any;
  audioBuffer?: Buffer;
  mediaType?: "audio" | "text";
};

type ManagedSession = {
  sock: WASocket;
  accountId: string;
  state: ConnectionState;
  qr: string | null;
  phone: string | null;
  pushName: string | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  qrAttempts: number;
  intentionallyStopped: boolean;
  botSentIds: Set<string>;
  readReceiptsEnabled: boolean;
  connectedAt: number;
  disappearingMessages: number; // 0 = off, seconds otherwise (86400, 604800, 7776000)
  configuredDisappearingChats: Set<string>;
};

const sessions = new Map<string, ManagedSession>();

const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_QR_ATTEMPTS = 5;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

function getReconnectDelay(attempt: number): number {
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(1.8, attempt), RECONNECT_MAX_MS);
  const jitter = delay * 0.25 * Math.random();
  return Math.round(delay + jitter);
}

export function getSession(accountId: string): ManagedSession | undefined {
  return sessions.get(accountId);
}

export function getSessionState(accountId: string): ConnectionState {
  return sessions.get(accountId)?.state ?? "disconnected";
}

export function getSessionQr(accountId: string): string | null {
  return sessions.get(accountId)?.qr ?? null;
}

export function getSessionPhone(accountId: string): string | null {
  return sessions.get(accountId)?.phone ?? null;
}

export function getAllSessions(): Map<string, ManagedSession> {
  return sessions;
}

export function setSessionReadReceipts(accountId: string, enabled: boolean): void {
  const session = sessions.get(accountId);
  if (session) {
    session.readReceiptsEnabled = enabled;
    logger.info("whatsapp", `Read receipts ${enabled ? "enabled" : "disabled"} for ${accountId}`);
  }
}

export function setSessionDisappearingMessages(accountId: string, duration: number): void {
  const session = sessions.get(accountId);
  if (session) {
    session.disappearingMessages = duration;
    session.configuredDisappearingChats.clear(); // re-apply to all chats
    logger.info("whatsapp", `Disappearing messages ${duration ? `set to ${duration}s` : "disabled"} for ${accountId}`);
  }
}

function jidToPhone(jid: string): string {
  const raw = jid.split("@")[0].split(":")[0];
  return raw.startsWith("+") ? raw : `+${raw}`;
}

function extractMessageText(msg: any): string {
  if (!msg?.message) return "";
  const m = msg.message;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId)
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  if (m.audioMessage) return "__voice_message__";
  return "";
}

function hasAudioMessage(msg: any): boolean {
  if (!msg?.message) return false;
  return !!msg.message.audioMessage;
}

async function tryDownloadAudio(msg: any): Promise<Buffer | undefined> {
  try {
    const buffer = await downloadMediaMessage(msg, "buffer", {});
    return buffer as Buffer;
  } catch (err) {
    logger.warn("whatsapp", `Failed to download audio: ${(err as Error).message}`);
    return undefined;
  }
}

function extractQuotedMessage(msg: any): NormalizedInboundMessage["quotedMessage"] | undefined {
  const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return undefined;
  const senderJid = msg.message.extendedTextMessage.contextInfo.participant || "";
  let body = "";
  if (quoted.conversation) body = quoted.conversation;
  else if (quoted.extendedTextMessage?.text) body = quoted.extendedTextMessage.text;
  return { body, senderJid };
}

export async function startSession(
  accountId: string,
  authDir: string,
  events: SessionEvents,
): Promise<void> {
  const existing = sessions.get(accountId);
  if (existing && existing.state !== "disconnected") {
    logger.warn("whatsapp", `Session ${accountId} already active (${existing.state}), skipping start`);
    return;
  }

  mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
    },
    logger: baileysLogger,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  const prevSession = sessions.get(accountId);
  const session: ManagedSession = {
    sock,
    accountId,
    state: "connecting",
    qr: null,
    phone: null,
    pushName: null,
    reconnectTimer: null,
    reconnectAttempts: prevSession?.reconnectAttempts ?? 0,
    qrAttempts: prevSession?.qrAttempts ?? 0,
    intentionallyStopped: false,
    botSentIds: new Set(),
    readReceiptsEnabled: true,
    connectedAt: 0,
    disappearingMessages: 0,
    configuredDisappearingChats: new Set(),
  };
  sessions.set(accountId, session);

  const recentInbound = new Set<string>();

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.qrAttempts++;

      if (session.qrAttempts > MAX_QR_ATTEMPTS) {
        logger.warn("whatsapp", `${accountId} QR code expired ${MAX_QR_ATTEMPTS} times without scan — stopping session`);
        session.intentionallyStopped = true;
        session.state = "disconnected";
        session.qr = null;
        sessions.delete(accountId);
        try { session.sock.end(undefined); } catch {}
        events.onDisconnected("qr_timeout");
        return;
      }

      session.state = "qr_pending";
      QRCode.toDataURL(qr, { width: 300, margin: 2 })
        .then((dataUrl: string) => {
          session.qr = dataUrl;
          events.onQr(dataUrl);
          logger.info("whatsapp", `QR code generated for ${accountId} (${session.qrAttempts}/${MAX_QR_ATTEMPTS})`);
        })
        .catch(() => {
          session.qr = qr;
          events.onQr(qr);
        });
    }

    if (connection === "open") {
      session.state = "connected";
      session.qr = null;
      session.reconnectAttempts = 0;
      session.qrAttempts = 0;
      session.connectedAt = Date.now();

      const me = sock.user;
      const phone = me?.id ? jidToPhone(me.id) : "unknown";
      const name = me?.name || "WhatsApp User";
      session.phone = phone;
      session.pushName = name;

      events.onConnected(phone, name);
      logger.ok("whatsapp", `Connected ${accountId} as ${phone} (${name})`);
    }

    if (connection === "close") {
      // If we intentionally stopped (qr_timeout, manual stop), ignore this event
      if (session.intentionallyStopped) return;

      const wasWaitingForQr = session.state === "qr_pending" || (!session.phone && session.connectedAt === 0);
      session.state = "disconnected";
      session.qr = null;

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const reason = DisconnectReason;

      if (statusCode === reason.loggedOut) {
        logger.warn("whatsapp", `${accountId} logged out — clearing auth and session`);
        sessions.delete(accountId);
        try { rmSync(authDir, { recursive: true, force: true }); } catch {}
        events.onDisconnected("logged_out");
        return;
      }

      // If we were waiting for a QR scan and got a hard timeout, don't reconnect.
      // For other disconnect reasons (restartRequired, connectionClosed, etc.),
      // allow reconnection so Baileys can generate a fresh QR — like WhatsApp Web does.
      if (wasWaitingForQr) {
        if (statusCode === reason.timedOut || statusCode === 408) {
          logger.info("whatsapp", `${accountId} timed out waiting for QR scan — not reconnecting`);
          sessions.delete(accountId);
          events.onDisconnected("qr_timeout");
          return;
        }
        // Non-timeout disconnect during QR — reconnect to generate fresh QR
        logger.info("whatsapp", `${accountId} disconnected during QR (code=${statusCode}) — reconnecting for fresh QR`);
        session.reconnectAttempts++;
        if (session.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
          logger.warn("whatsapp", `${accountId} max reconnect attempts reached during QR`);
          sessions.delete(accountId);
          events.onDisconnected("qr_timeout");
          return;
        }
        const delay = getReconnectDelay(session.reconnectAttempts - 1);
        session.reconnectTimer = setTimeout(() => {
          startSession(accountId, authDir, events);
        }, delay);
        return;
      }

      if (statusCode === reason.restartRequired) {
        logger.info("whatsapp", `${accountId} restart required — reconnecting immediately`);
        setTimeout(() => startSession(accountId, authDir, events), 500);
        return;
      }

      if (session.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = getReconnectDelay(session.reconnectAttempts);
        session.reconnectAttempts++;
        logger.warn("whatsapp", `${accountId} disconnected (code=${statusCode}), reconnecting in ${delay}ms (attempt ${session.reconnectAttempts})`);
        session.reconnectTimer = setTimeout(() => {
          startSession(accountId, authDir, events);
        }, delay);
      } else {
        logger.error("whatsapp", `${accountId} max reconnect attempts reached`);
        sessions.delete(accountId);
        events.onDisconnected("max_reconnect");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
    if (type !== "notify") return;

    for (const msg of msgs) {
      if (!msg.key?.remoteJid) continue;
      if (msg.key.remoteJid === "status@broadcast") continue;

      const messageId = msg.key.id || "";
      if (recentInbound.has(messageId)) continue;
      recentInbound.add(messageId);
      setTimeout(() => recentInbound.delete(messageId), 5 * 60_000);

      const fromMe = msg.key.fromMe ?? false;
      if (fromMe) {
        // Distinguish bot-sent messages from owner-typed messages
        if (!session.botSentIds.has(messageId)) {
          // Skip during connection grace period (first 15s = initial sync spam)
          if (Date.now() - session.connectedAt < 15_000) continue;

          // Skip self-chat (owner messaging themselves)
          const chatJid = msg.key.remoteJid;
          const ownJid = session.phone?.replace(/^\+/, "") + "@s.whatsapp.net";
          if (chatJid === ownJid) continue;

          // Only trigger for recent messages — ignore old synced messages
          const ts = msg.messageTimestamp
            ? typeof msg.messageTimestamp === "number"
              ? msg.messageTimestamp
              : Number(msg.messageTimestamp)
            : 0;
          const staleThreshold = Math.floor(Date.now() / 1000) - 60;
          if (ts > staleThreshold) {
            // Owner manually sent this from their phone — trigger human takeover
            if (chatJid && chatJid !== "status@broadcast") {
              events.onOwnerMessage(chatJid);
            }
          }
        }
        continue;
      }

      const body = extractMessageText(msg);
      if (!body.trim()) continue;

      const chatJid = msg.key.remoteJid;
      const isGroup = chatJid.endsWith("@g.us");
      const senderJid = isGroup ? (msg.key.participant || chatJid) : chatJid;
      const senderName = msg.pushName || jidToPhone(senderJid);
      const timestamp = msg.messageTimestamp
        ? typeof msg.messageTimestamp === "number"
          ? msg.messageTimestamp
          : Number(msg.messageTimestamp)
        : Math.floor(Date.now() / 1000);

      const staleThreshold = Math.floor(Date.now() / 1000) - 60;
      if (timestamp < staleThreshold) continue;

      const isAudio = hasAudioMessage(msg);
      let audioBuffer: Buffer | undefined;
      if (isAudio) {
        audioBuffer = await tryDownloadAudio(msg);
        if (!audioBuffer) continue;
      }

      const normalized: NormalizedInboundMessage = {
        messageId,
        chatJid,
        senderJid,
        senderName,
        body: isAudio ? "" : body,
        fromMe,
        timestamp,
        isGroup,
        quotedMessage: extractQuotedMessage(msg),
        rawKey: msg.key,
        ...(isAudio && audioBuffer ? { audioBuffer, mediaType: "audio" as const } : { mediaType: "text" as const }),
      };

      events.onMessage(normalized);
    }
  });
}

async function ensureDisappearingMessages(session: ManagedSession, jid: string): Promise<void> {
  if (!session.disappearingMessages && !session.configuredDisappearingChats.has(jid)) return;
  if (session.configuredDisappearingChats.has(jid)) return;
  try {
    const duration = session.disappearingMessages || false;
    await session.sock.sendMessage(jid, { disappearingMessagesInChat: duration as any });
    session.configuredDisappearingChats.add(jid);
  } catch {}
}

export async function sendTextMessage(accountId: string, jid: string, text: string): Promise<string | null> {
  const session = sessions.get(accountId);
  if (!session || session.state !== "connected") {
    throw new Error(`WhatsApp session ${accountId} not connected`);
  }

  await ensureDisappearingMessages(session, jid);
  const result = await session.sock.sendMessage(jid, { text });
  const msgId = result?.key?.id ?? null;
  if (msgId) {
    session.botSentIds.add(msgId);
    setTimeout(() => session.botSentIds.delete(msgId), 5 * 60_000);
  }
  return msgId;
}

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
  ".pdf": "application/pdf", ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi"]);
const AUDIO_EXTS = new Set([".mp3", ".ogg", ".wav"]);

export async function sendMediaMessage(
  accountId: string,
  jid: string,
  source: string, // file path or URL
  caption?: string,
): Promise<string | null> {
  const session = sessions.get(accountId);
  if (!session || session.state !== "connected") {
    throw new Error(`WhatsApp session ${accountId} not connected`);
  }

  await ensureDisappearingMessages(session, jid);

  const isUrl = /^https?:\/\//i.test(source);
  let buffer: Buffer;
  let ext: string;
  let mimetype: string;
  let fileName: string | undefined;

  if (isUrl) {
    // Fetch from URL
    const resp = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) throw new Error(`Failed to fetch media: HTTP ${resp.status}`);
    buffer = Buffer.from(await resp.arrayBuffer());
    // Get ext from URL path
    const urlPath = new URL(source).pathname;
    ext = extname(urlPath).toLowerCase() || ".jpg";
    mimetype = resp.headers.get("content-type") || MIME_MAP[ext] || "application/octet-stream";
    fileName = urlPath.split("/").pop() || `media${ext}`;
  } else {
    // Read from local file
    if (!existsSync(source)) throw new Error(`File not found: ${source}`);
    buffer = readFileSync(source);
    ext = extname(source).toLowerCase();
    mimetype = MIME_MAP[ext] || "application/octet-stream";
    fileName = source.split("/").pop() || `media${ext}`;
  }

  let msg: any;

  if (IMAGE_EXTS.has(ext)) {
    msg = { image: buffer, caption: caption || undefined, mimetype };
  } else if (VIDEO_EXTS.has(ext)) {
    msg = { video: buffer, caption: caption || undefined, mimetype };
  } else if (AUDIO_EXTS.has(ext)) {
    msg = { audio: buffer, mimetype, ptt: ext === ".ogg" };
  } else {
    // Send as document
    msg = { document: buffer, mimetype, fileName, caption: caption || undefined };
  }

  const result = await session.sock.sendMessage(jid, msg);
  const msgId = result?.key?.id ?? null;
  if (msgId) {
    session.botSentIds.add(msgId);
    setTimeout(() => session.botSentIds.delete(msgId), 5 * 60_000);
  }
  return msgId;
}

export async function sendComposing(accountId: string, jid: string): Promise<void> {
  const session = sessions.get(accountId);
  if (!session || session.state !== "connected") return;
  await session.sock.presenceSubscribe(jid);
  await session.sock.sendPresenceUpdate("composing", jid);
}

export async function sendPaused(accountId: string, jid: string): Promise<void> {
  const session = sessions.get(accountId);
  if (!session || session.state !== "connected") return;
  await session.sock.sendPresenceUpdate("paused", jid);
}

export function sendReadReceipt(accountId: string, messageKey: any): void {
  const session = sessions.get(accountId);
  if (!session || session.state !== "connected") return;
  if (!session.readReceiptsEnabled) return;
  session.sock.readMessages([messageKey]).catch(() => {});
}

export async function stopSession(accountId: string): Promise<void> {
  const session = sessions.get(accountId);
  if (!session) return;

  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  session.intentionallyStopped = true;
  session.state = "disconnected";
  sessions.delete(accountId);

  try {
    session.sock.end(undefined);
  } catch {}

  logger.info("whatsapp", `Session ${accountId} stopped`);
}

export async function logoutSession(accountId: string): Promise<void> {
  const session = sessions.get(accountId);
  if (!session) return;

  try {
    await session.sock.logout();
  } catch {}

  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
  }
  sessions.delete(accountId);
  logger.info("whatsapp", `Session ${accountId} logged out`);
}
