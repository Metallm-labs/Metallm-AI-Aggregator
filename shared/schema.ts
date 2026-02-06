import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import Auth Models
export * from "./models/auth";
// Import Chat Models (if we want to keep them, but we'll mainly use custom tables)
export * from "./models/chat";

// === Metallm Specific Tables ===

export const queries = pgTable("queries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Links to auth users.id
  prompt: text("prompt").notNull(),
  role: text("role").default("general").notNull(), // trader, developer, creative, general
  orchestratorSummary: text("orchestrator_summary"), // The final summary from GPT
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const modelResponses = pgTable("model_responses", {
  id: serial("id").primaryKey(),
  queryId: integer("query_id").notNull().references(() => queries.id),
  modelName: text("model_name").notNull(), // 'gpt-orchestrator', 'claude-technical', 'grok-social', 'gemini-creative', 'llama-casual'
  content: text("content").notNull(),
  responseType: text("response_type").default("text").notNull(), // text, image, code
  metadata: jsonb("metadata"), // For things like confidence scores, image URLs, etc.
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
export const insertQuerySchema = createInsertSchema(queries).omit({ 
  id: true, 
  createdAt: true, 
  orchestratorSummary: true 
});

export const insertModelResponseSchema = createInsertSchema(modelResponses).omit({ 
  id: true, 
  createdAt: true 
});

// === API Types ===
export type Query = typeof queries.$inferSelect;
export type ModelResponse = typeof modelResponses.$inferSelect;
export type InsertQuery = z.infer<typeof insertQuerySchema>;

// Detailed Query View (includes responses)
export type QueryWithResponses = Query & {
  responses: ModelResponse[];
};
