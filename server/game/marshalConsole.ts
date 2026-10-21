import { createHash, randomUUID } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { roomManager } from "./RoomManager";
import { PostgresMarshalConsoleRepository, type MarshalConsoleRepository, type NewPersistedCouncil, type NewPersistedProposal, type PersistedCouncil, type PersistedProposal } from "./marshalConsoleRepository";
import { runSpecialClassCouncil, type AgentId, type CouncilAgentAdapter, type CouncilRequest, type CouncilResult, type GovernanceFinding, type WorldId, SPECIAL_AGENTS } from "./orchestration";
import { WORLD_CATALOG, WORLD_IDS, type WorldTelemetrySnapshot } from "./worldTelemetry";

const worldIdSchema = z.enum(WORLD_IDS as [WorldId, ...WorldId[]]);
const councilBodySchema = z.object({
  subject: z.string().trim().min(2).max(120),
  scope: z.object({
    worldId: worldIdSchema,
    periodSeconds: z.number().int().min(60).max(2_592_000).optional(),
  }).strict(),
}).strict();
type CouncilBody = z.infer<typeof councilBodySchema>;

const agentDomain: Record<AgentId, GovernanceFinding["domain"]> = {
  "marshal-henricks": "operations",
  "king-krapulla": "economy",
  "ambassador-uryan": "diplomacy",
};
function createDefaultAdapters(): Record<AgentId, CouncilAgentAdapter> {
  const makeFinding = (agentId: AgentId, request: CouncilRequest): GovernanceFinding => {
    const telemetry = request.context;
    let position: GovernanceFinding["position"] = "support";
    let rationale = "Telemetria do runtime dentro dos limites observados; recomendação consultiva.";
    if (agentId === "marshal-henricks") {
      const incidents = typeof telemetry.activeIncidents === "number" ? telemetry.activeIncidents : null;
      if ((incidents !== null && incidents > 0) || Number(telemetry.occupancyPct ?? 0) >= 95 || Number(telemetry.queueP95Seconds ?? 0) >= 240) {
        position = "hold";
        rationale = "Sinal operacional real de saturação/incidente; bloquear recomendação automática e encaminhar para revisão.";
      }
    } else if (agentId === "king-krapulla") {
      if (telemetry.marketDataAvailable !== true || telemetry.marketDataStale === true || Number(telemetry.marketVolatilityPct ?? 0) >= 30) {
        position = "hold";
        rationale = "Telemetria econômica por mundo indisponível ou desatualizada; nenhum ajuste econômico é recomendado.";
      }
    } else if (telemetry.diplomacyAvailable !== true || telemetry.activeTreatyConflict === true) {
      position = "hold";
      rationale = "Fonte diplomática autoritativa indisponível ou conflito sinalizado; exigir revisão humana.";
    }
    return { agentId, domain: agentDomain[agentId], subject: request.subject, position, confidence: 0.7, rationale };
  };
  const makeAdapter = (agentId: AgentId): CouncilAgentAdapter => ({
    async analyze(request) { return makeFinding(agentId, request); },
    async review({ request, ownFinding, peerFindings }) {
      if (peerFindings.some((peer) => (peer.domain === "safety" || peer.domain === "competitive-integrity") && peer.position !== "support")) {
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export type CouncilSubmission =
  | { kind: "created" | "replay"; record: PersistedCouncil }
  | { kind: "conflict" }
  | { kind: "rate-limited" };

/** Orchestrates persisted council jobs. Only rate counters are process-local; requests/results are PostgreSQL-backed. */
export class MarshalConsoleStore {
  private readonly rateWindows = new Map<string, { startedAt: number; count: number }>();

  constructor(
    private readonly repository: MarshalConsoleRepository,
    private readonly adapters: Readonly<Record<AgentId, CouncilAgentAdapter>> = createDefaultAdapters(),
    private readonly now: () => number = Date.now,
  ) {}

  async submit(actorId: string, idempotencyKey: string, body: CouncilBody, telemetry: WorldTelemetrySnapshot): Promise<CouncilSubmission> {
    this.pruneRateWindows();
    const window = this.rateWindows.get(actorId);
    if (window && this.now() - window.startedAt < 60_000 && window.count >= 10) return { kind: "rate-limited" };
    if (!window || this.now() - window.startedAt >= 60_000) this.rateWindows.set(actorId, { startedAt: this.now(), count: 1 });
    else window.count += 1;

    const requestId = randomUUID();
    const inputHash = createHash("sha256").update(stableJson(body)).digest("hex");
    const record: NewPersistedCouncil = {
      requestId,
      actorId,
      idempotencyKey,
      payloadHash: inputHash,
      subject: body.subject,
      worldId: body.scope.worldId,
      periodSeconds: body.scope.periodSeconds ?? null,
      telemetrySnapshot: telemetry,
      status: "queued",
      createdAt: new Date(this.now()).toISOString(),
    };
    const result = await this.repository.createOrGetCouncil(record);
    if (result.kind === "created") this.start(result.record.requestId);
    return result;
  }

  async getCouncil(actorId: string, requestId: string): Promise<PersistedCouncil | undefined> {
    return this.repository.getCouncil(actorId, requestId);
  }

  async getProposal(actorId: string, proposalId: string): Promise<PersistedProposal | undefined> {
    return this.repository.getProposal(actorId, proposalId.replace(/^prop_/, ""));
  }

  async recoverPending(): Promise<void> {
    await this.repository.requeueStaleCouncils(new Date(this.now() - 120_000));
    for (;;) {
      const ids = await this.repository.listQueuedCouncils(100);
      if (!ids.length) break;
      await Promise.all(ids.map((id) => this.run(id)));
      if (ids.length < 100) break;
    }
  }

  private start(requestId: string): void {
    void this.run(requestId).catch(async () => {
      try { await this.repository.markCouncilFailed(requestId, "COUNCIL_UNAVAILABLE"); } catch { /* database retry will preserve the last durable status */ }
    });
  }

  private async run(requestId: string): Promise<void> {
    const record = await this.repository.claimQueuedCouncil(requestId);
    if (!record) return; // another process already claimed this job
    const telemetry = record.telemetrySnapshot;
    const request: CouncilRequest = {
      requestId: record.requestId,
      actorId: record.actorId,
      subject: record.subject,
      context: {
        worldId: record.worldId,
        periodSeconds: record.periodSeconds,
        observedAt: telemetry.observedAt,
        operationalState: telemetry.operationalState,
        occupancy: telemetry.occupancy,
        occupancyPct: telemetry.occupancy.percent,
        activeRooms: telemetry.activeRooms,
        queueCount: telemetry.queueCount,
        queueP95Seconds: telemetry.queueP95Seconds,
        activeIncidents: telemetry.activeIncidents,
        incidentTelemetryAvailable: telemetry.incidentTelemetryAvailable,
        configRevision: telemetry.configRevision,
        marketDataAvailable: false,
        diplomacyAvailable: false,
      },
    };
    try {
      const result = await runSpecialClassCouncil(request, this.adapters);
      const proposals: NewPersistedProposal[] = result.status === "complete"
        ? result.conflicts.filter((item) => item.status === "preferred-proposal").map((governance) => ({
            id: randomUUID(), actorId: record.actorId, councilId: record.requestId,
            subject: governance.subject, governance,
          }))
        : [];
      await this.repository.saveCouncilResult(record.requestId, result, proposals);
    } catch {
      await this.repository.markCouncilFailed(record.requestId, "COUNCIL_UNAVAILABLE");
    }
  }

  private pruneRateWindows(): void {
    for (const [actorId, value] of this.rateWindows) {
      if (this.now() - value.startedAt >= 60_000) this.rateWindows.delete(actorId);
    }
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

function error(res: Response, status: number, code: string, message: string, correlation: string) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error: { code, message, details: [] }, correlationId: correlation });
}
function correlationId(req: Request): string {
  const provided = req.get("x-correlation-id");
  return provided && /^[A-Za-z0-9_-]{8,80}$/.test(provided) ? provided : randomUUID();
}
function sameOriginPost(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin || req.get("sec-fetch-site") === "cross-site") return false;
  try { return new URL(origin).origin === `${req.protocol}://${req.get("host")}`; } catch { return false; }
}
function councilDto(record: PersistedCouncil, correlation: string) {
  if (!record.result) return {
    requestId: record.requestId, status: record.status, createdAt: record.createdAt,
    telemetry: record.telemetrySnapshot, correlationId: correlation,
    links: { self: `/api/console/v1/marshal/councils/${record.requestId}` },
  };
  if (record.status === "failed") return {
    requestId: record.requestId, status: "failed", createdAt: record.createdAt,
    reasonCodes: [record.errorCode ?? "COUNCIL_UNAVAILABLE"], telemetry: record.telemetrySnapshot,
    correlationId: correlation,
  };
  return {
    requestId: record.requestId,
    status: record.result.status === "complete" ? "complete" : record.result.status,
    createdAt: record.createdAt,
    roundsCompleted: record.result.roundsCompleted,
    scope: { worldId: record.worldId },
    telemetry: record.telemetrySnapshot,
    agents: record.result.findings.map((finding) => ({
      ...finding,
      name: SPECIAL_AGENTS.find((agent) => agent.id === finding.agentId)?.name ?? finding.agentId,
    })),
    governance: record.result.conflicts,
    failedAgents: record.result.failedAgents,
    reasonCodes: record.result.reasonCodes,
    proposalIds: record.proposalIds,
    correlationId: correlation,
    dataRevision: record.telemetrySnapshot.configRevision,
  };
}

export interface MarshalConsoleRouteOptions {
  operatorIds?: string;
  store?: MarshalConsoleStore;
  recoverPending?: boolean;
}

export function registerMarshalConsoleRoutes(app: Express, options: MarshalConsoleRouteOptions = {}): void {
  const store = options.store ?? new MarshalConsoleStore(new PostgresMarshalConsoleRepository());
  if (options.recoverPending) void store.recoverPending().catch(() => { /* requests return 503 until PostgreSQL is available */ });
  const noStore: RequestHandler = (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); };
  const protect = [noStore, isAuthenticated, createMarshalConsoleGuard(options.operatorIds)];
  const prefix = "/api/console/v1/marshal";

  app.get(`${prefix}/overview`, ...protect, (req, res) => {
    const correlation = correlationId(req);
    const parsedWorld = worldIdSchema.safeParse(req.query.worldId);
    if (!parsedWorld.success) return error(res, 400, "INVALID_REQUEST", "worldId inválido ou ausente.", correlation);
    const telemetry = roomManager.getWorldTelemetry(parsedWorld.data);
    res.setHeader("Cache-Control", "no-store");
    return res.json(telemetry);
  });

  app.post(`${prefix}/councils`, ...protect, async (req, res) => {
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
    const telemetry = roomManager.getWorldTelemetry(parsed.data.scope.worldId);
    try {
      const submission = await store.submit(actorId, key, parsed.data, telemetry);
      if (submission.kind === "conflict") return error(res, 409, "IDEMPOTENCY_KEY_REUSED", "A chave já foi usada com conteúdo diferente.", correlation);
      if (submission.kind === "rate-limited") return error(res, 429, "RATE_LIMITED", "Limite de 10 conselhos por minuto atingido.", correlation);
      const record = submission.record;
      res.setHeader("Location", `${prefix}/councils/${record.requestId}`);
      res.setHeader("Retry-After", "1");
      return res.status(submission.kind === "replay" && (record.status === "completed" || record.status === "failed") ? 200 : 202)
        .json(councilDto(record, correlation));
    } catch {
      return error(res, 503, "COUNCIL_UNAVAILABLE", "Persistência do conselho indisponível; tente novamente com a mesma chave.", correlation);
    }
  });

  app.get(`${prefix}/councils/:requestId`, ...protect, async (req, res) => {
    const correlation = correlationId(req);
    const actorId = (req as any).user.claims.sub as string;
    const id = req.params.requestId;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return error(res, 404, "RESOURCE_NOT_FOUND", "Conselho não encontrado.", correlation);
    try {
      const record = await store.getCouncil(actorId, id);
      if (!record) return error(res, 404, "RESOURCE_NOT_FOUND", "Conselho não encontrado.", correlation);
      res.setHeader("Retry-After", record.status === "completed" || record.status === "failed" ? "0" : "1");
      return res.status(record.status === "queued" || record.status === "running" ? 202 : 200).json(councilDto(record, correlation));
    } catch {
      return error(res, 503, "COUNCIL_UNAVAILABLE", "Persistência do conselho indisponível.", correlation);
    }
  });

  app.get(`${prefix}/proposals/:proposalId`, ...protect, async (req, res) => {
    const correlation = correlationId(req);
    const actorId = (req as any).user.claims.sub as string;
    const proposalId = req.params.proposalId;
    if (typeof proposalId !== "string" || !/^prop_[0-9a-f-]{36}$/i.test(proposalId)) return error(res, 404, "RESOURCE_NOT_FOUND", "Proposta não encontrada.", correlation);
    try {
      const proposal = await store.getProposal(actorId, proposalId);
      if (!proposal) return error(res, 404, "RESOURCE_NOT_FOUND", "Proposta não encontrada.", correlation);
      return res.json({
        proposalId: proposal.proposalId, councilRequestId: proposal.councilRequestId,
        subject: proposal.subject, governance: proposal.governance,
        createdAt: proposal.createdAt, executable: false, correlationId: correlation,
      });
    } catch {
      return error(res, 503, "COUNCIL_UNAVAILABLE", "Persistência da proposta indisponível.", correlation);
    }
  });
}
