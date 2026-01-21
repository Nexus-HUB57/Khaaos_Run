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
  AlertTriangle, 
  DollarSign, 
  Coins 
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
          title: "CREDITS RECEIVED",
          description: `Successfully claimed ${data.amount} KRC.`,
          className: "border-primary text-primary font-mono",
        });
      },
      onError: (error) => {
        toast({
          title: "ACCESS DENIED",
          description: error.message,
          variant: "destructive",
          className: "border-destructive text-destructive font-mono",
        });
      }
    });
  };

  if (isPlayerLoading || isBankLoading) {
    return <DashboardSkeleton />;
  }

  const { stats } = playerData || { stats: {} as any };
  const bank = bankData || { weaponsBalance: "0", bonusBalance: "0", fbmBalance: "0" };

  // Calculate salary status
  const lastSalary = stats.lastSalaryDate ? new Date(stats.lastSalaryDate) : null;
  const canClaim = !lastSalary || (new Date().getTime() - lastSalary.getTime() > 24 * 60 * 60 * 1000);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Welcome & Status - Full Width */}
      <div className="col-span-1 md:col-span-3">
        <CyberCard className="bg-gradient-to-r from-card to-card/50">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-white mb-1">
                WELCOME BACK, <span className="text-primary">{user?.firstName?.toUpperCase()}</span>
              </h1>
              <p className="text-muted-foreground font-mono flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                SYSTEM STATUS: OPTIMAL // RANK: {stats.rank}
              </p>
            </div>
            
            <Button 
              size="lg"
              className="font-display tracking-widest bg-primary hover:bg-primary/90 text-black font-bold shadow-[0_0_15px_rgba(0,255,65,0.4)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleClaim}
              disabled={!canClaim || isClaiming}
            >
              {isClaiming ? "PROCESSING..." : canClaim ? "CLAIM DAILY RATIONS" : "RATIONS CLAIMED"}
            </Button>
          </div>
        </CyberCard>
      </div>

      {/* Financial Overview - Column 1 */}
      <CyberCard title="FINANCIAL ASSETS" subtitle="CURRENT HOLDINGS" className="col-span-1">
        <div className="space-y-6">
          <div className="flex items-center justify-between p-3 bg-black/30 border border-white/5 rounded">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-mono">WEAPONS BALANCE</p>
                <p className="text-xl font-display font-bold">{bank.weaponsBalance} <span className="text-xs text-muted-foreground">KRC</span></p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-black/30 border border-white/5 rounded">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 text-yellow-400 rounded">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-mono">BONUS BALANCE</p>
                <p className="text-xl font-display font-bold">{bank.bonusBalance} <span className="text-xs text-muted-foreground">KRC</span></p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-black/30 border border-white/5 rounded">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-mono">FBM BALANCE</p>
                <p className="text-xl font-display font-bold">{bank.fbmBalance} <span className="text-xs text-muted-foreground">KRC</span></p>
              </div>
            </div>
          </div>
        </div>
      </CyberCard>

      {/* Combat Stats - Column 2 */}
      <CyberCard title="OPERATIVE STATUS" subtitle="COMBAT READINESS" className="col-span-1">
        <div className="space-y-6">
           <div className="space-y-2">
             <div className="flex justify-between text-xs font-mono">
               <span className="text-muted-foreground">HEALTH INTEGRITY</span>
               <span className="text-red-500">{stats.health} / {stats.maxHealth}</span>
             </div>
             <Progress value={(stats.health / stats.maxHealth) * 100} className="h-2 bg-red-950" indicatorClassName="bg-red-500" />
           </div>

           <div className="space-y-2">
             <div className="flex justify-between text-xs font-mono">
               <span className="text-muted-foreground">ENERGY LEVELS</span>
               <span className="text-yellow-400">{stats.energy} / {stats.maxEnergy}</span>
             </div>
             <Progress value={(stats.energy / stats.maxEnergy) * 100} className="h-2 bg-yellow-950" indicatorClassName="bg-yellow-400" />
           </div>

           <div className="space-y-2">
             <div className="flex justify-between text-xs font-mono">
               <span className="text-muted-foreground">EXPERIENCE</span>
               <span className="text-blue-400">{stats.xp} XP</span>
             </div>
             <Progress value={Math.min((stats.xp / 1000) * 100, 100)} className="h-2 bg-blue-950" indicatorClassName="bg-blue-400" />
           </div>

           <div className="grid grid-cols-2 gap-4 pt-4">
             <div className="bg-black/40 p-3 rounded border border-white/5 text-center">
               <Shield className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
               <div className="text-sm font-bold font-display">LEVEL 1</div>
               <div className="text-[10px] text-muted-foreground font-mono">CLEARANCE</div>
             </div>
             <div className="bg-black/40 p-3 rounded border border-white/5 text-center">
               <TrendingUp className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
               <div className="text-sm font-bold font-display">{stats.rank}</div>
               <div className="text-[10px] text-muted-foreground font-mono">CLASS</div>
             </div>
           </div>
        </div>
      </CyberCard>

      {/* Recent Activity - Column 3 */}
      <CyberCard title="LOGS" subtitle="RECENT ACTIVITY" className="col-span-1">
        <div className="space-y-0 divide-y divide-white/5">
          {/* Mock logs since we don't fetch them here yet */}
          {[1, 2, 3].map((_, i) => (
             <div key={i} className="py-3 flex items-start gap-3">
               <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/50" />
               <div>
                 <p className="text-sm font-mono text-white">System login detected</p>
                 <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                   <Clock className="w-3 h-3" />
                   {format(new Date(), 'HH:mm:ss')} - {format(new Date(), 'dd MMM yyyy')}
                 </p>
               </div>
             </div>
          ))}
          {!lastSalary && (
             <div className="py-3 flex items-start gap-3">
               <div className="mt-1 w-1.5 h-1.5 rounded-full bg-yellow-500/50" />
               <div>
                 <p className="text-sm font-mono text-white">Initial deployment</p>
                 <p className="text-[10px] text-muted-foreground">Account created</p>
               </div>
             </div>
          )}
        </div>
      </CyberCard>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="col-span-3 h-32 bg-card/20 animate-pulse rounded border border-white/5" />
      <div className="col-span-1 h-64 bg-card/20 animate-pulse rounded border border-white/5" />
      <div className="col-span-1 h-64 bg-card/20 animate-pulse rounded border border-white/5" />
      <div className="col-span-1 h-64 bg-card/20 animate-pulse rounded border border-white/5" />
    </div>
  );
}
