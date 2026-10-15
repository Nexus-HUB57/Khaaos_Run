import { createHash, randomUUID } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  runSpecialClassCouncil,
  type AgentId,
  type CouncilAgentAdapter,
  type CouncilRequest,
  type CouncilResult,
  type GovernanceFinding,
  type WorldId,
  SPECIAL_AGENTS,
} from "./orchestration";

const WORLD_CATALOG: Record<WorldId, { name: string; capacity: number }> = {
  CIGKV: { name: "Khaaos Ville", capacity: 50 },
  W1: { name: "Barburhen", capacity: 100 },
  W2: { name: "Priadus", capacity: 75 },
  W3: { name: "Ckesalth", capacity: 60 },
  W4: { name: "Arukheea", capacity: 80 },
};
const worlds = ["CIGKV", "W1", "W2", "W3", "W4"] as const;
const contextSchema = z.object({
  occupancyPct: z.number().min(0).max(100).optional(),
  queueP95Seconds: z.number().min(0).max(3600).optional(),
  activeIncidents: z.number().int().min(0).max(100).optional(),
  marketVolatilityPct: z.number().min(0).max(1000).optional(),
  marketDataStale: z.boolean().optional(),
  activeTreatyConflict: z.boolean().optional(),
  configRevision: z.string().trim().min(1).max(80).optional(),
}).strict();
const councilBodySchema = z.object({
  subject: z.string().trim().min(2).max(120),
  scope: z.object({
    worldId: z.enum(worlds),
    periodSeconds: z.number().int().min(60).max(2_592_000).optional(),
  }).strict(),
  context: contextSchema.optional().default({}),
}).strict();
type CouncilBody = z.infer<typeof councilBodySchema>;

const actorDomain: Record<AgentId, GovernanceFinding["domain"]> = {
  "marshal-henricks": "operations",
  "king-krapulla": "economy",
  "ambassador-uryan": "diplomacy",
};
function createDefaultAdapters(): Record<AgentId, CouncilAgentAdapter> {
  const makeFinding = (agentId: AgentId, request: CouncilRequest): GovernanceFinding => {
    const metrics = request.context;
    let position: GovernanceFinding["position"] = "support";
    let rationale = "Sinais recebidos dentro dos limites configurados; recomendação consultiva.";
    if (agentId === "marshal-henricks") {
      if (Number(metrics.activeIncidents ?? 0) > 0 || Number(metrics.occupancyPct ?? 0) >= 95 || Number(metrics.queueP95Seconds ?? 0) >= 240) {
        position = "hold";
        rationale = "Incidente ou saturação operacional observada; recomenda-se revisão antes de qualquer proposta.";
      }
    } else if (agentId === "king-krapulla") {
      if (metrics.marketDataStale === true || Number(metrics.marketVolatilityPct ?? 0) >= 30) {
        position = "hold";
        rationale = "Sinal de mercado desatualizado ou volátil; não recomendar ajuste sem revisão.";
      }
    } else if (metrics.activeTreatyConflict === true) {
      position = "hold";
      rationale = "Conflito diplomático informado; exigir revisão humana antes de preparar evento.";
    }
    return { agentId, domain: actorDomain[agentId], subject: request.subject, position, confidence: 0.65, rationale };
  };
  const makeAdapter = (agentId: AgentId): CouncilAgentAdapter => ({
    async analyze(request) { return makeFinding(agentId, request); },
    async review({ request, ownFinding, peerFindings }) {
      if (peerFindings.some((peer) => peer.domain === "safety" || peer.domain === "competitive-integrity") &&
          peerFindings.some((peer) => peer.position !== "support")) {
        return { ...ownFinding, position: "hold", confidence: Math.min(ownFinding.confidence, 0.5), rationale: "Revisão cruzada: recomendação suspensa diante de sinal de segurança/integridade." };
      }
      return makeFinding(agentId, request);
    },
  });
  return {
    "marshal-henricks": makeAdapter("marshal-henricks"),
    "king-krapulla": makeAdapter("king-krapulla"),
    "ambassador-uryan": makeAdapter("ambassador-uryan"),
  };
}

interface CouncilRecord {
  requestId: string;
  actorId: string;
  idempotencyKey: string;
  payloadHash: string;
  subject: string;
  worldId: WorldId;
  context: CouncilBody["context"];
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  expiresAt: number;
  result?: CouncilResult;
  errorCode?: string;
  proposalIds: string[];
}
interface ProposalRecord {
  proposalId: string;
  actorId: string;
  councilRequestId: string;
  subject: string;
  governance: CouncilResult["conflicts"][number];
  createdAt: string;
}
interface IdempotencyRecord { requestId: string; payloadHash: string; expiresAt: number }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Process-local TTL store: intentionally separate from PostgreSQL, user profiles and wallets. */
export class MarshalConsoleStore {
  private readonly councils = new Map<string, CouncilRecord>();
  private readonly proposals = new Map<string, ProposalRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly rateWindows = new Map<string, { startedAt: number; count: number }>();
  private readonly ttlMs = 24 * 60 * 60 * 1000;
  private readonly maxCouncils = 1_000;

  constructor(
    private readonly adapters: Readonly<Record<AgentId, CouncilAgentAdapter>> = createDefaultAdapters(),
    private readonly now: () => number = Date.now,
  ) {}

  submit(actorId: string, key: string, body: CouncilBody): { kind: "created" | "replay" | "conflict" | "rate-limited" | "full"; record?: CouncilRecord } {
    this.prune();
    const payloadHash = createHash("sha256").update(stableJson(body)).digest("hex");
    const idemKey = `${actorId}:${key}`;
    const previous = this.idempotency.get(idemKey);
    if (previous) {
      if (previous.payloadHash !== payloadHash) return { kind: "conflict" };
      const record = this.councils.get(previous.requestId);
      return record ? { kind: "replay", record } : { kind: "conflict" };
    }
    const window = this.rateWindows.get(actorId);
    if (window && this.now() - window.startedAt < 60_000 && window.count >= 10) return { kind: "rate-limited" };
    if (this.councils.size >= this.maxCouncils) return { kind: "full" };
    if (!window || this.now() - window.startedAt >= 60_000) this.rateWindows.set(actorId, { startedAt: this.now(), count: 1 });
    else window.count += 1;

    const requestId = randomUUID();
    const record: CouncilRecord = {
      requestId, actorId, idempotencyKey: key, payloadHash,
      subject: body.subject, worldId: body.scope.worldId, context: body.context,
      status: "queued", createdAt: new Date(this.now()).toISOString(),
      expiresAt: this.now() + this.ttlMs, proposalIds: [],
    };
    this.councils.set(requestId, record);
    this.idempotency.set(idemKey, { requestId, payloadHash, expiresAt: record.expiresAt });
    this.start(record, body.scope.periodSeconds);
    return { kind: "created", record };
  }

  getCouncil(actorId: string, requestId: string): CouncilRecord | undefined {
    this.prune();
    const record = this.councils.get(requestId);
    return record?.actorId === actorId ? record : undefined;
  }

  getProposal(actorId: string, proposalId: string): ProposalRecord | undefined {
    this.prune();
    const proposal = this.proposals.get(proposalId);
    return proposal?.actorId === actorId ? proposal : undefined;
  }

  private start(record: CouncilRecord, periodSeconds?: number): void {
    record.status = "running";
    const request: CouncilRequest = {
      requestId: record.requestId,
      actorId: record.actorId,
      subject: record.subject,
      context: { ...record.context, worldId: record.worldId, periodSeconds, source: "operator-submitted-aggregate" },
    };
    void runSpecialClassCouncil(request, this.adapters).then((result) => {
      record.result = result;
      record.status = result.status === "rejected" ? "failed" : "completed";
      if (result.status === "rejected") record.errorCode = result.reasonCodes[0] ?? "COUNCIL_REJECTED";
      if (result.status === "complete") {
        for (const governance of result.conflicts.filter((entry) => entry.status === "preferred-proposal")) {
          const proposalId = `prop_${randomUUID()}`;
          this.proposals.set(proposalId, {
            proposalId, actorId: record.actorId, councilRequestId: record.requestId,
            subject: record.subject, governance, createdAt: new Date(this.now()).toISOString(),
          });
          record.proposalIds.push(proposalId);
        }
      }
    }).catch(() => {
      record.status = "failed";
      record.errorCode = "COUNCIL_UNAVAILABLE";
    });
  }

  private prune(): void {
    const now = this.now();
    for (const [id, record] of this.councils) {
      if (record.expiresAt <= now) {
        this.councils.delete(id);
        for (const proposalId of record.proposalIds) this.proposals.delete(proposalId);
      }
    }
    for (const [key, record] of this.idempotency) if (record.expiresAt <= now) this.idempotency.delete(key);
    for (const [key, value] of this.rateWindows) if (now - value.startedAt >= 60_000) this.rateWindows.delete(key);
  }
}

export function createMarshalConsoleGuard(configuredIds = process.env.MARSHAL_CONSOLE_OPERATOR_IDS ?? ""): RequestHandler {
  const allowed = new Set(configuredIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean));
  return (req, res, next) => {
    const actorId = (req as any).user?.claims?.sub;
    if (typeof actorId !== "string" || !allowed.has(actorId)) {
      return res.status(403).json({ error: { code: "INSUFFICIENT_SCOPE", message: "Acesso ao console do Marechal não autorizado.", details: [] }, correlationId: correlationId(req) });
    }
    next();
  };
}

function error(res: Response, status: number, code: string, message: string, correlationId: string) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error: { code, message, details: [] }, correlationId });
}
function correlationId(req: Request): string {
  const provided = req.get("x-correlation-id");
  return provided && /^[A-Za-z0-9_-]{8,80}$/.test(provided) ? provided : randomUUID();
}
function sameOriginPost(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin || req.get("sec-fetch-site") === "cross-site") return false;
  try {
    return new URL(origin).origin === `${req.protocol}://${req.get("host")}`;
  } catch { return false; }
}
function councilDto(record: CouncilRecord, correlation: string) {
  if (!record.result) return {
    requestId: record.requestId, status: record.status, createdAt: record.createdAt,
    correlationId: correlation, links: { self: `/api/console/v1/marshal/councils/${record.requestId}` },
  };
  if (record.status === "failed") return {
    requestId: record.requestId, status: "failed", createdAt: record.createdAt,
    reasonCodes: [record.errorCode ?? "COUNCIL_UNAVAILABLE"], correlationId: correlation,
  };
  return {
    requestId: record.requestId, status: record.result.status === "complete" ? "complete" : record.result.status,
    createdAt: record.createdAt, roundsCompleted: record.result.roundsCompleted,
    scope: { worldId: record.worldId },
    agents: record.result.findings.map((finding) => ({
      ...finding,
      name: SPECIAL_AGENTS.find((agent) => agent.id === finding.agentId)?.name ?? finding.agentId,
    })),
    governance: record.result.conflicts,
    failedAgents: record.result.failedAgents, reasonCodes: record.result.reasonCodes,
    proposalIds: record.proposalIds,
    correlationId: correlation,
    dataRevision: record.context.configRevision ?? null,
  };
}

export interface MarshalConsoleRouteOptions {
  operatorIds?: string;
  store?: MarshalConsoleStore;
}

export function registerMarshalConsoleRoutes(app: Express, options: MarshalConsoleRouteOptions = {}): void {
  const store = options.store ?? new MarshalConsoleStore();
  const noStore: RequestHandler = (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); };
  const protect = [noStore, isAuthenticated, createMarshalConsoleGuard(options.operatorIds)];
  const prefix = "/api/console/v1/marshal";

  app.get(`${prefix}/overview`, ...protect, (req, res) => {
    const correlation = correlationId(req);
    const worldId = z.enum(worlds).safeParse(req.query.worldId);
    if (!worldId.success) return error(res, 400, "INVALID_REQUEST", "worldId inválido ou ausente.", correlation);
    const world = WORLD_CATALOG[worldId.data];
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      worldId: worldId.data, name: world.name, operationalState: "unknown",
      occupancy: { current: null, capacity: world.capacity, percent: null },
      queueP95Seconds: null, activeIncidents: null,
      configRevision: "world-catalog-v1", observedAt: new Date().toISOString(), stale: true,
    });
  });

  app.post(`${prefix}/councils`, ...protect, (req, res) => {
    const correlation = correlationId(req);
    res.setHeader("Cache-Control", "no-store");
    if (!sameOriginPost(req)) return error(res, 403, "CSRF_ORIGIN_REJECTED", "A origem da solicitação não corresponde ao painel.", correlation);
    if (Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > 16 * 1024)
      return error(res, 413, "PAYLOAD_TOO_LARGE", "Corpo acima do limite de 16 KiB.", correlation);
    const parsed = councilBodySchema.safeParse(req.body);
    if (!parsed.success) return error(res, 400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Entrada inválida.", correlation);
    const key = req.get("idempotency-key");
    if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
      return error(res, 400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key UUID obrigatório.", correlation);
    const actorId = (req as any).user.claims.sub as string;
    const submission = store.submit(actorId, key, parsed.data);
    if (submission.kind === "conflict") return error(res, 409, "IDEMPOTENCY_KEY_REUSED", "A chave já foi usada com conteúdo diferente ou expirou.", correlation);
    if (submission.kind === "rate-limited") return error(res, 429, "RATE_LIMITED", "Limite de 10 conselhos por minuto atingido.", correlation);
    if (submission.kind === "full") return error(res, 503, "COUNCIL_UNAVAILABLE", "Capacidade temporária do console esgotada.", correlation);
    const record = submission.record!;
    res.setHeader("Location", `${prefix}/councils/${record.requestId}`);
    res.setHeader("Retry-After", "1");
    return res.status(submission.kind === "replay" && record.status === "completed" ? 200 : 202)
      .json(councilDto(record, correlation));
  });

  app.get(`${prefix}/councils/:requestId`, ...protect, (req, res) => {
    const correlation = correlationId(req);
    const actorId = (req as any).user.claims.sub as string;
    const id = req.params.requestId;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return error(res, 404, "RESOURCE_NOT_FOUND", "Conselho não encontrado.", correlation);
    const record = store.getCouncil(actorId, id);
    if (!record) return error(res, 404, "RESOURCE_NOT_FOUND", "Conselho não encontrado.", correlation);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", record.status === "completed" || record.status === "failed" ? "0" : "1");
    return res.status(record.status === "queued" || record.status === "running" ? 202 : 200).json(councilDto(record, correlation));
  });

  app.get(`${prefix}/proposals/:proposalId`, ...protect, (req, res) => {
    const correlation = correlationId(req);
    const actorId = (req as any).user.claims.sub as string;
    const proposalId = req.params.proposalId;
    if (typeof proposalId !== "string" || !/^prop_[0-9a-f-]{36}$/i.test(proposalId)) return error(res, 404, "RESOURCE_NOT_FOUND", "Proposta não encontrada.", correlation);
    const proposal = store.getProposal(actorId, proposalId);
    if (!proposal) return error(res, 404, "RESOURCE_NOT_FOUND", "Proposta não encontrada.", correlation);
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      proposalId: proposal.proposalId, councilRequestId: proposal.councilRequestId,
      subject: proposal.subject, governance: proposal.governance,
      createdAt: proposal.createdAt, executable: false, correlationId: correlation,
    });
  });
}
