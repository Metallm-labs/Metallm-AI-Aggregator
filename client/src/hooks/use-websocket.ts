/**
 * use-websocket.ts
 *
 * Persistent WebSocket connection for real-time server push.
 * Handles:
 *  - Auto-connect on mount, auto-reconnect on disconnect (exponential back-off)
 *  - credit_update → instantly patches /api/credits/balance in React Query cache
 *  - token_update  → dispatches a custom DOM event so Dashboard can pick it up
 *                    without prop-drilling
 *
 * Only the three chat-related events flow through WebSocket.
 * Auth / billing / account management still use normal HTTPS.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Custom DOM event name for token updates (avoids prop drilling deep into Dashboard)
export const WS_TOKEN_UPDATE_EVENT = "ws:token_update";

// Custom DOM event name for WhatsApp link confirmation
export const WS_WHATSAPP_LINKED_EVENT = "ws:whatsapp_linked";

// Custom DOM event names for bootstrap progress
export const WS_BOOTSTRAP_LOG_EVENT = "ws:bootstrap_log";
export const WS_BOOTSTRAP_COMPLETE_EVENT = "ws:bootstrap_complete";

// Custom DOM event names for real-time business agent updates
export const WS_BUSINESS_AGENT_UPDATE_EVENT = "ws:business_agent_update";
export const WS_WHATSAPP_CONNECTED_EVENT = "ws:whatsapp_connected";
export const WS_WHATSAPP_DISCONNECTED_EVENT = "ws:whatsapp_disconnected";
export const WS_WHATSAPP_QR_EVENT = "ws:whatsapp_qr";

interface CreditUpdatePayload {
  type: "credit_update";
  cost: number;
  newBalance: number;
}

interface TokenUpdatePayload {
  type: "token_update";
  modelName: string;
  conversationId: number;
  messageId?: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedPromptTokens: number;
  };
}

interface PingPayload {
  type: "ping";
}

interface ConnectedPayload {
  type: "connected";
}

interface PongPayload {
  type: "pong";
  sentAt?: number;
}

interface WhatsAppLinkedPayload {
  type: "whatsapp_linked";
  sessionId: string;
}

interface BootstrapLogPayload {
  type: "bootstrap_log";
  agentId: string;
  message: string;
}

interface BootstrapCompletePayload {
  type: "bootstrap_complete";
  agentId: string;
  error?: string;
}

interface BusinessAgentUpdatePayload {
  type: "business_agent_update";
  agentId: string;
  accountId: string;
  chatJid: string;
  senderName: string;
  subscription: Record<string, unknown>;
}

interface WhatsAppConnectedPayload {
  type: "whatsapp_connected";
  accountId: string;
  phone: string;
  pushName: string;
}

interface WhatsAppDisconnectedPayload {
  type: "whatsapp_disconnected";
  accountId: string;
  reason: string;
}

interface WhatsAppQrPayload {
  type: "whatsapp_qr";
  accountId: string;
  qr: string;
}

type ServerMessage =
  | CreditUpdatePayload
  | TokenUpdatePayload
  | PingPayload
  | ConnectedPayload
  | PongPayload
  | WhatsAppLinkedPayload
  | BootstrapLogPayload
  | BootstrapCompletePayload
  | BusinessAgentUpdatePayload
  | WhatsAppConnectedPayload
  | WhatsAppDisconnectedPayload
  | WhatsAppQrPayload;

const BASE_RECONNECT_MS = 1_500;
const MAX_RECONNECT_MS = 30_000;
const CLIENT_PING_INTERVAL_MS = 15_000;

function buildWsUrl(): string {
  const { protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${host}/ws`;
}

export function useWebSocket(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(BASE_RECONNECT_MS);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const sendPing = useCallback((ws: WebSocket) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "ping", sentAt: Date.now() }));
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    clearTimers();

    let ws: WebSocket;
    try {
      ws = new WebSocket(buildWsUrl());
    } catch {
      // Browser blocked WS (e.g., HTTP→WS mismatch in dev) — retry later
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      // Reset back-off on successful connection
      reconnectDelayRef.current = BASE_RECONNECT_MS;
      setIsConnected(true);
      sendPing(ws);
      pingTimerRef.current = setInterval(() => {
        sendPing(ws);
      }, CLIENT_PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case "credit_update": {
          // Instantly update the credit balance in React Query cache — avoids
          // waiting for the next 30-second polling cycle
          queryClient.setQueryData(
            ["/api/credits/balance"],
            { credits: msg.newBalance }
          );
          break;
        }
        case "token_update": {
          // Dispatch a custom DOM event so Dashboard's token tracking can pick it up
          window.dispatchEvent(
            new CustomEvent(WS_TOKEN_UPDATE_EVENT, { detail: msg })
          );
          break;
        }
        case "pong":
          if (typeof msg.sentAt === "number") {
            setLatencyMs(Math.max(0, Date.now() - msg.sentAt));
          }
          break;
        case "ping":
          // No action needed — keepalive / handshake confirmation
          break;
        case "connected":
          setIsConnected(true);
          break;
        case "whatsapp_linked":
          // Dispatch a custom DOM event so BusinessAgent can react without prop drilling
          window.dispatchEvent(
            new CustomEvent(WS_WHATSAPP_LINKED_EVENT, { detail: msg })
          );
          break;
        case "bootstrap_log":
          window.dispatchEvent(
            new CustomEvent(WS_BOOTSTRAP_LOG_EVENT, { detail: msg })
          );
          break;
        case "bootstrap_complete":
          window.dispatchEvent(
            new CustomEvent(WS_BOOTSTRAP_COMPLETE_EVENT, { detail: msg })
          );
          break;
        case "business_agent_update":
          window.dispatchEvent(
            new CustomEvent(WS_BUSINESS_AGENT_UPDATE_EVENT, { detail: msg })
          );
          break;
        case "whatsapp_connected":
          window.dispatchEvent(
            new CustomEvent(WS_WHATSAPP_CONNECTED_EVENT, { detail: msg })
          );
          break;
        case "whatsapp_disconnected":
          window.dispatchEvent(
            new CustomEvent(WS_WHATSAPP_DISCONNECTED_EVENT, { detail: msg })
          );
          break;
        case "whatsapp_qr":
          window.dispatchEvent(
            new CustomEvent(WS_WHATSAPP_QR_EVENT, { detail: msg })
          );
          break;
      }
    };

    ws.onclose = () => {
      clearTimers();
      setIsConnected(false);
      if (!unmountedRef.current) scheduleReconnect();
    };

    ws.onerror = () => {
      // onerror always fires before onclose; let onclose handle reconnect
      ws.close();
    };
  }, [clearTimers, queryClient, sendPing]);

  function scheduleReconnect() {
    if (unmountedRef.current) return;
    const delay = reconnectDelayRef.current;
    reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_MS);
    reconnectTimerRef.current = setTimeout(connect, delay);
  }

  useEffect(() => {
    if (!enabled) {
      unmountedRef.current = true;
      clearTimers();
      setIsConnected(false);
      setLatencyMs(null);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      clearTimers();
      setIsConnected(false);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, clearTimers, enabled]);

  return { isConnected, latencyMs };
}
