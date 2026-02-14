import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import Auth Models
export * from "./models/auth";
// Import Chat Models (if we want to keep them, but we'll mainly use custom tables)
export * from "./models/chat";

// === Conversations Table ===
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").default("New Chat").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// === Messages Table ===
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  modelName: text("model_name"), // e.g., 'Gemini', 'Claude', 'Grok', 'LLaMA', null for user
  metadata: jsonb("metadata"), // For images, attachments, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  prompt: text("prompt").notNull(),
  role: text("role").default("general").notNull(),
  orchestratorSummary: text("orchestrator_summary"),
  allModelsMode: boolean("all_models_mode").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const modelResponses = pgTable("model_responses", {
  id: serial("id").primaryKey(),
  queryId: integer("query_id").notNull().references(() => queries.id),
  modelName: text("model_name").notNull(),
  content: text("content").notNull(),
  responseType: text("response_type").default("text").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

export const insertMessageSchema = z.object({
  conversationId: z.number(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
  modelName: z.string().optional(),
  metadata: z.any().optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1),
  mode: z.enum(["single", "multi", "debate"]).default("single"),
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
