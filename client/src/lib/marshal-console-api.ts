export const MARSHAL_API_ROOT = "/api/console/v1/marshal";

export const MARSHAL_WORLDS = [
  { id: "CIGKV", name: "Khaaos Ville", capacity: 50 },
  { id: "W1", name: "Barburhen", capacity: 100 },
  { id: "W2", name: "Priadus", capacity: 75 },
  { id: "W3", name: "Ckesalth", capacity: 60 },
  { id: "W4", name: "Arukheea", capacity: 80 },
] as const;

export type MarshalWorldId = (typeof MARSHAL_WORLDS)[number]["id"];
export type CouncilStatus = "queued" | "running" | "complete" | "partial" | "failed";

export interface MarshalOverview {
  worldId: MarshalWorldId;
  name: string;
  operationalState: string;
  occupancy: { current: number; capacity: number; percent: number | null };
  activeRooms: number;
  queueCount: number;
  queueP95Seconds: number | null;
  networkLatencyP95Ms: number | null;
  networkLatencySampleCount: number;
  networkLatencyTelemetryAvailable: boolean;
  networkLatencyObservedAt: string | null;
  activeIncidents: number | null;
  incidentTelemetryAvailable: boolean;
  configRevision: string | null;
  observedAt: string;
  stale: boolean;
}
export type SpecialAgentId = "marshal-henricks" | "king-krapulla" | "ambassador-uryan";
export interface SpecialClassNarrativeEvent {
  eventId: string;
  worldId: MarshalWorldId;
  title: string;
  theme: string;
  trigger: string;
  observedSignals: Array<{ key: "queueCount" | "queueP95Seconds" | "occupancy.percent" | "networkLatencyP95Ms"; value: number }>;
  contributions: Array<{ agentId: SpecialAgentId; role: "lead" | "review" | "draft"; line: string }>;
  status: "proposal";
  needsHumanReview: true;
  executable: false;
}
export interface NarrativeEventsResponse {
  worldId: MarshalWorldId;
  generatedAt: string;
  source: "server-runtime-telemetry";
  events: SpecialClassNarrativeEvent[];
  policy: { proposalOnly: true; humanReviewRequired: true; executable: false };
}

export interface CouncilInput {
  subject: string;
  scope: { worldId: MarshalWorldId; periodSeconds?: number };
}

export interface CouncilAgent {
  agentId: string;
  name: string;
  domain: string;
  position: string;
  confidence: number;
  rationale: string;
}

export interface CouncilGovernance {
  subject?: string;
  status: string;
  preferredAgent?: string;
  reasonCode?: string;
  executable: boolean;
}

export interface CouncilResponse {
  requestId: string;
  status: CouncilStatus;
  createdAt?: string;
  roundsCompleted?: number;
  scope?: { worldId: MarshalWorldId };
  agents?: CouncilAgent[];
  governance?: CouncilGovernance[];
  failedAgents?: string[];
  reasonCodes?: string[];
  proposalIds?: string[];
  correlationId?: string;
  dataRevision?: string | null;
  links?: { self?: string };
  telemetry?: MarshalOverview;
}

export interface MarshalProposal {
  proposalId: string;
  councilRequestId: string;
  subject: string;
  governance: CouncilGovernance;
  createdAt: string;
  executable: false;
  correlationId: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
  message?: string;
}

export class MarshalConsoleApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "MarshalConsoleApiError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody = body && typeof body === "object" ? (body as ApiErrorBody) : undefined;
    throw new MarshalConsoleApiError(
      response.status,
      errorBody?.error?.code,
      errorBody?.error?.message ?? errorBody?.message ?? `Falha na solicitação (${response.status}).`,
    );
  }

  if (!body || typeof body !== "object") {
    throw new MarshalConsoleApiError(response.status, "INVALID_RESPONSE", "A API retornou uma resposta inválida.");
  }
  return body as T;
}

function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  return fetch(path, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}

export async function fetchMarshalOverview(
  worldId: MarshalWorldId,
  signal?: AbortSignal,
): Promise<MarshalOverview> {
  const response = await request(`${MARSHAL_API_ROOT}/overview?worldId=${encodeURIComponent(worldId)}`, { signal });
  return parseResponse<MarshalOverview>(response);
}

export function marshalTelemetryStreamUrl(worldId: MarshalWorldId): string {
  return `${MARSHAL_API_ROOT}/telemetry/stream?worldId=${encodeURIComponent(worldId)}`;
}

export async function fetchMarshalNarrativeEvents(
  worldId: MarshalWorldId,
  signal?: AbortSignal,
): Promise<NarrativeEventsResponse> {
  const response = await request(`${MARSHAL_API_ROOT}/narrative-events?worldId=${encodeURIComponent(worldId)}`, { signal });
  return parseResponse<NarrativeEventsResponse>(response);
}

export async function checkMarshalConsoleAccess(): Promise<boolean> {
  try {
    await fetchMarshalOverview("CIGKV");
    return true;
  } catch (error) {
    if (error instanceof MarshalConsoleApiError && [401, 403].includes(error.status)) return false;
    throw error;
  }
}

function councilPath(path: string): string {
  if (!path.startsWith(`${MARSHAL_API_ROOT}/councils/`) || path.startsWith("//")) {
    throw new MarshalConsoleApiError(0, "INVALID_RESOURCE_PATH", "A API retornou um caminho de conselho inválido.");
  }
  return path;
}

export async function createMarshalCouncil(
  input: CouncilInput,
  idempotencyKey: string,
): Promise<{ council: CouncilResponse; resourcePath: string }> {
  const headers = new Headers({ "Content-Type": "application/json", "Idempotency-Key": idempotencyKey });
  const response = await request(`${MARSHAL_API_ROOT}/councils`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const council = await parseResponse<CouncilResponse>(response);
  const resourcePath = councilPath(response.headers.get("Location") ?? council.links?.self ?? "");
  return { council, resourcePath };
}

export async function fetchMarshalCouncil(path: string, signal?: AbortSignal): Promise<CouncilResponse> {
  const response = await request(councilPath(path), { signal });
  return parseResponse<CouncilResponse>(response);
}

export async function fetchMarshalProposal(
  proposalId: string,
  signal?: AbortSignal,
): Promise<MarshalProposal> {
  if (!/^prop_[0-9a-f-]{36}$/i.test(proposalId)) {
    throw new MarshalConsoleApiError(0, "INVALID_PROPOSAL_ID", "O identificador da proposta é inválido.");
  }
  const response = await request(`${MARSHAL_API_ROOT}/proposals/${encodeURIComponent(proposalId)}`, { signal });
  return parseResponse<MarshalProposal>(response);
}
