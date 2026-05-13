// ══════════════════════════════════════════════════════════════
// WhatsApp Business Agent Tools
// File operations (sandboxed to workspace) + Comprehensive web fetch
// ══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, appendFileSync } from "fs";
import { join, resolve, dirname, extname } from "path";
import { homedir } from "os";
import * as logger from "../../logger";
import { sendMediaMessage } from "./session";

export type ToolContext = {
  accountId?: string;
  chatJid?: string;
};

// ── Path safety ─────────────────────────────────────────────

function resolveHomeAwarePath(raw: string): string {
  if (!raw.trim()) return raw;
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  return raw;
}

function safePath(workspacePath: string, relativePath: string): string | null {
  const wsRoot = resolve(resolveHomeAwarePath(workspacePath));
  const target = resolve(wsRoot, relativePath);
  // Prevent directory traversal
  if (!target.startsWith(wsRoot)) return null;
  return target;
}

// ── Tool definitions for OpenAI Responses API ───────────────

export const AGENT_TOOL_DEFINITIONS: any[] = [
  {
    type: "function",
    name: "read_file",
    description: "Read a file from the workspace. Returns the file content.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path from workspace root (e.g. SOUL.md, memory/2026-04-26.md, assets/catalog/menu.jpg)",
        },
      },
      required: ["path"],
    },
  },
  {
    type: "function",
    name: "edit_file",
    description:
      "Edit a file by applying one or more find-and-replace operations in a single call. Pass an array of edits to replace multiple sections at once. Each edit replaces the exact old_text with new_text. Apply ALL changes to a file in ONE call — do not call edit_file multiple times for the same file.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path from workspace root",
        },
        edits: {
          type: "array",
          description: "Array of find-and-replace operations to apply to the file, in order",
          items: {
            type: "object",
            properties: {
              old_text: {
                type: "string",
                description: "The exact existing text to find",
              },
              new_text: {
                type: "string",
                description: "The replacement text",
              },
            },
            required: ["old_text", "new_text"],
          },
        },
        old_text: {
          type: "string",
          description: "For single edit: the exact text to find (use 'edits' array for multiple replacements)",
        },
        new_text: {
          type: "string",
          description: "For single edit: the replacement text",
        },
      },
      required: ["path"],
    },
  },
  {
    type: "function",
    name: "append_to_file",
    description: "Append text to the end of a file. Creates the file (and parent directories) if it doesn't exist. Use for adding new sections, log entries, or memory notes.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path from workspace root",
        },
        content: {
          type: "string",
          description: "Text to append at the end of the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    type: "function",
    name: "list_files",
    description: "List all files and subdirectories in a workspace directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative directory path from workspace root. Use '' or '.' for workspace root.",
          default: ".",
        },
      },
    },
  },
  {
    type: "function",
    name: "fetch_webpage",
    description:
      "Fetch a webpage and extract comprehensive content: text, headings, links, images, contact info, navigation, footer, structured data (JSON-LD), Open Graph metadata, social links, and more. Works like a thorough web crawler. Use this to research a business website and gather all available information.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL to fetch (e.g. https://example.com)",
        },
      },
      required: ["url"],
    },
  },
  {
    type: "function",
    name: "send_media",
    description:
      "Send an image, video, audio, or document to the current WhatsApp chat. Use this to share product photos, menus, or any media with the customer. Source can be a workspace file path (relative) or a full URL (https://...).",
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "The media source: a workspace-relative file path (e.g. assets/catalog/menu.jpg) OR a full URL (e.g. https://example.com/image.jpg)",
        },
        caption: {
          type: "string",
          description: "Optional caption/text to send with the media",
        },
      },
      required: ["source"],
    },
  },
];

// ── Tool execution ──────────────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  workspacePath: string,
  toolContext?: ToolContext,
): Promise<string> {
  try {
    switch (toolName) {
      case "read_file":
        return toolReadFile(workspacePath, args.path);
      case "edit_file":
        return toolEditFile(workspacePath, args.path, args.edits, args.old_text, args.new_text);
      case "append_to_file":
        return toolAppendToFile(workspacePath, args.path, args.content);
      case "list_files":
        return toolListFiles(workspacePath, args.path || ".");
      case "fetch_webpage":
        return await toolFetchWebpage(args.url);
      case "send_media":
        return await toolSendMedia(workspacePath, args.source, args.caption, toolContext);
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

// ── Image detection ─────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);
const MAX_IMAGE_API_SIZE = 5_000_000; // 5MB limit for sending to vision API

function getMimeTypeForExt(ext: string): string {
  switch (ext) {
    case ".png": return "image/png";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".bmp": return "image/bmp";
    default: return "image/jpeg";
  }
}

// ── File tools ──────────────────────────────────────────────

function toolReadFile(workspacePath: string, filePath: string): string {
  const target = safePath(workspacePath, filePath);
  if (!target) return JSON.stringify({ error: "Path not allowed — must be within workspace" });
  if (!existsSync(target)) return JSON.stringify({ error: `File not found: ${filePath}` });

  try {
    const stat = statSync(target);
    if (stat.isDirectory()) return JSON.stringify({ error: `${filePath} is a directory, not a file. Use list_files instead.` });

    const ext = extname(filePath).toLowerCase();

    // Handle image files — return base64 for API image attachment instead of garbled utf8
    if (IMAGE_EXTENSIONS.has(ext)) {
      if (stat.size > MAX_IMAGE_API_SIZE) {
        return JSON.stringify({
          error: `Image too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 5MB for viewing. Use send_media to share with customer.`,
        });
      }
      const buffer = readFileSync(target);
      const base64 = buffer.toString("base64");
      const mimeType = getMimeTypeForExt(ext);
      return JSON.stringify({
        path: filePath,
        type: "image",
        size: stat.size,
        mimeType,
        note: "Image attached as visual input. Analyze what you see.",
        _imageAttachment: { base64, mimeType },
      });
    }

    // Text files
    if (stat.size > 500_000) return JSON.stringify({ error: `File too large (${(stat.size / 1024).toFixed(0)}KB). Max 500KB.` });

    const content = readFileSync(target, "utf8");
    return JSON.stringify({ path: filePath, content, size: stat.size });
  } catch (err) {
    return JSON.stringify({ error: `Failed to read ${filePath}: ${(err as Error).message}` });
  }
}

function toolEditFile(
  workspacePath: string,
  filePath: string,
  edits?: Array<{ old_text: string; new_text: string }>,
  singleOldText?: string,
  singleNewText?: string,
): string {
  const target = safePath(workspacePath, filePath);
  if (!target) return JSON.stringify({ error: "Path not allowed — must be within workspace" });
  if (!existsSync(target)) return JSON.stringify({ error: `File not found: ${filePath}. Use append_to_file to create new files.` });

  // Normalize: support both single edit (old_text/new_text) and batch edits (edits array)
  const editList: Array<{ old_text: string; new_text: string }> = [];
  if (Array.isArray(edits) && edits.length > 0) {
    editList.push(...edits);
  } else if (singleOldText !== undefined && singleNewText !== undefined) {
    editList.push({ old_text: singleOldText, new_text: singleNewText });
  } else {
    return JSON.stringify({ error: "Provide either 'edits' array or 'old_text'+'new_text' params." });
  }

  try {
    let content = readFileSync(target, "utf8");
    const results: Array<{ old_text: string; status: string }> = [];

    for (const edit of editList) {
      const { old_text, new_text } = edit;
      if (content.includes(old_text)) {
        content = content.replace(old_text, new_text);
        results.push({ old_text: old_text.slice(0, 60), status: "ok" });
      } else {
        // Try trimmed match
        const trimmedOld = old_text.trim();
        const lines = content.split("\n");
        let found = false;
        const newLines = lines.map((line) => {
          if (!found && line.trim() === trimmedOld) {
            found = true;
            return line.replace(line.trim(), new_text.trim());
          }
          return line;
        });
        if (found) {
          content = newLines.join("\n");
          results.push({ old_text: old_text.slice(0, 60), status: "ok (trimmed match)" });
        } else {
          results.push({ old_text: old_text.slice(0, 60), status: "not found" });
        }
      }
    }

    writeFileSync(target, content, "utf8");

    const applied = results.filter((r) => r.status !== "not found").length;
    const failed = results.filter((r) => r.status === "not found").length;
    logger.info("whatsapp", `Agent edited file: ${filePath} (${applied} applied, ${failed} failed)`);
    return JSON.stringify({ ok: true, path: filePath, applied, failed, details: results });
  } catch (err) {
    return JSON.stringify({ error: `Failed to edit ${filePath}: ${(err as Error).message}` });
  }
}

function toolAppendToFile(workspacePath: string, filePath: string, content: string): string {
  const target = safePath(workspacePath, filePath);
  if (!target) return JSON.stringify({ error: "Path not allowed — must be within workspace" });

  try {
    mkdirSync(dirname(target), { recursive: true });
    const prefix = existsSync(target) && readFileSync(target, "utf8").length > 0 ? "\n" : "";
    appendFileSync(target, prefix + content, "utf8");

    logger.info("whatsapp", `Agent appended to file: ${filePath}`);
    return JSON.stringify({ ok: true, path: filePath });
  } catch (err) {
    return JSON.stringify({ error: `Failed to append to ${filePath}: ${(err as Error).message}` });
  }
}

function toolListFiles(workspacePath: string, dirPath: string): string {
  const target = safePath(workspacePath, dirPath);
  if (!target) return JSON.stringify({ error: "Path not allowed — must be within workspace" });
  if (!existsSync(target)) return JSON.stringify({ error: `Directory not found: ${dirPath}` });

  try {
    const stat = statSync(target);
    if (!stat.isDirectory()) return JSON.stringify({ error: `${dirPath} is a file, not a directory` });

    const entries = readdirSync(target).map((name) => {
      const full = join(target, name);
      try {
        const s = statSync(full);
        return {
          name,
          type: s.isDirectory() ? "directory" : "file",
          size: s.isFile() ? s.size : undefined,
        };
      } catch {
        return { name, type: "unknown" };
      }
    });

    return JSON.stringify({ path: dirPath, entries });
  } catch (err) {
    return JSON.stringify({ error: `Failed to list ${dirPath}: ${(err as Error).message}` });
  }
}

// ── Send media tool ────────────────────────────────────────

async function toolSendMedia(
  workspacePath: string,
  source: string,
  caption?: string,
  toolContext?: ToolContext,
): Promise<string> {
  if (!toolContext?.accountId || !toolContext?.chatJid) {
    return JSON.stringify({ error: "send_media is only available in WhatsApp conversations, not in UI chat." });
  }

  const isUrl = /^https?:\/\//i.test(source);
  let resolvedSource = source;

  if (!isUrl) {
    // Resolve workspace-relative path
    const target = safePath(workspacePath, source);
    if (!target) return JSON.stringify({ error: "Path not allowed — must be within workspace" });
    if (!existsSync(target)) {
      return JSON.stringify({ error: `File not found: ${source}. Check the exact path with list_files or read_file.` });
    }
    resolvedSource = target;
  }

  try {
    const msgId = await sendMediaMessage(
      toolContext.accountId,
      toolContext.chatJid,
      resolvedSource,
      caption,
    );
    logger.info("whatsapp", `Agent sent media: ${source} to ${toolContext.chatJid}`);
    return JSON.stringify({ ok: true, source, messageId: msgId });
  } catch (err) {
    return JSON.stringify({ error: `Failed to send media: ${(err as Error).message}` });
  }
}

// ══════════════════════════════════════════════════════════════
// Comprehensive web page fetcher
// ══════════════════════════════════════════════════════════════

const FETCH_TIMEOUT = 15_000;
const MAX_HTML_SIZE = 2_000_000; // 2MB
const MAX_OUTPUT_SIZE = 8_000; // chars — kept smaller to avoid token bloat across multiple pages

async function toolFetchWebpage(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return JSON.stringify({ error: "Invalid URL — must start with http:// or https://" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!response.ok) {
      return JSON.stringify({ error: `HTTP ${response.status}: ${response.statusText}`, url: response.url });
    }

    let html = await response.text();
    if (html.length > MAX_HTML_SIZE) html = html.slice(0, MAX_HTML_SIZE);

    const baseUrl = new URL(response.url);

    const result: Record<string, any> = {
      url: response.url,
      status: response.status,
    };

    // Title
    result.title = extractTag(html, "title") || extractMeta(html, "og:title");

    // Meta tags
    result.description = extractMeta(html, "description") || extractMeta(html, "og:description");
    result.keywords = extractMeta(html, "keywords");

    // Open Graph
    const og: Record<string, string> = {};
    for (const key of ["og:title", "og:description", "og:type", "og:url", "og:image", "og:site_name", "og:locale"]) {
      const val = extractMeta(html, key);
      if (val) og[key] = val;
    }
    if (Object.keys(og).length) result.openGraph = og;

    // Twitter Card
    const tw: Record<string, string> = {};
    for (const key of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
      const val = extractMeta(html, key);
      if (val) tw[key] = val;
    }
    if (Object.keys(tw).length) result.twitterCard = tw;

    // JSON-LD structured data
    const jsonLd = extractJsonLd(html);
    if (jsonLd.length) result.structuredData = jsonLd;

    // Headings
    const headings = extractHeadings(html);
    if (headings.length) result.headings = headings;

    // Navigation
    const nav = extractSection(html, "nav");
    if (nav) result.navigation = cleanText(nav).slice(0, 2000);

    // Footer
    const footer = extractSection(html, "footer");
    if (footer) result.footer = cleanText(footer).slice(0, 1000);

    // Main content
    result.mainContent = extractMainContent(html).slice(0, 4000);

    // Links
    const links = extractLinks(html, baseUrl);
    if (links.length) result.links = links.slice(0, 40);

    // Images
    const images = extractImages(html, baseUrl);
    if (images.length) result.images = images.slice(0, 40);

    // Contact info
    const contact = extractContactInfo(html);
    if (Object.keys(contact).length) result.contactInfo = contact;

    // Social links
    const social = extractSocialLinks(html);
    if (social.length) result.socialLinks = social;

    // Truncate full output
    let output = JSON.stringify(result, null, 2);
    if (output.length > MAX_OUTPUT_SIZE) {
      output = output.slice(0, MAX_OUTPUT_SIZE) + "\n... [truncated]";
    }

    return output;
  } catch (err) {
    return JSON.stringify({ error: `Fetch failed: ${(err as Error).message}`, url });
  }
}

// ── HTML extraction helpers ─────────────────────────────────

function extractTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? cleanText(m[1]).trim() : null;
}

function extractMeta(html: string, nameOrProperty: string): string | null {
  // Match both name="..." and property="..."
  const patterns = [
    new RegExp(`<meta[^>]*(?:name|property)=["']${escapeRegex(nameOrProperty)}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${escapeRegex(nameOrProperty)}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeHtmlEntities(m[1]).trim();
  }
  return null;
}

function extractJsonLd(html: string): any[] {
  const results: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      results.push(parsed);
    } catch {}
  }
  return results;
}

function extractHeadings(html: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = cleanText(m[2]).trim();
    if (text) headings.push({ level: parseInt(m[1]), text });
  }
  return headings.slice(0, 50);
}

function extractSection(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractMainContent(html: string): string {
  let text = html;

  // Remove non-content sections
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");

  // Try to find <main> or <article> or role="main"
  const mainMatch = text.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  if (mainMatch) text = mainMatch[1];

  // Convert block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|aside)[^>]*>/gi, "\n");
  // Convert list items
  text = text.replace(/<li[^>]*>/gi, "\n• ");

  return cleanText(text).replace(/\n{3,}/g, "\n\n").trim();
}

function extractLinks(html: string, baseUrl: URL): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const seen = new Set<string>();
  const re = /<a[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    let href = m[1].trim();
    const text = cleanText(m[2]).trim();
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;

    try {
      href = new URL(href, baseUrl).href;
    } catch {
      continue;
    }

    if (seen.has(href)) continue;
    seen.add(href);
    links.push({ text: text || href, href });
  }
  return links;
}

function extractImages(html: string, baseUrl: URL): Array<{ src: string; alt: string }> {
  const images: Array<{ src: string; alt: string }> = [];
  const seen = new Set<string>();
  const re = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    let src = m[1].trim();
    if (!src || src.startsWith("data:")) continue;

    try {
      src = new URL(src, baseUrl).href;
    } catch {
      continue;
    }

    if (seen.has(src)) continue;
    seen.add(src);

    const altMatch = m[0].match(/alt=["']([^"']*?)["']/i);
    images.push({ src, alt: altMatch ? decodeHtmlEntities(altMatch[1]) : "" });
  }
  return images;
}

function extractContactInfo(html: string): Record<string, string[]> {
  const info: Record<string, string[]> = {};

  // Emails
  const emails = new Set<string>();
  const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  let em: RegExpExecArray | null;
  while ((em = emailRe.exec(html)) !== null) {
    const email = em[0].toLowerCase();
    if (!email.includes("example.com") && !email.includes("sentry") && !email.includes("webpack")) {
      emails.add(email);
    }
  }
  if (emails.size) info.emails = [...emails].slice(0, 10);

  // Phone numbers
  const phones = new Set<string>();
  const phoneRe = /(?:\+?\d{1,4}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;
  let ph: RegExpExecArray | null;
  const plainText = cleanText(html);
  while ((ph = phoneRe.exec(plainText)) !== null) {
    const digits = ph[0].replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) {
      phones.add(ph[0].trim());
    }
  }
  if (phones.size) info.phones = [...phones].slice(0, 10);

  // Addresses — look for common patterns near "address" keywords
  const addressRe = /(?:address|location|located|visit us)[:\s]*([^<\n]{10,120})/gi;
  const addresses: string[] = [];
  let addr: RegExpExecArray | null;
  while ((addr = addressRe.exec(plainText)) !== null) {
    addresses.push(addr[1].trim());
  }
  if (addresses.length) info.addresses = addresses.slice(0, 5);

  // Business hours
  const hoursRe = /(?:hours|timing|open|schedule)[:\s]*([^<\n]{5,200})/gi;
  const hours: string[] = [];
  let hr: RegExpExecArray | null;
  while ((hr = hoursRe.exec(plainText)) !== null) {
    hours.push(hr[1].trim());
  }
  if (hours.length) info.businessHours = hours.slice(0, 5);

  return info;
}

function extractSocialLinks(html: string): Array<{ platform: string; url: string }> {
  const social: Array<{ platform: string; url: string }> = [];
  const seen = new Set<string>();

  const platforms: Array<{ name: string; pattern: RegExp }> = [
    { name: "Facebook", pattern: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi },
    { name: "Instagram", pattern: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi },
    { name: "Twitter/X", pattern: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>]+/gi },
    { name: "LinkedIn", pattern: /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi },
    { name: "YouTube", pattern: /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+/gi },
    { name: "TikTok", pattern: /https?:\/\/(?:www\.)?tiktok\.com\/[^\s"'<>]+/gi },
    { name: "Pinterest", pattern: /https?:\/\/(?:www\.)?pinterest\.com\/[^\s"'<>]+/gi },
    { name: "WhatsApp", pattern: /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s"'<>]+/gi },
    { name: "Telegram", pattern: /https?:\/\/(?:t\.me|telegram\.me)\/[^\s"'<>]+/gi },
  ];

  for (const { name, pattern } of platforms) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      const url = m[0].replace(/['"]+$/, "");
      if (!seen.has(url)) {
        seen.add(url);
        social.push({ platform: name, url });
      }
    }
  }
  return social;
}

// ── Text cleaning ───────────────────────────────────────────

function cleanText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
