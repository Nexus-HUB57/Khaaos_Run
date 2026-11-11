import { useCraftItem, useArmorerMaterials } from "@/hooks/use-items";
import { CyberCard } from "@/components/cyber-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Sword, Shield, Box, Hammer, Zap, Flame, Package, Pickaxe } from "lucide-react";
import { cn } from "@/lib/utils";
import { ARMORER_CATALOG, ARMORER_MATERIALS, type ArmorerProduct } from "@shared/armorer-catalog";

const MARKET_ICON = {
  sword: Sword,
  shield: Shield,
  box: Box,
  zap: Zap,
  flame: Flame,
  package: Package,
} as const;

const rarityStyle: Record<string, { badge: string; border: string; glow: string }> = {
  COMUM:    { badge: "bg-white/5 text-white/50",           border: "border-white/10",       glow: "" },
  RARO:     { badge: "bg-blue-500/10 text-blue-400",       border: "border-blue-500/20",    glow: "hover:shadow-[0_0_15px_rgba(59,130,246,0.1)]" },
  EPICO:    { badge: "bg-purple-500/10 text-purple-400",   border: "border-purple-500/20",  glow: "hover:shadow-[0_0_15px_rgba(168,85,247,0.12)]" },
  LENDARIO: { badge: "bg-amber-500/10 text-amber-400",     border: "border-amber-500/20",   glow: "hover:shadow-[0_0_18px_rgba(245,158,11,0.15)]" },
  MITICO:   { badge: "bg-red-500/10 text-red-400",         border: "border-red-500/20",     glow: "hover:shadow-[0_0_20px_rgba(239,68,68,0.18)]" },
};

export default function Market() {
  const { mutate: craft, isPending } = useCraftItem();
  const { data: balances = [], isLoading: materialsLoading, isError: materialsError } = useArmorerMaterials();
  const { toast } = useToast();
  const stock = new Map(balances.map((balance) => [balance.materialId, balance.quantity]));

  const canCraft = (item: ArmorerProduct) => item.recipe.every(
    (ingredient) => (stock.get(ingredient.materialId) ?? 0) >= ingredient.quantity,
  );

  const handleCraft = (item: ArmorerProduct) => {
    craft({ catalogId: item.id }, {
      onSuccess: () => toast({
        title: "FABRICAÇÃO CONCLUÍDA",
        description: `${item.name} fabricado e adicionado ao seu War’I. Materiais e taxa de serviço foram debitados.`,
        className: "border-primary text-primary",
      }),
      onError: (err) => toast({ title: "FABRICAÇÃO NEGADA", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">FORJA DO ARMEIRO</h1>
          <p className="text-muted-foreground font-mono text-xs tracking-widest mt-1">
            RECEITAS DE FABRICAÇÃO · MATERIAIS + SERVIÇO EM KRC
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-[10px] font-mono text-muted-foreground tracking-widest">STATUS</p>
          <p className="text-primary font-display font-bold text-sm animate-ember">BANCADA ATIVA</p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 border border-accent/20 bg-accent/5 text-sm">
        <div className="w-5 h-5 shrink-0 mt-0.5 text-accent"><Flame className="w-5 h-5" /></div>
        <p className="font-mono text-xs text-muted-foreground leading-relaxed tracking-wide">
          Escolha uma receita, reúna os componentes e pague a <span className="text-primary font-bold">mão de obra do Armeiro em KRC</span>.
          Metal, madeira, pólvora e outros recursos são encontrados como loot no campo. A raridade, o poder e a complexidade aumentam os materiais exigidos e o custo do serviço.
          O produto fabricado entra no seu <span className="text-accent font-bold">War’I</span>.
        </p>
      </div>

      <section aria-label="Estoque de materiais" className="border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Pickaxe className="w-4 h-4 text-accent" />
          <h2 className="font-display text-sm tracking-widest">SEU ESTOQUE DE MATÉRIAS-PRIMAS</h2>
          {materialsLoading && <span className="text-[10px] font-mono text-muted-foreground">SINCRONIZANDO…</span>}
          {materialsError && <span role="alert" className="text-[10px] font-mono text-destructive">FALHA AO CARREGAR ESTOQUE</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {ARMORER_MATERIALS.map((material) => {
            const style = rarityStyle[material.rarity] ?? rarityStyle.COMUM;
            return <div key={material.id} data-testid={`stock-${material.id}`} className="border border-border/70 bg-background/50 p-2">
              <p className="text-[9px] font-mono text-muted-foreground truncate" title={material.name}>{material.name}</p>
              <p className={cn("font-display font-bold text-lg", style.badge.includes("blue") ? "text-blue-400" : style.badge.includes("purple") ? "text-purple-400" : style.badge.includes("amber") ? "text-amber-400" : "text-foreground")}>{stock.get(material.id) ?? 0}</p>
            </div>;
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {ARMORER_CATALOG.map((item, idx) => {
          const rs = rarityStyle[item.rarity] || rarityStyle.COMUM;
          const Icon = MARKET_ICON[item.icon];
          const ready = canCraft(item);
          return (
            <div
              key={item.id}
              data-testid={`card-market-item-${idx}`}
              className={cn(
                "group relative bg-card/50 backdrop-blur-md border-2 p-5 transition-all duration-300 hover:bg-card/70 hover:border-primary/50 hover:shadow-[0_0_20px_-5px_hsla(25,95%,55%,0.2)]",
                rs.border, rs.glow,
              )}
            >
              <div className="absolute top-0 left-0 w-2.5 h-2.5 border-l-2 border-t-2 border-primary/30" />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-r-2 border-b-2 border-primary/30" />
              <div className={cn("absolute top-2 right-2 text-[10px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm", rs.badge)}>{item.rarity}</div>

              <div className="flex items-start gap-3 mb-4 pr-12">
                <div className="p-2.5 bg-black/40 border border-border/40 group-hover:border-primary/30 transition-colors shrink-0">
                  <Icon className="w-5 h-5 text-foreground/70 group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm text-foreground leading-tight">{item.name}</h3>
                  <p className="text-[10px] font-mono text-muted-foreground tracking-widest mt-0.5">{item.type}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground font-body leading-relaxed mb-4 min-h-[2.5rem]">{item.description}</p>

              <div className="border-y border-border/70 py-3 mb-3">
                <p className="text-[9px] font-mono tracking-widest text-muted-foreground mb-2">RECEITA · INGREDIENTES</p>
                <ul className="space-y-1.5">
                  {item.recipe.map((ingredient) => {
                    const material = ARMORER_MATERIALS.find((entry) => entry.id === ingredient.materialId)!;
                    const available = stock.get(material.id) ?? 0;
                    const enough = available >= ingredient.quantity;
                    return <li key={material.id} data-testid={`ingredient-${item.id}-${material.id}`} className="flex justify-between gap-2 text-[10px] font-mono">
                      <span className={enough ? "text-foreground/80" : "text-destructive"}>{material.name}</span>
                      <span className={enough ? "text-foreground/80" : "text-destructive"}>{available}/{ingredient.quantity}</span>
                    </li>;
                  })}
                </ul>
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-muted-foreground tracking-widest">TRABALHO DO ARMEIRO</span>
                <span data-testid={`labor-fee-${item.id}`} className="font-display font-bold text-lg text-primary">{item.armorerFeeKrc} <span className="text-xs text-muted-foreground font-mono">KRC</span></span>
              </div>

              <Button
                className="w-full font-display tracking-widest text-xs font-bold transition-all border-0 group-hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 45%))", color: "hsl(260 25% 5%)", boxShadow: "0 0 15px -5px hsla(25, 95%, 55%, 0.4)" }}
                onClick={() => handleCraft(item)}
                disabled={isPending || materialsLoading || materialsError || !ready}
                data-testid={`button-craft-${idx}`}
              >
                <Hammer className="w-3.5 h-3.5 mr-1.5" />
                {isPending ? "FABRICANDO…" : ready ? "FABRICAR" : "FALTAM MATERIAIS"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
