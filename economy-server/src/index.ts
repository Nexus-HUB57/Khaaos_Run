// ==============================================================================
// KHAAOS RUN - Economy 2PC Server
// Express server com rotas 2PC e Prometheus metrics
// ==============================================================================

import express from "express";
import { twoPcRouter } from "./routes/2pc.js";
import { getMetrics, getContentType } from "./metrics/index.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

// Logging middleware
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// 2PC endpoints (chamados pelo KhaaosEconomyBridge2PC no UE5)
app.use("/api/economy/2pc", twoPcRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "khaaos-economy-2pc", version: "1.0.0" });
});

// ─── Prometheus Metrics Endpoint ──────────────────────────────────────────────

app.get("/metrics", async (_req, res) => {
  try {
    res.set("Content-Type", getContentType());
    res.end(await getMetrics());
  } catch (error) {
    res.status(500).end(error instanceof Error ? error.message : "Metrics collection failed");
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Khaaos Economy 2PC] Server rodando na porta ${PORT}`);
  console.log(`[Khaaos Economy 2PC] Endpoints:`);
  console.log(`  POST /api/economy/2pc/prepare  — Lock KRC (prepare phase)`);
  console.log(`  POST /api/economy/2pc/commit   — Finalizar débito (commit phase)`);
  console.log(`  POST /api/economy/2pc/abort    — Release lock + refund (abort phase)`);
  console.log(`  GET  /api/economy/2pc/status/:id — Status da transação`);
  console.log(`  GET  /metrics                  — Prometheus metrics`);
  console.log(`  GET  /health                   — Health check`);
});

export { app };
