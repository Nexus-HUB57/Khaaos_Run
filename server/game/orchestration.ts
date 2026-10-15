/**
 * Khaaos Run: deterministic orchestration for the Special Class (Submundo KR).
 * Pure domain logic only: no database, network, shell, LLM, or game-state writes.
 */
export type AgentId = "marshal-henricks" | "king-krapulla" | "ambassador-uryan";
export type Effect = "read" | "proposal";
export type WorldId = "CIGKV" | "W1" | "W2" | "W3" | "W4";

export interface AgentDescriptor {
  id: AgentId;
  name: string;
  title: string;
  mission: string;
  commands: readonly string[];
}

export const SPECIAL_AGENTS: readonly AgentDescriptor[] = [
  {
    id: "marshal-henricks",
    name: "Henricks Hunterheads III",
    title: "Marechal",
    mission: "Coordenação estratégica e alertas operacionais dos mundos.",
    commands: ["world.status", "world.window.propose", "operation.alert"],
  },
  {
    id: "king-krapulla",
    name: "King Krapulla",
    title: "Centralizador do Mercado Negro",
    mission: "Inteligência agregada de oferta, procura e anomalias do mercado fictício.",
    commands: ["market.brief", "market.adjustment.propose", "market.anomaly"],
  },
  {
    id: "ambassador-uryan",
    name: "Uryan Horks",
    title: "Embaixadora",
    mission: "Diplomacia narrativa, comunicados em rascunho e propostas de eventos.",
    commands: ["diplomacy.brief", "diplomacy.message.draft", "diplomacy.event.propose"],
  },
] as const;

const WORLD_IDS = new Set<WorldId>(["CIGKV", "W1", "W2", "W3", "W4"]);
const COMMANDS = new Map<string, { agentId: AgentId; effect: Effect; worldRequired: boolean }>();
for (const agent of SPECIAL_AGENTS) {
  for (const command of agent.commands) {
    COMMANDS.set(command, {
      agentId: agent.id,
      effect: command.endsWith(".propose") || command.endsWith(".draft") ? "proposal" : "read",
      worldRequired: command.startsWith("world.") || command.startsWith("market."),
    });
  }
}

export interface AgentCommand {
  requestId: string;
  command: string;
  actorId: string;
  scope?: { worldId?: string; periodSeconds?: number; faction?: string; topic?: string };
  payload?: Record<string, unknown>;
}

export interface AgentDecision {
  status: "ok" | "proposal" | "rejected";
  agentId: AgentId | null;
  summary: string;
  reasonCodes: string[];
  proposal: null | { type: string; fields: Record<string, string | number> };
  correlationId: string;
}

const reject = (correlationId: string, reason: string): AgentDecision => ({
  status: "rejected", agentId: null, summary: "Comando recusado pela política de orquestração.",
  reasonCodes: [reason], proposal: null, correlationId,
});

/** Route only allowlisted, bounded, declarative commands. This does not authenticate actorId. */
export function orchestrate(command: AgentCommand): AgentDecision {
  const correlationId = command?.requestId || "missing-request-id";
  if (!command || typeof command !== "object" || typeof command.requestId !== "string" ||
      !/^[A-Za-z0-9_-]{8,80}$/.test(command.requestId)) return reject(correlationId, "INVALID_REQUEST_ID");
  if (typeof command.actorId !== "string" || command.actorId.trim().length < 1 || command.actorId.length > 128)
    return reject(correlationId, "INVALID_ACTOR");
  if (typeof command.command !== "string" || command.command.length > 80)
    return reject(correlationId, "INVALID_COMMAND");
  const policy = COMMANDS.get(command.command);
  if (!policy) return reject(correlationId, "COMMAND_NOT_ALLOWED");
  const scope = command.scope ?? {};
  if (policy.worldRequired && (!scope.worldId || !WORLD_IDS.has(scope.worldId as WorldId)))
    return reject(correlationId, "INVALID_WORLD_SCOPE");
  if (scope.periodSeconds !== undefined && (!Number.isInteger(scope.periodSeconds) || scope.periodSeconds < 60 || scope.periodSeconds > 2_592_000))
    return reject(correlationId, "INVALID_PERIOD");
  if (scope.faction !== undefined && (typeof scope.faction !== "string" || scope.faction.trim().length < 2 || scope.faction.length > 80))
    return reject(correlationId, "INVALID_FACTION");
  if (scope.topic !== undefined && (typeof scope.topic !== "string" || scope.topic.trim().length < 2 || scope.topic.length > 240))
    return reject(correlationId, "INVALID_TOPIC");
  if (command.payload && (typeof command.payload !== "object" || Array.isArray(command.payload) || Object.keys(command.payload).length > 12))
    return reject(correlationId, "INVALID_PAYLOAD");

  const agent = SPECIAL_AGENTS.find((item) => item.id === policy.agentId)!;
  const proposal = policy.effect === "proposal" ? makeProposal(command.command, scope) : null;
  return {
    status: proposal ? "proposal" : "ok",
    agentId: agent.id,
    summary: `${agent.title} (${agent.name}) recebeu ${command.command}; saída limitada a ${policy.effect}.`,
    reasonCodes: [], proposal,
    correlationId: command.requestId,
  };
}

function makeProposal(command: string, scope: NonNullable<AgentCommand["scope"]>) {
  const fields: Record<string, string | number> = {};
  if (scope.worldId) fields.worldId = scope.worldId;
  if (scope.periodSeconds !== undefined) fields.periodSeconds = scope.periodSeconds;
  if (scope.faction) fields.faction = scope.faction.trim();
  if (scope.topic) fields.topic = scope.topic.trim();
  return { type: command, fields };
}

export interface AlertSignal {
  severity: number;
  impact: number;
  confidence: number;
  staleness: number;
  createdAt: number;
}

/** Explainable 0–100 queue score. It prioritizes review; it never grants authorization. */
export function scoreAlert(signal: AlertSignal): number {
  const valid = Number.isFinite(signal.severity) && signal.severity >= 0 && signal.severity <= 4 &&
    Number.isFinite(signal.impact) && signal.impact >= 0 && signal.impact <= 4 &&
    Number.isFinite(signal.confidence) && signal.confidence >= 0 && signal.confidence <= 1 &&
    Number.isFinite(signal.staleness) && signal.staleness >= 0 && signal.staleness <= 1;
  if (!valid) throw new RangeError("AlertSignal fora dos limites permitidos");
  return Math.round(25 * (0.45 * signal.severity + 0.35 * signal.impact + 0.20 * (4 * signal.confidence)) * (1 - 0.5 * signal.staleness));
}

/** Stable ordering: higher score first, then oldest first. */
export function prioritizeAlerts<T extends AlertSignal>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => scoreAlert(b) - scoreAlert(a) || a.createdAt - b.createdAt);
}
