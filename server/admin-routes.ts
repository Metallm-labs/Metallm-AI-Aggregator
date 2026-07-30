import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users, userSubscriptions, creditTransactions, businessAgentSubscriptions, conversations, messages, businessProfiles } from "@shared/schema";
import { eq, desc, like, or, count, sum, gte, and, inArray, sql } from "drizzle-orm";
import { sendEmail } from "./integrations/auth/email";
import crypto from "crypto";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function getAvailableSenderEmails() {
  const senders: { id: string; email: string; label: string }[] = [];
  if (process.env.ZOHO_USER) {
    senders.push({ id: "otp", email: process.env.ZOHO_USER, label: "OTP / Default" });
  }
  if (process.env.WELCOME_EMAIL) {
    senders.push({ id: "welcome", email: process.env.WELCOME_EMAIL, label: "Welcome" });
  }
  if (process.env.FEEDBACK_EMAIL) {
    senders.push({ id: "feedback", email: process.env.FEEDBACK_EMAIL, label: "Support / Feedback" });
  }
  if (process.env.PROMOTION_EMAIL || process.env["PROMOTION-EMAIL"]) {
    const email = process.env.PROMOTION_EMAIL || process.env["PROMOTION-EMAIL"]!;
    senders.push({ id: "promotion", email, label: "Promotion" });
  }
  return senders;
}

const adminTokens = new Set<string>();

function generateAdminToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function isAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-admin-token"] as string;
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export function registerAdminRoutes(app: Express) {
  // Admin login
  app.post("/api/admin/login", (req: Request, res: Response) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: "Invalid password" });
    }
    const token = generateAdminToken();
    adminTokens.add(token);
    res.json({ token });
  });

  // Available sender emails
  app.get("/api/admin/sender-emails", isAdmin, (_req: Request, res: Response) => {
    res.json(getAvailableSenderEmails());
  });

  // Admin logout
  app.post("/api/admin/logout", isAdmin, (req: Request, res: Response) => {
    const token = req.headers["x-admin-token"] as string;
    adminTokens.delete(token);
    res.json({ message: "Logged out" });
  });

  // Dashboard stats
  app.get("/api/admin/stats", isAdmin, async (_req: Request, res: Response) => {
    try {
      const [userCount] = await db.select({ count: count() }).from(users);
      const [subCount] = await db.select({ count: count() }).from(userSubscriptions);

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [newUsersToday] = await db
        .select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, twentyFourHoursAgo));

      const [newUsersWeek] = await db
        .select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, sevenDaysAgo));

      const [newUsersMonth] = await db
        .select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, thirtyDaysAgo));

      const [verifiedCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.isVerified, true));

      const [totalRevenue] = await db
        .select({ total: sum(creditTransactions.amount) })
        .from(creditTransactions)
        .where(eq(creditTransactions.type, "purchase"));

      const [conversationCount] = await db.select({ count: count() }).from(conversations);
      const [messageCount] = await db.select({ count: count() }).from(messages);

      const [activeSubCount] = await db
        .select({ count: count() })
        .from(userSubscriptions)
        .where(eq(userSubscriptions.status, "active"));

      const [businessSubCount] = await db
        .select({ count: count() })
        .from(businessAgentSubscriptions);

      res.json({
        totalUsers: userCount.count,
        totalSubscriptions: subCount.count,
        activeSubscriptions: activeSubCount.count,
        businessSubscriptions: businessSubCount.count,
        newUsersToday: newUsersToday.count,
        newUsersWeek: newUsersWeek.count,
        newUsersMonth: newUsersMonth.count,
        verifiedUsers: verifiedCount.count,
        totalRevenue: totalRevenue.total || "0",
        totalConversations: conversationCount.count,
        totalMessages: messageCount.count,
      });
    } catch (err) {
      console.error("Admin stats error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Chart data
  app.get("/api/admin/charts", isAdmin, async (_req: Request, res: Response) => {
    try {
      const now = new Date();

      // 1) Daily signups for last 30 days
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const dailySignups = await db
        .select({
          date: sql<string>`TO_CHAR(${users.createdAt}, 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(users)
        .where(gte(users.createdAt, thirtyDaysAgo))
        .groupBy(sql`TO_CHAR(${users.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${users.createdAt}, 'YYYY-MM-DD')`);

      // Fill in missing days with 0
      const signupMap = new Map(dailySignups.map((r) => [r.date, r.count]));
      const signupChart: { date: string; users: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        signupChart.push({ date: key, users: Number(signupMap.get(key) || 0) });
      }

      // 2) Auth provider breakdown
      const providerBreakdown = await db
        .select({
          provider: users.authProvider,
          count: count(),
        })
        .from(users)
        .groupBy(users.authProvider);

      // 3) Daily revenue for last 30 days
      const dailyRevenue = await db
        .select({
          date: sql<string>`TO_CHAR(${creditTransactions.createdAt}, 'YYYY-MM-DD')`,
          total: sum(creditTransactions.amount),
        })
        .from(creditTransactions)
        .where(and(
          eq(creditTransactions.type, "purchase"),
          gte(creditTransactions.createdAt, thirtyDaysAgo)
        ))
        .groupBy(sql`TO_CHAR(${creditTransactions.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${creditTransactions.createdAt}, 'YYYY-MM-DD')`);

      const revenueMap = new Map(dailyRevenue.map((r) => [r.date, r.total]));
      const revenueChart: { date: string; revenue: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        revenueChart.push({ date: key, revenue: Number(revenueMap.get(key) || 0) });
      }

      // 4) Verified vs unverified
      const [verifiedCount] = await db.select({ count: count() }).from(users).where(eq(users.isVerified, true));
      const [unverifiedCount] = await db.select({ count: count() }).from(users).where(eq(users.isVerified, false));

      // 5) Subscription status breakdown
      const subStatusBreakdown = await db
        .select({
          status: userSubscriptions.status,
          count: count(),
        })
        .from(userSubscriptions)
        .groupBy(userSubscriptions.status);

      // 6) Daily messages for last 30 days
      const dailyMessages = await db
        .select({
          date: sql<string>`TO_CHAR(${messages.createdAt}, 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(messages)
        .where(gte(messages.createdAt, thirtyDaysAgo))
        .groupBy(sql`TO_CHAR(${messages.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${messages.createdAt}, 'YYYY-MM-DD')`);

      const msgMap = new Map(dailyMessages.map((r) => [r.date, r.count]));
      const messagesChart: { date: string; messages: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        messagesChart.push({ date: key, messages: Number(msgMap.get(key) || 0) });
      }

      res.json({
        signupChart,
        revenueChart,
        messagesChart,
        providerBreakdown: providerBreakdown.map((r) => ({
          name: r.provider || "unknown",
          value: Number(r.count),
        })),
        verificationBreakdown: [
          { name: "Verified", value: Number(verifiedCount.count) },
          { name: "Unverified", value: Number(unverifiedCount.count) },
        ],
        subscriptionBreakdown: subStatusBreakdown.map((r) => ({
          name: r.status,
          value: Number(r.count),
        })),
      });
    } catch (err) {
      console.error("Admin charts error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // List users with pagination and search
  app.get("/api/admin/users", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      const search = (req.query.search as string) || "";
      const offset = (page - 1) * limit;

      const conditions = search
        ? or(
            like(users.email, `%${search}%`),
            like(users.firstName, `%${search}%`),
            like(users.lastName, `%${search}%`)
          )
        : undefined;

      const [totalResult] = await db
        .select({ count: count() })
        .from(users)
        .where(conditions);

      const userList = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          authProvider: users.authProvider,
          isVerified: users.isVerified,
          credits: users.credits,
          profileImageUrl: users.profileImageUrl,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(conditions)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        users: userList,
        total: totalResult.count,
        page,
        totalPages: Math.ceil(totalResult.count / limit),
      });
    } catch (err) {
      console.error("Admin users error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single user details
  app.get("/api/admin/users/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.id);
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          authProvider: users.authProvider,
          isVerified: users.isVerified,
          credits: users.credits,
          profileImageUrl: users.profileImageUrl,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user) return res.status(404).json({ message: "User not found" });

      const txns = await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId))
        .orderBy(desc(creditTransactions.createdAt))
        .limit(50);

      const sub = await db
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId));

      res.json({ user, transactions: txns, subscription: sub[0] || null });
    } catch (err) {
      console.error("Admin user detail error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // List subscriptions
  app.get("/api/admin/subscriptions", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      const offset = (page - 1) * limit;

      const [totalResult] = await db.select({ count: count() }).from(userSubscriptions);

      const subs = await db
        .select({
          userId: userSubscriptions.userId,
          provider: userSubscriptions.provider,
          subscriptionId: userSubscriptions.subscriptionId,
          planInterval: userSubscriptions.planInterval,
          status: userSubscriptions.status,
          cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
          renewsAt: userSubscriptions.renewsAt,
          endsAt: userSubscriptions.endsAt,
          createdAt: userSubscriptions.createdAt,
        })
        .from(userSubscriptions)
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(limit)
        .offset(offset);

      const userIds = subs.map((s) => s.userId);
      let userMap: Record<string, { email: string | null; firstName: string | null }> = {};
      if (userIds.length > 0) {
        const subUsers = await db
          .select({ id: users.id, email: users.email, firstName: users.firstName })
          .from(users)
          .where(inArray(users.id, userIds));
        for (const u of subUsers) {
          userMap[u.id] = { email: u.email, firstName: u.firstName };
        }
      }

      const subsWithUser = subs.map((s) => ({
        ...s,
        userEmail: userMap[s.userId]?.email || null,
        userName: userMap[s.userId]?.firstName || null,
      }));

      res.json({
        subscriptions: subsWithUser,
        total: totalResult.count,
        page,
        totalPages: Math.ceil(totalResult.count / limit),
      });
    } catch (err) {
      console.error("Admin subscriptions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Credit transactions / logs
  app.get("/api/admin/transactions", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const typeFilter = req.query.type as string;
      const offset = (page - 1) * limit;

      const conditions = typeFilter ? eq(creditTransactions.type, typeFilter) : undefined;

      const [totalResult] = await db
        .select({ count: count() })
        .from(creditTransactions)
        .where(conditions);

      const txns = await db
        .select()
        .from(creditTransactions)
        .where(conditions)
        .orderBy(desc(creditTransactions.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        transactions: txns,
        total: totalResult.count,
        page,
        totalPages: Math.ceil(totalResult.count / limit),
      });
    } catch (err) {
      console.error("Admin transactions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Send email to selected users
  app.post("/api/admin/send-email", isAdmin, async (req: Request, res: Response) => {
    try {
      const { userIds, subject, html, text, sendToAll, fromEmailId } = req.body;

      if (!subject || !html) {
        return res.status(400).json({ message: "Subject and HTML body are required" });
      }

      // Resolve the "from" address
      let fromAddress: string | undefined;
      if (fromEmailId) {
        const senders = getAvailableSenderEmails();
        const sender = senders.find((s) => s.id === fromEmailId);
        if (sender) {
          fromAddress = `"MetaLLM" <${sender.email}>`;
        }
      }

      let targetEmails: { email: string | null; firstName: string | null }[] = [];

      if (sendToAll) {
        targetEmails = await db
          .select({ email: users.email, firstName: users.firstName })
          .from(users)
          .where(eq(users.isVerified, true));
      } else if (userIds && userIds.length > 0) {
        targetEmails = await db
          .select({ email: users.email, firstName: users.firstName })
          .from(users)
          .where(inArray(users.id, userIds));
      } else {
        return res.status(400).json({ message: "No recipients selected" });
      }

      const validEmails = targetEmails.filter((u) => u.email);
      let sent = 0;
      let failed = 0;

      for (const user of validEmails) {
        const personalizedHtml = html.replace(/\{\{name\}\}/g, user.firstName || "there");
        const personalizedText = text
          ? text.replace(/\{\{name\}\}/g, user.firstName || "there")
          : undefined;

        const success = await sendEmail({
          to: user.email!,
          subject,
          html: personalizedHtml,
          text: personalizedText,
          from: fromAddress,
        });

        if (success) sent++;
        else failed++;
      }

      // Log the admin action
      console.log(`[ADMIN] Email campaign: sent=${sent}, failed=${failed}, subject="${subject}"`);

      res.json({ sent, failed, total: validEmails.length });
    } catch (err) {
      console.error("Admin send email error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update user credits
  app.post("/api/admin/users/:id/credits", isAdmin, async (req: Request, res: Response) => {
    try {
      const { amount, description } = req.body;
      const userId = String(req.params.id);

      if (!amount || isNaN(Number(amount))) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      const [user] = await db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, userId));

      if (!user) return res.status(404).json({ message: "User not found" });

      const newBalance = (Number(user.credits) + Number(amount)).toFixed(4);

      await db.update(users).set({ credits: newBalance }).where(eq(users.id, userId));

      await db.insert(creditTransactions).values({
        userId,
        type: Number(amount) > 0 ? "admin_credit" : "admin_debit",
        amount: String(amount),
        balanceAfter: newBalance,
        description: description || `Admin adjustment: ${amount}`,
      });

      console.log(`[ADMIN] Credit adjustment: userId=${userId}, amount=${amount}, newBalance=${newBalance}`);

      res.json({ newBalance });
    } catch (err) {
      console.error("Admin credit update error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all emails for export
  app.get("/api/admin/emails", isAdmin, async (_req: Request, res: Response) => {
    try {
      const allEmails = await db
        .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, isVerified: users.isVerified, createdAt: users.createdAt })
        .from(users)
        .orderBy(desc(users.createdAt));

      // Get conversation and message counts per user
      const msgCounts = await db.execute(sql`
        SELECT c.user_id,
               COUNT(DISTINCT c.id) AS conversation_count,
               COUNT(m.id) AS message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.user_id
      `);

      const msgCountMap = new Map(
        (msgCounts.rows as any[]).map((r) => [r.user_id, { conversations: Number(r.conversation_count), messages: Number(r.message_count) }])
      );

      // Get active paid subscribers
      const activeSubs = await db
        .select({ userId: userSubscriptions.userId, status: userSubscriptions.status })
        .from(userSubscriptions)
        .where(eq(userSubscriptions.status, "active"));
      const paidUserIds = new Set(activeSubs.map((s) => s.userId));

      // Get users with business profiles
      const bizProfiles = await db
        .select({ userId: businessProfiles.userId })
        .from(businessProfiles);
      const bizUserIds = new Set(bizProfiles.map((b) => b.userId));

      const enriched = allEmails.map((u) => ({
        ...u,
        totalMessages: msgCountMap.get(u.id)?.messages ?? 0,
        totalConversations: msgCountMap.get(u.id)?.conversations ?? 0,
        isPaidSubscriber: paidUserIds.has(u.id),
        hasBusinessProfile: bizUserIds.has(u.id),
      }));

      res.json(enriched);
    } catch (err) {
      console.error("Admin emails error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // List all conversations (paginated, searchable by user email)
  app.get("/api/admin/conversations", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      const search = (req.query.search as string) || "";
      const offset = (page - 1) * limit;

      if (search) {
        const matchingUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(or(
            like(users.email, `%${search}%`),
            like(users.firstName, `%${search}%`),
            like(users.lastName, `%${search}%`)
          ));
        const matchingUserIds = matchingUsers.map((u) => u.id);

        if (matchingUserIds.length === 0) {
          return res.json({ conversations: [], total: 0, page, totalPages: 0 });
        }

        const [totalResult] = await db
          .select({ count: count() })
          .from(conversations)
          .where(inArray(conversations.userId, matchingUserIds));

        const convos = await db
          .select({
            id: conversations.id,
            userId: conversations.userId,
            title: conversations.title,
            createdAt: conversations.createdAt,
            updatedAt: conversations.updatedAt,
          })
          .from(conversations)
          .where(inArray(conversations.userId, matchingUserIds))
          .orderBy(desc(conversations.updatedAt))
          .limit(limit)
          .offset(offset);

        const convoIds = convos.map((c) => c.id);
        let msgCounts: Record<number, number> = {};
        let lastModels: Record<number, string | null> = {};
        if (convoIds.length > 0) {
          const counts = await db
            .select({ conversationId: messages.conversationId, count: count() })
            .from(messages)
            .where(inArray(messages.conversationId, convoIds))
            .groupBy(messages.conversationId);
          for (const c of counts) msgCounts[c.conversationId] = Number(c.count);

          const lastMsgs = await db
            .select({
              conversationId: messages.conversationId,
              modelName: messages.modelName,
            })
            .from(messages)
            .where(and(
              inArray(messages.conversationId, convoIds),
              sql`${messages.role} = 'assistant'`
            ))
            .orderBy(desc(messages.createdAt))
            .limit(convoIds.length);
          for (const m of lastMsgs) {
            if (!lastModels[m.conversationId]) lastModels[m.conversationId] = m.modelName;
          }
        }

        const userIds = [...new Set(convos.map((c) => c.userId))];
        let userMap: Record<string, { email: string | null; firstName: string | null }> = {};
        if (userIds.length > 0) {
          const convoUsers = await db
            .select({ id: users.id, email: users.email, firstName: users.firstName })
            .from(users)
            .where(inArray(users.id, userIds));
          for (const u of convoUsers) userMap[u.id] = { email: u.email, firstName: u.firstName };
        }

        const result = convos.map((c) => ({
          ...c,
          userEmail: userMap[c.userId]?.email || null,
          userName: userMap[c.userId]?.firstName || null,
          messageCount: msgCounts[c.id] || 0,
          lastModel: lastModels[c.id] || null,
        }));

        return res.json({
          conversations: result,
          total: totalResult.count,
          page,
          totalPages: Math.ceil(totalResult.count / limit),
        });
      }

      const [totalResult] = await db.select({ count: count() }).from(conversations);

      const convos = await db
        .select({
          id: conversations.id,
          userId: conversations.userId,
          title: conversations.title,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset);

      const convoIds = convos.map((c) => c.id);
      let msgCounts: Record<number, number> = {};
      let lastModels: Record<number, string | null> = {};
      if (convoIds.length > 0) {
        const counts = await db
          .select({ conversationId: messages.conversationId, count: count() })
          .from(messages)
          .where(inArray(messages.conversationId, convoIds))
          .groupBy(messages.conversationId);
        for (const c of counts) msgCounts[c.conversationId] = Number(c.count);

        const lastMsgs = await db
          .select({
            conversationId: messages.conversationId,
            modelName: messages.modelName,
          })
          .from(messages)
          .where(and(
            inArray(messages.conversationId, convoIds),
            sql`${messages.role} = 'assistant'`
          ))
          .orderBy(desc(messages.createdAt))
          .limit(convoIds.length);
        for (const m of lastMsgs) {
          if (!lastModels[m.conversationId]) lastModels[m.conversationId] = m.modelName;
        }
      }

      const userIds = [...new Set(convos.map((c) => c.userId))];
      let userMap: Record<string, { email: string | null; firstName: string | null }> = {};
      if (userIds.length > 0) {
        const convoUsers = await db
          .select({ id: users.id, email: users.email, firstName: users.firstName })
          .from(users)
          .where(inArray(users.id, userIds));
        for (const u of convoUsers) userMap[u.id] = { email: u.email, firstName: u.firstName };
      }

      const result = convos.map((c) => ({
        ...c,
        userEmail: userMap[c.userId]?.email || null,
        userName: userMap[c.userId]?.firstName || null,
        messageCount: msgCounts[c.id] || 0,
        lastModel: lastModels[c.id] || null,
      }));

      res.json({
        conversations: result,
        total: totalResult.count,
        page,
        totalPages: Math.ceil(totalResult.count / limit),
      });
    } catch (err) {
      console.error("Admin conversations error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get messages for a conversation
  app.get("/api/admin/conversations/:id/messages", isAdmin, async (req: Request, res: Response) => {
    try {
      const conversationId = Number(req.params.id);

      const [convo] = await db
        .select({
          id: conversations.id,
          userId: conversations.userId,
          title: conversations.title,
          createdAt: conversations.createdAt,
        })
        .from(conversations)
        .where(eq(conversations.id, conversationId));

      if (!convo) return res.status(404).json({ message: "Conversation not found" });

      const [user] = await db
        .select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, convo.userId));

      const msgs = await db
        .select({
          id: messages.id,
          role: messages.role,
          content: messages.content,
          modelName: messages.modelName,
          metadata: messages.metadata,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);

      res.json({
        conversation: {
          ...convo,
          userEmail: user?.email || null,
          userName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
        },
        messages: msgs,
      });
    } catch (err) {
      console.error("Admin conversation messages error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get conversations for a specific user
  app.get("/api/admin/users/:id/conversations", isAdmin, async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.id);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const offset = (page - 1) * limit;

      const [totalResult] = await db
        .select({ count: count() })
        .from(conversations)
        .where(eq(conversations.userId, userId));

      const convos = await db
        .select({
          id: conversations.id,
          title: conversations.title,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset);

      const convoIds = convos.map((c) => c.id);
      let msgCounts: Record<number, number> = {};
      let lastModels: Record<number, string | null> = {};
      if (convoIds.length > 0) {
        const counts = await db
          .select({ conversationId: messages.conversationId, count: count() })
          .from(messages)
          .where(inArray(messages.conversationId, convoIds))
          .groupBy(messages.conversationId);
        for (const c of counts) msgCounts[c.conversationId] = Number(c.count);

        const lastMsgs = await db
          .select({
            conversationId: messages.conversationId,
            modelName: messages.modelName,
          })
          .from(messages)
          .where(and(
            inArray(messages.conversationId, convoIds),
            sql`${messages.role} = 'assistant'`
          ))
          .orderBy(desc(messages.createdAt))
          .limit(convoIds.length);
        for (const m of lastMsgs) {
          if (!lastModels[m.conversationId]) lastModels[m.conversationId] = m.modelName;
        }
      }

      res.json({
        conversations: convos.map((c) => ({
          ...c,
          messageCount: msgCounts[c.id] || 0,
          lastModel: lastModels[c.id] || null,
        })),
        total: totalResult.count,
        page,
        totalPages: Math.ceil(totalResult.count / limit),
      });
    } catch (err) {
      console.error("Admin user conversations error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Model analytics — usage breakdown, trends, per-model stats
  app.get("/api/admin/model-analytics", isAdmin, async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // 1) Total messages per model (all time, assistant messages only)
      const modelUsage = await db
        .select({
          modelName: messages.modelName,
          count: count(),
        })
        .from(messages)
        .where(sql`${messages.role} = 'assistant' AND ${messages.modelName} IS NOT NULL`)
        .groupBy(messages.modelName)
        .orderBy(desc(count()));

      // 2) Daily messages per model (last 30 days) — top 8 models
      const topModels = modelUsage.slice(0, 8).map((m) => m.modelName!);

      let modelTrends: { date: string; model: string; count: number }[] = [];
      if (topModels.length > 0) {
        const rawTrends = await db
          .select({
            date: sql<string>`TO_CHAR(${messages.createdAt}, 'YYYY-MM-DD')`,
            modelName: messages.modelName,
            count: count(),
          })
          .from(messages)
          .where(and(
            sql`${messages.role} = 'assistant' AND ${messages.modelName} IS NOT NULL`,
            gte(messages.createdAt, thirtyDaysAgo),
            inArray(messages.modelName, topModels)
          ))
          .groupBy(sql`TO_CHAR(${messages.createdAt}, 'YYYY-MM-DD')`, messages.modelName)
          .orderBy(sql`TO_CHAR(${messages.createdAt}, 'YYYY-MM-DD')`);

        modelTrends = rawTrends.map((r) => ({
          date: r.date,
          model: r.modelName || "unknown",
          count: Number(r.count),
        }));
      }

      // 3) Build a 30-day date-keyed structure for charts
      const trendsByDate: Record<string, Record<string, number>> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        trendsByDate[key] = {};
        for (const m of topModels) trendsByDate[key][m] = 0;
      }
      for (const t of modelTrends) {
        if (trendsByDate[t.date]) {
          trendsByDate[t.date][t.model] = t.count;
        }
      }

      const trendChart = Object.entries(trendsByDate).map(([date, models]) => ({
        date,
        ...models,
      }));

      // 4) Unique users per model (last 30 days)
      const modelUsers = await db
        .select({
          modelName: messages.modelName,
          users: sql<number>`COUNT(DISTINCT ${conversations.userId})`,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(
          sql`${messages.role} = 'assistant' AND ${messages.modelName} IS NOT NULL`,
          gte(messages.createdAt, thirtyDaysAgo)
        ))
        .groupBy(messages.modelName)
        .orderBy(desc(sql`COUNT(DISTINCT ${conversations.userId})`));

      res.json({
        modelUsage: modelUsage.map((m) => ({
          name: m.modelName || "unknown",
          messages: Number(m.count),
        })),
        trendChart,
        topModels,
        modelUsers: modelUsers.map((m) => ({
          name: m.modelName || "unknown",
          users: Number(m.users),
        })),
      });
    } catch (err) {
      console.error("Admin model analytics error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Business agent subscriptions
  app.get("/api/admin/business-subscriptions", isAdmin, async (req: Request, res: Response) => {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      const offset = (page - 1) * limit;

      const [totalResult] = await db.select({ count: count() }).from(businessAgentSubscriptions);

      const subs = await db
        .select()
        .from(businessAgentSubscriptions)
        .orderBy(desc(businessAgentSubscriptions.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        subscriptions: subs,
        total: totalResult.count,
        page,
        totalPages: Math.ceil(totalResult.count / limit),
      });
    } catch (err) {
      console.error("Admin business subscriptions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
