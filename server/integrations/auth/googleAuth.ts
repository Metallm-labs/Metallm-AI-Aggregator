import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { sendVerificationEmail } from "./email";
import crypto from "crypto";
import { pool } from "../../db";

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
  app.set("trust proxy", 1);
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
            });

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

  // Google OAuth routes (only if configured)
  if (googleConfigured) {
    app.get(
      "/api/auth/google",
      passport.authenticate("google", {
        scope: ["profile", "email"],
      })
    );

    app.get(
      "/api/auth/google/callback",
      (req, res, next) => {
        passport.authenticate("google", (err: any, user: any, info: any) => {
          if (err) {
            return next(err);
          }
          if (!user) {
            // Redirect to login with error message
            const message = info?.message || "Authentication failed";
            return res.redirect(`/login?error=${encodeURIComponent(message)}`);
          }
          req.logIn(user, (err) => {
            if (err) {
              return next(err);
            }
            res.redirect("/dashboard");
          });
        })(req, res, next);
      }
    );
  }

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });

  console.log("✅ Email/Password authentication configured");
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

