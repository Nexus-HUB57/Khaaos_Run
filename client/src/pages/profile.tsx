import { useAuth } from "@/hooks/use-auth";
import { usePlayer } from "@/hooks/use-player";
import { CyberCard } from "@/components/cyber-card";
import { User, Activity, Shield, Hash } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const { data: playerData } = usePlayer();

  if (!playerData) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <CyberCard className="relative overflow-hidden border-primary/30">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <User className="w-64 h-64" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start">
           <div className="w-32 h-32 rounded bg-black/50 border-2 border-primary flex items-center justify-center">
             <span className="text-4xl font-display font-bold text-primary">{playerData.stats.rank.substring(0, 2)}</span>
           </div>
           
           <div className="flex-1 text-center md:text-left">
             <h1 className="text-4xl font-display font-bold text-white mb-2">{user?.firstName} {user?.lastName}</h1>
             <p className="font-mono text-primary bg-primary/10 inline-block px-3 py-1 rounded mb-6">
               OPERATIVE ID: {user?.id?.split('-')[0]}
             </p>
             
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <StatBox label="RANK" value={playerData.stats.rank} icon={Hash} />
               <StatBox label="XP" value={playerData.stats.xp} icon={Shield} />
               <StatBox label="HEALTH" value={playerData.stats.maxHealth} icon={Activity} />
               <StatBox label="ENERGY" value={playerData.stats.maxEnergy} icon={Activity} />
             </div>
           </div>
        </div>
      </CyberCard>
    </div>
  );
}

function StatBox({ label, value, icon: Icon }: any) {
  return (
    <div className="bg-black/30 p-3 rounded border border-white/5 flex flex-col items-center justify-center">
      <Icon className="w-4 h-4 text-muted-foreground mb-1" />
      <span className="text-sm font-bold font-display text-white">{value}</span>
      <span className="text-[10px] text-muted-foreground font-mono uppercase">{label}</span>
    </div>
  );
}
