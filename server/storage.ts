import {
  users, queries, modelResponses, conversations, messages,
  type User, type UpsertUser as InsertUser, type Query, type ModelResponse, type QueryWithResponses,
  type Conversation, type Message, type ConversationWithMessages
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lt, sql } from "drizzle-orm";

// Default pagination limits
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const DEFAULT_MESSAGE_LIMIT = 100;
const MAX_MESSAGE_LIMIT = 500;

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
    return db
      .select()
      .from(messages)
      .where(
        beforeId
          ? and(eq(messages.conversationId, conversationId), lt(messages.id, beforeId))
          : eq(messages.conversationId, conversationId)
      )
      .orderBy(messages.createdAt)
      .limit(safeLimit);
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
}

export const storage = new DatabaseStorage();
