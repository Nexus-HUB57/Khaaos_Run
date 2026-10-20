import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CyberCard } from "@/components/cyber-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlayer, useSelectSpecialization } from "@/hooks/use-player";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  EP555_HIERARCHY_TIERS,
  EP555_SPECIALIZATION_DOCTRINES,
  WORLD_HIERARCHY_DAG,
  SUBMUNDO_KR_AUTHORITY_HIERARCHY,
  UE5_GAME_HIERARCHY_TREE,
  computeEp555MatchReward,
  evaluateOperativeHierarchyProfile,
  type ZuVariantId,
  type Ep555MatchRewardBreakdown,
} from "@shared/game-hierarchy";
import type { WorldId } from "@shared/worlds";
import {
  Crown,
  Shield,
  Swords,
  Globe,
  Cpu,
  Award,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Play,
  Layers,
  ChevronRight,
  Radio,
  Sparkles,
  Flame,
} from "lucide-react";
import { Link } from "wouter";

type HierarchyTab =
  | "EP555_RANKS"
  | "SPECIALIZATIONS_12"
  | "WORLDS_DAG_ZU"
  | "SUBMUNDO_KR"
  | "UE5_RUNTIME_TREE";

export default function HierarquiaPage() {
  const { data: playerData } = usePlayer();
  const { mutate: selectSpecialization, isPending: isSelectingSpec } = useSelectSpecialization();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<HierarchyTab>("EP555_RANKS");
  const [selectedWorldId, setSelectedWorldId] = useState<WorldId>("Barburhen");
  const [simPlacement, setSimPlacement] = useState<number>(1);
  const [simKills, setSimKills] = useState<number>(6);
  const [simZex, setSimZex] = useState<number>(2);
  const [simZuVariant, setSimZuVariant] = useState<ZuVariantId>("ZU1");
  const [simZuAction, setSimZuAction] = useState<
    "APERTAR_CINTO" | "SALTAR_AGORA" | "ATIVAR_MASCARA_O2"
  >("APERTAR_CINTO");
  const [simDataCores, setSimDataCores] = useState<number>(2);
  const [simPulso, setSimPulso] = useState<number>(2);
  const [simGiantsTop50, setSimGiantsTop50] = useState<boolean>(true);
  const [compartmentFilter, setCompartmentFilter] = useState<"ALL" | "ARMAMENTO" | "DEFESA" | "BAG">("ALL");

  const { data: overviewData } = useQuery<{
    ok: boolean;
    operativeEvaluation?: ReturnType<typeof evaluateOperativeHierarchyProfile>;
  }>({
    queryKey: ["/api/hierarchy/overview"],
    staleTime: 20_000,
  });

  const currentXp = playerData?.stats?.xp ?? overviewData?.operativeEvaluation?.xp ?? 0;
  const currentMorth = playerData?.stats?.kills ?? overviewData?.operativeEvaluation?.morth ?? 0;
  const activeSpecId =
    playerData?.stats?.specializationId ??
    overviewData?.operativeEvaluation?.activeSpecialization?.id ??
    null;

  const liveEvaluation = evaluateOperativeHierarchyProfile({
    xp: currentXp,
    morth: currentMorth,
    specializationId: activeSpecId,
  });

  const defaultSimResult = computeEp555MatchReward({
    worldId: selectedWorldId,
    placement: simPlacement,
    pvpKills: simKills,
    zexExtractions: simZex,
    zuVariant: simZuVariant,
    zuActionChosen: simZuAction,
    dataCoresCaptured: simDataCores,
    pulsoKhaaosSurvived: simPulso,
    giantsChallengeTop50: simGiantsTop50,
    currentXp,
    currentMorth,
  });

  const [serverSimResult, setServerSimResult] = useState<Ep555MatchRewardBreakdown | null>(null);
  const activeSim = serverSimResult ?? defaultSimResult;

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/hierarchy/simulate-ep555", {
        worldId: selectedWorldId,
        placement: simPlacement,
        pvpKills: simKills,
        zexExtractions: simZex,
        zuVariant: simZuVariant,
        zuActionChosen: simZuAction,
        dataCoresCaptured: simDataCores,
        pulsoKhaaosSurvived: simPulso,
        giantsChallengeTop50: simGiantsTop50,
        currentXp,
        currentMorth,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.simulation) {
        setServerSimResult(data.simulation);
        toast({
          title: "SIMULAÇÃO EP555 CONCLUÍDA",
          description: `+${data.simulation.xpBreakdown.multipliedTotalXp.toLocaleString("pt-BR")} XP Accur · +${data.simulation.progressionDelta.morthAfter - data.simulation.progressionDelta.morthBefore} Morth · Posto: ${data.simulation.progressionDelta.rankAfter}`,
        });
      }
    },
  });

  const handleActivateSpecialization = (specId: string) => {
    selectSpecialization(specId, {
      onSuccess: () =>
        toast({
          title: "CERTIFICAÇÃO EP555 ATIVADA",
          description: `Especialização ${specId} sincronizada no QG-WAR'I e no PlayerState UE5.`,
        }),
      onError: (err) =>
        toast({
          title: "REQUISITOS PENDENTES",
          description: err.message,
          variant: "destructive",
        }),
    });
  };

  const selectedWorldNode =
    WORLD_HIERARCHY_DAG.find((w) => w.worldId === selectedWorldId) ?? WORLD_HIERARCHY_DAG[0];

  const filteredSpecializations = EP555_SPECIALIZATION_DOCTRINES.filter((spec) =>
    compartmentFilter === "ALL" ? true : spec.primaryWarICompartment === compartmentFilter,
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12" data-testid="page-hierarquia">
      {/* Header Banner */}
      <CyberCard className="border-primary/40 bg-gradient-to-r from-black/90 via-primary/10 to-purple-950/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-primary tracking-widest uppercase">
              <Crown className="w-4 h-4" />
              ESTATUTO CANÔNICO EP555 · ARQUITETURA DEVS PH.D · UE5.8 ↔ NODE.JS
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-wider text-foreground mt-1">
              HIERARQUIA DO JOGO <span className="text-primary">END-TO-END</span>
            </h1>
            <p className="text-xs font-mono text-muted-foreground mt-1 max-w-3xl">
              5 Eixos Integrados: Escada Militar EP555 (Zheers → Overlord) · 12 Certificações Táticas + GAS ·
              Ontologia dos Mundos & Protocolos Zu 1–3 (CIGKV → W4 Arukheea) · Submundo KR vs. Policy Engine ·
              Árvore de Runtime C++20 UE5.8.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            <div className="px-3 py-2 bg-black/60 border border-primary/30 text-center">
              <div className="text-[9px] font-mono text-muted-foreground">POSTO ATUAL</div>
              <div className="text-sm font-display font-bold text-primary" data-testid="hierarchy-current-rank">
                {liveEvaluation.currentTier.id}
              </div>
              <div className="text-[9px] font-mono text-amber-300">{liveEvaluation.currentTier.code}</div>
            </div>
            <div className="px-3 py-2 bg-black/60 border border-amber-500/30 text-center">
              <div className="text-[9px] font-mono text-muted-foreground">XP (ACCUR)</div>
              <div className="text-sm font-display font-bold text-amber-300">
                {currentXp.toLocaleString("pt-BR")}
              </div>
              <div className="text-[9px] font-mono text-muted-foreground">
                {liveEvaluation.rankProgress.progressPct.toFixed(1)}%
              </div>
            </div>
            <div className="px-3 py-2 bg-black/60 border border-red-500/30 text-center">
              <div className="text-[9px] font-mono text-muted-foreground">MORTH (PVP)</div>
              <div className="text-sm font-display font-bold text-red-400">{currentMorth}</div>
              <div className="text-[9px] font-mono text-muted-foreground">ABATES CONF.</div>
            </div>
            <div className="px-3 py-2 bg-black/60 border border-cyan-500/30 text-center">
              <div className="text-[9px] font-mono text-muted-foreground">CERTIFICAÇÃO</div>
              <div className="text-xs font-display font-bold text-cyan-300 truncate">
                {liveEvaluation.activeSpecialization?.callsign ?? "NENHUMA"}
              </div>
              <div className="text-[9px] font-mono text-muted-foreground">
                {liveEvaluation.unlockedSpecializations.length}/12 LIBERADAS
              </div>
            </div>
          </div>
        </div>

        {/* 5-Axis Navigation Tabs */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap gap-2">
          {[
            {
              id: "EP555_RANKS" as const,
              label: "I. ESCADA EP555 & SIMULADOR ACCUR",
              icon: Crown,
            },
            {
              id: "SPECIALIZATIONS_12" as const,
              label: "II. 12 ESPECIALIZAÇÕES & GAS",
              icon: Swords,
            },
            {
              id: "WORLDS_DAG_ZU" as const,
              label: "III. MUNDOS DAG · ZU 1-3 · DEDO-DURO",
              icon: Globe,
            },
            {
              id: "SUBMUNDO_KR" as const,
              label: "IV. SUBMUNDO KR & AUTORIDADE",
              icon: Shield,
            },
            {
              id: "UE5_RUNTIME_TREE" as const,
              label: "V. ÁRVORE RUNTIME UE5.8 ↔ WEB",
              icon: Cpu,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`tab-${tab.id.toLowerCase()}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-display tracking-wider border transition-all cursor-pointer ${
                  active
                    ? "bg-primary/20 border-primary text-primary shadow-[0_0_12px_rgba(220,100,20,0.25)]"
                    : "bg-black/40 border-white/10 text-muted-foreground hover:text-foreground hover:border-white/25"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </CyberCard>

      {/* =================================================================== */}
      {/* TAB I: ESCADA DE COMANDO EP555 & SIMULADOR DE PROGRESSÃO END-TO-END */}
      {/* =================================================================== */}
      {activeTab === "EP555_RANKS" && (
        <div className="space-y-6">
          <CyberCard
            title="ESCADA DE COMANDO MILITAR EP555 (8 ESCALÕES)"
            subtitle="SINCRONIZADO EM SHARED/SCHEMA.TS · KHAAOSPLAYERSTATE.CPP · DEFAULTGAME.INI"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {EP555_HIERARCHY_TIERS.map((tier) => {
                const isCurrent = tier.id === liveEvaluation.currentTier.id;
                const isUnlocked = currentXp >= tier.xpRequired;
                return (
                  <div
                    key={tier.id}
                    data-testid={`rank-tier-card-${tier.id}`}
                    className={`p-3.5 border flex flex-col justify-between transition-all ${
                      isCurrent
                        ? "border-primary bg-primary/10 shadow-[0_0_16px_rgba(220,100,20,0.25)]"
                        : isUnlocked
                        ? "border-emerald-500/30 bg-emerald-950/10"
                        : "border-white/10 bg-black/40 opacity-75"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{tier.code}</span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-mono ${
                            isCurrent
                              ? "border-primary text-primary"
                              : isUnlocked
                              ? "border-emerald-400/50 text-emerald-300"
                              : "border-white/15 text-muted-foreground"
                          }`}
                        >
                          {isCurrent ? "POSTO ATUAL" : isUnlocked ? "ALCANÇADO" : "BLOQUEADO"}
                        </Badge>
                      </div>

                      <div className="mt-2 flex items-baseline justify-between">
                        <h3 className="text-lg font-display font-bold text-foreground">{tier.id}</h3>
                        <span className="text-xs font-mono text-amber-300">
                          {tier.xpRequired.toLocaleString("pt-BR")} XP
                        </span>
                      </div>
                      <p className="text-xs font-mono text-cyan-300 mt-0.5">{tier.designation}</p>
                      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                        {tier.doctrineSummary}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/10 space-y-1 text-[10px] font-mono">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ESOPO DE COMANDO:</span>
                        <span className="text-foreground">Até {tier.maxSquadSize} op.</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SOLDAGEM DIÁRIA:</span>
                        <span className="text-emerald-400">{tier.dailySoldagemKrc} KRC/dia</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">FORJA LIBERADA:</span>
                        <span className="text-amber-300">{tier.armoryClearanceRarity}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">BÔNUS ZEX:</span>
                        <span className="text-cyan-300">+{tier.zexRetentionBonusPct}% (Base 20%)</span>
                      </div>
                      <div className="text-[9px] text-purple-300 truncate pt-1">
                        Tag: {tier.ue5GameplayTag}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CyberCard>

          {/* Interactive EP555 Match & Ring Simulator */}
          <CyberCard
            title="SIMULADOR DE PARTIDA & EVENTOS EP555 (ACCUR XP + MORTH + ZEX 20% + ZU)"
            subtitle="MATRIZ DE BÔNUS POR MUNDO (CIGKV → W4) E AÇÃO TÁTICA · UKHAAOSHIERARCHYSUBSYSTEM"
            className="border-cyan-500/30"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Controls */}
              <div className="lg:col-span-6 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">
                      MUNDO / RING
                    </label>
                    <select
                      data-testid="sim-select-world"
                      value={selectedWorldId}
                      onChange={(e) => {
                        setSelectedWorldId(e.target.value as WorldId);
                        setServerSimResult(null);
                      }}
                      className="w-full h-9 px-2 bg-black/70 border border-white/15 text-xs font-mono text-foreground"
                    >
                      {WORLD_HIERARCHY_DAG.map((w) => (
                        <option key={w.worldId} value={w.worldId}>
                          {w.stageCode} · {w.worldId} ({w.xpAccurMultiplier}x XP)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">
                      COLOCAÇÃO (1–100)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={simPlacement}
                      onChange={(e) => {
                        setSimPlacement(Number(e.target.value) || 1);
                        setServerSimResult(null);
                      }}
                      className="w-full h-9 px-2.5 bg-black/70 border border-white/15 text-xs font-mono text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">
                      ABATES PVP (MORTH)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={simKills}
                      onChange={(e) => {
                        setSimKills(Number(e.target.value) || 0);
                        setServerSimResult(null);
                      }}
                      className="w-full h-9 px-2.5 bg-black/70 border border-white/15 text-xs font-mono text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">
                      EXTRAÇÕES ZEX
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={simZex}
                      onChange={(e) => {
                        setSimZex(Number(e.target.value) || 0);
                        setServerSimResult(null);
                      }}
                      className="w-full h-9 px-2.5 bg-black/70 border border-white/15 text-xs font-mono text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">
                      DATA CORES
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={simDataCores}
                      onChange={(e) => {
                        setSimDataCores(Number(e.target.value) || 0);
                        setServerSimResult(null);
                      }}
                      className="w-full h-9 px-2.5 bg-black/70 border border-white/15 text-xs font-mono text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-muted-foreground uppercase mb-1">
                      PULSOS KHAAOS
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={12}
                      value={simPulso}
                      onChange={(e) => {
                        setSimPulso(Number(e.target.value) || 0);
                        setServerSimResult(null);
                      }}
                      className="w-full h-9 px-2.5 bg-black/70 border border-white/15 text-xs font-mono text-foreground"
                    />
                  </div>
                </div>

                {/* Zu Protocol Selector */}
                <div className="p-3 bg-black/50 border border-white/10 space-y-3">
                  <div className="text-[10px] font-mono text-amber-300 tracking-widest uppercase">
                    PROTOCOLO DE INGRESSO CINEMATOGRÁFICO (ZU 1 / ZU 2 / ZU 3)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono text-muted-foreground mb-1">
                        VARIANTE SORTEADA NO RING
                      </label>
                      <select
                        value={simZuVariant}
                        onChange={(e) => {
                          setSimZuVariant(e.target.value as ZuVariantId);
                          setServerSimResult(null);
                        }}
                        className="w-full h-9 px-2 bg-black/70 border border-white/15 text-xs font-mono text-foreground"
                      >
                        {selectedWorldNode.zuProtocols.map((zu) => (
                          <option key={zu.variantId} value={zu.variantId}>
                            {zu.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-muted-foreground mb-1">
                        DECISÃO DO JOGADOR (POP-UP ZU)
                      </label>
                      <select
                        value={simZuAction}
                        onChange={(e) => {
                          setSimZuAction(e.target.value as any);
                          setServerSimResult(null);
                        }}
                        className="w-full h-9 px-2 bg-black/70 border border-white/15 text-xs font-mono text-foreground"
                      >
                        <option value="APERTAR_CINTO">Zu 1 · Apertar Cinto de Contenção</option>
                        <option value="SALTAR_AGORA">Zu 2 · Saltar Antes do Impacto</option>
                        <option value="ATIVAR_MASCARA_O2">Zu 3 · Ativar Máscara / Respirador O₂</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-mono text-muted-foreground cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={simGiantsTop50}
                      onChange={(e) => {
                        setSimGiantsTop50(e.target.checked);
                        setServerSimResult(null);
                      }}
                    />
                    Top 50 Desafio de Gigantes (Guerra dos Filhos da Escuridão · +Token Veterano & Insígnia Mérito KR)
                  </label>
                </div>

                <Button
                  type="button"
                  data-testid="button-simulate-ep555"
                  onClick={() => simulateMutation.mutate()}
                  disabled={simulateMutation.isPending}
                  className="w-full font-display tracking-widest"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {simulateMutation.isPending
                    ? "CALCULANDO NO SERVIDOR..."
                    : "EXECUTAR CÁLCULO EP555 END-TO-END"}
                </Button>
              </div>

              {/* Breakdown Output */}
              <div className="lg:col-span-6 p-4 bg-black/60 border border-cyan-500/30 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-display tracking-widest text-cyan-300">
                      LAUDO DE RECOMPENSA & PROGRESSÃO EP555
                    </span>
                    <Badge variant="outline" className="border-cyan-400/40 text-cyan-300 font-mono text-[10px]">
                      {activeSim.stageCode} · {activeSim.worldAccurMultiplier}x ACCUR
                    </Badge>
                  </div>

                  {/* Zu Result Banner */}
                  <div
                    className={`mt-3 p-2.5 border text-xs font-mono ${
                      activeSim.zuEvaluation.correctDecision
                        ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300"
                        : "border-red-500/40 bg-red-950/20 text-red-300"
                    }`}
                  >
                    <div className="font-bold">
                      {activeSim.zuEvaluation.correctDecision
                        ? "✓ DECISÃO ZU CORRETA: 0% DANO DE VITALIDADE (+350 XP TÁTICO)"
                        : `✕ DECISÃO ZU INCORRETA: -${activeSim.zuEvaluation.initialVitalityDamagePct}% VITALIDADE INICIAL`}
                    </div>
                    {activeSim.zuEvaluation.zuInitialBankhaoosKrc > 0 && (
                      <div className="text-[11px] text-amber-300 mt-0.5">
                        +1.000 KRC creditados automaticamente no Bankhaoos (Protocolo Zu 1 CIGKV)
                      </div>
                    )}
                  </div>

                  {/* XP Breakdown Table */}
                  <div className="mt-3 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Colocação no Ring (#{simPlacement}):</span>
                      <span>+{activeSim.xpBreakdown.placementBaseXp} XP</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Abates PvP ({simKills} Morth):</span>
                      <span>+{activeSim.xpBreakdown.pvpKillsXp} XP</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Terminais ZEX ({simZex} extrações):</span>
                      <span>+{activeSim.xpBreakdown.zexExtractionXp} XP</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data Cores + Pulsos Khaaos:</span>
                      <span>
                        +{activeSim.xpBreakdown.dataCoresXp + activeSim.xpBreakdown.pulsoKhaaosXp} XP
                      </span>
                    </div>
                    {activeSim.xpBreakdown.giantsChallengeXp > 0 && (
                      <div className="flex justify-between text-amber-300">
                        <span>Desafio de Gigantes (Top 50):</span>
                        <span>+{activeSim.xpBreakdown.giantsChallengeXp} XP</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-sm text-primary">
                      <span>TOTAL ACCUR XP (×{activeSim.worldAccurMultiplier}):</span>
                      <span data-testid="sim-total-xp">
                        +{activeSim.xpBreakdown.multipliedTotalXp.toLocaleString("pt-BR")} XP
                      </span>
                    </div>
                  </div>
                </div>

                {/* KRC & Rank Delta */}
                <div className="pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2 bg-black/50 border border-white/10">
                    <div className="text-[9px] text-muted-foreground">KRC BRUTO SESSÃO</div>
                    <div className="text-sm font-bold text-amber-300">
                      {activeSim.krcBreakdown.rawSessionKrc} KRC
                    </div>
                  </div>
                  <div className="p-2 bg-black/50 border border-cyan-500/30">
                    <div className="text-[9px] text-muted-foreground">TRANSFERÊNCIA ZEX (20%+)</div>
                    <div className="text-sm font-bold text-cyan-300">
                      {activeSim.krcBreakdown.zexTransferable20PctKrc} KRC
                    </div>
                  </div>
                  <div className="p-2 bg-black/50 border border-emerald-500/30 col-span-2 sm:col-span-1">
                    <div className="text-[9px] text-muted-foreground">TRANSIÇÃO DE POSTO</div>
                    <div className="text-xs font-bold text-emerald-300">
                      {activeSim.progressionDelta.rankBefore} → {activeSim.progressionDelta.rankAfter}
                    </div>
                  </div>
                </div>

                {activeSim.krcBreakdown.veteranTokenAwarded && (
                  <div className="flex items-center justify-between px-3 py-2 bg-amber-500/10 border border-amber-500/40 text-[11px] font-mono text-amber-200">
                    <span className="flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-400" />
                      TOKEN DE VETERANO + CÓDIGO KR-N1 + INSÍGNIA MÉRITO KR CONCEDIDOS
                    </span>
                    <span className="text-amber-400 font-bold">W1 PACK ATIVO</span>
                  </div>
                )}
              </div>
            </div>
          </CyberCard>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB II: MATRIZ DAS 12 CERTIFICAÇÕES & ESPECIALIZAÇÕES TÁTICAS + GAS */}
      {/* =================================================================== */}
      {activeTab === "SPECIALIZATIONS_12" && (
        <CyberCard
          title="MATRIZ DAS 12 CERTIFICAÇÕES DE COMBATE (EP555 + UE5 GAS)"
          subtitle="REQUISITOS COMBINADOS DE PATENTE MÍNIMA + MORTH · MODIFICADORES UKHAAOSATTRIBUTESET"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex flex-wrap gap-2">
              {(["ALL", "ARMAMENTO", "DEFESA", "BAG"] as const).map((comp) => (
                <button
                  key={comp}
                  type="button"
                  onClick={() => setCompartmentFilter(comp)}
                  className={`px-3 py-1 text-xs font-mono border cursor-pointer ${
                    compartmentFilter === comp
                      ? "border-cyan-400 bg-cyan-950/30 text-cyan-300"
                      : "border-white/10 bg-black/40 text-muted-foreground"
                  }`}
                >
                  {comp === "ALL" ? "TODOS OS COMPARTIMENTOS WAR'I (12)" : `SINERGIA WAR'I: ${comp}`}
                </button>
              ))}
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              SEU STATUS: <span className="text-primary font-bold">{liveEvaluation.currentTier.id}</span> ·{" "}
              <span className="text-red-400 font-bold">{currentMorth} MORTH</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSpecializations.map((spec) => {
              const isUnlocked = liveEvaluation.unlockedSpecializations.some((u) => u.id === spec.id);
              const isActive = activeSpecId === spec.id;
              return (
                <div
                  key={spec.id}
                  data-testid={`spec-doctrine-card-${spec.id}`}
                  className={`p-4 border flex flex-col justify-between transition-all ${
                    isActive
                      ? "border-cyan-400 bg-cyan-950/20 shadow-[0_0_16px_rgba(34,211,238,0.2)]"
                      : isUnlocked
                      ? "border-primary/40 bg-primary/5"
                      : "border-white/10 bg-black/40"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-mono text-cyan-300 tracking-widest">
                          CODINOME: {spec.callsign.toUpperCase()}
                        </div>
                        <h3 className="text-base font-display font-bold text-foreground">{spec.name}</h3>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[9px] font-mono border-white/20 text-muted-foreground"
                      >
                        WAR&apos;I: {spec.primaryWarICompartment}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground mt-1.5">{spec.focus}</p>

                    <div className="mt-3 p-2 bg-black/50 border border-white/10 space-y-1 text-[10px] font-mono">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">REQUISITO EP555:</span>
                        <span className="text-amber-300">
                          {spec.requiredRank} + {spec.morthRequired} MORTH
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">BÔNUS VITALIDADE/NRG:</span>
                        <span className="text-emerald-300">
                          +{spec.combatModifiers.maxHealthBonus} HP / +{spec.combatModifiers.maxEnergyBonus} NRG
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VELOCIDADE / RECUO:</span>
                        <span className="text-cyan-300">
                          {spec.combatModifiers.speedMultiplier}x / +{spec.combatModifiers.recoilControlBonusPct}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">EXTRAÇÃO ZEX / HAZARD:</span>
                        <span className="text-purple-300">
                          +{spec.combatModifiers.zexExtractionSpeedBonusPct}% / +{spec.combatModifiers.hazardResistancePct}%
                        </span>
                      </div>
                      <div className="text-[9px] text-muted-foreground truncate pt-1">
                        GAS: {spec.ue5GasAbilityTag}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-white/10">
                    <div className="text-[10px] font-mono text-muted-foreground mb-2 truncate">
                      Equipamento: <span className="text-foreground">{spec.signatureEquipment}</span>
                    </div>
                    <Button
                      size="sm"
                      variant={isActive ? "outline" : "default"}
                      disabled={!isUnlocked || isActive || isSelectingSpec}
                      onClick={() => handleActivateSpecialization(spec.id)}
                      className="w-full font-mono text-[10px] tracking-widest"
                    >
                      {isActive
                        ? "✓ CERTIFICAÇÃO EM SERVIÇO"
                        : isUnlocked
                        ? "ASSUMIR ESPECIALIDADE"
                        : `REQUER ${spec.requiredRank} · ${spec.morthRequired} MORTH`}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CyberCard>
      )}

      {/* =================================================================== */}
      {/* TAB III: ONTOLOGIA DOS MUNDOS (DAG), PROTOCOLOS ZU 1-3 & DEDO-DURO  */}
      {/* =================================================================== */}
      {activeTab === "WORLDS_DAG_ZU" && (
        <div className="space-y-6">
          <CyberCard
            title="DOUTRINA DO DESCENTRALIZADOR — GRAFO ACÍCLICO DIRIGIDO (CIGKV → W1 → W2 → W3 → W4)"
            subtitle="CADA MUNDO REMOVE UMA DIMENSÃO DE SEGURANÇA ATÉ O HELICÓPTERO FINAL DE ARUKHEEA (US$ 1.000.000)"
          >
            {/* DAG Stepper */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-6">
              {WORLD_HIERARCHY_DAG.map((node, index) => {
                const isSelected = node.worldId === selectedWorldId;
                return (
                  <button
                    key={node.worldId}
                    type="button"
                    data-testid={`dag-world-node-${node.worldId}`}
                    onClick={() => setSelectedWorldId(node.worldId)}
                    className={`p-3 border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/15 shadow-[0_0_15px_rgba(220,100,20,0.25)]"
                        : "border-white/10 bg-black/40 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                      <span>ESTÁGIO {index}</span>
                      <span className="text-amber-300">{node.stageCode}</span>
                    </div>
                    <div className="text-sm font-display font-bold text-foreground mt-1">
                      {node.worldId.toUpperCase()}
                    </div>
                    <div className="text-[10px] font-mono text-cyan-300 mt-1">
                      {node.maxPlayers}p · {node.zexCount} ZEX · {node.xpAccurMultiplier}x XP
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                      Ring: {node.ringConflictName.split("(")[0]}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected World Detailed Ontology */}
            <div className="p-4 bg-black/60 border border-primary/30 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="text-xs font-mono text-primary tracking-widest">
                    {selectedWorldNode.stageCode} · RECOMENDADO: POSTO {selectedWorldNode.minimumRecommendedRank}+
                  </div>
                  <h2 className="text-xl font-display font-bold text-foreground mt-0.5">
                    {selectedWorldNode.canonicalTitle}
                  </h2>
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    {selectedWorldNode.targetDurationLabel} · Ring: {selectedWorldNode.ringConflictName}
                  </p>
                </div>
                <Link href="/mundos">
                  <Button variant="outline" size="sm" className="font-mono text-xs border-primary/50 text-primary">
                    ABRIR MAPA 3D & TELEMETRIA →
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 bg-black/50 border border-white/10">
                  <div className="text-[10px] font-mono text-amber-300 uppercase">
                    DIMENSÃO REMOVIDA (DESCENTRALIZADOR)
                  </div>
                  <p className="text-xs text-foreground mt-1 leading-relaxed">
                    {selectedWorldNode.decentralizerDimensionRemoved}
                  </p>
                </div>
                <div className="p-3 bg-black/50 border border-white/10">
                  <div className="text-[10px] font-mono text-purple-300 uppercase">
                    FILTRO PSICOLÓGICO DO RING
                  </div>
                  <p className="text-xs text-foreground mt-1 leading-relaxed">
                    {selectedWorldNode.psychologicalFilter}
                  </p>
                </div>
                <div className="p-3 bg-black/50 border border-red-500/30">
                  <div className="text-[10px] font-mono text-red-400 uppercase flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    SISTEMA DEDO-DURO (ANTI-INATIVIDADE)
                  </div>
                  <p className="text-xs font-bold text-foreground mt-1">
                    {selectedWorldNode.dedoDuroAgent.creature} ({selectedWorldNode.dedoDuroAgent.triggerIdleSeconds}s imóvel)
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {selectedWorldNode.dedoDuroAgent.punishmentEffect}
                  </p>
                </div>
              </div>

              {/* Sectors (Fractions of 8) */}
              <div>
                <h3 className="text-xs font-display tracking-widest text-cyan-300 mb-2.5">
                  PERÍMETROS FRACIONADOS DO MAPA (SOMA CANÔNICA = 8/8 = 1 INTEIRO)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {selectedWorldNode.sectors.map((sec) => (
                    <div key={sec.name} className="p-3 bg-black/50 border border-cyan-500/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-display font-bold text-foreground">{sec.name}</span>
                        <span className="text-sm font-mono font-bold text-cyan-300">{sec.fractionLabel}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">{sec.tacticalFunction}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3 Variants of Zu */}
              <div>
                <h3 className="text-xs font-display tracking-widest text-amber-300 mb-2.5">
                  TRÊS VARIANTES DO PROTOCOLO DE INGRESSO (ZU 1 · ZU 2 · ZU 3)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {selectedWorldNode.zuProtocols.map((zu) => (
                    <div key={zu.variantId} className="p-3 bg-black/50 border border-amber-500/25 space-y-1.5">
                      <div className="text-xs font-display font-bold text-amber-300">{zu.label}</div>
                      <p className="text-[11px] text-foreground">{zu.cinematicEvent}</p>
                      <div className="text-[10px] font-mono text-emerald-300 pt-1">
                        ✓ Ação Correta: {zu.actionLabel} → {zu.successOutcome}
                      </div>
                      <div className="text-[10px] font-mono text-red-400">
                        ✕ Falha de Decisão: -{zu.failurePenaltyPct}% Vitalidade imediata
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-primary/10 border border-primary/30 text-xs font-mono text-foreground">
                <span className="text-primary font-bold">REGRA DE PERSISTÊNCIA & TRANSIÇÃO: </span>
                {selectedWorldNode.persistenceRule}
              </div>
            </div>
          </CyberCard>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB IV: SUBMUNDO KR (CLASSE ESPECIAL) VS. AUTORIDADE DO SERVIDOR    */}
      {/* =================================================================== */}
      {activeTab === "SUBMUNDO_KR" && (
        <CyberCard
          title="HIERARQUIA DE COMANDO DO SUBMUNDO KR VS. AUTORIDADE REAL DO SISTEMA"
          subtitle="SEPARAÇÃO CANÔNICA ENTRE POLICY ENGINE (EXECUTABLE: TRUE) E CLASSE ESPECIAL (EXECUTABLE: FALSE)"
        >
          <div className="space-y-4">
            {SUBMUNDO_KR_AUTHORITY_HIERARCHY.map((node) => {
              const isServer = node.tier === "LEVEL_0_SERVER_AUTHORITY";
              return (
                <div
                  key={node.id}
                  data-testid={`authority-node-${node.id}`}
                  className={`p-4 border ${
                    isServer
                      ? "border-emerald-500/50 bg-emerald-950/15"
                      : "border-purple-500/35 bg-purple-950/10"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] ${
                            isServer
                              ? "border-emerald-400 text-emerald-300"
                              : "border-purple-400 text-purple-300"
                          }`}
                        >
                          PRECEDÊNCIA: {node.precedenceScore}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground">{node.roleTitle}</span>
                      </div>
                      <h3 className="text-lg font-display font-bold text-foreground mt-1">
                        {node.canonicalName}
                      </h3>
                      <p className="text-xs font-mono text-cyan-300 mt-0.5">Domínio: {node.domain}</p>
                    </div>

                    <Badge
                      variant="outline"
                      className={`font-mono text-xs shrink-0 ${
                        node.executableMutations
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-400 bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      executable: {String(node.executableMutations)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs font-mono">
                    <div className="p-2.5 bg-black/50 border border-white/10">
                      <div className="text-[10px] text-muted-foreground mb-1">ENTRADAS PERMITIDAS:</div>
                      <ul className="space-y-1 text-[11px] text-foreground">
                        {node.allowedInputs.map((inp) => (
                          <li key={inp}>• {inp}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-2.5 bg-black/50 border border-white/10">
                      <div className="text-[10px] text-muted-foreground mb-1">SAÍDAS TIPADAS:</div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {node.typedOutputs.map((out) => (
                          <span
                            key={out}
                            className="px-2 py-0.5 bg-white/5 border border-white/15 text-[10px] text-amber-300"
                          >
                            {out}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2">{node.hardBoundary}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CyberCard>
      )}

      {/* =================================================================== */}
      {/* TAB V: ÁRVORE DE ARQUITETURA RUNTIME UE5.8 (C++20) ↔ CAMADA WEB     */}
      {/* =================================================================== */}
      {activeTab === "UE5_RUNTIME_TREE" && (
        <CyberCard
          title="ÁRVORE DE ARQUITETURA DE RUNTIME UE5.8 (C++20) ↔ NODE.JS"
          subtitle="ESPELHAMENTO 1:1 ENTRE DEDICATED SERVER C++20 E SERVIÇOS WEB AUTHORITATIVE"
        >
          <div className="space-y-4">
            {UE5_GAME_HIERARCHY_TREE.map((layer) => (
              <div
                key={layer.id}
                data-testid={`ue5-tree-layer-${layer.id}`}
                className="p-4 bg-black/50 border border-cyan-500/25 space-y-3"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-mono text-cyan-400 tracking-widest">
                      {layer.layer} · {layer.authoritySide}
                    </div>
                    <h3 className="text-base font-display font-bold text-foreground mt-0.5">
                      UE5.8: <span className="text-primary">{layer.ue5Class}</span> ↔ Web:{" "}
                      <span className="text-cyan-300">{layer.tsCounterpart}</span>
                    </h3>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {layer.headerPath}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{layer.responsibility}</p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {layer.children.map((child) => (
                    <span
                      key={child}
                      className="px-2.5 py-1 bg-primary/10 border border-primary/30 text-[10px] font-mono text-primary"
                    >
                      ↳ {child}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CyberCard>
      )}
    </div>
  );
}
