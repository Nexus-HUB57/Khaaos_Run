/**
 * KHAAOS RUN — Ranking & Leaderboard
 * ELO, patente, histórico de partidas.
 */

import { useMyRanking, useLeaderboard, useMatchHistory, winRate, kdRatio, ratingDelta } from "@/hooks/use-ranking";
import { CyberCard } from "@/components/cyber-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trophy, TrendingUp, Swords, Target, Crown, Medal, Activity, History,
} from "lucide-react";
import { cn } from "@/lib/utils";

const RANK_COLOR: Record<string, string> = {
  ZHEERS: "text-gray-400",
  ONITH: "text-green-400",
  SKEETW: "text-cyan-400",
  HURAN: "text-blue-400",
  VENEX: "text-purple-400",
  KHAEL: "text-amber-400",
  MALAKOR: "text-orange-400",
  OVERLORD: "text-red-400",
};

function placementLabel(p: number) {
  if (p === 1) return { text: "1º", color: "text-amber-300" };
  if (p === 2) return { text: "2º", color: "text-gray-300" };
  if (p === 3) return { text: "3º", color: "text-orange-400" };
  if (p <= 5) return { text: `${p}º`, color: "text-cyan-400" };
  return { text: `${p}º`, color: "text-muted-foreground" };
}

export default function RankingPage() {
  const { data: me, isLoading: meLoading } = useMyRanking();
  const { data: board, isLoading: boardLoading } = useLeaderboard(50);
  const { data: history, isLoading: histLoading } = useMatchHistory(15);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-widest flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-400" />
          RANKING COMPETITIVO
        </h1>
        <p className="text-xs font-mono text-muted-foreground tracking-widest mt-1">
          ELO · PATENTE KR · HISTÓRICO DE PARTIDAS
        </p>
      </div>

      {/* Personal card */}
      <CyberCard className="border-amber-500/30 bg-gradient-to-r from-black/80 to-amber-950/20">
        {meLoading || !me ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              icon={<TrendingUp className="w-4 h-4 text-amber-400" />}
              label="ELO"
              value={String(me.rating ?? 1000)}
              accent="text-amber-300"
            />
            <Stat
              icon={<Crown className="w-4 h-4 text-cyan-400" />}
              label="PATENTE"
              value={me.rank}
              accent={RANK_COLOR[me.rank] || "text-foreground"}
            />
            <Stat
              icon={<Trophy className="w-4 h-4 text-emerald-400" />}
              label="WIN RATE"
              value={winRate(me.wins, me.matchesPlayed)}
              sub={`${me.wins}W / ${me.matchesPlayed}P`}
            />
            <Stat
              icon={<Swords className="w-4 h-4 text-red-400" />}
              label="K/D"
              value={kdRatio(me.kills, me.deaths)}
              sub={`${me.seasonKills} kills temporada`}
            />
          </div>
        )}
        {me && (
          <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-mono text-muted-foreground">
            <Badge variant="outline" className="border-white/10">
              TOP5: {me.top5}
            </Badge>
            <Badge variant="outline" className="border-white/10">
              XP: {me.xp}
            </Badge>
            <Badge variant="outline" className="border-white/10">
              ABATES: {me.kills} · MORTES: {me.deaths}
            </Badge>
          </div>
        )}
      </CyberCard>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Leaderboard */}
        <CyberCard className="lg:col-span-3 border-cyan-500/20">
          <h2 className="font-display tracking-widest text-xs text-cyan-300 mb-4 flex items-center gap-2">
            <Medal className="w-4 h-4" /> LEADERBOARD
          </h2>
          {boardLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 bg-white/5" />
              ))}
            </div>
          ) : !board?.length ? (
            <p className="text-sm font-mono text-muted-foreground py-8 text-center">
              Nenhuma partida ranqueada ainda. Jogue e suba no ranking.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-1 text-[10px] font-mono text-muted-foreground px-2 pb-2 border-b border-white/5">
                <div className="col-span-1">#</div>
                <div className="col-span-3">OPERATIVO</div>
                <div className="col-span-2 text-right">ELO</div>
                <div className="col-span-2 text-right">W/P</div>
                <div className="col-span-2 text-right">K/D</div>
                <div className="col-span-2 text-right">TOP5</div>
              </div>
              {board.map((row, i) => (
                <div
                  key={row.userId}
                  className={cn(
                    "grid grid-cols-12 gap-1 items-center px-2 py-2 rounded text-xs font-mono",
                    i === 0 && "bg-amber-500/10 border border-amber-500/20",
                    i === 1 && "bg-gray-500/10",
                    i === 2 && "bg-orange-500/5",
                    i > 2 && "hover:bg-white/5",
                  )}
                >
                  <div className="col-span-1 text-muted-foreground">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </div>
                  <div className="col-span-3 truncate">
                    <div className="truncate text-foreground">
                      {row.displayName || row.userId.slice(0, 8)}
                    </div>
                    <div className={cn("text-[10px]", RANK_COLOR[row.rank] || "text-muted-foreground")}>
                      {row.rank}
                    </div>
                  </div>
                  <div className="col-span-2 text-right text-amber-300 font-bold">
                    {row.rating ?? 1000}
                  </div>
                  <div className="col-span-2 text-right text-muted-foreground">
                    {row.wins}/{row.matchesPlayed}
                  </div>
                  <div className="col-span-2 text-right">
                    {kdRatio(row.kills, row.deaths)}
                  </div>
                  <div className="col-span-2 text-right text-cyan-400">{row.top5 ?? 0}</div>
                </div>
              ))}
            </div>
          )}
        </CyberCard>

        {/* Match history */}
        <CyberCard className="lg:col-span-2 border-purple-500/20">
          <h2 className="font-display tracking-widest text-xs text-purple-300 mb-4 flex items-center gap-2">
            <History className="w-4 h-4" /> HISTÓRICO
          </h2>
          {histLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 bg-white/5" />
              ))}
            </div>
          ) : !history?.length ? (
            <p className="text-sm font-mono text-muted-foreground py-8 text-center">
              Sem partidas registradas.
            </p>
          ) : (
            <div className="space-y-2 max-h-[28rem] overflow-y-auto">
              {history.map((m) => {
                const pl = placementLabel(m.placement);
                const delta = m.ratingAfter - m.ratingBefore;
                return (
                  <div
                    key={m.id}
                    className="rounded border border-white/10 bg-black/40 p-3 text-xs font-mono"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className={cn("font-bold", pl.color)}>{pl.text}</span>
                      <span
                        className={cn(
                          "font-bold",
                          delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground",
                        )}
                      >
                        {ratingDelta(m.ratingBefore, m.ratingAfter)} ELO
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground text-[10px]">
                      <span>
                        <Target className="w-3 h-3 inline mr-1" />
                        {m.kills} kills · +{m.xpGained} XP
                      </span>
                      <span>
                        {m.createdAt
                          ? new Date(m.createdAt).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-1">
                      {m.ratingBefore} → {m.ratingAfter}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CyberCard>
      </div>

      <p className="text-[10px] font-mono text-muted-foreground text-center tracking-widest">
        <Activity className="w-3 h-3 inline mr-1" />
        ELO K=32 · XP por placement + kills · Patente derivada de XP
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded border border-white/10 bg-black/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground tracking-widest mb-1">
        {icon}
        {label}
      </div>
      <div className={cn("text-2xl font-display font-bold", accent || "text-foreground")}>
        {value}
      </div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
