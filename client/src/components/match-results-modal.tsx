/**
 * End-of-match results overlay — ELO, XP, placement.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSharedBattleRoom } from "@/hooks/battle-room-context";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Trophy, TrendingUp, Swords, X } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export function MatchResultsModal() {
  const { user } = useAuth();
  const localId = (user as any)?.id;
  const { lastMatchResult, clearLastMatchResult } = useSharedBattleRoom();
  const qc = useQueryClient();

  useEffect(() => {
    if (!lastMatchResult) return;
    // Refresh ranking + player after match
    qc.invalidateQueries({ queryKey: ["/api/ranking/me"] });
    qc.invalidateQueries({ queryKey: ["/api/ranking/leaderboard"] });
    qc.invalidateQueries({ queryKey: ["/api/ranking/history"] });
    qc.invalidateQueries({ queryKey: ["/api/player/me"] });
  }, [lastMatchResult, qc]);

  if (!lastMatchResult) return null;

  const myRow = lastMatchResult.rankings.find((r) => r.userId === localId);
  const sorted = [...lastMatchResult.rankings].sort(
    (a, b) => (a.placement ?? 99) - (b.placement ?? 99),
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-amber-500/40 bg-gradient-to-b from-zinc-950 to-black shadow-2xl shadow-amber-500/10">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="font-display tracking-widest text-amber-300 flex items-center gap-2">
            <Trophy className="w-5 h-5" /> FIM DE PARTIDA
          </h2>
          <button
            onClick={clearLastMatchResult}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {myRow && (
            <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-4 text-center">
              <div className="text-3xl font-display font-bold text-cyan-300">
                {myRow.placement === 1
                  ? "🏆 VITÓRIA"
                  : `${myRow.placement ?? "—"}º LUGAR`}
              </div>
              <div className="mt-2 flex justify-center gap-4 text-xs font-mono">
                <span className="text-red-400">
                  <Swords className="w-3 h-3 inline mr-1" />
                  {myRow.kills} kills
                </span>
                {myRow.xpGained != null && (
                  <span className="text-purple-300">+{myRow.xpGained} XP</span>
                )}
                {myRow.ratingAfter != null && (
                  <span className="text-amber-300">
                    <TrendingUp className="w-3 h-3 inline mr-1" />
                    ELO {myRow.ratingAfter}
                    {myRow.promoted && (
                      <span className="ml-1 text-emerald-400">↑ PROMOVIDO</span>
                    )}
                  </span>
                )}
              </div>
              {myRow.rankAfter && (
                <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                  Patente: {myRow.rankAfter}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1 max-h-48 overflow-y-auto">
            <div className="text-[10px] font-mono text-muted-foreground tracking-widest mb-2">
              CLASSIFICAÇÃO
            </div>
            {sorted.map((r, i) => (
              <div
                key={r.userId}
                className={cn(
                  "flex justify-between items-center rounded px-3 py-1.5 text-xs font-mono",
                  r.userId === localId
                    ? "bg-cyan-500/15 border border-cyan-500/30"
                    : "bg-white/5",
                  i === 0 && "text-amber-300",
                )}
              >
                <span>
                  {r.placement ?? i + 1}º · {r.userId.slice(0, 8)}
                  {r.userId === lastMatchResult.winnerId && " 👑"}
                </span>
                <span className="text-muted-foreground">
                  {r.kills}K
                  {r.xpGained != null ? ` · +${r.xpGained}XP` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-t border-white/10 px-5 py-4">
          <Link href="/ranking" className="flex-1">
            <Button
              className="w-full font-display tracking-wider bg-amber-600 hover:bg-amber-500"
              onClick={clearLastMatchResult}
            >
              VER RANKING
            </Button>
          </Link>
          <Link href="/lobby" className="flex-1">
            <Button
              variant="outline"
              className="w-full font-display tracking-wider"
              onClick={clearLastMatchResult}
            >
              NOVO LOBBY
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
