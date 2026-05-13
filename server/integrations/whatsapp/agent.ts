// ══════════════════════════════════════════════════════════════
// WhatsApp Business Agent — OpenAI with tool-calling loop
// ══════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../../db";
import { whatsappMessages, whatsappAccounts, businessAgentSubscriptions } from "@shared/schema";
import { sendTextMessage, sendComposing, sendPaused, sendReadReceipt, type NormalizedInboundMessage } from "./session";
import { AGENT_TOOL_DEFINITIONS, executeTool, type ToolContext } from "./tools";
import { getBusinessAgentSubscriptionSummary, sendLimitExceededNotification } from "../business-agent";
import { transcribeAudio } from "../../providers/groq";
import { broadcastToUser } from "../../ws";
import * as logger from "../../logger";

const VOICE_ENABLED_PLANS = new Set(["pro", "enterprise"]);

const HISTORY_LIMIT = 20;
const MAX_REPLY_LENGTH = 4000;
const MAX_TOOL_ROUNDS = 50;

// ── Human takeover cooldown ──────────────────────────────────

const humanTakeoverMap = new Map<string, number>(); // key: "accountId:chatJid" → expiresAt (epoch ms)

export function activateHumanTakeover(accountId: string, chatJid: string, cooldownSeconds: number): void {
  const key = `${accountId}:${chatJid}`;
  const expiresAt = Date.now() + cooldownSeconds * 1000;
  humanTakeoverMap.set(key, expiresAt);
  logger.info("whatsapp", `Human takeover activated for ${chatJid} on ${accountId} (${cooldownSeconds}s cooldown)`);
}

export function isInHumanTakeover(accountId: string, chatJid: string): boolean {
  const key = `${accountId}:${chatJid}`;
  const expiresAt = humanTakeoverMap.get(key);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    humanTakeoverMap.delete(key);
    return false;
  }
  return true;
}

// ── Subscription usage tracking ─────────────────────────────

function readAgentIdFromWorkspace(workspacePath: string): string | null {
  if (!workspacePath) return null;
  const resolved = resolveHomeAwarePath(workspacePath);
  const metaPath = join(resolved, "session-metadata.json");
  try {
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      return meta.agentId || null;
    }
  } catch {}
  return null;
}

async function incrementAgentUsedMessages(userId: string, agentId: string): Promise<void> {
  await db
    .update(businessAgentSubscriptions)
    .set({
      usedMessages: sql`${businessAgentSubscriptions.usedMessages} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(businessAgentSubscriptions.userId, userId),
        eq(businessAgentSubscriptions.agentId, agentId),
      ),
    );
}

// ── Config ──────────────────────────────────────────────────

function getAgentModel(): string {
  return process.env.BUSINESS_AGENT_MODEL || "gpt-5.4-mini";
}

function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return key;
}

function getOpenAIBaseUrl(): string {
  const raw = process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
  return raw.replace(/\/+$/, "");
}

function apiUrl(path: string): string {
  const base = getOpenAIBaseUrl();
  if (/\/v\d+$/.test(base)) return `${base}${path}`;
  return `${base}/v1${path}`;
}

// ── Path helpers ────────────────────────────────────────────

function resolveHomeAwarePath(raw: string): string {
  if (!raw.trim()) return raw;
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  return raw;
}

// ── Workspace files pre-loading ─────────────────────────────

const PRELOAD_FILES = ["BOOTSTRAP.md", "AGENTS.md", "SOUL.md", "IDENTITY.md", "USER.md", "TOOLS.md", "PRODUCTS.md"] as const;

function readWorkspaceFiles(workspacePath: string): string {
  const resolved = resolveHomeAwarePath(workspacePath);
  const sections: string[] = [];

  for (const fileName of PRELOAD_FILES) {
    const filePath = join(resolved, fileName);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf8").trim();
        if (content) sections.push(`=== ${fileName} ===\n${content}`);
      } catch {}
    }
  }

  // Today + yesterday memory
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  for (const date of [today, yesterday]) {
    const dateStr = date.toISOString().slice(0, 10);
    const memPath = join(resolved, "memory", `${dateStr}.md`);
    if (existsSync(memPath)) {
      try {
        const content = readFileSync(memPath, "utf8").trim();
        if (content) sections.push(`=== memory/${dateStr}.md ===\n${content}`);
      } catch {}
    }
  }

  return sections.join("\n\n");
}

// ── System prompt builder ───────────────────────────────────

export function buildSystemPrompt(workspacePath: string): string {
  const workspaceContext = readWorkspaceFiles(workspacePath);
  const today = new Date().toISOString().slice(0, 10);

  return [
    "You are a business agent with your own workspace. You have tools to manage files and research the web.",
    "",
    `Date: ${today}`,
    "",
    "## Current Workspace Files",
    workspaceContext,
    "",
    "## File Editing Rules",
    "- NEVER rewrite entire files. Only replace specific placeholder text.",
    "- Use read_file first, then edit_file with ALL edits for that file in ONE call using the 'edits' array.",
    "- IMPORTANT: Apply ALL replacements to a file in a SINGLE edit_file call — not one-by-one!",
    "- Use append_to_file for new content (memory, logs, PRODUCTS.md).",
    '- Example: edit_file({ path: "SOUL.md", edits: [',
    '    { old_text: "_(fill during bootstrap)_", new_text: "Actual business info" },',
    '    { old_text: "_(fill during bootstrap)_", new_text: "More real data" }',
    "  ]})",
    "",
    "## Product Inquiries — STRICT PROTOCOL",
    "NEVER answer a product question from a single source. ALWAYS check ALL sources before replying:",
    "1. Read PRODUCTS.md — has general categories, services, and business contact (NOT individual product details)",
    "2. Check uploaded media — list_files on assets/catalog/, then read_file on relevant images/docs",
    "3. Check the business website LIVE — fetch_webpage on the website URL from SOUL.md",
    "4. Check memory/ files — recent notes may have updated info",
    "",
    "ONLY after checking ALL sources, reply to the customer:",
    "- If found → share verified info (price, description, availability)",
    "- If NOT found → say: 'I don't have that info right now. Let me check and get back to you.'",
    "- NEVER guess or make up product details, prices, or availability",
    "",
    "## Media & send_media",
    "- send_media works with both URLs (https://...) and workspace file paths (assets/catalog/photo.jpg)",
    "  Example: send_media({ source: 'https://website.com/product-image.jpg', caption: 'Product Name' })",
    "  Example: send_media({ source: 'assets/catalog/menu.jpg', caption: 'Our Menu' })",
    "- For workspace files (assets/), verify with list_files before sending",
    "",
    "## Web Research",
    "- Use web_search for general info, fetch_webpage for specific URLs",
    "- fetch_webpage extracts: text, links, images, contact info, structured data, navigation, etc.",
    "- Visit MULTIPLE pages when researching a business website",
    "",
    "## Memory",
    `- Log interactions in memory/${today}.md using append_to_file`,
    "",
    "## WhatsApp Rules",
    "- Use WhatsApp formatting: *bold*, _italic_, ~strikethrough~",
    "- Do NOT use markdown headers (#) in replies",
    "- Keep replies concise. Match customer's language.",
    `- Max ${MAX_REPLY_LENGTH} characters per message.`,
  ].join("\n");
}

// ── OpenAI Responses API helpers ────────────────────────────

function toResponsesInput(messages: Array<{ role: string; content: string }>): any[] {
  return messages.map((m) => {
    const role = m.role === "assistant" ? "assistant" : "user";
    const textType = role === "assistant" ? "output_text" : "input_text";
    return { role, content: [{ type: textType, text: m.content }] };
  });
}

function extractTextFromOutput(output: any[]): string {
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .filter((part: any) => part?.type === "output_text" && typeof part?.text === "string")
    .map((part: any) => part.text)
    .join("");
}

// ── Agent call with tool loop ───────────────────────────────

export type AgentToolContext = {
  accountId?: string;
  chatJid?: string;
};

export async function callAgentWithTools(
  modelId: string,
  systemPrompt: string,
  chatMessages: Array<{ role: string; content: string }>,
  workspacePath: string,
  toolContext?: AgentToolContext,
  onToolCall?: (toolName: string, args: Record<string, any>) => void,
): Promise<string> {
  const tools: any[] = [
    { type: "web_search" },
    ...AGENT_TOOL_DEFINITIONS,
  ];

  const input = toResponsesInput(chatMessages);
  let iterations = 0;

  // Track tool output indices so we can trim old ones to save tokens
  const toolOutputIndices: number[] = [];
  const MAX_TOOL_OUTPUT_CHARS = 3000; // trim old outputs to this size
  const KEEP_RECENT_OUTPUTS = 2; // keep last N tool outputs full-size

  while (iterations < MAX_TOOL_ROUNDS) {
    iterations++;

    // Before each API call, trim old tool outputs to prevent token bloat
    if (toolOutputIndices.length > KEEP_RECENT_OUTPUTS) {
      const toTrim = toolOutputIndices.slice(0, -KEEP_RECENT_OUTPUTS);
      for (const idx of toTrim) {
        const item = input[idx];
        if (item && item.type === "function_call_output" && typeof item.output === "string") {
          if (item.output.length > MAX_TOOL_OUTPUT_CHARS) {
            item.output = item.output.slice(0, MAX_TOOL_OUTPUT_CHARS) + "\n... [trimmed to save context]";
          }
        }
      }
    }

    const body: any = {
      model: modelId,
      instructions: systemPrompt,
      input,
      tools,
      tool_choice: "auto",
      max_output_tokens: 4096,
    };

    // API call with rate-limit retry
    let data: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(apiUrl("/responses"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getOpenAIApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });

      if (response.status === 429) {
        // Rate limited — wait and retry
        const retryMs = Math.min(2000 * Math.pow(2, attempt), 10000);
        logger.warn("whatsapp", `Rate limited (429), waiting ${retryMs}ms before retry ${attempt + 1}/3`);
        await new Promise((r) => setTimeout(r, retryMs));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      data = await response.json();
      break;
    }

    if (!data) {
      throw new Error("OpenAI API rate limit exceeded after 3 retries");
    }

    const output: any[] = data.output || [];

    const outputTypes = output.map((item: any) => item.type || "unknown").join(", ");
    logger.info("whatsapp", `Agent round ${iterations}: output types=[${outputTypes}], status=${data.status}`);

    const functionCalls = output.filter((item: any) => item.type === "function_call");

    if (functionCalls.length === 0) {
      const text = data.output_text || extractTextFromOutput(output);
      logger.info("whatsapp", `Agent finished after ${iterations} round(s), reply length=${text.length}`);
      return text || "Sorry, I couldn't generate a response.";
    }

    logger.info("whatsapp", `Agent requesting ${functionCalls.length} tool call(s): ${functionCalls.map((fc: any) => fc.name).join(", ")}`);

    // Execute each function call and add results to input
    for (const fc of functionCalls) {
      input.push(fc);

      const toolName = fc.name;
      let args: Record<string, any> = {};
      try {
        args = typeof fc.arguments === "string" ? JSON.parse(fc.arguments) : fc.arguments || {};
      } catch {}

      logger.info("whatsapp", `Agent tool call: ${toolName}(${JSON.stringify(args).slice(0, 200)})`);

      if (onToolCall) {
        try { onToolCall(toolName, args); } catch {}
      }

      const result = await executeTool(toolName, args, workspacePath, toolContext);

      // Check if result contains an image attachment (from read_file on image files)
      let toolOutput = result;
      let imageAttachment: { base64: string; mimeType: string } | null = null;
      try {
        const parsed = JSON.parse(result);
        if (parsed._imageAttachment) {
          imageAttachment = parsed._imageAttachment;
          // Strip the base64 data from the tool output to save context tokens
          const { _imageAttachment, ...rest } = parsed;
          toolOutput = JSON.stringify(rest);
        }
      } catch {}

      // Track index for future trimming
      const outputIdx = input.length;
      input.push({
        type: "function_call_output",
        call_id: fc.call_id,
        output: toolOutput,
      });
      toolOutputIndices.push(outputIdx);

      // If there was an image, add it as a proper vision input for the model
      if (imageAttachment) {
        input.push({
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: `data:${imageAttachment.mimeType};base64,${imageAttachment.base64}`,
              detail: "low",
            },
          ],
        });
        logger.info("whatsapp", `Agent image attached as vision input for ${args.path || "unknown"}`);
      }
    }
  }

  return "I'm still working on this but need to respond now. Please send another message and I'll continue.";
}

// ── Text chunking ───────────────────────────────────────────

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(". ", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt + 1).trimEnd());
    remaining = remaining.slice(splitAt + 1).trimStart();
  }
  return chunks;
}

// ── Main handler ────────────────────────────────────────────

export async function handleInboundMessage(
  accountId: string,
  msg: NormalizedInboundMessage,
): Promise<void> {
  const [account] = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.accountId, accountId))
    .limit(1);

  if (!account || !account.enabled) {
    logger.warn("whatsapp", `Ignoring message for disabled/unknown account ${accountId}`);
    return;
  }

  // Check human takeover cooldown — owner is manually handling this chat
  if (isInHumanTakeover(accountId, msg.chatJid)) {
    logger.info("whatsapp", `Skipping AI reply for ${msg.chatJid} — human takeover active on ${accountId}`);
    return;
  }

  // Check subscription message limit — stop agent when plan exhausted
  if (account.workspacePath) {
    const agentId = readAgentIdFromWorkspace(account.workspacePath);
    if (agentId) {
      try {
        const subscription = await getBusinessAgentSubscriptionSummary(account.userId, agentId);
        if (subscription.remainingMessages <= 0) {
          logger.info("whatsapp", `Skipping AI reply for ${accountId} — message limit exhausted (${subscription.usedMessages}/${subscription.limitMessages})`);
          sendLimitExceededNotification(account.userId, subscription).catch((err) =>
            logger.warn("whatsapp", `Failed to send limit-exceeded email: ${(err as Error).message}`),
          );
          return;
        }
      } catch (err) {
        logger.warn("whatsapp", `Failed to check subscription for ${accountId}: ${(err as Error).message}`);
      }
    }
  }

  // Agent is active and will respond — send read receipt now
  if (msg.rawKey) {
    sendReadReceipt(accountId, msg.rawKey);
  }

  // Handle voice messages — transcribe via Groq Whisper (pro/enterprise only)
  let messageBody = msg.body;
  if (msg.mediaType === "audio" && msg.audioBuffer) {
    let planCode = "trial";
    if (account.workspacePath) {
      const agentId = readAgentIdFromWorkspace(account.workspacePath);
      if (agentId) {
        try {
          const sub = await getBusinessAgentSubscriptionSummary(account.userId, agentId);
          planCode = sub.planCode;
        } catch {}
      }
    }

    if (!VOICE_ENABLED_PLANS.has(planCode)) {
      logger.info("whatsapp", `Skipping voice message for ${accountId} — plan "${planCode}" does not support voice`);
      await sendTextMessage(accountId, msg.chatJid, "Voice messages are available on Pro and Enterprise plans. Please send a text message instead.");
      return;
    }

    try {
      logger.info("whatsapp", `Transcribing voice message for ${accountId} (${msg.audioBuffer.length} bytes)`);
      messageBody = await transcribeAudio(msg.audioBuffer);
      logger.info("whatsapp", `Transcription complete for ${accountId}: "${messageBody.slice(0, 80)}..."`);
    } catch (err) {
      logger.error("whatsapp", `Voice transcription failed for ${accountId}: ${(err as Error).message}`);
      await sendTextMessage(accountId, msg.chatJid, "Sorry, I couldn't process your voice message. Please try again or send a text message.");
      return;
    }

    if (!messageBody.trim()) {
      await sendTextMessage(accountId, msg.chatJid, "I couldn't understand the voice message. Could you please send a text message instead?");
      return;
    }
  }

  await db.insert(whatsappMessages).values({
    accountId,
    chatJid: msg.chatJid,
    messageId: msg.messageId,
    direction: "inbound",
    senderJid: msg.senderJid,
    senderName: msg.senderName,
    body: messageBody,
    mediaType: msg.mediaType === "audio" ? "audio" : undefined,
    metadata: {
      isGroup: msg.isGroup,
      quotedMessage: msg.quotedMessage,
      timestamp: msg.timestamp,
      ...(msg.mediaType === "audio" ? { transcribed: true } : {}),
    },
  });

  const history = await db
    .select()
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.accountId, accountId),
        eq(whatsappMessages.chatJid, msg.chatJid),
      ),
    )
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(HISTORY_LIMIT);

  history.reverse();

  const chatMessages = history.map((row) => ({
    role: row.direction === "inbound" ? "user" : "assistant",
    content: row.body || "",
  }));

  try {
    await sendComposing(accountId, msg.chatJid);
  } catch {}

  const modelId = getAgentModel();
  let reply: string;

  try {
    if (account.workspacePath) {
      const systemPrompt = buildSystemPrompt(account.workspacePath);
      reply = await callAgentWithTools(modelId, systemPrompt, chatMessages, account.workspacePath, {
        accountId,
        chatJid: msg.chatJid,
      });
    } else {
      // Fallback: no workspace, basic system prompt, no tools
      const { callOpenAI } = await import("../../providers/openai");
      reply = await callOpenAI(modelId, chatMessages, {
        systemPrompt:
          account.systemPrompt ||
          `You are a helpful WhatsApp assistant. Reply concisely and naturally. Use WhatsApp-friendly formatting (*bold*, _italic_, ~strikethrough~). Keep responses under ${MAX_REPLY_LENGTH} characters. Do not use markdown headers (#).`,
        maxTokens: 2048,
      });
    }
  } catch (err) {
    logger.error("whatsapp", `AI call failed for ${accountId} (model: ${modelId}): ${(err as Error).message}`);
    reply = "Sorry, I'm having trouble processing your message right now. Please try again in a moment.";
  }

  try {
    await sendPaused(accountId, msg.chatJid);
  } catch {}

  const chunks = chunkText(reply.trim(), MAX_REPLY_LENGTH);

  for (const chunk of chunks) {
    try {
      const sentId = await sendTextMessage(accountId, msg.chatJid, chunk);

      await db.insert(whatsappMessages).values({
        accountId,
        chatJid: msg.chatJid,
        messageId: sentId,
        direction: "outbound",
        body: chunk,
      });
    } catch (err) {
      logger.error("whatsapp", `Failed to send reply for ${accountId}: ${(err as Error).message}`);
    }
  }

  // Increment subscription usage for this agent and broadcast update to UI
  if (account.workspacePath) {
    try {
      const agentId = readAgentIdFromWorkspace(account.workspacePath);
      if (agentId) {
        await incrementAgentUsedMessages(account.userId, agentId);
        const subscription = await getBusinessAgentSubscriptionSummary(account.userId, agentId);
        broadcastToUser(account.userId, "business_agent_update", {
          agentId,
          accountId,
          chatJid: msg.chatJid,
          senderName: msg.senderName || "",
          subscription,
        });
      }
    } catch (err) {
      logger.warn("whatsapp", `Failed to increment usage for ${accountId}: ${(err as Error).message}`);
    }
  }

  logger.info("whatsapp", `Agent replied to ${msg.senderName} on ${accountId} [${modelId}] (${chunks.length} chunk(s), ${MAX_TOOL_ROUNDS >= 1 ? "tools enabled" : "no tools"})`);
}
