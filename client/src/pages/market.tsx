import { usePurchaseItem } from "@/hooks/use-items";
import { CyberCard } from "@/components/cyber-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Sword, Shield, Box, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

const MARKET_ITEMS = [
  { name: "Nano-Blade", type: "ARMA", price: 500, icon: Sword, desc: "Standard issue melee weapon." },
  { name: "Plasma Rifle", type: "ARMA", price: 1200, icon: Sword, desc: "High energy ranged weapon." },
  { name: "Kevlar Vest", type: "DEFESA", price: 800, icon: Shield, desc: "Basic ballistic protection." },
  { name: "Stim Pack", type: "CURATIVO", price: 100, icon: Box, desc: "Restores 20 HP instantly." },
  { name: "Energy Cell", type: "UTILIDADE", price: 150, icon: Box, desc: "Refills energy reserves." },
];

export default function Market() {
  const { mutate: purchase, isPending } = usePurchaseItem();
  const { toast } = useToast();

  const handleBuy = (item: typeof MARKET_ITEMS[0]) => {
    purchase({ type: item.type, name: item.name }, {
      onSuccess: () => toast({ title: "PURCHASE SUCCESSFUL", description: `${item.name} added to inventory.`, className: "border-primary text-primary" }),
      onError: (err) => toast({ title: "TRANSACTION FAILED", description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-6 flex justify-between items-end">
         <div>
           <h1 className="text-3xl font-display font-bold text-white">BLACK MARKET</h1>
           <p className="text-muted-foreground font-mono text-sm">UNREGULATED TRADING ZONE</p>
         </div>
         <div className="text-right hidden md:block">
           <p className="text-xs text-muted-foreground font-mono">STATUS</p>
           <p className="text-green-500 font-bold font-display animate-pulse">OPEN FOR BUSINESS</p>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MARKET_ITEMS.map((item, idx) => (
          <CyberCard key={idx} className="group hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-white/5 rounded-lg group-hover:bg-primary/10 transition-colors">
                <item.icon className="w-6 h-6 text-white group-hover:text-primary transition-colors" />
              </div>
              <div className="text-right">
                <div className="font-display font-bold text-xl text-primary">{item.price} KRC</div>
                <div className="text-[10px] text-muted-foreground font-mono uppercase">{item.type}</div>
              </div>
            </div>
            
            <h3 className="font-bold text-white text-lg font-display mb-1">{item.name}</h3>
            <p className="text-sm text-muted-foreground mb-6 h-10">{item.desc}</p>
            
            <Button 
              className="w-full bg-white/5 hover:bg-primary hover:text-black border border-white/10 hover:border-primary font-display tracking-wider font-bold transition-all"
              onClick={() => handleBuy(item)}
              disabled={isPending}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              {isPending ? "PROCESSING..." : "PURCHASE"}
            </Button>
          </CyberCard>
        ))}
      </div>
    </div>
  );
}
