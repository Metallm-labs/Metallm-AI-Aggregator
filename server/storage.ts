import {
  users, queries, modelResponses, conversations, messages, userModelSettings, userPersonalizations, userMemoryPreferences, userMemories, creditTransactions,
  type User, type UpsertUser as InsertUser, type Query, type ModelResponse, type QueryWithResponses,
  type Conversation, type Message, type ConversationWithMessages
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lt, sql, inArray } from "drizzle-orm";
import type { ModelConfig } from "./openrouter";
import type { UserMemoryCategory, UserMemoryData, UserMemoryPreferenceData } from "./user-memory";

// Default pagination limits
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const DEFAULT_MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LIMIT = 500;

export interface UserPersonalizationData {
  nickname: string;
  occupation: string;
  customInstructions: string;
  moreAboutYou: string;
}

export interface UserChatModeUsageData {
  direct: number;
  single: number;
  multi: number;
  debate: number;
  media: number;
}

export interface IStorage {
  // Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Legacy Metallm
  createQuery(query: any): Promise<Query>;
  updateQuerySummary(id: number, summary: string): Promise<Query>;
  addModelResponse(response: { queryId: number; modelName: string; content: string; responseType: string; metadata?: any }): Promise<ModelResponse>;
  getQueries(userId: string, limit?: number, offset?: number): Promise<Query[]>;
  getQueryWithResponses(id: number): Promise<QueryWithResponses | undefined>;

  // Chat Conversations
  getConversations(userId: string, limit?: number, offset?: number): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  getConversationWithMessages(id: number, messageLimit?: number, beforeId?: number): Promise<ConversationWithMessages | undefined>;
  createConversation(data: { userId: string; title: string }): Promise<Conversation>;
  updateConversationTitle(id: number, title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;

  // Messages
  getMessages(conversationId: number, limit?: number, beforeId?: number): Promise<Message[]>;
  getMessageCount(conversationId: number): Promise<number>;
  addMessage(data: { conversationId: number; role: string; content: string; modelName: string | null; metadata?: any }): Promise<Message>;
  deleteMessagesAfter(conversationId: number, messageId: number): Promise<void>;

  // Per-user model settings
  getUserModelSettings(userId: string): Promise<{ models: ModelConfig[]; mainModelId: string } | undefined>;
  upsertUserModelSettings(userId: string, models: ModelConfig[], mainModelId: string): Promise<void>;
  clearUserModelSettings(userId: string): Promise<void>;

  // Per-user personalization
  getUserPersonalization(userId: string): Promise<UserPersonalizationData | undefined>;
  upsertUserPersonalization(userId: string, personalization: UserPersonalizationData): Promise<UserPersonalizationData>;
  clearUserPersonalization(userId: string): Promise<void>;

  // Access / billing helpers
  hasPurchasedCredits(userId: string): Promise<boolean>;
  getUserChatModeUsage(userId: string): Promise<UserChatModeUsageData>;

  // Per-user saved memory
  getUserMemoryPreferences(userId: string): Promise<UserMemoryPreferenceData>;
  upsertUserMemoryPreferences(userId: string, preferences: UserMemoryPreferenceData): Promise<UserMemoryPreferenceData>;
  getUserMemories(userId: string): Promise<UserMemoryData[]>;
  createUserMemory(data: {
    userId: string;
    category: UserMemoryCategory;
    content: string;
    source: string;
    sourceConversationId?: number | null;
    sourceMessageId?: number | null;
  }): Promise<UserMemoryData>;
  updateUserMemory(id: number, data: { content: string; category?: UserMemoryCategory; source?: string }): Promise<UserMemoryData>;
  deleteUserMemories(userId: string, ids: number[]): Promise<void>;
  deleteUserMemoriesByCategory(userId: string, category: UserMemoryCategory): Promise<void>;
  clearUserMemories(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Auth methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Legacy Metallm methods
  async createQuery(insertQuery: any): Promise<Query> {
    const [query] = await db.insert(queries).values(insertQuery).returning();
    return query;
  }

  async updateQuerySummary(id: number, summary: string): Promise<Query> {
    const [query] = await db
      .update(queries)
      .set({ orchestratorSummary: summary })
      .where(eq(queries.id, id))
      .returning();
    return query;
  }

  async addModelResponse(response: { queryId: number; modelName: string; content: string; responseType: string; metadata?: any }): Promise<ModelResponse> {
    const [res] = await db.insert(modelResponses).values(response).returning();
    return res;
  }

  async getQueries(userId: string, limit = DEFAULT_PAGE_SIZE, offset = 0): Promise<Query[]> {
    const safeLimit = Math.min(limit, MAX_PAGE_SIZE);
    return db
      .select()
      .from(queries)
      .where(eq(queries.userId, userId))
      .orderBy(desc(queries.createdAt))
      .limit(safeLimit)
      .offset(offset);
  }

  async getQueryWithResponses(id: number): Promise<QueryWithResponses | undefined> {
    const [query] = await db.select().from(queries).where(eq(queries.id, id));
    if (!query) return undefined;

    const responses = await db
      .select()
      .from(modelResponses)
      .where(eq(modelResponses.queryId, id));

    return { ...query, responses };
  }

  // ===== Chat Conversation Methods =====

  async getConversations(userId: string, limit = DEFAULT_PAGE_SIZE, offset = 0): Promise<Conversation[]> {
    const safeLimit = Math.min(limit, MAX_PAGE_SIZE);
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(safeLimit)
      .offset(offset);
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationWithMessages(id: number, messageLimit = DEFAULT_MESSAGE_LIMIT, beforeId?: number): Promise<ConversationWithMessages | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    if (!conversation) return undefined;

    const safeLimit = Math.min(messageLimit, MAX_MESSAGE_LIMIT);
    let query = db
      .select()
      .from(messages)
      .where(
        beforeId
          ? and(eq(messages.conversationId, id), lt(messages.id, beforeId))
          : eq(messages.conversationId, id)
      )
      .orderBy(messages.createdAt)
      .limit(safeLimit);

    const msgs = await query;

    return { ...conversation, messages: msgs };
  }

  async createConversation(data: { userId: string; title: string }): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values(data)
      .returning();
    return conversation;
  }

  async updateConversationTitle(id: number, title: string): Promise<Conversation> {
    const [conversation] = await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return conversation;
  }

  async deleteConversation(id: number): Promise<void> {
    // Messages will be cascade deleted due to foreign key
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // ===== Message Methods =====

  async getMessages(conversationId: number, limit = DEFAULT_MESSAGE_LIMIT, beforeId?: number): Promise<Message[]> {
    const safeLimit = Math.min(limit, MAX_MESSAGE_LIMIT);
    const rows = await db
      .select()
      .from(messages)
      .where(
        beforeId
          ? and(eq(messages.conversationId, conversationId), lt(messages.id, beforeId))
          : eq(messages.conversationId, conversationId)
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(safeLimit);

    // Return chronological order while still selecting the latest N rows.
    return rows.reverse();
  }

  async getMessageCount(conversationId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    return result[0]?.count ?? 0;
  }

  async addMessage(data: { conversationId: number; role: string; content: string; modelName: string | null; metadata?: any }): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(data)
      .returning();

    // Update conversation's updatedAt
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, data.conversationId));

    return message;
  }

  async deleteMessagesAfter(conversationId: number, messageId: number): Promise<void> {
    // Delete all messages with ID greater than or equal to the specified messageId
    await db
      .delete(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          gte(messages.id, messageId)
        )
      );
  }

  // ===== Per-user model settings =====

  async getUserModelSettings(userId: string): Promise<{ models: ModelConfig[]; mainModelId: string } | undefined> {
    const [row] = await db.select().from(userModelSettings).where(eq(userModelSettings.userId, userId));
    if (!row) return undefined;
    const models = Array.isArray(row.models) ? (row.models as ModelConfig[]) : [];
    const mainModelId = typeof row.mainModelId === "string" ? row.mainModelId : "";
    if (models.length === 0 || !mainModelId) return undefined;
    return { models, mainModelId };
  }

  async upsertUserModelSettings(userId: string, models: ModelConfig[], mainModelId: string): Promise<void> {
    await db
      .insert(userModelSettings)
      .values({
        userId,
        models: models as any,
        mainModelId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userModelSettings.userId,
        set: { models: models as any, mainModelId, updatedAt: new Date() },
      });
  }

  async clearUserModelSettings(userId: string): Promise<void> {
    await db.delete(userModelSettings).where(eq(userModelSettings.userId, userId));
  }

  async getUserPersonalization(userId: string): Promise<UserPersonalizationData | undefined> {
    const [row] = await db.select().from(userPersonalizations).where(eq(userPersonalizations.userId, userId));
    if (!row) return undefined;
    return {
      nickname: row.nickname ?? "",
      occupation: row.occupation ?? "",
      customInstructions: row.customInstructions ?? "",
      moreAboutYou: row.moreAboutYou ?? "",
    };
  }

  async upsertUserPersonalization(userId: string, personalization: UserPersonalizationData): Promise<UserPersonalizationData> {
    const next = {
      nickname: personalization.nickname,
      occupation: personalization.occupation,
      customInstructions: personalization.customInstructions,
      moreAboutYou: personalization.moreAboutYou,
    };

    await db
      .insert(userPersonalizations)
      .values({
        userId,
        ...next,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPersonalizations.userId,
        set: {
          ...next,
          updatedAt: new Date(),
        },
      });

    return next;
  }

  async clearUserPersonalization(userId: string): Promise<void> {
    await db.delete(userPersonalizations).where(eq(userPersonalizations.userId, userId));
  }

  async hasPurchasedCredits(userId: string): Promise<boolean> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.userId, userId),
          eq(creditTransactions.type, "purchase")
        )
      );

    return (result?.count ?? 0) > 0;
  }

  async getUserChatModeUsage(userId: string): Promise<UserChatModeUsageData> {
    const [result] = await db
      .select({
        direct: sql<number>`count(*) filter (where ${messages.role} = 'user' and coalesce(${messages.metadata}->>'mode', '') = 'direct')::int`,
        single: sql<number>`count(*) filter (where ${messages.role} = 'user' and coalesce(${messages.metadata}->>'mode', '') = 'single')::int`,
        multi: sql<number>`count(*) filter (where ${messages.role} = 'user' and coalesce(${messages.metadata}->>'mode', '') = 'multi')::int`,
        debate: sql<number>`count(*) filter (where ${messages.role} = 'user' and coalesce(${messages.metadata}->>'mode', '') = 'debate')::int`,
        media: sql<number>`count(*) filter (where ${messages.role} = 'user' and coalesce(${messages.metadata}->>'mode', '') = 'media')::int`,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.userId, userId));

    return {
      direct: result?.direct ?? 0,
      single: result?.single ?? 0,
      multi: result?.multi ?? 0,
      debate: result?.debate ?? 0,
      media: result?.media ?? 0,
    };
  }

  async getUserMemoryPreferences(userId: string): Promise<UserMemoryPreferenceData> {
    const [row] = await db.select().from(userMemoryPreferences).where(eq(userMemoryPreferences.userId, userId));
    return {
      enabled: row?.enabled ?? true,
    };
  }

  async upsertUserMemoryPreferences(userId: string, preferences: UserMemoryPreferenceData): Promise<UserMemoryPreferenceData> {
    const next = {
      enabled: preferences.enabled,
    };

    await db
      .insert(userMemoryPreferences)
      .values({
        userId,
        ...next,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userMemoryPreferences.userId,
        set: {
          ...next,
          updatedAt: new Date(),
        },
      });

    return next;
  }

  async getUserMemories(userId: string): Promise<UserMemoryData[]> {
    const rows = await db
      .select()
      .from(userMemories)
      .where(eq(userMemories.userId, userId))
      .orderBy(desc(userMemories.updatedAt), desc(userMemories.id));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      category: row.category as UserMemoryCategory,
      content: row.content,
      source: row.source,
      sourceConversationId: row.sourceConversationId ?? null,
      sourceMessageId: row.sourceMessageId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async createUserMemory(data: {
    userId: string;
    category: UserMemoryCategory;
    content: string;
    source: string;
    sourceConversationId?: number | null;
    sourceMessageId?: number | null;
  }): Promise<UserMemoryData> {
    const [row] = await db
      .insert(userMemories)
      .values({
        userId: data.userId,
        category: data.category,
        content: data.content,
        source: data.source,
        sourceConversationId: data.sourceConversationId ?? null,
        sourceMessageId: data.sourceMessageId ?? null,
        updatedAt: new Date(),
      })
      .returning();

    return {
      id: row.id,
      userId: row.userId,
      category: row.category as UserMemoryCategory,
      content: row.content,
      source: row.source,
      sourceConversationId: row.sourceConversationId ?? null,
      sourceMessageId: row.sourceMessageId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async updateUserMemory(id: number, data: { content: string; category?: UserMemoryCategory; source?: string }): Promise<UserMemoryData> {
    const [row] = await db
      .update(userMemories)
      .set({
        content: data.content,
        category: data.category,
        source: data.source,
        updatedAt: new Date(),
      })
      .where(eq(userMemories.id, id))
      .returning();

    return {
      id: row.id,
      userId: row.userId,
      category: row.category as UserMemoryCategory,
      content: row.content,
      source: row.source,
      sourceConversationId: row.sourceConversationId ?? null,
      sourceMessageId: row.sourceMessageId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async deleteUserMemories(userId: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db
      .delete(userMemories)
      .where(and(eq(userMemories.userId, userId), inArray(userMemories.id, ids)));
  }

  async deleteUserMemoriesByCategory(userId: string, category: UserMemoryCategory): Promise<void> {
    await db
      .delete(userMemories)
      .where(and(eq(userMemories.userId, userId), eq(userMemories.category, category)));
  }

  async clearUserMemories(userId: string): Promise<void> {
    await db.delete(userMemories).where(eq(userMemories.userId, userId));
  }
}

export const storage = new DatabaseStorage();
