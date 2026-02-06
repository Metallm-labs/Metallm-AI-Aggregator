import { users, queries, modelResponses, type User, type InsertUser, type Query, type InsertQuery, type ModelResponse, type QueryWithResponses } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Metallm
  createQuery(query: InsertQuery): Promise<Query>;
  updateQuerySummary(id: number, summary: string): Promise<Query>;
  addModelResponse(response: { queryId: number; modelName: string; content: string; responseType: string; metadata?: any }): Promise<ModelResponse>;
  getQueries(userId: string): Promise<Query[]>;
  getQueryWithResponses(id: number): Promise<QueryWithResponses | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Auth methods (minimal implementation if needed, but Replit Auth handles most)
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

  // Metallm methods
  async createQuery(insertQuery: InsertQuery): Promise<Query> {
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

  async getQueries(userId: string): Promise<Query[]> {
    return db
      .select()
      .from(queries)
      .where(eq(queries.userId, userId))
      .orderBy(desc(queries.createdAt));
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
}

export const storage = new DatabaseStorage();
