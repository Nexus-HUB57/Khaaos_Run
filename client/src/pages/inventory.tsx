import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useItems, useSetItemEquipped, useUseItem, useRepairItem } from "@/hooks/use-items";
import type { Item } from "@shared/routes";
import { canUseItemOutsideMatch, getWarICategory, getWarIUseKind, hasValidWarIDurability, type WarICategory } from "@shared/war-i";
import { useSharedBattleRoom } from "@/hooks/battle-room-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Backpack, Box, Check, Crosshair, Package, Search, Shield,
  Sword, Wrench, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const COMPARTMENTS: Array<{ id: "TODOS" | WarICategory | "PACKBACK"; label: string; icon: typeof Package }> = [
  { id: "TODOS", label: "ARSENAL", icon: Package },
  { id: "ARMAMENTO", label: "ARMAMENTO", icon: Sword },
  { id: "DEFESA", label: "DEFESA", icon: Shield },
  { id: "BAG", label: "BAG", icon: Backpack },
  { id: "PACKBACK", label: "PACKBACK", icon: Crosshair },
];

const RARITY_STYLE: Record<string, { border: string; glow: string; label: string; badge: string }> = {
  COMUM: { border: "border-white/20", glow: "", label: "text-white/60", badge: "bg-white/5 text-white/50" },
  RARO: { border: "border-blue-500/50", glow: "shadow-[0_0_12px_rgba(59,130,246,0.15)]", label: "text-blue-400", badge: "bg-blue-500/10 text-blue-400" },
  EPICO: { border: "border-purple-500/60", glow: "shadow-[0_0_12px_rgba(168,85,247,0.15)]", label: "text-purple-400", badge: "bg-purple-500/10 text-purple-400" },
  LENDARIO: { border: "border-amber-500/60", glow: "shadow-[0_0_14px_rgba(245,158,11,0.2)]", label: "text-amber-400", badge: "bg-amber-500/10 text-amber-400" },
  MITICO: { border: "border-red-500/70", glow: "shadow-[0_0_16px_rgba(239,68,68,0.25)]", label: "text-red-400", badge: "bg-red-500/10 text-red-400" },
};

const TYPE_ICON: Record<string, typeof Package> = {
  ARMA: Sword,
  DEFESA: Shield,
  CURATIVO: Box,
  UTILIDADE: Zap,
  RECURSO: Package,
};

function countFor(compartment: string, items: Item[]) {
  if (compartment === "TODOS") return items.length;
  if (compartment === "PACKBACK") return items.filter((item) => item.isEquipped).length;
  return items.filter((item) => getWarICategory(item.type) === compartment).length;
}

export default function Inventory() {
  const { data: items = [], isLoading, isError, refetch } = useItems();
  const { room } = useSharedBattleRoom();
  const loadoutLocked = room?.status === "COUNTDOWN" || room?.status === "IN_PROGRESS";
  const [activeCompartment, setActiveCompartment] = useState<(typeof COMPARTMENTS)[number]["id"]>("TODOS");
  const [search, setSearch] = useState("");
  const selectedItems = items.filter((item) => item.isEquipped);
  const battleReadyItems = selectedItems.filter((item) => hasValidWarIDurability(item.durability, item.maxDurability));
  const unusableEquippedItems = selectedItems.length - battleReadyItems.length;
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      const inCompartment = activeCompartment === "TODOS"
        || (activeCompartment === "PACKBACK" ? Boolean(item.isEquipped) : getWarICategory(item.type) === activeCompartment);
      const matchesSearch = !query || `${item.name} ${item.type} ${item.rarity}`.toLocaleLowerCase("pt-BR").includes(query);
      return inCompartment && matchesSearch;
    });
  }, [activeCompartment, items, search]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono text-muted-foreground tracking-widest animate-pulse">CARREGANDO WAR’I...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <section className="py-20 text-center border border-destructive/30 bg-destructive/5">
        <Activity className="w-8 h-8 text-destructive mx-auto mb-3" />
        <h2 className="font-display text-lg">FALHA AO ABRIR O ARSENAL</h2>
        <p className="text-sm text-muted-foreground mt-2">Não foi possível sincronizar seu War’I.</p>
        <Button variant="outline" className="mt-5" onClick={() => refetch()}>TENTAR NOVAMENTE</Button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-5 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <p className="text-[10px] font-mono tracking-[0.3em] text-primary mb-2">QG-WAR’I / ARMAZÉM BÉLICO</p>
          <h1 className="text-3xl font-display font-bold text-foreground">WAR’I</h1>
          <p className="text-muted-foreground font-mono text-xs tracking-widest mt-1">ARSENAL, SUPRIMENTOS E EQUIPAMENTO DE COMBATE</p>
        </div>
        <div className="flex gap-3">
          <Summary value={items.length} label="ITENS NO ARSENAL" />
          <Summary value={selectedItems.length} label="NA PACKBACK" accent />
        </div>
      </header>

      <section aria-label="PackBack Tática" className="relative overflow-hidden border border-primary/30 bg-primary/[0.06] p-4 sm:p-5">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-primary/[0.07] to-transparent pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 border border-primary/30 bg-black/30 text-primary"><Backpack className="w-5 h-5" /></div>
            <div>
              <h2 className="font-display font-bold tracking-widest text-sm">PACKBACK TÁTICA</h2>
              <p className="mt-1 text-xs text-muted-foreground font-mono leading-relaxed">
                O loadout é congelado no countdown. Cura, granadas e reconhecimento são acionados pela interface da Zona durante o match.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 md:justify-end">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">EQUIPADOS</span>
            <span className="font-display text-xl font-bold text-primary">{selectedItems.length}</span>
            <Button variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => setActiveCompartment("PACKBACK")}>
              REVISAR LOADOUT
            </Button>
          </div>
        </div>
        {selectedItems.length > 0 && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {selectedItems.slice(0, 8).map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1.5 border border-primary/20 bg-black/30 px-2 py-1 text-[10px] font-mono text-foreground/80">
                <Check className="w-3 h-3 text-primary" />{item.name}
              </span>
            ))}
            {selectedItems.length > 8 && <span className="px-2 py-1 text-[10px] font-mono text-muted-foreground">+{selectedItems.length - 8} OUTROS</span>}
          </div>
        )}
        <div className="relative mt-4 border-t border-primary/15 pt-3">
          {loadoutLocked ? (
            <p role="status" className="text-[10px] font-mono tracking-wider text-amber-200">
              LOADOUT CONGELADO — alterações valem para a próxima batalha.
            </p>
          ) : (
            <>
              <p className="text-[10px] font-mono tracking-wider text-muted-foreground">
                PRONTOS PARA A BATALHA <span className="font-bold text-primary">{battleReadyItems.length}/{selectedItems.length}</span>
              </p>
              {unusableEquippedItems > 0 && (
                <p role="status" className="mt-1 text-[10px] font-mono text-amber-200">
                  {unusableEquippedItems} item(ns) equipado(s) sem durabilidade válida ficam no War’I e não concedem bônus nesta partida. Repare-os ou remova-os da PackBack.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <nav aria-label="Compartimentos do WarBag" className="flex gap-1 overflow-x-auto border-b border-border">
          {COMPARTMENTS.map(({ id, label, icon: Icon }) => {
            const active = activeCompartment === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveCompartment(id)}
                className={cn(
                  "shrink-0 flex items-center gap-2 border-b-2 px-3 py-2.5 font-mono text-[10px] tracking-widest transition-colors",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-3.5 h-3.5" />{label}
                <span className={cn("text-[9px]", active ? "text-primary/70" : "text-muted-foreground/60")}>{countFor(id, items)}</span>
              </button>
            );
          })}
        </nav>
        <label className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="BUSCAR NO WAR’I..."
            aria-label="Buscar itens no War’I"
            className="pl-9 pr-9 h-10 bg-black/30 border-border font-mono text-xs tracking-wider"
          />
          {search && <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
        </label>
      </div>

      {items.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border/50 rounded-sm">
          <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-muted-foreground font-mono tracking-widest text-sm">WAR’I VAZIO</h2>
          <p className="text-muted-foreground/60 font-mono text-xs mt-2 mb-4 tracking-widest">Adquira equipamento na Forja ou colete itens no Ring.</p>
          <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 font-display tracking-widest text-xs" asChild>
            <Link href="/market">FORJA DO ARMEIRO</Link>
          </Button>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="py-14 text-center border border-dashed border-border/50">
          <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-mono text-sm tracking-widest">NENHUM ITEM NESTE FILTRO</p>
          <p className="text-muted-foreground/60 font-mono text-xs mt-2">Ajuste a busca ou escolha outro compartimento.</p>
          <Button variant="ghost" className="mt-3 text-primary" onClick={() => { setSearch(""); setActiveCompartment("TODOS"); }}>LIMPAR FILTROS</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {visibleItems.map((item) => <ItemCard key={item.id} item={item} loadoutLocked={loadoutLocked} />)}
        </div>
      )}
      <p className="text-[10px] font-mono text-muted-foreground/60 tracking-widest">
        WAR’I / {activeCompartment === "TODOS" ? "ARSENAL COMPLETO" : activeCompartment} / {visibleItems.length} REGISTRO(S)
      </p>
    </div>
  );
}

function Summary({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="text-right border-l border-border pl-3">
      <p className="text-[9px] font-mono text-muted-foreground tracking-widest">{label}</p>
      <p className={cn("font-display font-bold text-lg", accent ? "text-primary" : "text-foreground")}>{value.toString().padStart(2, "0")}</p>
    </div>
  );
}

function ItemCard({ item, loadoutLocked }: { item: Item; loadoutLocked: boolean }) {
  const [showDetails, setShowDetails] = useState(false);
  const { mutate: useItem, isPending: isUsing } = useUseItem();
  const { mutate: repairItem, isPending: isRepairing } = useRepairItem();
  const { mutate: setEquipped, isPending: isUpdatingLoadout } = useSetItemEquipped();
  const { toast } = useToast();
  const rarity = RARITY_STYLE[item.rarity] ?? RARITY_STYLE.COMUM;
  const Icon = TYPE_ICON[item.type] ?? Package;
  const durability = Number.parseFloat(String(item.durability));
  const maxDurability = Number.parseFloat(String(item.maxDurability)) || 100;
  const currentDurability = Number.isFinite(durability) ? durability : 0;
  const durabilityPct = Math.max(0, Math.min(100, (currentDurability / maxDurability) * 100));
  const durabilityColor = durabilityPct > 60 ? "bg-primary" : durabilityPct > 30 ? "bg-amber-500" : "bg-destructive";
  const compartment = getWarICategory(item.type);
  const canUseOutsideMatch = canUseItemOutsideMatch(item.type, item.stats);

  const handleEquip = () => setEquipped({ id: item.id, isEquipped: !item.isEquipped }, {
    onSuccess: (updated) => toast({
      title: updated.isEquipped ? "ADICIONADO À PACKBACK" : "ITEM GUARDADO",
      description: updated.isEquipped ? `${item.name} está marcado no seu loadout.` : `${item.name} permanece no arsenal.`,
      className: "border-primary text-primary",
    }),
    onError: (error) => toast({ title: "LOADOUT NÃO ATUALIZADO", description: error.message, variant: "destructive" }),
  });

  const handleUse = () => useItem(item.id, {
    onSuccess: (data) => {
      toast({ title: "ITEM UTILIZADO", description: data.message, className: "border-primary text-primary" });
      setShowDetails(false);
    },
    onError: (error) => toast({ title: "ERRO", description: error.message, variant: "destructive" }),
  });

  const handleRepair = () => repairItem({ id: item.id, amountKrc: 50 }, {
    onSuccess: () => {
      toast({ title: "REPARO CONCLUÍDO", description: "Durabilidade restaurada.", className: "border-primary text-primary" });
      setShowDetails(false);
    },
    onError: (error) => toast({ title: "REPARO FALHOU", description: error.message, variant: "destructive" }),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDetails(true)}
        aria-label={`Ver detalhes de ${item.name}`}
        data-testid={`card-item-${item.id}`}
        className={cn(
          "aspect-square w-full text-left relative bg-card/50 backdrop-blur-sm border-2 p-4 transition-all hover:scale-[1.03] hover:bg-card/70 group",
          rarity.border, rarity.glow,
        )}
      >
        <div className={cn("absolute top-1.5 right-2 text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded-sm", rarity.badge)}>{item.rarity}</div>
        {item.isEquipped && <span className="absolute left-2 top-2 flex items-center gap-1 text-[8px] font-mono tracking-widest text-primary"><Check className="w-3 h-3" /> PACKBACK</span>}
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <Icon className={cn("w-10 h-10 opacity-80 group-hover:opacity-100 transition-opacity", rarity.label)} />
          <div className="text-center">
            <h3 className="font-display font-bold text-xs tracking-wide text-foreground leading-tight">{item.name}</h3>
            <p className="text-[10px] font-mono opacity-50 tracking-widest mt-1">{compartment} / {item.type}</p>
          </div>
        </div>
        <div className="absolute bottom-3 left-3 right-3 h-1 bg-black/60 overflow-hidden" aria-label={`Durabilidade: ${Math.round(durabilityPct)}%`}>
          <div className={cn("h-full transition-all", durabilityColor)} style={{ width: `${durabilityPct}%` }} />
        </div>
      </button>
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="bg-card border-primary/20 text-foreground max-w-sm">
          <div className="absolute top-0 left-0 w-3 h-3 border-l-2 border-t-2 border-primary/50" />
          <div className="absolute top-0 right-0 w-3 h-3 border-r-2 border-t-2 border-primary/50" />
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <Icon className={cn("w-6 h-6", rarity.label)} />
              <DialogTitle className="font-display tracking-widest text-base">{item.name}</DialogTitle>
            </div>
            <DialogDescription className="font-mono text-[11px] tracking-widest">
              {item.rarity} | {compartment} / {item.type} | DUR: {currentDurability}/{maxDurability}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="h-1.5 bg-black/50 overflow-hidden"><div className={cn("h-full transition-all", durabilityColor)} style={{ width: `${durabilityPct}%` }} /></div>
            {item.stats && Object.keys(item.stats).length > 0 && (
              <div className="bg-black/30 p-3 border border-border/40 space-y-2">
                {Object.entries(item.stats).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-xs font-mono">
                    <span className="text-muted-foreground uppercase tracking-widest">{key}</span>
                    <span className="text-primary font-bold">{value}</span>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              className={cn("w-full font-display tracking-widest text-xs", item.isEquipped ? "border-primary/40 text-primary" : "border-border")}
              onClick={handleEquip}
              disabled={isUpdatingLoadout || loadoutLocked}
              data-testid={`button-packback-${item.id}`}
            >
              {item.isEquipped ? <><Check className="w-3.5 h-3.5 mr-2" /> NA PACKBACK — REMOVER</> : <><Backpack className="w-3.5 h-3.5 mr-2" /> ADICIONAR À PACKBACK</>}
            </Button>
            {loadoutLocked && <p role="status" className="text-[10px] font-mono text-amber-300">LOADOUT CONGELADO DURANTE O COUNTDOWN E A PARTIDA.</p>}
            {loadoutLocked && getWarIUseKind(item.type, item.stats) && <p className="text-[10px] font-mono text-muted-foreground">Ação de combate disponível em ZONA → AÇÕES DA PACKBACK.</p>}
            {currentDurability < maxDurability && (
              <div className="p-2.5 border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-200 font-mono tracking-widest">CUSTO DE REPARO: 50 KRC</div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            <Button variant="outline" className="flex-1 font-display tracking-widest text-xs" onClick={() => setShowDetails(false)}>FECHAR</Button>
            {currentDurability < maxDurability && (
              <Button variant="secondary" className="flex-1 font-display tracking-widest text-xs" onClick={handleRepair} disabled={isRepairing}>
                <Wrench className="w-3 h-3 mr-1" /> REPARAR
              </Button>
            )}
            {canUseOutsideMatch && !loadoutLocked && (
              <Button
                className="flex-1 font-display tracking-widest text-xs border-0"
                style={{ background: "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 45%))", color: "hsl(260 25% 5%)" }}
                onClick={handleUse}
                disabled={isUsing || currentDurability <= 0}
                data-testid={`button-use-item-${item.id}`}
              >USAR CURA</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
