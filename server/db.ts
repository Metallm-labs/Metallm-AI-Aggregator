import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

// Allow connections to databases with self-signed certificates (e.g. Neon on Koyeb)
if (process.env.NODE_ENV === "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });
