import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

// Allow connections to databases with self-signed certificates (e.g. Supabase on Koyeb)
if (process.env.NODE_ENV === "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isProduction = process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // --- Scale-ready pool config ---
  min: isProduction ? 5 : 1,            // keep warm connections ready
  max: isProduction ? 30 : 10,           // handle concurrent requests
  idleTimeoutMillis: 30_000,             // free idle clients after 30s
  connectionTimeoutMillis: 10_000,       // fail fast on connection issues
  maxUses: 7500,                         // recycle connections to prevent leaks
  allowExitOnIdle: !isProduction,        // allow dev process to exit
});
export const db = drizzle(pool, { schema });
