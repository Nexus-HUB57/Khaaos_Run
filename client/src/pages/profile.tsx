import { useAuth } from "@/hooks/use-auth";
import { usePlayer } from "@/hooks/use-player";
import { CyberCard } from "@/components/cyber-card";
import { User, Activity, Shield, Hash, Star, Swords, HeartPulse } from "lucide-react";

const RANK_DESCRIPTIONS: Record<string, string> = {
  ZHEERS: "Recruta — Início do alistamento. O caminho começa aqui.",
  ONITH: "Soldado — Primeiros combates, primeiros ciclos vencidos.",
  SKEETW: "Especialista — Habilidade reconhecida em batalha.",
  HURAN: "Sargento — Comando tático e experiência em campo.",
  VENEX: "Tenente — Liderança provada. Poucos chegam aqui.",
  KHAEL: "Capitão — Mestre da guerra. Respeitado por todos.",
  MALAKOR: "Comandante — A elite dos sobreviventes.",
  OVERLORD: "Overlord — O Soberano do Khaaos. Lenda viva.",
};

const RANK_ORDER = ["ZHEERS","ONITH","SKEETW","HURAN","VENEX","KHAEL","MALAKOR","OVERLORD"];

export default function Profile() {
  const { user } = useAuth();
  const { data: playerData } = usePlayer();

  if (!playerData) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { stats } = playerData;
  const rankIdx = RANK_ORDER.indexOf(stats.rank);
  const rankProgress = rankIdx >= 0 ? ((rankIdx + 1) / RANK_ORDER.length) * 100 : 12.5;
  const rankDesc = RANK_DESCRIPTIONS[stats.rank] || "Posto desconhecido.";

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
            <span className="text-3xl font-display font-bold text-accent">{stats.rank.substring(0, 2)}</span>
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
                POSTO: {stats.rank}
              </span>
            </div>

            {/* Rank Progress */}
            <div className="mb-5 max-w-md mx-auto md:mx-0">
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground tracking-widest mb-1.5">
                <span>PROGRESSÃO DE POSTO</span>
                <span className="text-accent">{rankIdx + 1} / {RANK_ORDER.length}</span>
              </div>
              <div className="h-1.5 bg-black/60 rounded-none overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${rankProgress}%`,
                    background: "linear-gradient(90deg, hsl(25 95% 55%), hsl(45 90% 55%))"
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-2 leading-relaxed tracking-wide">{rankDesc}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="POSTO" value={stats.rank} icon={Hash} color="text-primary" />
              <StatBox label="XP (Accur)" value={`${stats.xp}`} icon={Star} color="text-accent" />
              <StatBox label="VL (Life)" value={stats.maxHealth} icon={HeartPulse} color="text-red-400" />
              <StatBox label="NRG" value={stats.maxEnergy} icon={Swords} color="text-amber-400" />
            </div>
          </div>
        </div>
      </CyberCard>

      {/* Rank Ladder */}
      <CyberCard title="POSTOS DE COMANDO" subtitle="HIERARQUIA DO KHAAOS RUN">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {RANK_ORDER.map((rank, i) => {
            const isCurrentRank = rank === stats.rank;
            const isPast = i < rankIdx;
            return (
              <div
                key={rank}
                className={`p-3 border text-center transition-all ${
                  isCurrentRank
                    ? "border-primary/60 bg-primary/10 shadow-[0_0_12px_-3px_hsla(25,95%,55%,0.3)]"
                    : isPast
                    ? "border-border/40 bg-black/20 opacity-60"
                    : "border-border/20 bg-black/10 opacity-40"
                }`}
              >
                <div className={`text-lg font-display font-bold mb-0.5 ${isCurrentRank ? "text-primary text-glow-primary" : isPast ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                  {rank.substring(0, 2)}
                </div>
                <div className={`text-[10px] font-mono tracking-widest ${isCurrentRank ? "text-primary" : "text-muted-foreground"}`}>{rank}</div>
                {isCurrentRank && <div className="mt-1 text-[9px] font-mono text-primary/60 tracking-widest">← ATUAL</div>}
              </div>
            );
          })}
        </div>
      </CyberCard>
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
