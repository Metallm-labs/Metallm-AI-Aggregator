import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, boolean, numeric, bigserial, integer } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password"), // Nullable - only for email auth users
  authProvider: varchar("auth_provider").default("email"), // 'email' or 'google'
  isVerified: boolean("is_verified").default(false), // Email verification status
  otpCode: varchar("otp_code"), // 6-digit OTP code
  otpExpiresAt: timestamp("otp_expires_at"), // Expiry time for OTP
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  credits: numeric("credits", { precision: 12, scale: 4 }).default("0").notNull(), // Credit balance (1:1 with USD)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_users_email").on(table.email),
  index("idx_users_auth_provider").on(table.authProvider),
]);

// === Paddle Transactions ===
export const paddleTransactions = pgTable("paddle_transactions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").notNull(),
  paddleTransactionId: varchar("paddle_transaction_id").notNull().unique(),
  status: varchar("status").notNull(), // 'completed', 'refunded', etc.
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency").default("USD").notNull(),
  creditsAdded: numeric("credits_added", { precision: 12, scale: 4 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_paddle_tx_user").on(table.userId),
  index("idx_paddle_tx_paddle_id").on(table.paddleTransactionId),
]);

// === Credit Usage Ledger ===
export const creditTransactions = pgTable("credit_transactions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type").notNull(), // 'purchase' | 'usage' | 'refund'
  amount: numeric("amount", { precision: 12, scale: 6 }).notNull(), // positive for purchase, negative for usage
  balanceAfter: numeric("balance_after", { precision: 12, scale: 4 }).notNull(),
  description: varchar("description"),
  metadata: jsonb("metadata"), // token usage details, model name, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_credit_tx_user").on(table.userId),
  index("idx_credit_tx_type").on(table.type),
]);

// === QBitcoin Deposit Wallets ===
// One dedicated deposit address per user — generated with Falcon-512
export const qbcWallets = pgTable("qbc_wallets", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").notNull().unique(), // one wallet per user
  address: varchar("address").notNull().unique(),
  publicKey: varchar("public_key").notNull(),
  encryptedSecretKey: varchar("encrypted_secret_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_qbc_wallets_user").on(table.userId),
  index("idx_qbc_wallets_address").on(table.address),
]);

// === QBitcoin Deposit Transactions ===
export const qbcDeposits = pgTable("qbc_deposits", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").notNull(),
  txHash: varchar("tx_hash").notNull().unique(),
  amountShor: varchar("amount_shor").notNull(),    // raw shor amount
  amountQbc: varchar("amount_qbc").notNull(),      // human-readable QBC
  amountUsd: varchar("amount_usd").notNull(),      // USD equivalent at time of deposit
  creditsAdded: varchar("credits_added").notNull().default("0"),
  confirmations: integer("confirmations").notNull().default(0),
  status: varchar("status").notNull().default("pending"), // pending | confirmed | forwarded
  forwardTxHash: varchar("forward_tx_hash"),              // sweep tx to main wallet
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_qbc_deposits_user").on(table.userId),
  index("idx_qbc_deposits_txhash").on(table.txHash),
]);

// === OxaPay (Crypto) Transactions ===
export const oxapayTransactions = pgTable("oxapay_transactions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").notNull(),
  trackId: varchar("track_id").notNull().unique(),
  orderId: varchar("order_id").notNull(),
  status: varchar("status").notNull().default("waiting"), // waiting | paid | expired | error
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
  creditsAdded: numeric("credits_added", { precision: 12, scale: 4 }).notNull().default("0"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_oxapay_tx_user").on(table.userId),
  index("idx_oxapay_tx_track").on(table.trackId),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type PaddleTransaction = typeof paddleTransactions.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type OxapayTransaction = typeof oxapayTransactions.$inferSelect;

