import { useItems, useUseItem, useRepairItem } from "@/hooks/use-items";
import { CyberCard } from "@/components/cyber-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Shield, Sword, Box, Zap, Wrench, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function Inventory() {
  const { data: items, isLoading } = useItems();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono text-muted-foreground tracking-widest animate-pulse">CARREGANDO WAR'I...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">WAR'I</h1>
          <p className="text-muted-foreground font-mono text-xs tracking-widest mt-1">
            ARMAZÉM BÉLICO — INVENTÁRIO DE GUERRA
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-[10px] font-mono text-muted-foreground tracking-widest">ARSENAL</p>
          <p className="font-display font-bold text-primary text-lg">{items?.length || 0} ITENS</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs font-mono">
        {[
          { label: "COMUM", color: "text-white/60 border-white/20" },
          { label: "RARO", color: "text-blue-400 border-blue-500/40" },
          { label: "ÉPICO", color: "text-purple-400 border-purple-500/40" },
          { label: "LENDÁRIO", color: "text-amber-400 border-amber-500/40" },
          { label: "MÍTICO", color: "text-red-400 border-red-500/40" },
        ].map(r => (
          <span key={r.label} className={cn("px-2 py-0.5 border rounded-sm tracking-widest", r.color)}>{r.label}</span>
        ))}
      </div>

      {items?.length === 0 ? (
        <div className="col-span-full py-16 text-center border border-dashed border-border/50 rounded-sm">
          <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground font-mono tracking-widest text-sm">WAR'I VAZIO</p>
          <p className="text-muted-foreground/50 font-mono text-xs mt-1 mb-4 tracking-widest">Visite a Forja do Armeiro para adquirir itens</p>
          <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 font-display tracking-widest text-xs" asChild>
            <a href="/market">FORJA DO ARMEIRO</a>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items?.map((item: any) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemCard({ item }: { item: any }) {
  const [showDetails, setShowDetails] = useState(false);
  const { mutate: useItem, isPending: isUsing } = useUseItem();
  const { mutate: repairItem, isPending: isRepairing } = useRepairItem();
  const { toast } = useToast();

  const rarityConfig: Record<string, { border: string; glow: string; label: string; badge: string }> = {
    COMUM:    { border: "border-white/20",       glow: "",                                                     label: "text-white/60",   badge: "bg-white/5 text-white/50" },
    RARO:     { border: "border-blue-500/50",     glow: "shadow-[0_0_12px_rgba(59,130,246,0.15)]",             label: "text-blue-400",   badge: "bg-blue-500/10 text-blue-400" },
    EPICO:    { border: "border-purple-500/60",   glow: "shadow-[0_0_12px_rgba(168,85,247,0.15)]",             label: "text-purple-400", badge: "bg-purple-500/10 text-purple-400" },
    LENDARIO: { border: "border-amber-500/60",    glow: "shadow-[0_0_14px_rgba(245,158,11,0.2)]",              label: "text-amber-400",  badge: "bg-amber-500/10 text-amber-400" },
    MITICO:   { border: "border-red-500/70",      glow: "shadow-[0_0_16px_rgba(239,68,68,0.25)]",              label: "text-red-400",    badge: "bg-red-500/10 text-red-400" },
  };

  const cfg = rarityConfig[item.rarity as string] || rarityConfig.COMUM;

  const Icon = {
    ARMA: Sword,
    DEFESA: Shield,
    CURATIVO: Box,
    UTILIDADE: Zap,
    RECURSO: Box,
  }[item.type as string] || Box;

  const durPct = (parseInt(item.durability) / parseInt(item.maxDurability)) * 100;
  const durColor = durPct > 60 ? "bg-primary" : durPct > 30 ? "bg-amber-500" : "bg-destructive";

  const handleUse = () => {
    useItem(item.id, {
      onSuccess: (data) => {
        toast({ title: "ITEM UTILIZADO", description: data.message, className: "border-primary text-primary" });
        setShowDetails(false);
      },
      onError: (err) => toast({ title: "ERRO", description: err.message, variant: "destructive" })
    });
  };

  const handleRepair = () => {
    repairItem({ id: item.id, amountKrc: 50 }, {
      onSuccess: () => {
        toast({ title: "REPARO CONCLUÍDO", description: "Durabilidade restaurada.", className: "border-primary text-primary" });
        setShowDetails(false);
      },
      onError: (err) => toast({ title: "REPARO FALHOU", description: err.message, variant: "destructive" })
    });
  };

  return (
    <>
      <div
        onClick={() => setShowDetails(true)}
        data-testid={`card-item-${item.id}`}
        className={cn(
          "aspect-square relative bg-card/50 backdrop-blur-sm border-2 p-4 cursor-pointer transition-all hover:scale-[1.03] hover:bg-card/70 group",
          cfg.border, cfg.glow
        )}
      >
        <div className={cn("absolute top-1.5 right-2 text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm", cfg.badge)}>
          {item.rarity}
        </div>
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <Icon className={cn("w-10 h-10 opacity-80 group-hover:opacity-100 transition-opacity", cfg.label)} />
          <div className="text-center">
            <h3 className="font-display font-bold text-xs tracking-wide text-foreground leading-tight">{item.name}</h3>
            <p className="text-[10px] font-mono opacity-50 tracking-widest mt-0.5">{item.type}</p>
          </div>
        </div>

        {/* Durability Bar */}
        <div className="absolute bottom-3 left-3 right-3 h-1 bg-black/60 rounded-none overflow-hidden">
          <div className={cn("h-full transition-all", durColor)} style={{ width: `${durPct}%` }} />
        </div>
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="bg-card border-primary/20 text-foreground max-w-sm">
          <div className="absolute top-0 left-0 w-3 h-3 border-l-2 border-t-2 border-primary/50" />
          <div className="absolute top-0 right-0 w-3 h-3 border-r-2 border-t-2 border-primary/50" />
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <Icon className={cn("w-6 h-6", cfg.label)} />
              <DialogTitle className="font-display tracking-widest text-base">{item.name}</DialogTitle>
            </div>
            <DialogDescription className="font-mono text-[11px] tracking-widest">
              {item.rarity} | {item.type} | DUR: {item.durability}/{item.maxDurability}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <div className="h-1.5 bg-black/50 rounded-none overflow-hidden">
              <div className={cn("h-full transition-all", durColor)} style={{ width: `${durPct}%` }} />
            </div>

            {item.stats && Object.keys(item.stats).length > 0 && (
              <div className="bg-black/30 p-3 border border-border/40 space-y-2">
                {Object.entries(item.stats as Record<string, number>).map(([key, val]) => (
                  <div key={key} className="flex justify-between text-xs font-mono">
                    <span className="text-muted-foreground uppercase tracking-widest">{key}</span>
                    <span className="text-primary font-bold">{val}</span>
                  </div>
                ))}
              </div>
            )}

            {parseInt(item.durability) < parseInt(item.maxDurability) && (
              <div className="p-2.5 border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-200 font-mono tracking-widest">
                CUSTO DE REPARO: 50 KRC
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            <Button variant="outline" className="flex-1 font-display tracking-widest text-xs" onClick={() => setShowDetails(false)}>FECHAR</Button>

            {parseInt(item.durability) < parseInt(item.maxDurability) && (
              <Button
                variant="secondary"
                className="flex-1 font-display tracking-widest text-xs"
                onClick={handleRepair}
                disabled={isRepairing}
              >
                <Wrench className="w-3 h-3 mr-1" /> REPARAR
              </Button>
            )}

            <Button
              className="flex-1 font-display tracking-widest text-xs border-0"
              style={{ background: "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 45%))", color: "hsl(260 25% 5%)" }}
              onClick={handleUse}
              disabled={isUsing || parseInt(item.durability) <= 0}
              data-testid={`button-use-item-${item.id}`}
            >
              USAR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
