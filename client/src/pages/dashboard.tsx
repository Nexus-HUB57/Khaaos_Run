import { useAuth } from "@/hooks/use-auth";
import { usePlayer, useClaimDailySalary } from "@/hooks/use-player";
import { useBank } from "@/hooks/use-bank";
import { CyberCard } from "@/components/cyber-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  TrendingUp,
  Award,
  Clock,
  DollarSign,
  Coins,
  Flame,
  Sword,
  HeartPulse,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: playerData, isLoading: isPlayerLoading } = usePlayer();
  const { data: bankData, isLoading: isBankLoading } = useBank();
  const { mutate: claimSalary, isPending: isClaiming } = useClaimDailySalary();
  const { toast } = useToast();

  const handleClaim = () => {
    claimSalary(undefined, {
      onSuccess: (data) => {
        toast({
          title: "CRÉDITOS RECEBIDOS",
          description: `${data.amount} KRC depositados na sua Wallet.`,
          className: "border-primary text-primary font-mono",
        });
      },
      onError: (error) => {
        toast({
          title: "ACESSO NEGADO",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  if (isPlayerLoading || isBankLoading) return <DashboardSkeleton />;

  const { stats } = playerData || { stats: {} as any };
  const bank = bankData || { weaponsBalance: "0", bonusBalance: "0", fbmBalance: "0" };

  const lastSalary = stats.lastSalaryDate ? new Date(stats.lastSalaryDate) : null;
  const canClaim = !lastSalary || (new Date().getTime() - lastSalary.getTime() > 24 * 60 * 60 * 1000);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Welcome Banner */}
      <div className="col-span-1 md:col-span-3">
        <CyberCard className="relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(260 20% 8%) 0%, hsl(270 25% 10%) 100%)" } as any}
        >
          <div className="absolute inset-0 opacity-5"
            style={{ backgroundImage: "radial-gradient(circle at 80% 50%, hsl(25 95% 55%) 0%, transparent 60%)" }}
          />
          <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-1">
                BEM-VINDO, <span className="text-primary text-glow-primary">{user?.firstName?.toUpperCase()}</span>
              </h1>
              <p className="text-muted-foreground font-mono text-xs flex items-center gap-2 tracking-widest">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                POSTO: {stats.rank || 'ZHEERS'} // QG-WAR'I ONLINE
              </p>
            </div>

            <Button
              size="lg"
              className="font-display tracking-widest font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 border-0 shrink-0"
              style={{
                background: canClaim
                  ? "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 45%))"
                  : "hsl(265 15% 18%)",
                color: canClaim ? "hsl(260 25% 5%)" : "hsl(260 10% 45%)",
                boxShadow: canClaim ? "0 0 20px -5px hsla(25, 95%, 55%, 0.6)" : "none"
              }}
              onClick={handleClaim}
              disabled={!canClaim || isClaiming}
              data-testid="button-claim-salary"
            >
              <Coins className="w-4 h-4 mr-2" />
              {isClaiming ? "PROCESSANDO..." : canClaim ? "RECEBER SOLDAGEM DIÁRIA" : "SOLDAGEM COLETADA"}
            </Button>
          </div>
        </CyberCard>
      </div>

      {/* BanKhaaos Overview */}
      <CyberCard title="BANKHAAOS" subtitle="SALDO ATUAL — WALLET KRC" className="col-span-1">
        <div className="space-y-4">
          <BalanceRow icon={Sword} label="WEAPONS ACCOUNT" value={bank.weaponsBalance} iconColor="text-primary" />
          <BalanceRow icon={Award} label="BÔNUS ACCOUNT" value={bank.bonusBalance} iconColor="text-accent" />
          <BalanceRow icon={Coins} label="FBM — FUNDO BÉLICO" value={bank.fbmBalance} iconColor="text-purple-400" />

          <div className="pt-2 border-t border-border/40 flex justify-between items-center">
            <span className="text-xs font-mono text-muted-foreground tracking-widest">TOTAL KRC</span>
            <span className="font-display font-bold text-lg text-accent text-glow-gold">
              {(parseFloat(bank.weaponsBalance || "0") + parseFloat(bank.bonusBalance || "0") + parseFloat(bank.fbmBalance || "0")).toFixed(2)}
            </span>
          </div>
        </div>
      </CyberCard>

      {/* Vitalidade / Combat Stats */}
      <CyberCard title="STATUS OPERATIVO" subtitle="VITALLITY & ACCUR" className="col-span-1">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono tracking-widest">
              <span className="text-muted-foreground">VL — VITALIDADE LIFE</span>
              <span className="text-red-400">{stats.health} / {stats.maxHealth}</span>
            </div>
            <div className="h-2 rounded-none bg-red-950/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all"
                style={{ width: `${(stats.health / stats.maxHealth) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono tracking-widest">
              <span className="text-muted-foreground">NRG — ENERGIA</span>
              <span className="text-amber-400">{stats.energy} / {stats.maxEnergy}</span>
            </div>
            <div className="h-2 rounded-none bg-amber-950/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all"
                style={{ width: `${(stats.energy / stats.maxEnergy) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono tracking-widest">
              <span className="text-muted-foreground">XP — ACCUR POINTS</span>
              <span className="text-purple-400">{stats.xp} XP</span>
            </div>
            <div className="h-2 rounded-none bg-purple-950/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-700 to-purple-400 transition-all"
                style={{ width: `${Math.min((stats.xp / 1000) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="bg-black/40 p-3 border border-border/40 text-center">
              <Shield className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
              <div className="text-sm font-bold font-display text-foreground">NV. 1</div>
              <div className="text-[10px] text-muted-foreground font-mono tracking-widest">CLEARANCE</div>
            </div>
            <div className="bg-black/40 p-3 border border-border/40 text-center">
              <TrendingUp className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
              <div className="text-sm font-bold font-display text-primary">{stats.rank || 'ZHEERS'}</div>
              <div className="text-[10px] text-muted-foreground font-mono tracking-widest">POSTO</div>
            </div>
          </div>
        </div>
      </CyberCard>

      {/* Logs / Recent Activity */}
      <CyberCard title="LOGS DO SISTEMA" subtitle="ATIVIDADE RECENTE" className="col-span-1">
        <div className="space-y-0 divide-y divide-border/30">
          {[1, 2, 3].map((_, i) => (
            <div key={i} className="py-3 flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shadow-[0_0_4px_hsla(25,95%,55%,0.6)]" />
              <div>
                <p className="text-sm font-mono text-foreground">Login no QG-War'I detectado</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono mt-0.5 tracking-widest">
                  <Clock className="w-3 h-3" />
                  {format(new Date(), 'HH:mm:ss')} — {format(new Date(), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
          ))}
          {!lastSalary && (
            <div className="py-3 flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent/60 shadow-[0_0_4px_hsla(45,90%,55%,0.6)]" />
              <div>
                <p className="text-sm font-mono text-foreground">Alistamento concluído</p>
                <p className="text-[10px] text-muted-foreground font-mono tracking-widest">Conta criada — Posto: ZHEERS</p>
              </div>
            </div>
          )}
        </div>
      </CyberCard>
    </div>
  );
}

function BalanceRow({ icon: Icon, label, value, iconColor }: any) {
  return (
    <div className="flex items-center justify-between p-3 bg-black/30 border border-border/30 rounded-sm">
      <div className="flex items-center gap-3">
        <div className={`p-1.5 bg-black/40 rounded-sm ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-xs text-muted-foreground font-mono tracking-widest">{label}</p>
      </div>
      <p className="font-display font-bold text-lg text-foreground">
        {value} <span className="text-xs text-muted-foreground font-mono font-normal">KRC</span>
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="col-span-3 h-32 bg-card/20 animate-pulse rounded border border-border/30" />
      <div className="col-span-1 h-64 bg-card/20 animate-pulse rounded border border-border/30" />
      <div className="col-span-1 h-64 bg-card/20 animate-pulse rounded border border-border/30" />
      <div className="col-span-1 h-64 bg-card/20 animate-pulse rounded border border-border/30" />
    </div>
  );
}
