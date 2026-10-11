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
}

type ServerMessage =
  | { type: "welcome"; userId: string; roomId: string }
  | { type: "room_state"; room: RoomState }
  | { type: "zone_tick"; zone: ZoneStatus; players: BattlePlayer[] }
  | { type: "player_eliminated"; userId: string; cause: string; eliminatorId?: string }
  | { type: "loot_picked"; lootId: number; by: string }
  | { type: "damage_dealt"; attackerId: string; targetId: string; damage: number; targetHealth: number }
  | { type: "interest_update"; players: BattlePlayer[]; loot: RoomLoot[] }
  | { type: "match_finished"; winnerId: string | null; rankings: { userId: string; kills: number }[] }
  | { type: "error"; message: string }
  | { type: "countdown"; seconds: number };

export function useBattleRoom() {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [zone, setZone] = useState<ZoneStatus | null>(null);
  const [players, setPlayers] = useState<BattlePlayer[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [eliminations, setEliminations] = useState<{ userId: string; cause: string }[]>([]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!user || wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setLastError(null);
      // Auth + join — user comes from Replit Auth model (id / firstName)
      const uid = (user as any).id || (user as any).claims?.sub;
      const name = (user as any).firstName || (user as any).claims?.first_name || "Operativo";
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "join",
          userId: uid,
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
      setConnected(false);
      // Auto-reconnect after 2s
      setTimeout(() => {
        if (user) connect();
      }, 2000);
    };

    ws.onerror = () => {
      setLastError("WebSocket error");
    };
  }, [user, send]);

  useEffect(() => {
    if (user) connect();
    return () => {
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
    (targetId: string) => send({ type: "attack", targetId }),
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
    updatePosition,
    pickupLoot,
    startMatch,
    leave,
    attack,
  };
}
