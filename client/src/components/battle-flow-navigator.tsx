/**
 * End-to-end battle flow navigation:
 * match_found → /lobby
 * COUNTDOWN / IN_PROGRESS → /zona (once)
 * FINISHED stays put (results modal handles UX)
 */

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useSharedBattleRoom } from "@/hooks/battle-room-context";

export function BattleFlowNavigator() {
  const [location, setLocation] = useLocation();
  const { room, inQueue } = useSharedBattleRoom();
  const lastRoomStatus = useRef<string | null>(null);
  const navigatedForMatch = useRef<string | null>(null);

  useEffect(() => {
    if (!room) {
      lastRoomStatus.current = null;
      return;
    }

    const status = room.status;
    const prev = lastRoomStatus.current;
    lastRoomStatus.current = status;

    // New room assigned (matchmaking or create) → lobby
    if (
      (status === "LOBBY" || status === "COUNTDOWN") &&
      navigatedForMatch.current !== room.id &&
      location !== "/lobby" &&
      location !== "/zona"
    ) {
      navigatedForMatch.current = room.id;
      setLocation("/lobby");
      return;
    }

    // Match starting → zone
    if (
      status === "IN_PROGRESS" &&
      prev !== "IN_PROGRESS" &&
      location !== "/zona"
    ) {
      setLocation("/zona");
      return;
    }

    // Countdown — optional soft redirect to lobby if user is elsewhere
    if (
      status === "COUNTDOWN" &&
      location !== "/lobby" &&
      location !== "/zona" &&
      location !== "/batalha"
    ) {
      setLocation("/lobby");
    }
  }, [room, location, setLocation]);

  // Clear navigation lock when leaving queue without room
  useEffect(() => {
    if (!room && !inQueue) {
      navigatedForMatch.current = null;
    }
  }, [room, inQueue]);

  return null;
}
