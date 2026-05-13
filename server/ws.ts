/**
 * ws.ts — WebSocket server for real-time per-user push events.
 *
 * Responsibilities:
 *  - Upgrade HTTP → WS on /ws path only
 *  - Authenticate each connection via session (same cookie as Express)
 *  - Maintain userId → Set<WebSocket> registry
 *  - Expose broadcastToUser(userId, event, data) for use in routes
 *
 * Events sent to client (JSON-encoded):
 *   { type: "credit_update",  newBalance: number, cost: number }
 *   { type: "token_update",   modelName: string, tokenUsage: {...}, conversationId: number }
 *   { type: "ping" }   (keepalive from server)
 *   { type: "pong", sentAt }   (echo for client latency measurement)
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "http";
import * as logger from "./logger";

// Map userId → active WS connections (one user may have multiple tabs)
const userSockets = new Map<string, Set<WebSocket>>();

function registerSocket(userId: string, ws: WebSocket) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId)!.add(ws);
  logger.info("ws", `Client connected  userId=${userId}  total=${userSockets.get(userId)!.size}`);
}

function unregisterSocket(userId: string, ws: WebSocket) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) userSockets.delete(userId);
  logger.info("ws", `Client disconnected userId=${userId}`);
}

/**
 * Broadcast a typed event to all open sockets for a user.
 * Safe to call even if the user has no active connections.
 */
export function broadcastToUser(userId: string, type: string, data: Record<string, unknown>) {
  const set = userSockets.get(userId);
  if (!set?.size) return;
  const payload = JSON.stringify({ type, ...data });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Must receive the express-session middleware so it can read req.session.
 */
export function setupWebSocketServer(
  httpServer: HttpServer,
  getSessionUser: (req: IncomingMessage) => Promise<string | null>
) {
  const wss = new WebSocketServer({ noServer: true });

  // Only upgrade requests to /ws
  httpServer.on("upgrade", async (req, socket, head) => {
    const url = req.url ?? "";
    if (!url.startsWith("/ws")) {
      // Do nothing, let other listeners (like Vite HMR) handle it
      return;
    }

    // Authenticate via session cookie
    let userId: string | null = null;
    try {
      userId = await getSessionUser(req);
    } catch (err) {
      logger.error("ws", `Session resolution error: ${(err as Error).message}`);
    }

    if (!userId) {
      // Send HTTP 401 and close the socket
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, userId);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, userId: string) => {
    registerSocket(userId, ws);

    // Send initial ping so client knows the connection is live
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "connected", userId }));
    }

    // Keepalive: ping every 25 s
    const keepalive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      } else {
        clearInterval(keepalive);
      }
    }, 25_000);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "pong", sentAt: msg.sentAt }));
          }
          return;
        }
        // Client pong — no-op (just keeps the TCP connection alive)
        if (msg.type === "pong") return;
      } catch {
        // Ignore non-JSON messages
      }
    });

    ws.on("close", () => {
      clearInterval(keepalive);
      unregisterSocket(userId, ws);
    });

    ws.on("error", (err) => {
      logger.error("ws", `Socket error userId=${userId}: ${err.message}`);
      clearInterval(keepalive);
      unregisterSocket(userId, ws);
    });
  });

  logger.info("ws", "WebSocket server attached (path: /ws)");
  return wss;
}
