import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, boolean, numeric, bigserial, integer, uniqueIndex } from "drizzle-orm/pg-core";

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

// === Password reset tokens (email/password users) ===
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").notNull(),
  tokenHash: varchar("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_password_reset_tokens_user_id").on(table.userId),
  index("idx_password_reset_tokens_expires_at").on(table.expiresAt),
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

// === Subscription State ===
export const userSubscriptions = pgTable("user_subscriptions", {
  userId: varchar("user_id").primaryKey(),
  provider: varchar("provider").notNull().default("lemonsqueezy"),
  subscriptionId: varchar("subscription_id").notNull().unique(),
  customerId: varchar("customer_id"),
  orderId: varchar("order_id"),
  productId: varchar("product_id"),
  variantId: varchar("variant_id"),
  planInterval: varchar("plan_interval").notNull().default("unknown"), // monthly | yearly | unknown
  status: varchar("status").notNull().default("pending"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  testMode: boolean("test_mode").notNull().default(false),
  customerPortalUrl: varchar("customer_portal_url"),
  updateSubscriptionUrl: varchar("update_subscription_url"),
  renewsAt: timestamp("renews_at"),
  endsAt: timestamp("ends_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_subscriptions_status").on(table.status),
  index("idx_user_subscriptions_provider").on(table.provider),
]);

// === Business Agent Subscription State ===
export const businessAgentSubscriptions = pgTable("business_agent_subscriptions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: varchar("user_id").notNull(),
  agentId: varchar("agent_id").notNull(),
  provider: varchar("provider").notNull().default("lemonsqueezy"),
  status: varchar("status").notNull().default("trialing"),
  planCode: varchar("plan_code").notNull().default("trial"), // trial | starter | pro | enterprise
  subscriptionId: varchar("subscription_id"),
  customerId: varchar("customer_id"),
  variantId: varchar("variant_id"),
  checkoutId: varchar("checkout_id"),
  monthlyMessageLimit: integer("monthly_message_limit").notNull().default(20),
  usedMessages: integer("used_messages").notNull().default(0),
  periodStart: timestamp("period_start").notNull().defaultNow(),
  periodEnd: timestamp("period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_business_agent_subscriptions_user").on(table.userId),
  index("idx_business_agent_subscriptions_agent").on(table.agentId),
  index("idx_business_agent_subscriptions_subscription").on(table.subscriptionId),
  uniqueIndex("uq_business_agent_subscriptions_user_agent").on(table.userId, table.agentId),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type PaddleTransaction = typeof paddleTransactions.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type OxapayTransaction = typeof oxapayTransactions.$inferSelect;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type BusinessAgentSubscription = typeof businessAgentSubscriptions.$inferSelect;
