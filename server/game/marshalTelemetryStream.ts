import type { Request, RequestHandler, Response } from "express";
import type { WorldId } from "./orchestration";
import type { WorldTelemetrySnapshot } from "./worldTelemetry";

type SnapshotReader = (worldId: WorldId) => WorldTelemetrySnapshot;
interface StreamClient {
  actorId: string;
  worldId: WorldId;
  response: Response;
}

export interface TelemetryStreamOptions {
  intervalMs?: number;
  maxTotalClients?: number;
  maxClientsPerActor?: number;
}

/** One bounded process-local fanout loop shared by all authenticated SSE clients. */
export function createMarshalTelemetryStream(
  readSnapshot: SnapshotReader,
  options: TelemetryStreamOptions = {},
): RequestHandler {
  const intervalMs = options.intervalMs ?? 2_000;
  const maxTotal = options.maxTotalClients ?? 100;
  const maxPerActor = options.maxClientsPerActor ?? 3;
  const clients = new Set<StreamClient>();
  let sequence = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const sendSnapshot = (client: StreamClient, snapshot: WorldTelemetrySnapshot) => {
    try {
      const event = `id: ${++sequence}\nevent: telemetry\ndata: ${JSON.stringify(snapshot)}\n\n`;
      client.response.write(event);
      if (client.response.writableLength > 64 * 1024) client.response.destroy();
    } catch {
      client.response.write(": telemetry temporarily unavailable\n\n");
    }
  };

  const stopClient = (client: StreamClient) => {
    if (!clients.delete(client)) return;
    if (clients.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const handler: RequestHandler = (req: Request, res: Response) => {
    const actorId = (req as any).user?.claims?.sub;
    if (typeof actorId !== "string") {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sessão necessária." } });
    }
    const worldId = req.query.worldId;
    if (typeof worldId !== "string" || !["CIGKV", "W1", "W2", "W3", "W4"].includes(worldId)) {
      return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "worldId inválido ou ausente." } });
    }
    const actorClients = [...clients].filter((client) => client.actorId === actorId).length;
    if (clients.size >= maxTotal || actorClients >= maxPerActor) {
      res.setHeader("Retry-After", "5");
      return res.status(429).json({ error: { code: "STREAM_LIMIT_REACHED", message: "Limite de streams ativos atingido." } });
    }

    const client: StreamClient = { actorId, worldId: worldId as WorldId, response: res };
    // Validate/snapshot before committing SSE headers so runtime errors can still be retried by EventSource.
    let initialSnapshot: WorldTelemetrySnapshot;
    try {
      initialSnapshot = readSnapshot(client.worldId);
    } catch {
      return res.status(503).json({ error: { code: "TELEMETRY_UNAVAILABLE", message: "Snapshot indisponível." } });
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    clients.add(client);
    res.on("close", () => stopClient(client));
    req.on("aborted", () => stopClient(client));
    sendSnapshot(client, initialSnapshot);
    if (!timer) {
      timer = setInterval(() => {
        const snapshots = new Map<WorldId, WorldTelemetrySnapshot | null>();
        for (const active of clients) {
          if (!snapshots.has(active.worldId)) {
            try { snapshots.set(active.worldId, readSnapshot(active.worldId)); }
            catch { snapshots.set(active.worldId, null); }
          }
          const snapshot = snapshots.get(active.worldId);
          if (snapshot) sendSnapshot(active, snapshot);
          else active.response.write(": telemetry temporarily unavailable\n\n");
        }
      }, intervalMs);
      timer.unref?.();
    }
  };
  return handler;
}
