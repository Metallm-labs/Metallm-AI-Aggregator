import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { isBot } from "./bot-prerender";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Serve static HTML files from client/public only to bots/crawlers for SEO.
  // Normal users get the SPA so client-side routing works correctly.
  const publicDir = path.resolve(import.meta.dirname, "..", "client", "public");
  app.use((req, res, next) => {
    const ua = req.headers["user-agent"] ?? "";
    if (!isBot(ua)) return next();

    let filePath = path.join(publicDir, req.path);
    if (req.path.endsWith("/")) {
      filePath = path.join(filePath, "index.html");
    } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (filePath.endsWith(".html") && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      if (filePath === path.join(publicDir, "index.html")) {
        return next();
      }
      return res.status(200).set({ "Content-Type": "text/html" }).sendFile(filePath);
    }
    next();
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;
    if (req.path.startsWith("/api/") || req.path === "/api") {
      return res.status(404).json({ message: "API route not found" });
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
