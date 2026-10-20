import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Globe,
  ShieldAlert,
  Compass,
  Flame,
  Zap,
  Lock,
  CheckCircle2,
  Play,
  Trophy,
  Radio,
  MapPin,
  Layers,
  Crosshair,
  AlertTriangle,
  Sparkles,
  Unlock,
  Code2,
} from "lucide-react";
import type {
  WorldDefinition,
  WorldId,
  MultiWorldPersistenceState,
} from "@shared/worlds";
import { UE5EngineeringHub } from "@/components/ue5-engineering-hub";

interface WorldsApiResponse {
  worlds: WorldDefinition[];
  progression: MultiWorldPersistenceState;
}

interface SimulationApiResponse {
  ok: boolean;
  simulation: {
    simulationId: string;
    worldId: WorldId;
    worldName: string;
    extractionType: "ZEX" | "ZU" | "ELIMINATED";
    phaseReached: number;
    survivalTimeSeconds: number;
    kills: number;
    poiVisited: string;
    hazardSurvived: string;
    hazardDamageTaken: number;
    baseKrcReward: number;
    worldMultiplier: number;
    totalKrcMinted: number;
    newlyUnlockedWorlds: WorldId[];
    proceduralSeed: number;
    timestamp: string;
  };
}

export default function MundosPage() {
  const [selectedWorldId, setSelectedWorldId] = useState<WorldId>("Barburhen");
  const [selectedExtractionMode, setSelectedExtractionMode] = useState<"ZEX" | "ZU">("ZEX");
  const [lastSimResult, setLastSimResult] = useState<SimulationApiResponse["simulation"] | null>(null);

  const { data, isLoading } = useQuery<WorldsApiResponse>({
    queryKey: ["/api/worlds"],
  });

  const simulateMutation = useMutation({
    mutationFn: async (params: { worldId: WorldId; extractionType: "ZEX" | "ZU" }) => {
      const res = await apiRequest("POST", "/api/worlds/simulate", params);
      return (await res.json()) as SimulationApiResponse;
    },
    onSuccess: (result) => {
      setLastSimResult(result.simulation);
      queryClient.invalidateQueries({ queryKey: ["/api/worlds"] });
    },
  });

  const selectWorldMutation = useMutation({
    mutationFn: async (worldId: WorldId) => {
      const res = await apiRequest("POST", "/api/worlds/select", { worldId });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worlds"] });
    },
  });

  const unlockAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/worlds/unlock-all", {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/worlds"] });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-24 rounded-md bg-zinc-900/60 border border-zinc-800 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-36 rounded-md bg-zinc-900/60 border border-zinc-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const worlds = data.worlds;
  const progression = data.progression;
  const activeWorld = worlds.find((w) => w.id === selectedWorldId) ?? worlds[0];
  const activeStats = progression.worlds[activeWorld.id];

  const getPreviousWorldExtractions = (world: WorldDefinition): number => {
    if (!world.unlockRule.requiredWorld) return 0;
    return progression.worlds[world.unlockRule.requiredWorld]?.successfulExtractions ?? 0;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Command Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-amber-400">
            <Globe className="w-4 h-4" />
            <span>Arquitetura Multi-Mundos End-to-End • UE5 C++ & Node.js Sync</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mt-1">
            Atlas Operacional de Mundos Kháaos
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Progressão persistente (`UKhaaosMultiWorldPersistence`), fases dinâmicas de SafeZone, POIs com pesos de raridade e extração ZEX/ZU.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-2 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-3">
            <div>
              <div className="text-[11px] font-mono uppercase text-zinc-400">KRC Acumulado</div>
              <div className="text-lg font-mono font-bold text-amber-400">
                {progression.totalKrcEarned.toLocaleString()} KRC
              </div>
            </div>
            <div className="h-7 w-px bg-zinc-800" />
            <div>
              <div className="text-[11px] font-mono uppercase text-zinc-400">Extrações Totais</div>
              <div className="text-lg font-mono font-bold text-cyan-400">
                {progression.totalCompletions}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => unlockAllMutation.mutate()}
            disabled={unlockAllMutation.isPending}
            className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-mono"
            data-testid="button-unlock-all-worlds"
          >
            <Unlock className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            Certificar Todos os Mundos (Dev)
          </Button>
        </div>
      </div>

      {/* 5-World Progression Chain */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {worlds.map((world) => {
          const stats = progression.worlds[world.id];
          const isSelected = world.id === activeWorld.id;
          const isCurrentDeployed = progression.currentWorld === world.id;
          const reqCount = world.unlockRule.requiredCompletions;
          const prevCount = getPreviousWorldExtractions(world);
          const progressPct =
            reqCount === 0 ? 100 : Math.min(100, Math.round((prevCount / reqCount) * 100));

          return (
            <button
              key={world.id}
              type="button"
              onClick={() => setSelectedWorldId(world.id)}
              data-testid={`card-world-${world.id}`}
              className={`text-left p-4 rounded-md border transition-all relative overflow-hidden ${
                isSelected
                  ? "bg-zinc-900 border-amber-500/80 shadow-lg shadow-amber-500/5"
                  : "bg-zinc-950/80 border-zinc-800/90 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  MUNDO 0{world.order + 1} • {world.dimensionsKm}
                </span>
                {stats?.unlocked ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                )}
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-bold text-white">{world.name}</h3>
                <span className="text-xs font-mono font-semibold text-amber-400">
                  {world.krcMultiplier.toFixed(2)}x KRC
                </span>
              </div>

              <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">{world.subtitle}</p>

              <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-1.5">
                {stats?.unlocked ? (
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400">Extrações:</span>
                    <span className="text-white font-semibold">
                      {stats.successfulExtractions} ({stats.zuVictories} ZU)
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span>Req: {world.unlockRule.requiredWorld}</span>
                      <span>
                        {prevCount}/{reqCount}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-900 rounded overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {isCurrentDeployed && (
                  <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 flex items-center gap-1 pt-0.5">
                    <Radio className="w-3 h-3 animate-pulse" />
                    Mundo Ativo no Servidor
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected World Deep Console */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Tactical Radar & World Specs */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader className="border-b border-zinc-800/80 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl font-bold text-white">
                      {activeWorld.name} — {activeWorld.subtitle}
                    </CardTitle>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">{activeWorld.biome}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {activeStats?.unlocked ? (
                    <>
                      <Button
                        size="sm"
                        variant={progression.currentWorld === activeWorld.id ? "secondary" : "default"}
                        onClick={() => selectWorldMutation.mutate(activeWorld.id)}
                        disabled={
                          selectWorldMutation.isPending ||
                          progression.currentWorld === activeWorld.id
                        }
                        data-testid="button-set-active-world"
                        className="text-xs font-mono"
                      >
                        <Compass className="w-3.5 h-3.5 mr-1.5" />
                        {progression.currentWorld === activeWorld.id
                          ? "Mundo Selecionado"
                          : "Definir como Mundo Ativo"}
                      </Button>
                      <Link href="/zona">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (progression.currentWorld !== activeWorld.id) {
                              selectWorldMutation.mutate(activeWorld.id);
                            }
                          }}
                          data-testid="button-deploy-world-zona"
                          className="bg-amber-600 hover:bg-amber-500 text-black font-mono font-bold text-xs"
                        >
                          <Play className="w-3.5 h-3.5 mr-1.5" />
                          Incursão Tática na Zona
                        </Button>
                      </Link>
                    </>
                  ) : (
                    <span className="text-xs font-mono text-amber-400/90 flex items-center gap-1.5 bg-amber-950/30 border border-amber-800/40 px-2.5 py-1.5 rounded">
                      <Lock className="w-3.5 h-3.5" />
                      {activeWorld.unlockRule.description}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-5">
              <Tabs defaultValue="topology" className="space-y-4">
                <TabsList className="bg-zinc-900 border border-zinc-800">
                  <TabsTrigger value="topology" className="text-xs font-mono">
                    <MapPin className="w-3.5 h-3.5 mr-1.5" />
                    Topologia & POIs ({activeWorld.pois.length})
                  </TabsTrigger>
                  <TabsTrigger value="safezone" className="text-xs font-mono">
                    <Layers className="w-3.5 h-3.5 mr-1.5" />
                    Fases SafeZone (5)
                  </TabsTrigger>
                  <TabsTrigger value="extractions" className="text-xs font-mono">
                    <Crosshair className="w-3.5 h-3.5 mr-1.5" />
                    ZEX / ZU & Risco Ambiental
                  </TabsTrigger>
                  <TabsTrigger value="ue5" className="text-xs font-mono">
                    <Code2 className="w-3.5 h-3.5 mr-1.5" />
                    Contrato UE5 C++
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: TOPOLOGY & POIS */}
                <TabsContent value="topology" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeWorld.pois.map((poi) => (
                      <div
                        key={poi.name}
                        className="p-4 rounded bg-zinc-900/70 border border-zinc-800 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-white">{poi.name}</h4>
                            <p className="text-xs text-zinc-400">{poi.theme}</p>
                          </div>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 text-amber-400">
                            TIER {poi.tier}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {poi.strategicNote}
                        </p>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-[11px] font-mono">
                          <div>
                            <span className="text-zinc-500 block">COORDENADAS</span>
                            <span className="text-zinc-200">
                              ({poi.coordinates.x}, {poi.coordinates.y}, {poi.coordinates.z}m)
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">RAIO / LOOT</span>
                            <span className="text-zinc-200">
                              {poi.radiusMeters}m • {poi.lootSpawnCount} spawns
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">ÉPICO + LEND.</span>
                            <span className="text-amber-400 font-semibold">
                              {poi.rarityWeights.epic + poi.rarityWeights.legendary}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* TAB 2: SAFEZONE PHASES */}
                <TabsContent value="safezone" className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-400">
                          <th className="py-2.5 px-3">FASE</th>
                          <th className="py-2.5 px-3">DESIGNAÇÃO</th>
                          <th className="py-2.5 px-3">DURAÇÃO</th>
                          <th className="py-2.5 px-3">RAIO SEGURO</th>
                          <th className="py-2.5 px-3">DANO GAS (DPS)</th>
                          <th className="py-2.5 px-3">CENTRO (X,Y,Z)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {activeWorld.safeZonePhases.map((phase) => (
                          <tr key={phase.phaseIndex} className="hover:bg-zinc-900/50">
                            <td className="py-2.5 px-3 font-bold text-amber-400">
                              FASE {phase.phaseIndex}
                            </td>
                            <td className="py-2.5 px-3 text-white">{phase.phaseName}</td>
                            <td className="py-2.5 px-3 text-zinc-300">{phase.durationSeconds}s</td>
                            <td className="py-2.5 px-3 text-cyan-400">{phase.radiusMeters}m</td>
                            <td className="py-2.5 px-3 text-rose-400 font-semibold">
                              {phase.damagePerSecond.toFixed(1)} HP/s
                            </td>
                            <td className="py-2.5 px-3 text-zinc-400">
                              ({phase.center.x}, {phase.center.y}, {phase.center.z})
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-300">
                    <span>
                      Regra Anti-Camping (`UpdateInactivityTracking`): Penalidade após{" "}
                      <strong className="text-white">{activeWorld.inactivityRule.thresholdSeconds}s</strong>{" "}
                      sem deslocamento (&lt;100cm).
                    </span>
                    <span className="text-rose-400 font-bold">
                      {activeWorld.inactivityRule.penaltyDamagePerSecond.toFixed(1)} DPS
                    </span>
                  </div>
                </TabsContent>

                {/* TAB 3: ZEX, ZU & ENVIRONMENTAL HAZARD */}
                <TabsContent value="extractions" className="space-y-4">
                  <div className="p-4 rounded bg-rose-950/20 border border-rose-900/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-rose-400 font-mono text-xs uppercase font-bold">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Risco Ambiental Ativo: {activeWorld.hazard.name}</span>
                      </div>
                      <span className="text-xs font-mono text-rose-300">
                        {activeWorld.hazard.damagePerSecond} DPS • Ciclo {activeWorld.hazard.intervalSeconds}s / Ativo {activeWorld.hazard.durationSeconds}s
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300">{activeWorld.hazard.description}</p>
                    <p className="text-xs text-emerald-400 font-mono">
                      Contramedida Tática: {activeWorld.hazard.counterplay}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeWorld.zexNodes.map((zex) => (
                      <div
                        key={zex.id}
                        className="p-3.5 rounded bg-zinc-900/70 border border-zinc-800 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-mono text-cyan-400 font-bold">{zex.id}</div>
                          <div className="text-sm font-semibold text-white">{zex.name}</div>
                          <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                            Pos: ({zex.coordinates.x}, {zex.coordinates.y}, {zex.coordinates.z})
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs">
                          <div className="text-amber-400">Fase {zex.activationPhase}+</div>
                          <div className="text-zinc-400">{zex.extractionTimeSeconds}s canalização</div>
                          <div className="text-zinc-500">Cap: {zex.capacityPlayers} ops</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3.5 rounded bg-amber-950/20 border border-amber-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                    <div>
                      <span className="text-amber-400 font-bold block">
                        ZONA ÚNICA FINAL (ZU) — {activeWorld.zuSpec.locationLabel}
                      </span>
                      <span className="text-zinc-300">
                        Ativa {activeWorld.zuSpec.spawnDelayAfterLastZexSeconds}s após fechamento da última ZEX. Janela final de {activeWorld.zuSpec.durationSeconds}s.
                      </span>
                    </div>
                    <span className="text-amber-300 font-bold shrink-0">
                      Raio {activeWorld.zuSpec.radiusMeters}m
                    </span>
                  </div>
                </TabsContent>

                {/* TAB 4: UE5 C++ CONTRACT */}
                <TabsContent value="ue5" className="space-y-3">
                  <div className="p-4 rounded bg-zinc-900 border border-zinc-800 font-mono text-xs space-y-2">
                    <div className="text-zinc-400">
                      Sincronizado diretamente com os módulos C++ do Unreal Engine 5:
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                      <div className="p-3 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-zinc-500 text-[10px]">MAP DATA ASSET</div>
                        <div className="text-cyan-400 mt-1 break-all">
                          {activeWorld.ue5Class.mapDataHeader}
                        </div>
                      </div>
                      <div className="p-3 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-zinc-500 text-[10px]">LEVEL ACTOR</div>
                        <div className="text-amber-400 mt-1 break-all">
                          {activeWorld.ue5Class.levelHeader}
                        </div>
                      </div>
                      <div className="p-3 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-zinc-500 text-[10px]">PERSISTENCE ENUM</div>
                        <div className="text-emerald-400 mt-1">
                          {activeWorld.ue5Class.persistenceEnum}
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 text-[11px] text-zinc-400">
                      Integração GAS: <code className="text-zinc-200">UKhaaosDamageManager::ApplyEnvironmentDamage</code> +{" "}
                      <code className="text-zinc-200">SafeZone-&gt;SetWorldZone()</code> +{" "}
                      <code className="text-zinc-200">UKhaaosMultiWorldPersistence::RecordWorldCompletion()</code>.
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Match / Extraction Simulator & Telemetry */}
        <div className="space-y-6">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader className="border-b border-zinc-800/80 pb-4">
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Simulador End-to-End de Operação
              </CardTitle>
              <p className="text-xs text-zinc-400">
                Executa ciclo completo no mundo selecionado, calcula KRC com multiplicador e atualiza desbloqueios em `UKhaaosMultiWorldPersistence`.
              </p>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              <div className="p-3 rounded bg-zinc-900 border border-zinc-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Mundo Alvo:</span>
                  <span className="text-white font-bold">{activeWorld.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Multiplicador KRC:</span>
                  <span className="text-amber-400 font-bold">{activeWorld.krcMultiplier}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Status de Acesso:</span>
                  <span className={activeStats?.unlocked ? "text-emerald-400" : "text-rose-400"}>
                    {activeStats?.unlocked ? "LIBERADO" : "BLOQUEADO"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={selectedExtractionMode === "ZEX" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedExtractionMode("ZEX")}
                  className="text-xs font-mono"
                  data-testid="button-mode-zex"
                >
                  Extração ZEX (Tática)
                </Button>
                <Button
                  type="button"
                  variant={selectedExtractionMode === "ZU" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedExtractionMode("ZU")}
                  className="text-xs font-mono"
                  data-testid="button-mode-zu"
                >
                  Vitória ZU (Final)
                </Button>
              </div>

              <Button
                className="w-full font-mono text-xs"
                disabled={!activeStats?.unlocked || simulateMutation.isPending}
                onClick={() =>
                  simulateMutation.mutate({
                    worldId: activeWorld.id,
                    extractionType: selectedExtractionMode,
                  })
                }
                data-testid="button-simulate-world-run"
              >
                <Play className="w-3.5 h-3.5 mr-1.5" />
                {simulateMutation.isPending
                  ? "Simulando Partida..."
                  : `Executar Incursão em ${activeWorld.name}`}
              </Button>

              {lastSimResult && (
                <div
                  className="p-4 rounded bg-zinc-900/90 border border-amber-500/40 space-y-2.5 text-xs font-mono"
                  data-testid="simulation-result-panel"
                >
                  <div className="flex items-center justify-between text-amber-400 font-bold">
                    <span>RELATÓRIO DE EXTRAÇÃO</span>
                    <span>{lastSimResult.simulationId}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-zinc-300">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">MUNDO / TIPO</span>
                      <span>
                        {lastSimResult.worldName} ({lastSimResult.extractionType})
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">POI EXPLORADO</span>
                      <span>{lastSimResult.poiVisited}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">FASE / SOBREVIVÊNCIA</span>
                      <span>
                        Fase {lastSimResult.phaseReached} • {lastSimResult.survivalTimeSeconds}s
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">ABATES / KRC MINTADO</span>
                      <span className="text-emerald-400 font-bold">
                        {lastSimResult.kills} Kills • +{lastSimResult.totalKrcMinted} KRC
                      </span>
                    </div>
                  </div>

                  {lastSimResult.newlyUnlockedWorlds.length > 0 && (
                    <div className="p-2 rounded bg-emerald-950/50 border border-emerald-600/50 text-emerald-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>
                        Novo Mundo Desbloqueado: <strong>{lastSimResult.newlyUnlockedWorlds.join(", ")}</strong>!
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Player Career Stats for Selected World */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader className="border-b border-zinc-800/80 pb-3">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-cyan-400" />
                Histórico Persistente em {activeWorld.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                <div className="text-zinc-500 text-[10px]">INCURSÕES</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {activeStats?.matchesPlayed ?? 0}
                </div>
              </div>
              <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                <div className="text-zinc-500 text-[10px]">EXTRAÇÕES ZEX/ZU</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {activeStats?.successfulExtractions ?? 0}
                </div>
              </div>
              <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                <div className="text-zinc-500 text-[10px]">VITÓRIAS ZU</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">
                  {activeStats?.zuVictories ?? 0}
                </div>
              </div>
              <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                <div className="text-zinc-500 text-[10px]">KRC OBTIDO NO MUNDO</div>
                <div className="text-base font-bold text-cyan-400 mt-0.5">
                  {activeStats?.krcEarned ?? 0} KRC
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Central de Engenharia UE5.8: Mapas 3D (.umap/.obj/.gltf), Niagara VFX & SDK EAC */}
      <UE5EngineeringHub selectedWorldId={activeWorld.id} />
    </div>
  );
}
