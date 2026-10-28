import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initializeGameServices, shutdownGameServices } from "./game/GameServices";
import { randomUUID } from "node:crypto";
import { metrics, normalizeRoute } from "./game/metrics";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
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
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
    // M3 — métricas RED de HTTP (cardinalidade baixa: rota normalizada).
    const route = normalizeRoute(path);
    metrics.counter("khaaos_http_requests_total", { method: req.method, route, status: String(res.statusCode) });
    metrics.observe("khaaos_http_request_duration_seconds", duration / 1000, { method: req.method, route });
  });

  next();
});

// M3 — conexões HTTP ativas por contagem incremental de sockets (a API
// getConnections() tem callback assíncrono e não serve a leitura síncrona
// do scrape).
let activeHttpConnections = 0;
httpServer.on("connection", (socket) => {
  activeHttpConnections += 1;
  socket.once("close", () => {
    activeHttpConnections = Math.max(0, activeHttpConnections - 1);
  });
});
metrics.gaugeSampler("khaaos_http_active_connections", {}, () => activeHttpConnections);

(async () => {
  await registerRoutes(httpServer, app);

  // ── Initialize Game Services (EconomyMatchBridge, Spectator, DiscordBot, MatchFlow) ──
  try {
    await initializeGameServices(httpServer, app);
    log("Game services initialized (EconomyMatch + Spectator + Discord + MatchFlow)");
  } catch (err) {
    console.error("[GameServices] Initialization failed (non-fatal):", err);
  }

  // ── Graceful shutdown ──
  process.on("SIGTERM", async () => {
    log("SIGTERM received, shutting down game services...");
    await shutdownGameServices();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    log("SIGINT received, shutting down game services...");
    await shutdownGameServices();
    process.exit(0);
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

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
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
