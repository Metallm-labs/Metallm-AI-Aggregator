/**
 * export-emails.mjs
 * Connects to the Metallm Supabase PostgreSQL database and exports all
 * registered user emails to user_emails.txt (one email per line, no headers).
 *
 * Usage:
 *   node scripts/export-emails.mjs
 *   -- or --
 *   node scripts/export-emails.mjs --output /path/to/output.txt
 */

import { createReadStream, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const { Client } = pg;

// ── Resolve project root & load .env manually ──────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

function loadEnv() {
  try {
    const envContent = readFileSync(join(rootDir, ".env"), "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env not found — rely on environment variables already set
  }
}

loadEnv();

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const outputFlagIdx = args.indexOf("--output");
const outputPath =
  outputFlagIdx !== -1 && args[outputFlagIdx + 1]
    ? args[outputFlagIdx + 1]
    : join(rootDir, "user_emails.txt");

// ── Main ────────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "❌  DATABASE_URL is not set. Add it to your .env or export it as an environment variable."
  );
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log("🔌  Connecting to database…");
  await client.connect();

  console.log("📋  Fetching registered user emails…");
  const result = await client.query(
    "SELECT email FROM users WHERE email IS NOT NULL AND email <> '' ORDER BY created_at ASC"
  );

  const emails = result.rows.map((r) => r.email.trim()).filter(Boolean);

  if (emails.length === 0) {
    console.warn("⚠️  No emails found in the users table.");
    process.exit(0);
  }

  writeFileSync(outputPath, emails.join("\n"), "utf-8");

  console.log(`✅  Exported ${emails.length} email(s) → ${outputPath}`);
} catch (err) {
  console.error("❌  Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
