import { useItems, useUseItem, useRepairItem } from "@/hooks/use-items";
import { CyberCard } from "@/components/cyber-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Shield, Sword, Box, Zap, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

export default function Inventory() {
  const { data: items, isLoading } = useItems();
  
  if (isLoading) return <div className="text-center font-mono animate-pulse">LOADING ARMORY DATA...</div>;

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-6">
         <h1 className="text-3xl font-display font-bold text-white">ARMORY</h1>
         <p className="text-muted-foreground font-mono text-sm">EQUIPMENT MANAGEMENT & MAINTENANCE</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {items?.map((item: any) => (
          <ItemCard key={item.id} item={item} />
        ))}
        {items?.length === 0 && (
          <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded">
            <p className="text-muted-foreground font-mono">NO ITEMS IN INVENTORY</p>
            <Button variant="link" className="text-primary" asChild>
              <a href="/market">VISIT MARKET</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: any }) {
  const [showDetails, setShowDetails] = useState(false);
  const { mutate: useItem, isPending: isUsing } = useUseItem();
  const { mutate: repairItem, isPending: isRepairing } = useRepairItem();
  const { toast } = useToast();

  const rarityColor = {
    COMUM: "border-white/20 text-white",
    RARO: "border-blue-500/50 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]",
    EPICO: "border-purple-500/50 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)]",
    LENDARIO: "border-yellow-500/50 text-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.1)]",
    MITICO: "border-red-500/50 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)]",
  }[item.rarity as string] || "border-white/20";

  const Icon = {
    ARMA: Sword,
    DEFESA: Shield,
    CURATIVO: Box,
    UTILIDADE: Zap,
    RECURSO: Box
  }[item.type as string] || Box;

  const handleUse = () => {
    useItem(item.id, {
      onSuccess: (data) => {
        toast({ title: "ITEM USED", description: data.message, className: "border-primary text-primary" });
        setShowDetails(false);
      },
      onError: (err) => toast({ title: "ERROR", description: err.message, variant: "destructive" })
    });
  };

  const handleRepair = () => {
    // Basic repair logic - flat fee 50 KRC for now
    repairItem({ id: item.id, amountKrc: 50 }, {
      onSuccess: () => {
        toast({ title: "REPAIR COMPLETE", description: "Item durability restored.", className: "border-primary text-primary" });
        setShowDetails(false);
      },
      onError: (err) => toast({ title: "REPAIR FAILED", description: err.message, variant: "destructive" })
    });
  };

  return (
    <>
      <div 
        onClick={() => setShowDetails(true)}
        className={cn(
          "aspect-square relative bg-card/40 backdrop-blur-sm border-2 rounded-lg p-4 cursor-pointer transition-all hover:scale-105 hover:bg-card/60 group",
          rarityColor
        )}
      >
        <div className="absolute top-2 right-2 text-[10px] font-mono opacity-50 uppercase">{item.type}</div>
        <div className="h-full flex flex-col items-center justify-center gap-4">
          <Icon className="w-12 h-12 opacity-80 group-hover:opacity-100 transition-opacity" />
          <div className="text-center">
            <h3 className="font-display font-bold tracking-wide">{item.name}</h3>
            <p className="text-xs font-mono opacity-60 uppercase">{item.rarity}</p>
          </div>
        </div>
        
        {/* Durability Bar */}
        <div className="absolute bottom-4 left-4 right-4">
          <Progress value={(parseInt(item.durability) / parseInt(item.maxDurability)) * 100} className="h-1 bg-black/50" />
        </div>
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="bg-card border-primary/20 text-white max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <Icon className={cn("w-6 h-6", rarityColor.split(' ')[1])} />
              <DialogTitle className="font-display tracking-widest text-lg">{item.name}</DialogTitle>
            </div>
            <DialogDescription className="font-mono text-xs uppercase">
              {item.rarity} | {item.type} | DUR: {item.durability}/{item.maxDurability}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
             {/* Stats Display */}
             {item.stats && (
               <div className="bg-black/30 p-3 rounded border border-white/5 space-y-2">
                 {Object.entries(item.stats as Record<string, number>).map(([key, val]) => (
                   <div key={key} className="flex justify-between text-sm font-mono">
                     <span className="text-muted-foreground uppercase">{key}</span>
                     <span className="text-primary font-bold">{val}</span>
                   </div>
                 ))}
               </div>
             )}
             
             {parseInt(item.durability) < parseInt(item.maxDurability) && (
               <div className="p-3 border border-yellow-500/20 bg-yellow-500/5 rounded text-xs text-yellow-200 font-mono">
                 <p>REPAIR COST: 50 KRC</p>
               </div>
             )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
             <Button variant="outline" className="flex-1" onClick={() => setShowDetails(false)}>CLOSE</Button>
             
             {parseInt(item.durability) < parseInt(item.maxDurability) && (
               <Button 
                 variant="secondary" 
                 className="flex-1" 
                 onClick={handleRepair}
                 disabled={isRepairing}
               >
                 <Wrench className="w-4 h-4 mr-2" /> REPAIR
               </Button>
             )}

             <Button 
               className="flex-1 bg-primary text-black font-bold"
               onClick={handleUse}
               disabled={isUsing || parseInt(item.durability) <= 0}
             >
               USE
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
