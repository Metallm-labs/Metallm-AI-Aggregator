// ============================================================
// Beautiful colorful server logger using ANSI escape codes
// Works in both dev and production (TTY-aware dimming only)
// ============================================================

const IS_TTY = process.stdout.isTTY !== false;

// ── ANSI codes ────────────────────────────────────────────────
const R = "\x1b[0m";       // reset
const B = "\x1b[1m";       // bold
const DIM = "\x1b[2m";     // dim

// Foreground colors
const BLACK   = "\x1b[30m";
const RED     = "\x1b[31m";
const GREEN   = "\x1b[32m";
const YELLOW  = "\x1b[33m";
const BLUE    = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN    = "\x1b[36m";
const WHITE   = "\x1b[37m";
const GRAY    = "\x1b[90m";

// Bright foreground
const BR_RED     = "\x1b[91m";
const BR_GREEN   = "\x1b[92m";
const BR_YELLOW  = "\x1b[93m";
const BR_BLUE    = "\x1b[94m";
const BR_MAGENTA = "\x1b[95m";
const BR_CYAN    = "\x1b[96m";
const BR_WHITE   = "\x1b[97m";

// Background
const BG_RED    = "\x1b[41m";
const BG_GREEN  = "\x1b[42m";
const BG_YELLOW = "\x1b[43m";
const BG_BLUE   = "\x1b[44m";

function c(code: string, text: string): string {
    return IS_TTY ? `${code}${text}${R}` : text;
}

// ── Timestamp ────────────────────────────────────────────────
function ts(): string {
    const t = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
    return c(GRAY, `[${t}]`);
}

// ── Source badge ─────────────────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
    express:   CYAN,
    gemini:    BR_BLUE,
    groq:      BR_MAGENTA,
    openrouter: BR_CYAN,
    websearch: BR_GREEN,
    router:    YELLOW,
    auth:      BR_YELLOW,
    db:        MAGENTA,
    vite:      CYAN,
    server:    WHITE,
};

function badge(source: string): string {
    const upper = source.toUpperCase().padEnd(10);
    const clr = SOURCE_COLORS[source.toLowerCase()] ?? WHITE;
    return c(`${B}${clr}`, `[${upper.trim()}]`);
}

// ── HTTP method badge ─────────────────────────────────────────
const METHOD_COLORS: Record<string, string> = {
    GET:    BR_GREEN,
    POST:   BR_CYAN,
    PUT:    BR_YELLOW,
    PATCH:  BR_YELLOW,
    DELETE: BR_RED,
    HEAD:   GRAY,
    OPTIONS: GRAY,
};

export function colorMethod(method: string): string {
    const clr = METHOD_COLORS[method.toUpperCase()] ?? WHITE;
    return c(`${B}${clr}`, method.toUpperCase().padEnd(6));
}

// ── Status code coloring ──────────────────────────────────────
export function colorStatus(status: number): string {
    let clr = GREEN;
    if (status >= 500) clr = `${B}${BR_RED}`;
    else if (status >= 400) clr = `${B}${BR_YELLOW}`;
    else if (status >= 300) clr = `${B}${CYAN}`;
    else if (status >= 200) clr = `${B}${BR_GREEN}`;
    return c(clr, String(status));
}

// ── Duration coloring ─────────────────────────────────────────
export function colorDuration(ms: number): string {
    let clr = BR_GREEN;
    if (ms > 5000) clr = `${B}${BR_RED}`;
    else if (ms > 2000) clr = BR_YELLOW;
    else if (ms > 500) clr = YELLOW;
    return c(clr + DIM, `${ms}ms`);
}

// ── Token count coloring ──────────────────────────────────────
export function colorTokens(n: number, label = ""): string {
    const formatted = n.toLocaleString();
    const val = c(`${B}${BR_YELLOW}`, formatted);
    return label ? `${c(GRAY, label + ":")} ${val}` : val;
}

// ── Number/value coloring ─────────────────────────────────────
export function colorValue(v: string | number): string {
    return c(`${B}${BR_GREEN}`, String(v));
}

// ── URL/path coloring ─────────────────────────────────────────
export function colorPath(p: string): string {
    return c(CYAN, p);
}

// ── Model name coloring ───────────────────────────────────────
export function colorModel(name: string): string {
    return c(`${B}${BR_MAGENTA}`, name);
}

// ── Query/search term ─────────────────────────────────────────
export function colorQuery(q: string): string {
    return c(BR_CYAN, `"${q}"`);
}

// ── Main log levels ───────────────────────────────────────────

/** General info log: [timestamp] [SOURCE] message */
export function info(source: string, ...parts: string[]): void {
    console.log(`${ts()} ${badge(source)} ${parts.join(" ")}`);
}

/** Success/green log */
export function ok(source: string, ...parts: string[]): void {
    const tick = c(`${B}${BR_GREEN}`, "✓");
    console.log(`${ts()} ${badge(source)} ${tick} ${parts.join(" ")}`);
}

/** Warning: yellow */
export function warn(source: string, ...parts: string[]): void {
    const icon = c(`${B}${BR_YELLOW}`, "⚠");
    console.warn(`${ts()} ${badge(source)} ${icon} ${c(BR_YELLOW, parts.join(" "))}`);
}

/** Error: red */
export function error(source: string, ...parts: string[]): void {
    const icon = c(`${B}${BR_RED}`, "✖");
    console.error(`${ts()} ${badge(source)} ${icon} ${c(BR_RED, parts.join(" "))}`);
}

/** Rate limit warning: prominent orange/red */
export function rateLimit(source: string, model: string, retryInSec?: number): void {
    const icon = c(`${B}${BG_YELLOW}${BLACK}`, " 429 ");
    const m = colorModel(model);
    const retry = retryInSec ? c(BR_YELLOW, ` retry in ${retryInSec}s`) : "";
    console.warn(`${ts()} ${badge(source)} ${icon} ${c(BR_YELLOW, "Rate limit")} ${c(GRAY, "for")} ${m}${retry}`);
}

/** HTTP request log */
export function httpLog(method: string, path: string, status: number, durationMs: number, body?: any): void {
    const bodyStr = body ? c(DIM + GRAY, ` :: ${JSON.stringify(body).slice(0, 200)}`) : "";
    console.log(`${ts()} ${badge("express")} ${colorMethod(method)} ${colorPath(path)} ${colorStatus(status)} ${c(GRAY, "in")} ${colorDuration(durationMs)}${bodyStr}`);
}

/** Token usage log */
export function tokenLog(source: string, model: string, prompt: number, completion: number, total: number): void {
    const m = colorModel(model);
    const p = colorTokens(prompt, "in");
    const o = colorTokens(completion, "out");
    const t = colorTokens(total, "total");
    console.log(`${ts()} ${badge(source)} 🪙 ${m} ${p}  ${o}  ${t}`);
}

/** Web search log */
export function searchLog(action: string, detail: string, count?: number): void {
    const icon = c(`${B}${BR_BLUE}`, "🔍");
    const a = c(`${B}${CYAN}`, action);
    const d = c(GRAY, detail);
    const n = count !== undefined ? c(BR_GREEN, ` (${count} results)`) : "";
    console.log(`${ts()} ${badge("websearch")} ${icon} ${a} ${d}${n}`);
}

/** Startup/config success */
export function startup(msg: string): void {
    const icon = c(`${B}${BR_GREEN}`, "✅");
    console.log(`${ts()} ${badge("server")} ${icon} ${c(BR_WHITE, msg)}`);
}

/** Separator for grouping related logs */
export function divider(label?: string): void {
    const line = "─".repeat(50);
    const text = label ? ` ${c(`${B}${CYAN}`, label)} ` : "";
    console.log(c(GRAY, `${line}${text}${line}`));
}

// ── Monkey-patch console.log for all server modules ──────────
// Parses common patterns and colorizes them automatically
// ─────────────────────────────────────────────────────────────
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);

function autoColor(args: any[]): string {
    const raw = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");

    // Already formatted with ANSI (from our own logger) — pass through
    if (raw.includes("\x1b[")) return raw;

    let out = raw;

    // Error/fail patterns → red
    if (/\b(error|Error|failed|fail|exception)\b/i.test(out)) {
        return c(BR_RED, out);
    }
    // Rate limit → yellow bold
    if (/429|rate.?limit/i.test(out)) {
        return c(`${B}${BR_YELLOW}`, out);
    }
    // Warning patterns → yellow
    if (/\b(warn|warning|retry|retrying|fallback)\b/i.test(out)) {
        return c(BR_YELLOW, out);
    }
    // Token usage lines — colorize numbers
    if (/token/i.test(out)) {
        // Color numbers green, labels gray
        out = out.replace(/(\d[\d,]+)/g, (n) => c(`${B}${BR_YELLOW}`, n));
        return c(GRAY, "[Token] ") + out;
    }
    // Web search lines
    if (/\[WebSearch\]|\[DDG\]/i.test(out)) {
        out = out.replace(/\[WebSearch\]/g, c(`${B}${BR_BLUE}`, "[🔍 Search]"));
        out = out.replace(/"([^"]+)"/g, (_, q) => c(BR_CYAN, `"${q}"`));
        out = out.replace(/(\d+) results?/g, (_, n) => c(BR_GREEN, `${n} results`));
        return out;
    }
    // Success / OK patterns → green
    if (/✅|configured|success|connected|ready|listening|serving/i.test(out)) {
        return c(BR_GREEN, out);
    }
    // Groq/model names
    out = out.replace(/\[Groq\]/g, c(`${B}${BR_MAGENTA}`, "[Groq]"));
    out = out.replace(/\[Gemini\]/g, c(`${B}${BR_BLUE}`, "[Gemini]"));
    out = out.replace(/\[OpenRouter\]/g, c(`${B}${BR_CYAN}`, "[OpenRouter]"));
    out = out.replace(/\[Router\]/g, c(`${B}${YELLOW}`, "[Router]"));

    // Color numbers that look like token counts or values
    out = out.replace(/=(\d[\d,]+)/g, (_m, n) => `=${c(`${B}${BR_GREEN}`, n)}`);
    out = out.replace(/:\s*(\d[\d,]+)/g, (_m, n) => `: ${c(`${B}${BR_GREEN}`, n)}`);

    return out;
}

export function installGlobalLogger(): void {
    console.log = (...args: any[]) => {
        _origLog(autoColor(args));
    };
    console.warn = (...args: any[]) => {
        const raw = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
        const already = raw.includes("\x1b[");
        _origWarn(already ? raw : c(`${B}${BR_YELLOW}`, "⚠ " + raw));
    };
    console.error = (...args: any[]) => {
        const raw = args.map(a => {
            if (a instanceof Error) return `${a.message}\n${a.stack ?? ""}`;
            if (typeof a === "object") return JSON.stringify(a);
            return String(a);
        }).join(" ");
        const already = raw.includes("\x1b[");
        _origError(already ? raw : c(`${B}${BR_RED}`, "✖ " + raw));
    };
}
