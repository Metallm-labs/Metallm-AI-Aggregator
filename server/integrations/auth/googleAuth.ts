import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from "./email";
import crypto from "crypto";
import { pool } from "../../db";
import bcrypt from "bcryptjs";

const MOBILE_AUTH_REDIRECT_COOKIE = "metallm_mobile_auth_redirect";
const MOBILE_AUTH_TICKET_TTL_MS = 5 * 60 * 1000;
const mobileAuthTickets = new Map<string, { userId: string; expiresAt: number }>();

function readCookieValue(cookieHeader: string | undefined, key: string): string {
  if (!cookieHeader) return "";

  for (const fragment of cookieHeader.split(";")) {
    const trimmed = fragment.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    const cookieKey = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex).trim() : trimmed;
    if (cookieKey !== key) continue;
    const cookieValue = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1).trim() : "";
    try {
      return decodeURIComponent(cookieValue);
    } catch {
      return cookieValue;
    }
  }

  return "";
}

function pruneExpiredMobileAuthTickets() {
  const now = Date.now();
  for (const [ticket, entry] of mobileAuthTickets.entries()) {
    if (entry.expiresAt <= now) {
      mobileAuthTickets.delete(ticket);
    }
  }
}

function createMobileAuthTicket(userId: string) {
  pruneExpiredMobileAuthTickets();
  const ticket = crypto.randomBytes(32).toString("base64url");
  mobileAuthTickets.set(ticket, {
    userId,
    expiresAt: Date.now() + MOBILE_AUTH_TICKET_TTL_MS,
  });
  return ticket;
}

function consumeMobileAuthTicket(ticket: string) {
  pruneExpiredMobileAuthTickets();
  const entry = mobileAuthTickets.get(ticket);
  if (!entry) return null;
  mobileAuthTickets.delete(ticket);
  if (entry.expiresAt <= Date.now()) return null;
  return entry.userId;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
    pool: pool as any,
    errorLog: (err: Error) => {
      // suppress noisy connection errors in console
      if (process.env.NODE_ENV !== "production") return;
      console.error("[session-store]", err.message);
    },
  });
  return session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupGoogleAuth(app: Express) {
  // Keep a sane default only when no global trust proxy setting exists.
  if (process.env.NODE_ENV === "production" && !app.get("trust proxy")) {
    app.set("trust proxy", 1);
  }
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Setup passport-local strategy for email/password auth
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await authStorage.getUserByEmail(email);
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }
          if (!user.password) {
            return done(null, false, { message: "Please sign in with Google" });
          }

          // Check verification status
          if (!user.isVerified) {
            return done(null, false, { message: "Email not verified. Please verify your email." });
          }

          const isValid = await authStorage.verifyPassword(password, user.password);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  // Check if Google OAuth is configured
  const googleConfigured = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;

  if (googleConfigured) {
    // Use a relative path so Passport derives the full callback URL from the
    // incoming request's host header.  This works both locally (localhost:3000)
    // and on any deployment (Koyeb, Heroku, etc.) without changing env vars.
    // The explicit GOOGLE_CALLBACK_URL override is still honoured when set.
    const callbackURL = process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback";

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: callbackURL,
          proxy: true, // trust X-Forwarded-Proto so https:// is used in production
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            // Extract user info from Google profile
            const email = profile.emails?.[0]?.value || "";
            const firstName = profile.name?.givenName || "";
            const lastName = profile.name?.familyName || "";
            const profileImageUrl = profile.photos?.[0]?.value || "";

            // Check if user exists by email first
            const existingUser = await authStorage.getUserByEmail(email);

            if (existingUser) {
              // If user exists but used email/password signup (and hasn't linked Google)
              // We'll return an error to guide them to use email login
              // Note: robust implementation would allow linking, but user requested error message
              if (existingUser.authProvider === "email") {
                return done(null, false, { message: "Account exists with email/password. Please log in with email." });
              }

              // If user exists (and presumably is Google auth or compatible), we update them
              // We must use the EXISTING ID, not the Google Profile ID, to avoid conflict
              await authStorage.upsertUser({
                ...existingUser, // Keep existing ID
                firstName,
                lastName,
                profileImageUrl,
                authProvider: "google",
                isVerified: true,
                updatedAt: new Date(),
              });

              return done(null, existingUser);
            }

            // Create new user if not exists
            const newUser = await authStorage.upsertUser({
              id: profile.id, // Use Google ID for new users
              email: email,
              firstName: firstName,
              lastName: lastName,
              profileImageUrl: profileImageUrl,
              authProvider: "google",
              isVerified: true,
            });

            // Send welcome email to new Google users (fire-and-forget)
            sendWelcomeEmail(email, firstName).catch((err) =>
              console.error("Failed to send welcome email:", err)
            );

            done(null, newUser);
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
    console.log("✅ Google OAuth configured successfully");
  } else {
    console.log("⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await authStorage.getUser(id);
      if (!user) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[auth] Stale session for missing user ${id}; clearing authenticated state.`);
        }
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Email/Password registration with OTP
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validation
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      // Check if user already exists
      const existingUser = await authStorage.getUserByEmail(email);
      if (existingUser) {
        if (!existingUser.isVerified && existingUser.authProvider === 'email') {
          // If exists but unverified, resend OTP
          const otp = crypto.randomInt(100000, 999999).toString();
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

          await authStorage.saveOtp(existingUser.id, otp, expiresAt);
          await sendVerificationEmail(email, otp);

          return res.json({
            message: "Account exists but unverified. New OTP sent.",
            status: "pending_verification",
            email: email
          });
        }
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      // Create user (unverified)
      const user = await authStorage.createUserWithPassword(
        email,
        password,
        firstName || "",
        lastName || ""
      );

      // Generate OTP
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      // Save OTP
      await authStorage.saveOtp(user.id, otp, expiresAt);

      // Send Email
      await sendVerificationEmail(email, otp);

      return res.json({
        message: "Registration successful. Please verify your email.",
        status: "pending_verification",
        email: user.email
      });

    } catch (error: any) {
      console.error("Registration error:", error);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  // Verify OTP
  app.post("/api/auth/verify", async (req, res) => {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
      }

      const user = await authStorage.getUserByEmail(email);
      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      if (user.isVerified) {
        return res.status(400).json({ message: "Email already verified" });
      }

      if (user.otpCode !== otp) {
        return res.status(400).json({ message: "Invalid OTP code" });
      }

      if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
        return res.status(400).json({ message: "OTP code expired" });
      }

      // Verify user
      await authStorage.verifyUser(user.id);

      // Send welcome email on first verification (fire-and-forget)
      sendWelcomeEmail(user.email!, user.firstName || "").catch((err) =>
        console.error("Failed to send welcome email:", err)
      );

      // Log user in
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Verification successful but login failed" });
        }
        return res.json({
          message: "Email verified successfully",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          }
        });
      });

    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Resend OTP
  app.post("/api/auth/resend-otp", async (req, res) => {
    try {
      const { email } = req.body;
      const user = await authStorage.getUserByEmail(email);

      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      if (user.isVerified) {
        return res.status(400).json({ message: "Email already verified" });
      }

      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await authStorage.saveOtp(user.id, otp, expiresAt);
      await sendVerificationEmail(email, otp);

      res.json({ message: "New verification code sent" });
    } catch (error) {
      console.error("Resend OTP error:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  // Email/Password login
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Login failed" });
      }
      if (!user) {
        // Check if unverified to prompt OTP screen
        if (info?.message === "Email not verified. Please verify your email.") {
          return res.status(403).json({ message: info.message, status: "unverified", email: req.body.email });
        }
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ message: "Login failed" });
        }
        return res.json({
          message: "Login successful",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          }
        });
      });
    })(req, res, next);
  });

  // Forgot password (email users)
  app.post("/api/auth/forgot-password", async (req, res) => {
    const debug: any = { stage: "start" };
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      debug.email = email;
      if (!email) {
        debug.stage = "no_email";
        return res.status(200).json(process.env.NODE_ENV !== "production" ? { ok: true, debug } : { ok: true });
      }

      // Always respond success to avoid account enumeration.
      const user = await authStorage.getUserByEmail(email);
      debug.userFound = !!user;
      debug.authProvider = user?.authProvider;
      debug.hasPassword = !!user?.password;
      if (!user || !user.password || user.authProvider !== "email") {
        debug.stage = "not_eligible";
        return res.status(200).json(process.env.NODE_ENV !== "production" ? { ok: true, debug } : { ok: true });
      }

      const rawToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      debug.stage = "saving_token";
      await authStorage.createPasswordResetToken(user.id, tokenHash, expiresAt);
      debug.stage = "token_saved";

      const publicBaseUrl =
        process.env.PUBLIC_BASE_URL ||
        process.env.APP_URL ||
        `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${publicBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
      debug.publicBaseUrl = publicBaseUrl;

      debug.stage = "sending_email";
      const sent = await sendPasswordResetEmail(email, resetUrl);
      debug.emailSent = sent;
      debug.stage = "done";
      if (process.env.NODE_ENV !== "production") {
        console.log("[forgot-password] debug:", debug);
      }
      return res.status(200).json(process.env.NODE_ENV !== "production" ? { ok: true, debug } : { ok: true });
    } catch (e) {
      console.error("Forgot password error:", e);
      debug.stage = "error";
      debug.errorMessage = (e as any)?.message ? String((e as any).message) : String(e);
      if (process.env.NODE_ENV !== "production") {
        console.log("[forgot-password] debug (error):", debug);
      }
      return res.status(200).json(process.env.NODE_ENV !== "production" ? { ok: true, debug } : { ok: true });
    }
  });

  // Reset password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || "");
      if (!token || password.length < 6) {
        return res.status(400).json({ message: "Invalid token or password too short" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const consumed = await authStorage.consumePasswordResetToken(tokenHash);
      if (!consumed) {
        return res.status(400).json({ message: "Reset link is invalid or expired" });
      }

      const user = await authStorage.getUser(consumed.userId);
      if (!user) return res.status(400).json({ message: "User not found" });
      if (user.authProvider !== "email") {
        return res.status(400).json({ message: "Please sign in with your provider" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await authStorage.setUserPassword(consumed.userId, hashedPassword);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Reset password error:", e);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Google OAuth routes (only if configured)
  if (googleConfigured) {
    app.get(
      "/api/auth/google",
      (req, res, next) => {
        const mobileRedirect = String(req.query.redirect_uri || "").trim();
        if (mobileRedirect.startsWith("metallm://") || mobileRedirect.startsWith("tech.metallm.app://")) {
          res.cookie(MOBILE_AUTH_REDIRECT_COOKIE, mobileRedirect, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 10 * 60 * 1000,
          });
        } else {
          res.clearCookie(MOBILE_AUTH_REDIRECT_COOKIE);
        }

        const webRedirect = String(req.query.web_redirect || "").trim();
        if (webRedirect) {
          res.cookie("web_auth_redirect", webRedirect, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 10 * 60 * 1000,
          });
        }

        passport.authenticate("google", {
          scope: ["profile", "email"],
        })(req, res, next);
      }
    );

    app.get(
      "/api/auth/google/callback",
      (req, res, next) => {
        const mobileRedirect = readCookieValue(req.headers.cookie, MOBILE_AUTH_REDIRECT_COOKIE).trim();

        const buildMobileRedirect = (status: "success" | "error", options?: { message?: string; ticket?: string }) => {
          if (!(mobileRedirect.startsWith("metallm://") || mobileRedirect.startsWith("tech.metallm.app://"))) {
            return null;
          }
          const separator = mobileRedirect.includes("?") ? "&" : "?";
          const params = new URLSearchParams({ status });
          if (options?.message) params.set("message", options.message);
          if (options?.ticket) params.set("ticket", options.ticket);
          return `${mobileRedirect}${separator}${params.toString()}`;
        };

        passport.authenticate("google", (err: any, user: any, info: any) => {
          if (err) {
            return next(err);
          }
          if (!user) {
            // Redirect to login with error message
            const message = info?.message || "Authentication failed";
            const mobileErrorRedirect = buildMobileRedirect("error", { message });
            res.clearCookie(MOBILE_AUTH_REDIRECT_COOKIE);
            if (mobileErrorRedirect) {
              return res.redirect(mobileErrorRedirect);
            }
            return res.redirect(`/login?error=${encodeURIComponent(message)}`);
          }
          req.logIn(user, (err) => {
            if (err) {
              return next(err);
            }
            const mobileSuccessRedirect = buildMobileRedirect("success", {
              ticket: createMobileAuthTicket(user.id),
            });
            res.clearCookie(MOBILE_AUTH_REDIRECT_COOKIE);
            if (mobileSuccessRedirect) {
              return res.redirect(mobileSuccessRedirect);
            }
            const webRedirect = readCookieValue(req.headers.cookie, "web_auth_redirect"); res.redirect(webRedirect || "/chat");
          });
        })(req, res, next);
      }
    );

    app.post("/api/auth/mobile/complete", async (req, res) => {
      try {
        const ticket = String(req.body?.ticket || "").trim();
        if (!ticket) {
          return res.status(400).json({ message: "Missing mobile auth ticket" });
        }

        const userId = consumeMobileAuthTicket(ticket);
        if (!userId) {
          return res.status(400).json({ message: "Mobile auth ticket expired or invalid" });
        }

        const user = await authStorage.getUser(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        req.login(user, (err) => {
          if (err) {
            return res.status(500).json({ message: "Failed to finalize mobile login" });
          }

          return res.json({
            ok: true,
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            },
          });
        });
      } catch (error) {
        console.error("Mobile auth completion error:", error);
        return res.status(500).json({ message: "Failed to finalize mobile login" });
      }
    });
  }

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      const webRedirect = readCookieValue(req.headers.cookie, "web_auth_redirect"); res.redirect(webRedirect || "/chat");
    });
  });

  console.log("✅ Email/Password authentication configured");
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && req.user) {
    return next();
  }

  const hasStalePassportSession = Boolean((req as any).session?.passport?.user);
  if (hasStalePassportSession) {
    req.logout?.(() => {});
    req.session?.destroy?.(() => {});
    res.clearCookie("connect.sid");
  }

  res.status(401).json({ message: "Unauthorized" });
};

export const isVerifiedUser: RequestHandler = async (req, res, next) => {
  try {
    if (!(req.isAuthenticated() && req.user)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const sessionUser = req.user as any;
    const userId = sessionUser?.id || sessionUser?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await authStorage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!user.isVerified && user.authProvider === "google") {
      await authStorage.verifyUser(userId);
      return next();
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Account verification required",
        status: "unverified",
      });
    }

    return next();
  } catch (error) {
    console.error("Verification guard error:", error);
    return res.status(500).json({ message: "Failed to verify account state" });
  }
};
