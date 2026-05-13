import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import type { IncomingMessage } from "http";
import * as logger from "./logger";
import { authStorage, getSession } from "./integrations/auth";
import { setupWebSocketServer } from "./ws";

// Install global console patch so all server files get colorized output
logger.installGlobalLogger();

const app = express();
const httpServer = createServer(app);

// Ensure rate limiters and session middleware see the real client IP behind proxies.
if (process.env.NODE_ENV === "production") {
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (typeof trustProxyEnv === "string") {
    const parsed = Number(trustProxyEnv);
    app.set("trust proxy", Number.isNaN(parsed) ? trustProxyEnv : parsed);
  } else {
    app.set("trust proxy", 1);
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const isDev = process.env.NODE_ENV !== "production";
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "16mb";

if (!isDev) {
  app.use((req, res, next) => {
    const forwardedProto = req.header("x-forwarded-proto");
    if (forwardedProto && forwardedProto.toLowerCase() !== "https") {
      const host = req.header("host");
      if (host) {
        return res.redirect(301, `https://${host}${req.originalUrl}`);
      }
    }
    return next();
  });
}

// Security headers — CSP is environment-aware:
//   dev:  permits ws: (Vite HMR + local WS), Google Fonts, and data: URIs
//   prod: locks down to wss: only, still allows Google Fonts CDN
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      // Vite injects inline onload/onerror event attrs in dev — must allow
      scriptSrcAttr: isDev ? ["'unsafe-inline'"] : ["'none'"],
      // Allow Google Fonts stylesheet
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      // Explicit styleSrcElem stops the "style-src used as fallback" warning
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      // Allow Google Fonts woff/woff2 files
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      // ws: for dev (Vite HMR + local WS), wss: for prod
      connectSrc: isDev
        ? ["'self'", "https:", "wss:", "ws:"]
        : ["'self'", "https:", "wss:"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}));

// CORS - only allow requests from our domain
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? ["https://metallm.tech", "https://www.metallm.tech"]
    : true,
  credentials: true,
}));

// Rate limiting for sensitive auth endpoints only.
const authWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000); // 15 minutes
const authMessage = { message: "Too many requests, please try again later." };

function authKey(req: Request): string {
  // Use socket remote address rather than req.ip so express-rate-limit's IPv6
  // validation does not flag a custom keyGenerator.
  const rawIp = req.socket.remoteAddress || "unknown";
  const ip = ipKeyGenerator(rawIp);
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  // Use IP + email when available so users behind shared NAT IPs don't block each other.
  return email ? `${ip}:${email}` : ip;
}

const loginLimiter = rateLimit({
  windowMs: authWindowMs,
  max: Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX || process.env.AUTH_RATE_LIMIT_MAX || 180),
  keyGenerator: authKey,
  message: authMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: authWindowMs,
  max: Number(process.env.AUTH_REGISTER_RATE_LIMIT_MAX || process.env.AUTH_RATE_LIMIT_MAX || 120),
  keyGenerator: authKey,
  message: authMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyLimiter = rateLimit({
  windowMs: authWindowMs,
  max: Number(process.env.AUTH_VERIFY_RATE_LIMIT_MAX || process.env.AUTH_RATE_LIMIT_MAX || 240),
  keyGenerator: authKey,
  message: authMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

const resendOtpLimiter = rateLimit({
  windowMs: authWindowMs,
  max: Number(process.env.AUTH_RESEND_OTP_RATE_LIMIT_MAX || process.env.AUTH_RATE_LIMIT_MAX || 120),
  keyGenerator: authKey,
  message: authMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: authWindowMs,
  max: Number(process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX || process.env.AUTH_RATE_LIMIT_MAX || 120),
  keyGenerator: authKey,
  message: authMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: authWindowMs,
  max: Number(process.env.AUTH_RESET_PASSWORD_RATE_LIMIT_MAX || process.env.AUTH_RATE_LIMIT_MAX || 120),
  keyGenerator: authKey,
  message: authMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for general API (lenient)
const apiLimiter = rateLimit({
  windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 1 * 60 * 1000), // 1 minute
  max: Number(process.env.API_RATE_LIMIT_MAX || 1200),
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  // Auth endpoints have their own dedicated limiter to avoid double-throttling.
  skip: (req) => req.originalUrl.startsWith("/api/auth"),
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/verify", verifyLimiter);
app.use("/api/auth/resend-otp", resendOtpLimiter);
app.use("/api/auth/forgot-password", forgotPasswordLimiter);
app.use("/api/auth/reset-password", resetPasswordLimiter);
app.use("/api", apiLimiter);

app.use(
  express.json({
    limit: JSON_BODY_LIMIT,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: JSON_BODY_LIMIT }));

export function log(message: string, source = "express") {
  logger.info(source, message);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Sanitize sensitive data from logs
      let logBody = capturedJsonResponse;
      if (logBody && path.includes("/auth/user")) {
        const { password, otpCode, otpExpiresAt, ...safe } = logBody as any;
        logBody = safe;
      }
      logger.httpLog(req.method, path, res.statusCode, duration, logBody);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // ── WebSocket server for real-time balance/token push ──────────────────
  // We recreate the session middleware instance here so WS upgrade requests
  // go through the exact same session/cookie parsing as Express requests.
  const sessionMiddleware = getSession();
  const getSessionUser = (req: IncomingMessage): Promise<string | null> =>
    new Promise((resolve) => {
      // Cast to any to satisfy the middleware signature — we only need the
      // session populated, not the full Express Request/Response shape.
      sessionMiddleware(req as any, {} as any, async () => {
        const session = (req as any).session;
        const userId: string | undefined =
          session?.passport?.user ||
          session?.userId ||
          undefined;
        if (!userId) {
          resolve(null);
          return;
        }

        try {
          const user = await authStorage.getUser(userId);
          if (!user) {
            session?.destroy?.(() => {});
            resolve(null);
            return;
          }
          resolve(userId);
        } catch (error) {
          logger.error("ws", `User lookup failed during session validation: ${(error as Error).message}`);
          resolve(null);
        }
      });
    });
  setupWebSocketServer(httpServer, getSessionUser);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error("server", `Unhandled error [${status}]: ${message}`);
    if (err.stack) console.error(err.stack);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
