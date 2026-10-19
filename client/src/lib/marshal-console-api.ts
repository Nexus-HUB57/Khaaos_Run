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
  occupancy: { current: number | null; capacity: number; percent: number | null };
  queueP95Seconds: number | null;
  activeIncidents: number | null;
  configRevision: string;
  observedAt: string;
  stale: boolean;
}

export interface CouncilContext {
  occupancyPct?: number;
  queueP95Seconds?: number;
  activeIncidents?: number;
  marketVolatilityPct?: number;
  marketDataStale?: boolean;
  activeTreatyConflict?: boolean;
  configRevision?: string;
}

export interface CouncilInput {
  subject: string;
  scope: { worldId: MarshalWorldId; periodSeconds?: number };
  context?: CouncilContext;
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
