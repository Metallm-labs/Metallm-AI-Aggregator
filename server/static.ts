import express, { type Express } from "express";
import fs from "fs";
import path from "path";

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

  // SPA catch-all — serve index.html with NO cache for navigation routes.
  // Skip asset requests so missing files get a proper 404 instead of text/html.
  app.use((req, res, next) => {
    const ext = path.extname(req.path);
    if (ext && ext !== ".html") {
      return next();
    }
    // Never cache index.html — it contains hashed asset references
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
