import { usePurchaseItem } from "@/hooks/use-items";
import { CyberCard } from "@/components/cyber-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Sword, Shield, Box, ShoppingCart, Zap, Flame, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const MARKET_ITEMS = [
  { name: "Lâmina Nano", type: "ARMA", price: 500, icon: Sword, rarity: "COMUM", desc: "Arma corpo a corpo padrão. Eficiente em combate próximo." },
  { name: "Rifle de Plasma", type: "ARMA", price: 1200, icon: Sword, rarity: "RARO", desc: "Arma de alto impacto energético. Dano devastador à distância." },
  { name: "Colete de Kevlar", type: "DEFESA", price: 800, icon: Shield, rarity: "COMUM", desc: "Proteção balística básica. Absorve impacto de projéteis." },
  { name: "Escudo Tático", type: "DEFESA", price: 2000, icon: Shield, rarity: "EPICO", desc: "Barreira defensiva avançada. Alta resistência ao dano." },
  { name: "Stim Pack", type: "CURATIVO", price: 100, icon: Box, rarity: "COMUM", desc: "Restaura 20 HP instantaneamente. Essencial na PackBack." },
  { name: "Célula de Energia", type: "UTILIDADE", price: 150, icon: Zap, rarity: "COMUM", desc: "Recarrega as reservas de energia do operativo." },
  { name: "Granada de Fragmentação", type: "ARMA", price: 600, icon: Flame, rarity: "RARO", desc: "Explosivo de área. Causa dano múltiplo em batalha." },
  { name: "Kit Médico Avançado", type: "CURATIVO", price: 350, icon: Package, rarity: "EPICO", desc: "Restaura 80 HP e remove debuffs. Item premium." },
];

const rarityStyle: Record<string, { badge: string; border: string; glow: string }> = {
  COMUM:    { badge: "bg-white/5 text-white/50",           border: "border-white/10",       glow: "" },
  RARO:     { badge: "bg-blue-500/10 text-blue-400",       border: "border-blue-500/20",    glow: "hover:shadow-[0_0_15px_rgba(59,130,246,0.1)]" },
  EPICO:    { badge: "bg-purple-500/10 text-purple-400",   border: "border-purple-500/20",  glow: "hover:shadow-[0_0_15px_rgba(168,85,247,0.12)]" },
  LENDARIO: { badge: "bg-amber-500/10 text-amber-400",     border: "border-amber-500/20",   glow: "hover:shadow-[0_0_18px_rgba(245,158,11,0.15)]" },
};

export default function Market() {
  const { mutate: purchase, isPending } = usePurchaseItem();
  const { toast } = useToast();

  const handleBuy = (item: typeof MARKET_ITEMS[0]) => {
    purchase({ type: item.type, name: item.name }, {
      onSuccess: () => toast({
        title: "AQUISIÇÃO CONFIRMADA",
        description: `${item.name} adicionado ao seu War'I.`,
        className: "border-primary text-primary"
      }),
      onError: (err) => toast({ title: "TRANSAÇÃO NEGADA", description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">FORJA DO ARMEIRO</h1>
          <p className="text-muted-foreground font-mono text-xs tracking-widest mt-1">
            LOJA OFICIAL DO KR — AQUISIÇÃO DE ARSENAL
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-[10px] font-mono text-muted-foreground tracking-widest">STATUS</p>
          <p className="text-primary font-display font-bold text-sm animate-ember">FORJA ATIVA</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 border border-accent/20 bg-accent/5 text-sm">
        <div className="w-5 h-5 shrink-0 mt-0.5 text-accent">
          <Flame className="w-5 h-5" />
        </div>
        <p className="font-mono text-xs text-muted-foreground leading-relaxed tracking-wide">
          Todos os itens adquiridos na Forja são armazenados no seu <span className="text-accent font-bold">War'I (Arsenal)</span>.
          Itens levados à batalha via <span className="text-primary font-bold">PackBack Tática</span> podem ser pilhados em caso de derrota.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {MARKET_ITEMS.map((item, idx) => {
          const rs = rarityStyle[item.rarity] || rarityStyle.COMUM;
          return (
            <div
              key={idx}
              data-testid={`card-market-item-${idx}`}
              className={cn(
                "group relative bg-card/50 backdrop-blur-md border-2 p-5 transition-all duration-300 hover:bg-card/70 hover:border-primary/50 hover:shadow-[0_0_20px_-5px_hsla(25,95%,55%,0.2)]",
                rs.border, rs.glow
              )}
            >
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-2.5 h-2.5 border-l-2 border-t-2 border-primary/30" />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-r-2 border-b-2 border-primary/30" />

              {/* Rarity badge */}
              <div className={cn("absolute top-2 right-2 text-[10px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm", rs.badge)}>
                {item.rarity}
              </div>

              <div className="flex items-start gap-3 mb-4 pr-12">
                <div className="p-2.5 bg-black/40 border border-border/40 group-hover:border-primary/30 transition-colors shrink-0">
                  <item.icon className="w-5 h-5 text-foreground/70 group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm text-foreground leading-tight">{item.name}</h3>
                  <p className="text-[10px] font-mono text-muted-foreground tracking-widest mt-0.5">{item.type}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground font-body leading-relaxed mb-5 min-h-[2.5rem]">{item.desc}</p>

              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-muted-foreground tracking-widest">PREÇO</span>
                <span className="font-display font-bold text-xl text-primary text-glow-primary">{item.price} <span className="text-xs text-muted-foreground font-mono">KRC</span></span>
              </div>

              <Button
                className="w-full font-display tracking-widest text-xs font-bold transition-all border-0 group-hover:scale-[1.02]"
                style={{
                  background: "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 45%))",
                  color: "hsl(260 25% 5%)",
                  boxShadow: "0 0 15px -5px hsla(25, 95%, 55%, 0.4)"
                }}
                onClick={() => handleBuy(item)}
                disabled={isPending}
                data-testid={`button-buy-${idx}`}
              >
                <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                {isPending ? "PROCESSANDO..." : "ADQUIRIR"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
