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

  app.use(express.static(distPath, { maxAge: "1d" }));

  // Only serve index.html for SPA navigation — NOT for asset requests.
  // If a .js/.css/.png etc. file wasn't found by express.static above, return
  // 404 so the browser sees a clear error instead of a text/html MIME mismatch.
  app.use((req, res, next) => {
    const ext = path.extname(req.path);
    if (ext && ext !== ".html") {
      // Static asset that wasn't found — let Express return 404 naturally
      return next();
    }
    // SPA route — serve index.html
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
