import { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { isValidIdempotencyKey } from "../game/economyMoney";
import { randomBytes } from "node:crypto";

/* ────────────────────────────────────────────────────────────────────────────
 * Alistamento E2E (T1.1 — port da entrega validada no preview)
 *
 * Fluxo canônico em 3 etapas com protocolo `KR-REG-*`:
 *   1) Dados do operador  → AWAITING_TERMS
 *   2) Aceite de termos   → AWAITING_FEE
 *   3) Taxa U$1 (= 100 KRC) → COMPLETED + bônus único de 500 KRC
 *
 * Propriedades validadas no preview e preservadas aqui:
 *   - Idempotência: `Idempotency-Key` na etapa de taxa; reenvio da mesma chave
 *     devolve a mesma resposta e credita o bônus exatamente uma vez.
 *   - Retomada de sessão: `GET /status` reconstrói o estado; `POST /start`
 *     com sessão existente devolve a mesma sessão (200) sem resetar etapas.
 * ──────────────────────────────────────────────────────────────────────────── */

export const ENROLLMENT_FEE_USD_CENTS = 100; // U$1,00
export const ENROLLMENT_FEE_KRC = 100; // taxa U$1 = 100 KRC
export const ENROLLMENT_BONUS_KRC = 500; // bônus de conclusão (uma única vez)
export const ENROLLMENT_TERMS_VERSION = "KR-TERMS-2026-11";

export type EnrollmentStep =
  | "AWAITING_DATA"
  | "AWAITING_TERMS"
  | "AWAITING_FEE"
  | "COMPLETED";

export interface EnrollmentData {
  displayName: string;
  birthDate: string; // ISO-8601 (data)
  country: string; // ISO-3166 alpha-2
}

export interface EnrollmentSession {
  protocol: string; // KR-REG-XXXXXXXX
  userId: string;
  step: EnrollmentStep;
  data: EnrollmentData | null;
  terms: { version: string; acceptedAt: string } | null;
  fee: {
    idempotencyKey: string;
    amountUsdCents: number;
    krcCredited: number;
    paidAt: string;
  } | null;
  bonusKrcCredited: number;
  createdAt: string;
  updatedAt: string;
}

/** Persistência plugável (default: memória do processo).
 *
 * Fase 47.1: `get`/`put` aceitam Promise — a store PostgreSQL
 * (server/game/enrollmentStore.postgres.ts, migration 0011) é assíncrona.
 * A store em memória do #252 continua válida sem alteração (valores
 * síncronos atravessam `await` normalmente).
 */
export interface EnrollmentStore {
  get(userId: string): EnrollmentSession | undefined | Promise<EnrollmentSession | undefined>;
  put(session: EnrollmentSession): void | Promise<void>;
}

export function createInMemoryEnrollmentStore(): EnrollmentStore {
  const sessions = new Map<string, EnrollmentSession>();
  return {
    get: (userId) => sessions.get(userId),
    put: (session) => {
      sessions.set(session.userId, session);
    },
  };
}

function generateProtocol(now: () => Date): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
  const bytes = randomBytes(8);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  void now;
  return `KR-REG-${out}`;
}

const dataInput = z.object({
  displayName: z.string().trim().min(3).max(40),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate deve ser AAAA-MM-DD")
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return false;
      const ageMs = Date.now() - date.getTime();
      const ageYears = ageMs / (365.25 * 24 * 3600 * 1000);
      return ageYears >= 13 && ageYears <= 120;
    }, "operador deve ter entre 13 e 120 anos"),
  country: z.string().trim().regex(/^[A-Z]{2}$/, "country deve ser ISO-3166 alpha-2"),
});

const termsInput = z.object({
  accepted: z.literal(true),
  version: z.string().trim().min(1).optional(),
});

const feeInput = z.object({
  confirm: z.literal(true),
});

export interface EnrollmentRouterOptions {
  /** Middleware de autenticação (produção: `isAuthenticated`). */
  authenticate: RequestHandler;
  store?: EnrollmentStore;
  now?: () => Date;
  /** Resolvedor do userId a partir da request autenticada. */
  getUserId?: (req: Request) => string;
  /**
   * Fase 47.1 — camada financeira REAL da taxa (opcional, DI): grava o
   * double-entry no `economy_ledger_entries` (taxa: `external.deposit` →
   * `system.item_sales`; bônus: `equity.opening_balance` → `wallet.bonus` +
   * bank_accounts) com idempotência dura do banco. Chamada ANTES de marcar a
   * sessão como paga: se falhar, a sessão fica em AWAITING_FEE e o cliente
   * reenvia a MESMA Idempotency-Key (replay não paga duas vezes).
   * Obrigatória em produção (wiring em server/routes.ts); testes herméticos
   * do #252 continuam sem ledger e intactos.
   */
  ledger?: {
    recordEnrollmentFeeLedger(input: {
      userId: string;
      protocol: string;
      idempotencyKey: string;
    }): Promise<{ feeRecorded: boolean; bonusRecorded: boolean }>;
  };
}

function defaultGetUserId(req: Request): string {
  const sub = (req.user as { claims?: { sub?: string } } | undefined)?.claims?.sub;
  if (!sub) throw new Error("Unauthorized");
  return sub;
}

export function createEnrollmentRouter(options: EnrollmentRouterOptions): Router {
  const router = Router();
  const store = options.store ?? createInMemoryEnrollmentStore();
  const now = options.now ?? (() => new Date());
  const getUserId = options.getUserId ?? defaultGetUserId;
  const authenticate = options.authenticate;
  const ledger = options.ledger;

  // Respostas idempotentes por chave de taxa (por usuário)
  const feeResponses = new Map<string, { status: number; body: unknown }>();

  const serialize = (session: EnrollmentSession) => ({
    protocol: session.protocol,
    step: session.step,
    data: session.data,
    terms: session.terms,
    fee: session.fee,
    bonusKrcCredited: session.bonusKrcCredited,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });

  router.use("/api/enrollment", authenticate);

  router.post("/api/enrollment/start", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const existing = await store.get(userId);
    if (existing) {
      // retomada de sessão: nunca reseta etapas concluídas
      return res.status(200).json({ resumed: true, ...serialize(existing) });
    }
    const timestamp = now().toISOString();
    const session: EnrollmentSession = {
      protocol: generateProtocol(now),
      userId,
      step: "AWAITING_DATA",
      data: null,
      terms: null,
      fee: null,
      bonusKrcCredited: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await store.put(session);
    return res.status(201).json({ resumed: false, ...serialize(session) });
  });

  router.post("/api/enrollment/steps/data", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const session = await store.get(userId);
    if (!session) return res.status(404).json({ message: "Alistamento não iniciado" });
    if (session.step !== "AWAITING_DATA") {
      return res.status(409).json({ message: `Etapa inválida para ${session.step}` });
    }
    const parsed = dataInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });
    }
    session.data = parsed.data;
    session.step = "AWAITING_TERMS";
    session.updatedAt = now().toISOString();
    await store.put(session);
    return res.status(200).json(serialize(session));
  });

  router.post("/api/enrollment/steps/terms", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const session = await store.get(userId);
    if (!session) return res.status(404).json({ message: "Alistamento não iniciado" });
    if (session.step !== "AWAITING_TERMS") {
      return res.status(409).json({ message: `Etapa inválida para ${session.step}` });
    }
    const parsed = termsInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Aceite de termos obrigatório" });
    }
    session.terms = {
      version: parsed.data.version ?? ENROLLMENT_TERMS_VERSION,
      acceptedAt: now().toISOString(),
    };
    session.step = "AWAITING_FEE";
    session.updatedAt = session.terms.acceptedAt;
    await store.put(session);
    return res.status(200).json(serialize(session));
  });

  router.post("/api/enrollment/fee", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const session = await store.get(userId);
    if (!session) return res.status(404).json({ message: "Alistamento não iniciado" });
    const parsed = feeInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Confirmação de taxa obrigatória" });
    }
    const headerKey = req.get("Idempotency-Key") ?? "";
    if (!isValidIdempotencyKey(headerKey)) {
      return res.status(400).json({ message: "Idempotency-Key inválida" });
    }

    // Idempotência: mesma chave → mesma resposta, crédito único.
    // Verificada ANTES do guard de etapa: reenvio (retry de rede) após
    // `COMPLETED` deve devolver a resposta original, nunca 409.
    const cacheKey = `${session.protocol}:${headerKey}`;
    const cached = feeResponses.get(cacheKey);
    if (cached) return res.status(cached.status).json(cached.body);

    if (session.step !== "AWAITING_FEE") {
      return res.status(409).json({ message: `Etapa inválida para ${session.step}` });
    }

    // Fase 47.1 — ledger REAL antes de marcar a sessão como paga (guard
    // financeiro: taxa falhou ⇒ nada é marcado; replay da mesma Idempotency-Key
    // é absorvido pelo unique (user_id, idempotency_key, line) do ledger).
    if (ledger) {
      try {
        await ledger.recordEnrollmentFeeLedger({
          userId,
          protocol: session.protocol,
          idempotencyKey: headerKey,
        });
      } catch (err) {
        console.error("[enrollment] ledger indisponível — taxa não marcada:", err);
        return res.status(503).json({ message: "Ledger indisponível — tente novamente com a mesma Idempotency-Key" });
      }
    }

    const paidAt = now().toISOString();
    session.fee = {
      idempotencyKey: headerKey,
      amountUsdCents: ENROLLMENT_FEE_USD_CENTS,
      krcCredited: ENROLLMENT_FEE_KRC,
      paidAt,
    };
    session.bonusKrcCredited = ENROLLMENT_BONUS_KRC; // bônus único
    session.step = "COMPLETED";
    session.updatedAt = paidAt;
    await store.put(session);

    const body = {
      ...serialize(session),
      walletDeltaKrc: ENROLLMENT_FEE_KRC + ENROLLMENT_BONUS_KRC,
    };
    feeResponses.set(cacheKey, { status: 200, body });
    return res.status(200).json(body);
  });

  router.get("/api/enrollment/status", async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const session = await store.get(userId);
    if (!session) return res.status(404).json({ message: "Alistamento não iniciado" });
    return res.status(200).json(serialize(session));
  });

  return router;
}
