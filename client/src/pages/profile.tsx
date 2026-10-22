import { useAuth } from "@/hooks/use-auth";
import { usePlayer, useSelectSpecialization } from "@/hooks/use-player";
import { CyberCard } from "@/components/cyber-card";
import { Button } from "@/components/ui/button";
import { User, Activity, Shield, Hash, Star, Swords, HeartPulse, Trophy, TrendingUp } from "lucide-react";
import { useMyRanking, winRate, kdRatio } from "@/hooks/use-ranking";
import { useToast } from "@/hooks/use-toast";
import { FIGURES, figureSrc } from "@shared/figures";
import { Link } from "wouter";
import {
  canUnlockSpecialization,
  EP555_RANKS,
  EP555_SPECIALIZATIONS,
  getRankProgress,
} from "@shared/schema";

export default function Profile() {
  const { user } = useAuth();
  const { data: playerData } = usePlayer();
  const { data: ranking } = useMyRanking();
  const { mutate: selectSpecialization, isPending: isSelecting } = useSelectSpecialization();
  const { toast } = useToast();

  if (!playerData) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { stats } = playerData;
  const progression = getRankProgress(stats.xp ?? 0);
  const rankIdx = EP555_RANKS.findIndex(({ id }) => id === progression.rank);
  const currentRank = EP555_RANKS[rankIdx];
  const activeSpecialization = EP555_SPECIALIZATIONS.find(({ id }) => id === stats.specializationId);

  const handleSelectSpecialization = (specializationId: string) => {
    selectSpecialization(specializationId, {
      onSuccess: () => toast({ title: "CERTIFICAÇÃO REGISTRADA", description: "Especialidade atualizada no seu QG-WAR'I." }),
      onError: (error) => toast({ title: "REQUISITOS NÃO ATINGIDOS", description: error.message, variant: "destructive" }),
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Hero Card */}
      <CyberCard className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle at 70% 50%, hsl(25 95% 55%) 0%, transparent 60%)" }}
        />
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <User className="w-64 h-64" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start">
          {/* Avatar Placeholder */}
          <div className="w-32 h-32 border-2 border-accent/60 bg-black/50 flex flex-col items-center justify-center shrink-0 relative"
            style={{ boxShadow: "0 0 20px -5px hsla(45,90%,55%,0.3)" }}
          >
            <div className="absolute top-0 left-0 w-3 h-3 border-l-2 border-t-2 border-accent/60" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-accent/60" />
            <span className="text-3xl font-display font-bold text-accent">{progression.rank.substring(0, 2)}</span>
            <span className="text-[9px] font-mono text-muted-foreground tracking-widest mt-1">AVATAR</span>
          </div>

          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-1">
              {user?.firstName} {user?.lastName}
            </h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-5">
              <span className="font-mono text-primary bg-primary/10 border border-primary/20 px-3 py-1 text-xs tracking-widest">
                ID: {user?.id?.split('-')[0].toUpperCase()}
              </span>
              <span className="font-mono text-accent bg-accent/10 border border-accent/20 px-3 py-1 text-xs tracking-widest">
                POSTO: {progression.rank}
              </span>
              {ranking && (
                <span className="font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs tracking-widest">
                  ELO: {ranking.rating}
                </span>
              )}
            </div>

            {/* Rank Progress */}
            <div className="mb-5 max-w-md mx-auto md:mx-0">
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground tracking-widest mb-1.5">
                <span>PROGRESSÃO DE POSTO</span>
                <span className="text-accent">{rankIdx + 1} / {EP555_RANKS.length}</span>
              </div>
              <div className="h-1.5 bg-black/60 rounded-none overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${progression.progressPct}%`,
                    background: "linear-gradient(90deg, hsl(25 95% 55%), hsl(45 90% 55%))"
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-2 leading-relaxed tracking-wide">
                {currentRank.designation}
                {progression.nextRank
                  ? ` · ${progression.currentXp.toLocaleString("pt-BR")} / ${progression.nextThreshold?.toLocaleString("pt-BR")} XP · faltam ${progression.xpToNext.toLocaleString("pt-BR")} XP para ${progression.nextRank}`
                  : ` · ${progression.currentXp.toLocaleString("pt-BR")} XP · patente máxima`}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="POSTO" value={progression.rank} icon={Hash} color="text-primary" />
              <StatBox label="XP (Accur)" value={`${stats.xp}`} icon={Star} color="text-accent" />
              <StatBox label="VL (Life)" value={stats.maxHealth} icon={HeartPulse} color="text-red-400" />
              <StatBox label="NRG" value={stats.maxEnergy} icon={Swords} color="text-amber-400" />
            </div>
          </div>
        </div>
      </CyberCard>

      <CyberCard title="FIGURAS DE ALISTAMENTO" subtitle="RENDER 3D · A TABELA EP555 NÃO MUDA">
        <p className="mb-4 text-xs font-mono leading-relaxed tracking-wide text-muted-foreground">
          Seis corpos. Três masculinos, três femininos. Origem e marca são do rosto, não do dano.
          Idris Kane é a primeira placa realista. As outras cinco estão fechadas na ficha; o render entra quando o estúdio liberar.
          Malha riggada (GLB) ainda não exportada.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIGURES.map((figure) => (
            <article key={figure.id} className="border border-border/40 bg-black/30">
              {figure.render === "placa" ? (
                <img
                  src={figureSrc(figure.id)}
                  alt={`${figure.name}, render 3D de alistamento`}
                  className="aspect-[3/4] w-full object-cover object-top"
                />
              ) : (
                <div className="flex aspect-[3/4] items-end border-b border-border/30 bg-black/50 p-3">
                  <span className="font-mono text-[10px] tracking-widest text-muted-foreground">RENDER 3D PENDENTE</span>
                </div>
              )}
              <div className="p-3">
                <h3 className="font-display text-lg">{figure.name}</h3>
                <p className="font-mono text-[10px] tracking-widest text-primary">
                  {figure.sexLabel} · {figure.origin} · {figure.age}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{figure.build}</p>
                <p className="mt-1 text-xs">{figure.mark}</p>
              </div>
            </article>
          ))}
        </div>
      </CyberCard>

      {/* Rank Ladder */}
      <CyberCard title="POSTOS DE COMANDO" subtitle="HIERARQUIA DO KHAAOS RUN">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {EP555_RANKS.map((rank, i) => {
            const isCurrentRank = rank.id === progression.rank;
            const isPast = i < rankIdx;
            return (
              <div
                key={rank.id}
                className={`p-3 border text-center transition-all ${
                  isCurrentRank
                    ? "border-primary/60 bg-primary/10 shadow-[0_0_12px_-3px_hsla(25,95%,55%,0.3)]"
                    : isPast
                    ? "border-border/40 bg-black/20 opacity-60"
                    : "border-border/20 bg-black/10 opacity-40"
                }`}
              >
                <div className={`text-lg font-display font-bold mb-0.5 ${isCurrentRank ? "text-primary text-glow-primary" : isPast ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                  {rank.id.substring(0, 2)}
                </div>
                <div className={`text-[10px] font-mono tracking-widest ${isCurrentRank ? "text-primary" : "text-muted-foreground"}`}>{rank.id}</div>
                <div className="mt-1 text-[9px] font-mono text-muted-foreground">{rank.xpRequired.toLocaleString("pt-BR")} XP</div>
                {isCurrentRank && <div className="mt-1 text-[9px] font-mono text-primary/60 tracking-widest">← ATUAL</div>}
              </div>
            );
          })}
        </div>
      </CyberCard>

      <CyberCard title="CERTIFICAÇÕES DE COMBATE" subtitle="ESPECIALIZAÇÕES EP555 · REQUISITOS DE PATENTE + MORTH">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
          <span>MORTH REGISTRADO: {stats.kills ?? 0}</span>
          <span>
            ESPECIALIDADE ATIVA: {activeSpecialization
              ? `${activeSpecialization.name} · ${activeSpecialization.callsign}`
              : "NENHUMA"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EP555_SPECIALIZATIONS.map((specialization) => {
            const eligible = canUnlockSpecialization(specialization, stats.xp ?? 0, stats.kills ?? 0);
            const isActive = specialization.id === stats.specializationId;
            return (
              <div
                key={specialization.id}
                className={`flex min-h-36 flex-col justify-between border p-3 ${
                  isActive ? "border-cyan-400/60 bg-cyan-950/20" : eligible ? "border-primary/40 bg-primary/5" : "border-border/30 bg-black/20"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-sm font-bold text-foreground">{specialization.name}</h3>
                      <p className="mt-0.5 text-[10px] font-mono tracking-widest text-cyan-300">{specialization.callsign}</p>
                    </div>
                    <Shield className={`h-4 w-4 shrink-0 ${eligible ? "text-primary" : "text-muted-foreground/50"}`} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{specialization.focus}</p>
                  <p className="mt-2 text-[10px] font-mono text-muted-foreground">
                    PATENTE {specialization.rank} · {specialization.morthRequired.toLocaleString("pt-BR")} MORTH
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={isActive ? "outline" : "default"}
                  className="mt-3 w-full font-mono text-[10px] tracking-widest"
                  disabled={!eligible || isActive || isSelecting}
                  onClick={() => handleSelectSpecialization(specialization.id)}
                >
                  {isActive ? "EM SERVIÇO" : eligible ? "ASSUMIR ESPECIALIDADE" : "REQUISITOS PENDENTES"}
                </Button>
              </div>
            );
          })}
        </div>
      </CyberCard>

      {/* Competitive ranking summary */}
      {ranking && (
        <CyberCard className="border-amber-500/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display tracking-widest text-xs text-amber-300 flex items-center gap-2">
              <Trophy className="w-4 h-4" /> RANKING COMPETITIVO
            </h2>
            <Link href="/ranking">
              <span className="text-[10px] font-mono text-cyan-400 hover:underline cursor-pointer">
                VER LEADERBOARD →
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-xl font-display font-bold text-amber-300">{ranking.rating}</div>
              <div className="text-[10px] font-mono text-muted-foreground">ELO</div>
            </div>
            <div>
              <div className="text-xl font-display font-bold text-emerald-400">{winRate(ranking.wins, ranking.matchesPlayed)}</div>
              <div className="text-[10px] font-mono text-muted-foreground">{ranking.wins}W / {ranking.matchesPlayed}P</div>
            </div>
            <div>
              <div className="text-xl font-display font-bold">{kdRatio(ranking.kills, ranking.deaths)}</div>
              <div className="text-[10px] font-mono text-muted-foreground">K/D</div>
            </div>
            <div>
              <div className="text-xl font-display font-bold text-cyan-400">{ranking.top5}</div>
              <div className="text-[10px] font-mono text-muted-foreground">TOP 5</div>
            </div>
          </div>
        </CyberCard>
      )}
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-black/30 p-3 border border-border/40 flex flex-col items-center justify-center gap-1">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm font-bold font-display text-foreground">{value}</span>
      <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">{label}</span>

    </div>
  );
}
