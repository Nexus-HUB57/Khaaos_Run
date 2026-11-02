// KHAAOS RUN — Enrollment Routes (Express)
// ==========================================
// Contrato canônico do alistamento (README "Console Web + Mundos canônicos,
// 2026-11-02" — portado do preview para o app canônico, Sprint 1.1/T1.1):
//
//   POST /api/enrollment          → alistamento idempotente (taxa U$1 = 100 KRC
//                                   server-authoritative + WELCOME_BONUS 500 KRC
//                                   após pagamento; 2ª chamada → alreadyPaid:true)
//   GET  /api/enrollment?username → retomada de sessão (não repete inscrição)
//   GET  /api/worlds              → mundos canônicos + dimensões do ring
//                                   (fonte única: shared/worlds.ts)
//
// Modo sandbox: a taxa é auto-liquidada (sem gateway real). Habilitação de
// valor real = trilha T1.2 (PIX/Cartão + webhook + reconciliação) sob
// compliance T5. Protocolo assinado (HMAC) = T1.4.

import type { Express } from "express";
import { z } from "zod";
import {
  CANONICAL_RING_SPEC,
  KHAAOS_WORLDS,
  WORLD_ORDER,
  validateWorldDimensions,
} from "@shared/worlds";
import {
  EnrollmentError,
  ENROLLMENT_FEE_KRC,
  ENROLLMENT_FEE_USD,
  ENROLLMENT_WELCOME_BONUS_KRC,
  enrollmentService,
} from "../game/enrollmentService";

export const enrollSchema = z.object({
  username: z.string().trim().min(3).max(24)
    .regex(/^[a-zA-Z0-9_-]+$/, "username: 3–24 caracteres (letras, números, hífen, underline)"),
});

export function registerEnrollmentRoutes(app: Express): void {
  // ── POST /api/enrollment ─────────────────────────────────────────────────
  app.post("/api/enrollment", async (req, res) => {
    try {
      const parsed = enrollSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: "invalid_username",
          message: parsed.error.issues[0]?.message ?? "username inválido",
        });
      }
      const result = await enrollmentService.enroll(parsed.data.username);
      return res.status(result.status).json(result.body);
    } catch (error) {
      if (error instanceof EnrollmentError) {
        return res.status(error.httpStatus).json({ error: error.code, message: error.message });
      }
      console.error("[enrollment] falha no alistamento:", error);
      return res.status(500).json({ error: "enrollment_failed", message: "alistamento indisponível" });
    }
  });

  // ── GET /api/enrollment?username=… ───────────────────────────────────────
  app.get("/api/enrollment", async (req, res) => {
    try {
      const parsed = z.string().trim().min(3).max(24).safeParse(req.query.username);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_username", message: "query param username é obrigatório (3–24 chars)" });
      }
      const status = await enrollmentService.getStatus(parsed.data);
      if (!status) {
        return res.status(404).json({ enlisted: false, enrollmentPaid: false, username: parsed.data });
      }
      return res.json(status);
    } catch (error) {
      if (error instanceof EnrollmentError) {
        return res.status(error.httpStatus).json({ error: error.code, message: error.message });
      }
      console.error("[enrollment] falha na retomada:", error);
      return res.status(500).json({ error: "enrollment_failed", message: "consulta indisponível" });
    }
  });

  // ── GET /api/worlds — mundos canônicos + dimensões (fonte única shared/worlds.ts) ──
  app.get("/api/worlds", (_req, res) => {
    const worlds = WORLD_ORDER.map((id) => {
      const world = KHAAOS_WORLDS[id];
      const dimensionErrors = validateWorldDimensions(world.dimensions);
      return {
        id: world.id,
        name: world.name,
        subtitle: world.subtitle,
        biome: world.biome,
        accentColor: world.accentColor,
        unlockRule: world.unlockRule,
        dimensions: world.dimensions,
        canonical: dimensionErrors.length === 0,
        dimensionErrors,
      };
    });
    res.json({
      canonicalRing: CANONICAL_RING_SPEC,
      enrollment: {
        feeUsd: ENROLLMENT_FEE_USD,
        feeKrc: ENROLLMENT_FEE_KRC,
        welcomeBonusKrc: ENROLLMENT_WELCOME_BONUS_KRC,
      },
      worlds,
    });
  });
}
