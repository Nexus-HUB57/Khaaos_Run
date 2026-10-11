/**
 * KHAAOS RUN — Real-time Battle Room Hook
 * Connects to the authoritative RoomManager via WebSocket.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./use-auth";

export type RoomStatus = "LOBBY" | "COUNTDOWN" | "IN_PROGRESS" | "FINISHED";

export interface BattlePlayer {
  userId: string;
  displayName: string;
  posX: number;
  posY: number;
  health: number;
  maxHealth: number;
  status: string;
  kills: number;
  isConnected: boolean;
  isReady?: boolean;
  isHost?: boolean;
  rating?: number;
}

export interface RoomLoot {
  id: number;
  name: string;
  type: string;
  rarity: string;
  posX: number;
  posY: number;
  stats: Record<string, number>;
  isPickedUp: boolean;
}

export interface ZoneStatus {
  isActive: boolean;
  sessionId: number | null;
  currentPhase: number;
  totalPhases: number;
  isShrinking: boolean;
  currentRadiusPct: number;
  targetRadiusPct: number;
  prevRadiusPct: number;
  waitTimeRemaining: number;
  shrinkTimeRemaining: number;
  shrinkProgress: number;
  damagePerTick: number;
  centerX: number;
  centerY: number;
}

export interface RoomState {
  id: string;
  status: RoomStatus;
  maxPlayers: number;
  playerCount: number;
  players: BattlePlayer[];
  zone: ZoneStatus | null;
  loot: RoomLoot[];
  countdownSeconds?: number;
  winnerId?: string | null;
  hostId?: string | null;
  isPrivate?: boolean;
  inviteCode?: string | null;
  readyCount?: number;
  minPlayersToStart?: number;
}

type ServerMessage =
  | { type: "welcome"; userId: string; roomId: string }
  | { type: "room_state"; room: RoomState }
  | { type: "zone_tick"; zone: ZoneStatus; players: BattlePlayer[] }
  | { type: "player_eliminated"; userId: string; cause: string; eliminatorId?: string }
  | { type: "loot_picked"; lootId: number; by: string }
  | { type: "damage_dealt"; attackerId: string; targetId: string; damage: number; targetHealth: number }
  | { type: "interest_update"; players: BattlePlayer[]; loot: RoomLoot[] }
  | { type: "match_finished"; winnerId: string | null; rankings: { userId: string; kills: number; placement?: number; xpGained?: number; ratingAfter?: number; rankAfter?: string; promoted?: boolean }[] }
  | { type: "error"; message: string }
  | { type: "countdown"; seconds: number }
  | { type: "queue_joined"; position: number; rating: number; mode: string }
  | { type: "queue_left" }
  | { type: "queue_update"; position: number; estimatedWaitSec: number; currentDelta: number; playersInQueue: number }
  | { type: "match_found"; roomId: string; players: { userId: string; displayName: string; rating: number }[] };


export interface MatchRankingRow {
  userId: string;
  kills: number;
  placement?: number;
  xpGained?: number;
  ratingAfter?: number;
  rankAfter?: string;
  promoted?: boolean;
}

export interface LastMatchResult {
  winnerId: string | null;
  rankings: MatchRankingRow[];
  finishedAt: number;
}

export function useBattleRoom() {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const activeRef = useRef(false);
  const connectingRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [zone, setZone] = useState<ZoneStatus | null>(null);
  const [players, setPlayers] = useState<BattlePlayer[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [eliminations, setEliminations] = useState<{ userId: string; cause: string }[]>([]);
  const [lastMatchResult, setLastMatchResult] = useState<LastMatchResult | null>(null);
  const [inQueue, setInQueue] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{
    position: number;
    estimatedWaitSec: number;
    currentDelta: number;
    playersInQueue: number;
    rating?: number;
    mode?: string;
  } | null>(null);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(async () => {
    if (!user || !activeRef.current || connectingRef.current) return;
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;
    connectingRef.current = true;

    let ws: WebSocket;
    try {
      const tokenResponse = await fetch("/api/auth/ws-token", { credentials: "include", cache: "no-store" });
      if (!tokenResponse.ok) throw new Error(`Autenticação WebSocket indisponível (${tokenResponse.status})`);
      const { token } = await tokenResponse.json() as { token: string; expiresAt: number };
      if (!token || !activeRef.current) return;
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`, ["khaaos-v1", `khaaos-token.${token}`]);
      wsRef.current = ws;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Falha de autenticação WebSocket");
      if (activeRef.current) {
        reconnectTimerRef.current = setTimeout(() => { void connect(); }, 2000);
      }
      return;
    } finally {
      connectingRef.current = false;
    }

    ws.onopen = () => {
      setConnected(true);
      setLastError(null);
      const name = (user as any).firstName || (user as any).claims?.first_name || "Operativo";
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "join",
          displayName: name,
        }));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        switch (msg.type) {
          case "welcome":
            // roomId known
            break;
          case "room_state":
            setRoom(msg.room);
            setPlayers(msg.room.players);
            setZone(msg.room.zone);
            if (msg.room.countdownSeconds != null) setCountdown(msg.room.countdownSeconds);
            if (msg.room.winnerId) setWinnerId(msg.room.winnerId);
            break;
          case "zone_tick":
            setZone(msg.zone);
            setPlayers(msg.players);
            break;
          case "countdown":
            setCountdown(msg.seconds);
            break;
          case "player_eliminated":
            setEliminations((prev) => [...prev.slice(-29), { userId: msg.userId, cause: msg.cause }]);
            break;
          case "loot_picked":
            setRoom((prev) =>
              prev
                ? { ...prev, loot: prev.loot.filter((l) => l.id !== msg.lootId) }
                : prev,
            );
            break;
          case "damage_dealt":
            setPlayers((prev) =>
              prev.map((p) =>
                p.userId === msg.targetId
                  ? { ...p, health: msg.targetHealth, status: msg.targetHealth <= 0 ? "ELIMINADO" : p.status }
                  : p.userId === msg.attackerId && msg.targetHealth <= 0
                    ? { ...p, kills: p.kills + 1 }
                    : p,
              ),
            );
            break;
          case "interest_update":
            // AOI: replace visible set with nearby entities
            setPlayers(msg.players);
            setRoom((prev) => (prev ? { ...prev, loot: msg.loot } : prev));
            break;
          case "match_finished":
            setWinnerId(msg.winnerId);
            setRoom((prev) => (prev ? { ...prev, status: "FINISHED", winnerId: msg.winnerId } : prev));
            setLastMatchResult({
              winnerId: msg.winnerId,
              rankings: msg.rankings || [],
              finishedAt: Date.now(),
            });
            break;
          case "queue_joined":
            setInQueue(true);
            setQueueInfo({
              position: msg.position,
              estimatedWaitSec: 30,
              currentDelta: 100,
              playersInQueue: msg.position,
              rating: msg.rating,
              mode: msg.mode,
            });
            break;
          case "queue_update":
            setInQueue(true);
            setQueueInfo({
              position: msg.position,
              estimatedWaitSec: msg.estimatedWaitSec,
              currentDelta: msg.currentDelta,
              playersInQueue: msg.playersInQueue,
            });
            break;
          case "queue_left":
            setInQueue(false);
            setQueueInfo(null);
            break;
          case "match_found":
            setInQueue(false);
            setQueueInfo(null);
            break;
          case "error":
            setLastError(msg.message);
            break;
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setConnected(false);
      }
      if (activeRef.current) {
        reconnectTimerRef.current = setTimeout(() => { void connect(); }, 2000);
      }
    };

    ws.onerror = () => {
      setLastError("WebSocket error");
    };
  }, [user]);

  useEffect(() => {
    activeRef.current = !!user;
    if (user) void connect();
    return () => {
      activeRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user, connect]);

  const updatePosition = useCallback(
    (x: number, y: number) => send({ type: "position", x, y }),
    [send],
  );

  const pickupLoot = useCallback(
    (lootId: number) => send({ type: "pickup", lootId }),
    [send],
  );

  const startMatch = useCallback(() => send({ type: "start" }), [send]);

  const leave = useCallback(() => send({ type: "leave" }), [send]);

  const attack = useCallback(
    (targetId: string) =>
      send({ type: "attack", targetId, clientTimestamp: Date.now() }),
    [send],
  );

  const joinQueue = useCallback(
    (mode: "solo" | "duo" | "squad" = "solo") => send({ type: "queue", mode }),
    [send],
  );

  const leaveQueue = useCallback(() => send({ type: "dequeue" }), [send]);

  const setReady = useCallback(
    (ready: boolean) => send({ type: "set_ready", ready }),
    [send],
  );

  const createLobby = useCallback(
    (opts?: { private?: boolean; maxPlayers?: number }) =>
      send({ type: "create_lobby", private: opts?.private, maxPlayers: opts?.maxPlayers }),
    [send],
  );

  const joinByCode = useCallback(
    (code: string) => send({ type: "join_code", code }),
    [send],
  );

  const kickPlayer = useCallback(
    (targetId: string) => send({ type: "kick", targetId }),
    [send],
  );

  const cancelCountdown = useCallback(
    () => send({ type: "cancel_countdown" }),
    [send],
  );

  return {
    connected,
    room,
    zone,
    players,
    countdown,
    lastError,
    winnerId,
    eliminations,
    inQueue,
    queueInfo,
    updatePosition,
    pickupLoot,
    startMatch,
    leave,
    attack,
    joinQueue,
    leaveQueue,
    setReady,
    createLobby,
    joinByCode,
    kickPlayer,
    cancelCountdown,
    lastMatchResult,
    clearLastMatchResult: () => setLastMatchResult(null),
  };
}
