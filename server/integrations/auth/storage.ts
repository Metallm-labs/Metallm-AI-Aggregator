import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";
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
    await db.delete(users).where(eq(users.id, id));
  }
}

export const authStorage = new AuthStorage();

