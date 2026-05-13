import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import { isBot, getPrerenderHTML } from "./bot-prerender";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hashed assets (/assets/*) — cache aggressively (hash changes on rebuild)
  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      maxAge: "30d",
      immutable: true,
    }),
  );

  // Other static files (favicon, icons, etc.) — short cache
  app.use(express.static(distPath, { maxAge: "1h" }));

  // Serve static HTML pages from public subdirectories (e.g. /agent/index.html)
  // Only serve to bots/crawlers for SEO; normal users get the SPA.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) return next();
    const ua = req.headers["user-agent"] ?? "";
    if (!isBot(ua)) return next();

    let filePath = path.join(distPath, req.path);
    if (req.path.endsWith("/")) {
      filePath = path.join(filePath, "index.html");
    } else if (!path.extname(req.path) && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (filePath.endsWith(".html") && filePath !== path.resolve(distPath, "index.html") && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.sendFile(filePath);
    }
    next();
  });

  // SPA catch-all — serve index.html with NO cache for navigation routes.
  // Skip asset requests so missing files get a proper 404 instead of text/html.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/") || req.path === "/api") {
      return res.status(404).json({ message: "API route not found" });
    }

    const ext = path.extname(req.path);
    if (ext && ext !== ".html") {
      return next();
    }

    // ── Bot / crawler detection: serve pre-rendered static HTML ─────────────
    const ua = req.headers["user-agent"] ?? "";
    if (isBot(ua)) {
      res.setHeader("Cache-Control", "public, max-age=3600"); // crawlers can cache 1h
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Robots-Tag", "index, follow");
      return res.send(getPrerenderHTML(req.path));
    }

    // Never cache index.html — it contains hashed asset references
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
