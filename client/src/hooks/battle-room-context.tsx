/**
 * Single shared WebSocket battle session for the whole app.
 * Prevents duplicate /ws connections from dashboard + lobby + zona.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useBattleRoom as useBattleRoomInternal } from "./use-battle-room";

type BattleRoomApi = ReturnType<typeof useBattleRoomInternal>;

const BattleRoomContext = createContext<BattleRoomApi | null>(null);

export function BattleRoomProvider({ children }: { children: ReactNode }) {
  const api = useBattleRoomInternal();
  return (
    <BattleRoomContext.Provider value={api}>
      {children}
    </BattleRoomContext.Provider>
  );
}

export function useSharedBattleRoom(): BattleRoomApi {
  const ctx = useContext(BattleRoomContext);
  if (!ctx) {
    throw new Error("useSharedBattleRoom must be used within BattleRoomProvider");
  }
  return ctx;
}
