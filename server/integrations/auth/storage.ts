import {
  users,
  sessions,
  passwordResetTokens,
  paddleTransactions,
  creditTransactions,
  qbcWallets,
  qbcDeposits,
  oxapayTransactions,
  userSubscriptions,
  businessAgentSubscriptions,
  conversations,
  messages,
  queries,
  modelResponses,
  userModelSettings,
  userPersonalizations,
  userMemoryPreferences,
  userMemories,
  type User,
  type UpsertUser,
} from "@shared/schema";
import { db } from "../../db";
import { eq, and, gt, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUserWithPassword(email: string, password: string, firstName: string, lastName: string): Promise<User>;
  verifyPassword(password: string, hashedPassword: string): Promise<boolean>;
  saveOtp(userId: string, otp: string, expiresAt: Date): Promise<void>;
  verifyUser(userId: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
  setUserPassword(userId: string, hashedPassword: string): Promise<void>;
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  consumePasswordResetToken(tokenHash: string): Promise<{ userId: string } | null>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createUserWithPassword(
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        authProvider: "email",
        firstName,
        lastName,
        isVerified: false, // Explicitly false for email signup
      })
      .returning();
    return user;
  }

  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async saveOtp(userId: string, otp: string, expiresAt: Date): Promise<void> {
    await db
      .update(users)
      .set({ otpCode: otp, otpExpiresAt: expiresAt })
      .where(eq(users.id, userId));
  }

  async verifyUser(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ isVerified: true, otpCode: null, otpExpiresAt: null })
      .where(eq(users.id, userId));
  }

  async deleteUser(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Remove dependent chat rows first where no FK cascade exists.
      await tx
        .delete(modelResponses)
        .where(
          sql`${modelResponses.queryId} IN (select ${queries.id} from ${queries} where ${queries.userId} = ${id})`
        );

      await tx.delete(queries).where(eq(queries.userId, id));
      await tx.delete(conversations).where(eq(conversations.userId, id));
      await tx.delete(messages).where(
        sql`${messages.conversationId} IN (select ${conversations.id} from ${conversations} where ${conversations.userId} = ${id})`
      );

      await tx.delete(userMemories).where(eq(userMemories.userId, id));
      await tx.delete(userMemoryPreferences).where(eq(userMemoryPreferences.userId, id));
      await tx.delete(userPersonalizations).where(eq(userPersonalizations.userId, id));
      await tx.delete(userModelSettings).where(eq(userModelSettings.userId, id));

      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
      await tx.delete(paddleTransactions).where(eq(paddleTransactions.userId, id));
      await tx.delete(creditTransactions).where(eq(creditTransactions.userId, id));
      await tx.delete(qbcDeposits).where(eq(qbcDeposits.userId, id));
      await tx.delete(qbcWallets).where(eq(qbcWallets.userId, id));
      await tx.delete(oxapayTransactions).where(eq(oxapayTransactions.userId, id));
      await tx.delete(userSubscriptions).where(eq(userSubscriptions.userId, id));
      await tx.delete(businessAgentSubscriptions).where(eq(businessAgentSubscriptions.userId, id));

      // Remove any persisted sessions that still reference this user.
      await tx.delete(sessions).where(
        sql`
          coalesce(${sessions.sess}->'passport'->>'user', '') = ${id}
          or coalesce(${sessions.sess}->>'userId', '') = ${id}
          or ${sessions.sess}::text like ${`%${id}%`}
        `
      );

      await tx.delete(users).where(eq(users.id, id));
    });
  }

  async setUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash,
      expiresAt,
      usedAt: null,
    });
  }

  async consumePasswordResetToken(tokenHash: string): Promise<{ userId: string } | null> {
    const now = new Date();
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now)));
    if (!row) return null;
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
    return { userId: row.userId };
  }
}

export const authStorage = new AuthStorage();
