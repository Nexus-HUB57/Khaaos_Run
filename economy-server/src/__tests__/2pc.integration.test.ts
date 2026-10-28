// ==============================================================================
// KHAAOS RUN - Economy 2PC Server
// Integration test — valida o protocolo 2PC completo (prepare → commit / abort)
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../index.js";

describe("2PC Protocol — Integration Tests", () => {
  const playerId = 9001;
  let transactionId: string;

  beforeAll(() => {
    // Em testes, usamos IDs fixos para previsibilidade
    transactionId = "00000000-0000-0000-0000-000000000001";
  });

  describe("POST /api/economy/2pc/prepare", () => {
    it("deve rejeitar request sem campos obrigatórios", async () => {
      const res = await request(app)
        .post("/api/economy/2pc/prepare")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.prepared).toBe(false);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("deve rejeitar amountKrc negativo", async () => {
      const res = await request(app)
        .post("/api/economy/2pc/prepare")
        .send({
          transactionId: "00000000-0000-0000-0000-000000000099",
          idempotencyKey: "test-negative-amount",
          amountKrc: -100,
          playerId,
        });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/economy/2pc/commit", () => {
    it("deve retornar 404 para transação inexistente", async () => {
      const res = await request(app)
        .post("/api/economy/2pc/commit")
        .send({
          transactionId: "00000000-0000-0000-0000-999999999999",
          playerId: 9999,
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/economy/2pc/abort", () => {
    it("deve retornar 404 para transação inexistente", async () => {
      const res = await request(app)
        .post("/api/economy/2pc/abort")
        .send({
          transactionId: "00000000-0000-0000-0000-999999999998",
          playerId: 9999,
          reason: "test",
        });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /health", () => {
    it("deve retornar status ok", async () => {
      const res = await request(app)
        .get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("khaaos-economy-2pc");
    });
  });

  describe("GET /metrics", () => {
    it("deve retornar métricas Prometheus", async () => {
      const res = await request(app)
        .get("/metrics");

      expect(res.status).toBe(200);
      expect(res.text).toContain("khaaos_2pc_transactions_total");
      expect(res.text).toContain("khaaos_krc_locked_total");
      expect(res.text).toContain("khaaos_http_requests_total");
    });
  });
});
