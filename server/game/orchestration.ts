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

// Governance vocabulary for the Submundo KR council. Recommendations remain proposals.
export type GovernanceDomain = "safety" | "competitive-integrity" | "operations" | "economy" | "diplomacy";
export type GovernancePosition = "support" | "hold" | "oppose";
export interface GovernanceFinding {
  agentId: AgentId;
  domain: GovernanceDomain;
  subject: string;
  position: GovernancePosition;
  confidence: number;
  rationale: string;
}
export interface CouncilRequest {
  requestId: string;
  actorId: string;
  subject: string;
  context: Readonly<Record<string, unknown>>;
}
export interface AgentReviewInput {
  request: CouncilRequest;
  ownFinding: GovernanceFinding;
  peerFindings: readonly GovernanceFinding[];
}
export interface CouncilAgentAdapter {
  analyze(request: CouncilRequest): Promise<GovernanceFinding>;
  review(input: AgentReviewInput): Promise<GovernanceFinding>;
}
export interface ConflictResolution {
  subject: string;
  status: "no-conflict" | "preferred-proposal" | "escalated-human-review" | "safety-veto" | "integrity-veto";
  preferredAgent: AgentId | null;
  positions: Array<{ agentId: AgentId; domain: GovernanceDomain; position: GovernancePosition }>;
  reasonCode: string;
  executable: false;
}
export interface CouncilResult {
  requestId: string;
  status: "complete" | "partial" | "rejected";
  findings: GovernanceFinding[];
  conflicts: ConflictResolution[];
  failedAgents: AgentId[];
  roundsCompleted: 0 | 1 | 2;
  reasonCodes: string[];
}

const GOVERNANCE_PRIORITY: Record<GovernanceDomain, number> = {
  safety: 500,
  "competitive-integrity": 400,
  operations: 300,
  economy: 200,
  diplomacy: 100,
};
const AGENT_DOMAINS: Record<AgentId, readonly GovernanceDomain[]> = {
  "marshal-henricks": ["safety", "competitive-integrity", "operations"],
  "king-krapulla": ["economy"],
  "ambassador-uryan": ["diplomacy"],
};
const AGENT_ORDER: readonly AgentId[] = ["marshal-henricks", "king-krapulla", "ambassador-uryan"];
const isFinding = (value: GovernanceFinding, agentId: AgentId, subject: string): boolean =>
  !!value && Object.hasOwn(AGENT_DOMAINS, agentId) && value.agentId === agentId && value.subject === subject &&
  Object.hasOwn(GOVERNANCE_PRIORITY, value.domain) && AGENT_DOMAINS[agentId].includes(value.domain) &&
  ["support", "hold", "oppose"].includes(value.position) &&
  Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1 &&
  typeof value.rationale === "string" && value.rationale.length <= 500;

/**
 * Resolve disagreements by fixed policy precedence, never by agent seniority or confidence.
 * Safety/integrity conflict is always escalated; no resolution is executable.
 */
export function resolveGovernanceConflicts(findings: readonly GovernanceFinding[]): ConflictResolution[] {
  const grouped = new Map<string, GovernanceFinding[]>();
  for (const finding of findings) {
    if (!finding || !isFinding(finding, finding.agentId, finding.subject))
      throw new RangeError("Parecer inválido ou fora da competência do agente");
    const group = grouped.get(finding.subject) ?? [];
    group.push(finding);
    grouped.set(finding.subject, group);
  }
  const resolutions: ConflictResolution[] = [];
  for (const [subject, group] of grouped) {
    const positions = group.map(({ agentId, domain, position }) => ({ agentId, domain, position }));
    const stances = new Set(group.map((finding) => finding.position));
    if (stances.size < 2) {
      resolutions.push({ subject, status: "no-conflict", preferredAgent: null, positions, reasonCode: "COUNCIL_CONSENSUS", executable: false });
      continue;
    }
    const veto = group.find((finding) => finding.domain === "safety" && finding.position !== "support") ??
      group.find((finding) => finding.domain === "competitive-integrity" && finding.position !== "support");
    if (veto) {
      resolutions.push({ subject, status: veto.domain === "safety" ? "safety-veto" : "integrity-veto", preferredAgent: null, positions, reasonCode: veto.domain === "safety" ? "SAFETY_POLICY_VETO" : "COMPETITIVE_INTEGRITY_VETO", executable: false });
      continue;
    }
    const sorted = [...group].sort((a, b) => GOVERNANCE_PRIORITY[b.domain] - GOVERNANCE_PRIORITY[a.domain] || AGENT_ORDER.indexOf(a.agentId) - AGENT_ORDER.indexOf(b.agentId));
    const topPriority = GOVERNANCE_PRIORITY[sorted[0].domain];
    const topPositions = new Set(sorted.filter((finding) => GOVERNANCE_PRIORITY[finding.domain] === topPriority).map((finding) => finding.position));
    if (topPositions.size > 1 || topPriority <= GOVERNANCE_PRIORITY.diplomacy) {
      resolutions.push({ subject, status: "escalated-human-review", preferredAgent: null, positions, reasonCode: "CONFLICT_REQUIRES_HUMAN_REVIEW", executable: false });
    } else {
      resolutions.push({ subject, status: "preferred-proposal", preferredAgent: sorted[0].agentId, positions, reasonCode: "PRECEDENCE_SELECTED_PROPOSAL_ONLY", executable: false });
    }
  }
  return resolutions;
}

const unavailableFinding = (agentId: AgentId, subject: string): GovernanceFinding => ({
  agentId, domain: AGENT_DOMAINS[agentId][0], subject, position: "hold", confidence: 0,
  rationale: "Agente indisponível; decisão bloqueada até revisão humana.",
});

function withDeadline<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Agent deadline exceeded")), timeoutMs);
  });
  return Promise.race([task, deadline]).finally(() => clearTimeout(timer!));
}

/**
 * Two asynchronous rounds: all agents analyze in parallel, then review anonymized peer
 * findings in parallel. Adapters are injected ports; this module itself has no side effects.
 */
export async function runSpecialClassCouncil(
  request: CouncilRequest,
  adapters: Readonly<Record<AgentId, CouncilAgentAdapter>>,
  options: { timeoutMs?: number } = {},
): Promise<CouncilResult> {
  if (!request || !/^[A-Za-z0-9_-]{8,80}$/.test(request.requestId) ||
      typeof request.actorId !== "string" || request.actorId.length < 1 || request.actorId.length > 128 ||
      typeof request.subject !== "string" || request.subject.trim().length < 2 || request.subject.length > 120 ||
      !request.context || typeof request.context !== "object" || Array.isArray(request.context) ||
      Object.keys(request.context).length > 24 ||
      (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 50 || options.timeoutMs > 60_000))) {
    return { requestId: request?.requestId ?? "invalid-request", status: "rejected", findings: [], conflicts: [], failedAgents: [], roundsCompleted: 0, reasonCodes: ["INVALID_COUNCIL_REQUEST"] };
  }
  const initial = await Promise.all(AGENT_ORDER.map(async (agentId) => {
    try {
      const finding = await withDeadline(adapters[agentId].analyze(request), options.timeoutMs ?? 5_000);
      return isFinding(finding, agentId, request.subject) ? { agentId, finding } : { agentId, finding: null };
    } catch {
      return { agentId, finding: null };
    }
  }));
  const initialFindings = initial.flatMap((entry) => entry.finding ? [entry.finding] : []);
  const initialFailed = initial.filter((entry) => !entry.finding).map((entry) => entry.agentId);
  if (initialFindings.length !== AGENT_ORDER.length) {
    const findings = AGENT_ORDER.map((agentId) => initialFindings.find((finding) => finding.agentId === agentId) ?? unavailableFinding(agentId, request.subject));
    return { requestId: request.requestId, status: "partial", findings, conflicts: resolveGovernanceConflicts(findings), failedAgents: initialFailed, roundsCompleted: 1, reasonCodes: ["AGENT_ANALYSIS_INCOMPLETE", "HUMAN_REVIEW_REQUIRED"] };
  }
  const reviewed = await Promise.all(AGENT_ORDER.map(async (agentId) => {
    try {
      const ownFinding = initialFindings.find((finding) => finding.agentId === agentId)!;
      const peers = initialFindings.filter((finding) => finding.agentId !== agentId);
      const revised = await withDeadline(adapters[agentId].review({ request, ownFinding, peerFindings: peers }), options.timeoutMs ?? 5_000);
      return isFinding(revised, agentId, request.subject) ? { agentId, finding: revised } : { agentId, finding: null };
    } catch {
      return { agentId, finding: null };
    }
  }));
  const finalFindings = reviewed.flatMap((entry) => entry.finding ? [entry.finding] : []);
  const failedAgents = reviewed.filter((entry) => !entry.finding).map((entry) => entry.agentId);
  if (failedAgents.length) {
    const complete = AGENT_ORDER.map((agentId) => finalFindings.find((finding) => finding.agentId === agentId) ?? unavailableFinding(agentId, request.subject));
    return { requestId: request.requestId, status: "partial", findings: complete, conflicts: resolveGovernanceConflicts(complete), failedAgents, roundsCompleted: 1, reasonCodes: ["AGENT_REVIEW_INCOMPLETE", "HUMAN_REVIEW_REQUIRED"] };
  }
  return { requestId: request.requestId, status: "complete", findings: finalFindings, conflicts: resolveGovernanceConflicts(finalFindings), failedAgents: [], roundsCompleted: 2, reasonCodes: [] };
}
