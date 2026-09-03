import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { resolveDbSsl } from "./shared/db-ssl";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: resolveDbSsl(process.env.DATABASE_URL),
  },
});
