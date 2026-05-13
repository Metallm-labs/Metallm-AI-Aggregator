import { pgTable, text, serial, integer, bigint, bigserial, boolean, timestamp, jsonb, varchar, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import Auth Models
export * from "./models/auth";
// Import Chat Models (if we want to keep them, but we'll mainly use custom tables)
export * from "./models/chat";

// === Conversations Table ===
export const conversations = pgTable("conversations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").default("New Chat").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_conversations_user_id").on(table.userId),
  index("idx_conversations_user_updated").on(table.userId, table.updatedAt),
]);

// === Messages Table ===
export const messages = pgTable("messages", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  conversationId: bigint("conversation_id", { mode: "number" }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  modelName: text("model_name"), // e.g., 'Gemini', 'Claude', 'Grok', 'LLaMA', null for user
  metadata: jsonb("metadata"), // For images, attachments, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_messages_conversation_id").on(table.conversationId),
  index("idx_messages_conversation_created").on(table.conversationId, table.createdAt),
]);

// === Relations ===
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// === Legacy Query Tables (keeping for backward compatibility) ===
export const queries = pgTable("queries", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  prompt: text("prompt").notNull(),
  role: text("role").default("general").notNull(),
  orchestratorSummary: text("orchestrator_summary"),
  allModelsMode: boolean("all_models_mode").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_queries_user_id").on(table.userId),
  index("idx_queries_user_created").on(table.userId, table.createdAt),
]);

export const modelResponses = pgTable("model_responses", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  queryId: bigint("query_id", { mode: "number" }).notNull().references(() => queries.id),
  modelName: text("model_name").notNull(),
  content: text("content").notNull(),
  responseType: text("response_type").default("text").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_model_responses_query_id").on(table.queryId),
]);

export const queriesRelations = relations(queries, ({ many }) => ({
  responses: many(modelResponses),
}));

export const modelResponsesRelations = relations(modelResponses, ({ one }) => ({
  query: one(queries, {
    fields: [modelResponses.queryId],
    references: [queries.id],
  }),
}));

// === Zod Schemas ===
export const insertConversationSchema = z.object({
  title: z.string().optional(),
});

// === Per-user model settings (customized model name/role/prompts + main model) ===
export const userModelSettings = pgTable("user_model_settings", {
  userId: text("user_id").primaryKey().notNull(),
  models: jsonb("models"), // ModelConfig[] (stored as JSON)
  mainModelId: text("main_model_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_model_settings_user_id").on(table.userId),
]);

export const userPersonalizations = pgTable("user_personalizations", {
  userId: text("user_id").primaryKey().notNull(),
  nickname: text("nickname"),
  occupation: text("occupation"),
  customInstructions: text("custom_instructions"),
  moreAboutYou: text("more_about_you"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_personalizations_user_id").on(table.userId),
]);

export const userMemoryPreferences = pgTable("user_memory_preferences", {
  userId: text("user_id").primaryKey().notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_memory_preferences_user_id").on(table.userId),
]);

export const userMemories = pgTable("user_memories", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  content: text("content").notNull(),
  source: text("source").default("auto").notNull(),
  sourceConversationId: bigint("source_conversation_id", { mode: "number" }),
  sourceMessageId: bigint("source_message_id", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_memories_user_id").on(table.userId),
  index("idx_user_memories_user_category").on(table.userId, table.category),
  index("idx_user_memories_user_updated").on(table.userId, table.updatedAt),
]);

export const businessProfiles = pgTable("business_profiles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  agentId: text("agent_id").notNull(),
  businessName: text("business_name").notNull(),
  businessType: text("business_type").notNull(),
  whatsappNumber: text("whatsapp_number"),
  email: text("email"),
  website: text("website"),
  regions: jsonb("regions").$type<string[]>().default([]).notNull(),
  languages: jsonb("languages").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_business_profiles_user_id").on(table.userId),
  index("idx_business_profiles_agent_id").on(table.agentId),
  uniqueIndex("uq_business_profiles_user_agent").on(table.userId, table.agentId),
]);

export const insertMessageSchema = z.object({
  conversationId: z.number(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
  modelName: z.string().optional(),
  metadata: z.any().optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1),
  mode: z.enum(["single", "multi", "debate", "media"]).default("single"),
  attachments: z.array(z.any()).optional(),
});

// Legacy schemas
export const insertQuerySchema = z.object({
  prompt: z.string().min(1),
  role: z.string().default("general"),
  allModelsMode: z.boolean().default(false),
});

export const insertModelResponseSchema = createInsertSchema(modelResponses).omit({
  id: true,
  createdAt: true
});

// === API Types ===
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type SendMessage = z.infer<typeof sendMessageSchema>;

// Legacy types
export type Query = typeof queries.$inferSelect;
export type ModelResponse = typeof modelResponses.$inferSelect;
export type InsertQuery = z.infer<typeof insertQuerySchema>;

export type QueryWithResponses = Query & {
  responses: ModelResponse[];
};

export type ConversationWithMessages = Conversation & {
  messages: Message[];
};

// === WhatsApp Agent Accounts ===
export const whatsappAccounts = pgTable("whatsapp_accounts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull().unique(),
  phone: text("phone"),
  pushName: text("push_name"),
  status: text("status").notNull().default("disconnected"), // disconnected | connecting | qr_pending | connected
  enabled: boolean("enabled").notNull().default(true),
  systemPrompt: text("system_prompt"),
  aiModel: text("ai_model").default("anthropic/claude-sonnet-4-5"),
  workspacePath: text("workspace_path"),
  authDir: text("auth_dir").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_whatsapp_accounts_user_id").on(table.userId),
  uniqueIndex("uq_whatsapp_accounts_user_account").on(table.userId, table.accountId),
]);

// === WhatsApp Messages Log ===
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  accountId: text("account_id").notNull(),
  chatJid: text("chat_jid").notNull(),
  messageId: text("message_id"),
  direction: text("direction").notNull(), // inbound | outbound
  senderJid: text("sender_jid"),
  senderName: text("sender_name"),
  body: text("body"),
  mediaType: text("media_type"),
  mediaUrl: text("media_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_whatsapp_messages_account_id").on(table.accountId),
  index("idx_whatsapp_messages_chat_jid").on(table.accountId, table.chatJid),
  index("idx_whatsapp_messages_created").on(table.accountId, table.createdAt),
]);

export type UserModelSettings = typeof userModelSettings.$inferSelect;
export type UserPersonalization = typeof userPersonalizations.$inferSelect;
export type UserMemoryPreference = typeof userMemoryPreferences.$inferSelect;
export type UserMemory = typeof userMemories.$inferSelect;
export type BusinessProfile = typeof businessProfiles.$inferSelect;
export type WhatsAppAccount = typeof whatsappAccounts.$inferSelect;
export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
