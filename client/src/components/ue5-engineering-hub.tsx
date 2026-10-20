import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Cpu,
  Box,
  ShieldCheck,
  Terminal,
  Copy,
  Check,
  Flame,
  Eye,
  AlertTriangle,
  Crosshair,
  Layers,
} from "lucide-react";
import type { WorldId } from "@shared/worlds";
import {
  KHAAOS_NIAGARA_SYSTEMS,
  KHAAOS_WORLD_3D_BUNDLES,
  simulateEACViolationEvaluation,
  type EACViolationSimulationResult,
} from "@shared/ue5-engineering-hub";

interface UE5EngineeringHubProps {
  selectedWorldId: WorldId;
}

const EAC_PRESETS = [
  {
    id: "clean",
    label: "Heartbeat Íntegro (0 Strikes)",
    violationCode: "info_heartbeat_ok",
    description: "Sessão EAC autenticada com assinatura SHA-256 válida",
    priorStrikes: 0,
  },
  {
    id: "minor",
    label: "Violação Minor (+1 Strike)",
    violationCode: "minor_suspicious_firerate",
    description: "Cadência de tiro 14% acima do intervalo mínimo (Warning)",
    priorStrikes: 0,
  },
  {
    id: "major",
    label: "Violação Major (+2 Strikes)",
    violationCode: "major_integrity_wallhack_trace",
    description: "Anomalia de oclusão / tentativa de injeção de DLL secundária",
    priorStrikes: 0,
  },
  {
    id: "critical",
    label: "Violação Critical (3 Strikes → Auto-Kick)",
    violationCode: "critical_cheat_detected_memory_tamper",
    description: "Modificação de memória kernel / SpeedHack crítico detectado",
    priorStrikes: 0,
  },
] as const;

export function UE5EngineeringHub({ selectedWorldId }: UE5EngineeringHubProps) {
  const [activeSection, setActiveSection] = useState<"MAPS_3D" | "NIAGARA" | "UBT_BUILD" | "EAC_SDK">("MAPS_3D");
  const [showZexNodes, setShowZexNodes] = useState(true);
  const [showSectors, setShowSectors] = useState(true);
  const [showRingClose, setShowRingClose] = useState(true);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // EAC Simulator state
  const [selectedPresetId, setSelectedPresetId] = useState<string>("minor");
  const [accumulatedStrikes, setAccumulatedStrikes] = useState<number>(0);
  const [lastEacEval, setLastEacEval] = useState<EACViolationSimulationResult>(() =>
    simulateEACViolationEvaluation({
      playerId: 77,
      clientHandle: "EAC-ZHEERS-SESSION-9901",
      violationCode: "minor_suspicious_firerate",
      description: "Cadência de tiro 14% acima do intervalo mínimo (Warning)",
      priorStrikes: 0,
    })
  );

  const worldBundle = KHAAOS_WORLD_3D_BUNDLES[selectedWorldId] ?? KHAAOS_WORLD_3D_BUNDLES.Barburhen;

  const worldNiagaraSystems = useMemo(
    () =>
      KHAAOS_NIAGARA_SYSTEMS.filter(
        (n) => n.worldId === selectedWorldId || n.worldId === "All"
      ),
    [selectedWorldId]
  );

  const eacMutation = useMutation({
    mutationFn: async (payload: {
      playerId: number;
      clientHandle: string;
      violationCode: string;
      description: string;
      priorStrikes: number;
    }) => {
      const res = await apiRequest("POST", "/api/ue5/eac-simulate-check", payload);
      return (await res.json()) as { ok: boolean; evaluation: EACViolationSimulationResult };
    },
    onSuccess: (data) => {
      if (data?.evaluation) {
        setLastEacEval(data.evaluation);
        setAccumulatedStrikes(data.evaluation.kicked ? 0 : data.evaluation.totalStrikes);
      }
    },
  });

  const handleCopy = (key: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(null), 1800);
  };

  const runEacPreset = (preset: (typeof EAC_PRESETS)[number], resetStrikes = false) => {
    setSelectedPresetId(preset.id);
    const baseStrikes = resetStrikes ? 0 : accumulatedStrikes;
    const localEval = simulateEACViolationEvaluation({
      playerId: 77,
      clientHandle: "EAC-ZHEERS-SESSION-9901",
      violationCode: preset.violationCode,
      description: preset.description,
      priorStrikes: baseStrikes,
    });
    setLastEacEval(localEval);
    setAccumulatedStrikes(localEval.kicked ? 0 : localEval.totalStrikes);

    eacMutation.mutate({
      playerId: 77,
      clientHandle: "EAC-ZHEERS-SESSION-9901",
      violationCode: preset.violationCode,
      description: preset.description,
      priorStrikes: baseStrikes,
    });
  };

  return (
    <Card className="bg-zinc-950 border-zinc-800" data-testid="ue5-engineering-hub">
      <CardHeader className="border-b border-zinc-800/80 pb-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span className="text-amber-400 font-semibold">UE5.8 PIPELINE</span>
              <span aria-hidden="true">·</span>
              <span>327 ARQUIVOS C++20</span>
              <span aria-hidden="true">·</span>
              <span>5 MAPAS 3D (.OBJ / .GLTF / .UMAP)</span>
              <span aria-hidden="true">·</span>
              <span>11 NIAGARA VFX</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">EAC SDK BINÁRIO ATIVO</span>
            </div>
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-amber-400" />
              Central de Engenharia UE5.8 — Recursos 3D ({worldBundle.worldId}), Niagara &amp; SDK EAC
            </CardTitle>
          </div>

          {/* Functional Segmented Filter Control */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-md">
            <button
              type="button"
              onClick={() => setActiveSection("MAPS_3D")}
              data-testid="tab-ue5-maps-3d"
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                activeSection === "MAPS_3D"
                  ? "bg-amber-500 text-black font-bold"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              1. Mapa 3D &amp; .umap ({worldBundle.worldId})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("NIAGARA")}
              data-testid="tab-ue5-niagara"
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                activeSection === "NIAGARA"
                  ? "bg-amber-500 text-black font-bold"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              2. Sistemas Niagara ({worldNiagaraSystems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("UBT_BUILD")}
              data-testid="tab-ue5-ubt-build"
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                activeSection === "UBT_BUILD"
                  ? "bg-amber-500 text-black font-bold"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              3. Compilação UE5.8 &amp; Commandlet
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("EAC_SDK")}
              data-testid="tab-ue5-eac-sdk"
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                activeSection === "EAC_SDK"
                  ? "bg-amber-500 text-black font-bold"
                  : "text-zinc-300 hover:text-white"
              }`}
            >
              4. Binário SDK EAC (3-Strikes)
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-5">
        {activeSection === "MAPS_3D" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Interactive Top-Down / Spatial 3D Blockout Viewport */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-mono text-zinc-400">
                  <span>PACOTE: {worldBundle.umapPackagePath}</span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span>ESCALA: {worldBundle.sizeMeters}m × {worldBundle.sizeMeters}m</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={showSectors ? "default" : "outline"}
                    onClick={() => setShowSectors((v) => !v)}
                    className="h-7 px-2.5 text-[11px] font-mono"
                  >
                    <Layers className="w-3 h-3 mr-1" />
                    Setores ({worldBundle.sectors.length})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={showZexNodes ? "default" : "outline"}
                    onClick={() => setShowZexNodes((v) => !v)}
                    className="h-7 px-2.5 text-[11px] font-mono"
                  >
                    <Crosshair className="w-3 h-3 mr-1" />
                    15 Terminais ZEX
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={showRingClose ? "default" : "outline"}
                    onClick={() => setShowRingClose((v) => !v)}
                    className="h-7 px-2.5 text-[11px] font-mono"
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Anel ({worldBundle.ringCloseSeconds}s)
                  </Button>
                </div>
              </div>

              <div className="relative rounded-md border border-zinc-800 bg-zinc-900/90 p-3 overflow-hidden">
                <svg
                  viewBox="-500 -500 1000 1000"
                  className="w-full h-[360px] rounded bg-[#07090e]"
                  data-testid="svg-3d-world-viewport"
                >
                  {/* Coordinate Grid */}
                  {[-400, -200, 0, 200, 400].map((coord) => (
                    <g key={coord}>
                      <line
                        x1={coord}
                        y1={-480}
                        x2={coord}
                        y2={480}
                        stroke="#1f2937"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <line
                        x1={-480}
                        y1={coord}
                        x2={480}
                        y2={coord}
                        stroke="#1f2937"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                    </g>
                  ))}

                  {/* Shrinking Ring Boundaries */}
                  {showRingClose && (
                    <g>
                      <circle
                        cx={0}
                        cy={0}
                        r={410}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                        strokeDasharray="10 6"
                        opacity={0.65}
                      />
                      <circle
                        cx={0}
                        cy={0}
                        r={125}
                        fill="#ef444412"
                        stroke="#ef4444"
                        strokeWidth="2"
                        opacity={0.9}
                      />
                    </g>
                  )}

                  {/* 3D Sector Blockouts */}
                  {showSectors &&
                    worldBundle.sectors.map((sec) => {
                      const scale = 800 / worldBundle.sizeMeters;
                      const cx = sec.centerMeters[0] * scale;
                      const cy = sec.centerMeters[1] * scale;
                      const w = Math.max(110, sec.extentMeters[0] * scale);
                      const h = Math.max(80, sec.extentMeters[1] * scale);
                      return (
                        <g key={sec.id}>
                          <rect
                            x={cx - w / 2}
                            y={cy - h / 2}
                            width={w}
                            height={h}
                            rx={6}
                            fill="#f59e0b18"
                            stroke="#f59e0b"
                            strokeWidth="1.5"
                          />
                          <text
                            x={cx}
                            y={cy - 4}
                            fill="#ffffff"
                            fontSize="16"
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {sec.id}
                          </text>
                          <text
                            x={cx}
                            y={cy + 16}
                            fill="#fbbf24"
                            fontSize="13"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            Fração {sec.fraction} · Z={sec.extentMeters[2]}m
                          </text>
                        </g>
                      );
                    })}

                  {/* 15 ZEX Extraction Terminals */}
                  {showZexNodes &&
                    worldBundle.zexCoordinates.map((zex, idx) => {
                      const scale = 800 / worldBundle.sizeMeters;
                      const zx = zex.x * scale;
                      const zy = zex.y * scale;
                      return (
                        <g key={zex.id}>
                          <circle
                            cx={zx}
                            cy={zy}
                            r={9}
                            fill="#0284c7"
                            stroke="#38bdf8"
                            strokeWidth="2"
                          />
                          <text
                            x={zx}
                            y={zy - 13}
                            fill="#7dd3fc"
                            fontSize="11"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            ZEX-{idx + 1}
                          </text>
                        </g>
                      );
                    })}

                  {/* Central Extraction / Ring Core */}
                  <circle cx={0} cy={0} r={7} fill="#ef4444" />
                  <text
                    x={0}
                    y={24}
                    fill="#fca5a5"
                    fontSize="12"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    RING CENTER (0,0,100)
                  </text>
                </svg>
              </div>
            </div>

            {/* Right: 3D Mesh / DataTable / .umap Package Inventory */}
            <div className="lg:col-span-5 space-y-4">
              <div className="p-4 rounded-md bg-zinc-900/90 border border-zinc-800 space-y-3 font-mono text-xs">
                <div className="text-zinc-400 text-[11px]">
                  ATIVOS SINCRONIZADOS NO REPOSITÓRIO ({worldBundle.worldId})
                </div>

                <div className="space-y-2">
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px]">LEVEL PACKAGE (.UMAP DESCRIPTOR)</div>
                    <div className="text-amber-400 font-semibold mt-0.5 break-all">
                      {worldBundle.umapPackagePath}
                    </div>
                    <div className="text-zinc-400 text-[11px] mt-1">
                      Actor: {worldBundle.levelScriptClass} · Capacidade: {worldBundle.maxPlayers} players
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px]">MALHAS 3D (.OBJ &amp; .GLTF 2.0 NANITE)</div>
                    <div className="text-zinc-200 mt-0.5 break-all">{worldBundle.objMeshPath}</div>
                    <div className="text-zinc-400 mt-0.5 break-all">{worldBundle.gltfMeshPath}</div>
                  </div>

                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px]">DATATABLES OFICIAIS (.CSV)</div>
                    <div className="text-emerald-400 mt-0.5 break-all">{worldBundle.mapPointsCsvPath}</div>
                    <div className="text-emerald-400 mt-0.5 break-all">{worldBundle.worldConfigCsvPath}</div>
                  </div>

                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px]">FÓRMULA AMBIENTAL &amp; NIAGARA ATIVO</div>
                    <div className="text-cyan-400 font-semibold mt-0.5">
                      {worldBundle.primaryNiagaraHazard}
                    </div>
                    <div className="text-zinc-300 text-[11px] mt-1 leading-relaxed">
                      {worldBundle.hazardFormulaSummary}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === "NIAGARA" && (
          <div className="space-y-4">
            <div className="text-xs font-mono text-zinc-400">
              <span>SUBSISTEMA C++: UKhaaosVFXManager (Game/VFX/KhaaosVFXManager.h)</span>
              <span className="mx-2" aria-hidden="true">·</span>
              <span>SIGNIFICANCE MANAGER LOD ATIVO</span>
              <span className="mx-2" aria-hidden="true">·</span>
              <span>POOLING MAX 32 INSTÂNCIAS/TIPO</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {worldNiagaraSystems.map((sys) => (
                <div
                  key={sys.id}
                  className="p-3.5 rounded-md bg-zinc-900/90 border border-zinc-800 space-y-2 font-mono text-xs"
                  data-testid={`niagara-card-${sys.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: sys.colorHex }}
                      />
                      {sys.id}
                    </span>
                    <span className="text-[11px] text-zinc-400">Rank LOD {sys.significanceRank}</span>
                  </div>

                  <div className="text-[11px] text-zinc-400 break-all">{sys.packagePath}</div>

                  <p className="text-zinc-300 text-[11px] font-sans leading-relaxed">
                    {sys.description}
                  </p>

                  <div className="pt-1 flex items-center gap-2 text-[11px] text-zinc-400 border-t border-zinc-800/80">
                    <span>Spawn: {sys.spawnRate}/s</span>
                    <span aria-hidden="true">·</span>
                    <span>Max: {sys.maxParticles}</span>
                    <span aria-hidden="true">·</span>
                    <span>TTL: {sys.lifetimeSeconds}s</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === "UBT_BUILD" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-4 rounded-md bg-zinc-900/90 border border-zinc-800 space-y-3 font-mono text-xs">
              <div className="text-white font-bold flex items-center gap-2">
                <Box className="w-4 h-4 text-amber-400" />
                Status de Compilação C++20 &amp; UHT (UE 5.8)
              </div>

              <div className="space-y-2 text-zinc-300">
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span className="text-zinc-400">Arquivos C++ / Headers Auditados:</span>
                  <span className="text-emerald-400 font-bold">327 arquivos (167 UCLASS · 230 USTRUCT)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span className="text-zinc-400">Macro de Exportação UBT:</span>
                  <span className="text-emerald-400 font-bold">KHAAOSRUN_API (100% padronizado)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span className="text-zinc-400">Módulos Build.cs Vinculados:</span>
                  <span className="text-white">GAS · Iris · Niagara · PCG · UMG · Slate · EOSSDK</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span className="text-zinc-400">Commandlet de Geração .umap:</span>
                  <span className="text-amber-400">UKhaaosWorldAssetBuilderCommandlet</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-400">Container Multi-Stage Linux:</span>
                  <span className="text-cyan-400">ghcr.io/epicgames/unreal-engine:dev-slim-5.8</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-md bg-zinc-900/90 border border-zinc-800 space-y-3 font-mono text-xs">
              <div className="text-white font-bold flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                Comandos de Automação (Compilação &amp; Geração de Mapas)
              </div>

              {[
                {
                  key: "audit",
                  label: "1. Auditar C++20, Mapas 3D, Niagara e Binários EAC",
                  cmd: "node scripts/verify_ue5_build_readiness.mjs",
                },
                {
                  key: "commandlet",
                  label: "2. Gerar os 5 .umap + Niagara via UE5.8 Editor Commandlet",
                  cmd: "bash scripts/setup_ue5_editor.sh --generate-maps",
                },
                {
                  key: "server",
                  label: "3. Compilar & Empacotar KhaaosRunServer (Linux Shipping + Docker)",
                  cmd: "bash scripts/build-server.sh --release --docker",
                },
              ].map((item) => (
                <div key={item.key} className="p-2.5 rounded bg-zinc-950 border border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>{item.label}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(item.key, item.cmd)}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1"
                      data-testid={`button-copy-cmd-${item.key}`}
                    >
                      {copiedCmd === item.key ? (
                        <>
                          <Check className="w-3 h-3" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-zinc-200 select-all break-all">{item.cmd}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === "EAC_SDK" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 space-y-3">
              <div className="p-4 rounded-md bg-zinc-900/90 border border-zinc-800 space-y-3 font-mono text-xs">
                <div className="text-white font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Binários Easy Anti-Cheat (EOS Anti-Cheat C-ABI Bridge)
                </div>

                <div className="space-y-1.5 text-[11px] text-zinc-300">
                  <div>
                    <span className="text-zinc-500">Header C++20 Bridge: </span>
                    <span className="text-emerald-400">ThirdParty/EasyAntiCheat/include/eos_anticheat_bridge.h</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Linux Server Binary: </span>
                    <span className="text-zinc-200">ThirdParty/EasyAntiCheat/Binaries/Linux/libeasyanticheat_server.so</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Win64 Client Binary: </span>
                    <span className="text-zinc-200">ThirdParty/EasyAntiCheat/Binaries/Win64/EasyAntiCheat_x64.dll</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Integração 3-Strikes: </span>
                    <span className="text-amber-400">UKhaaosEACIntegration → UKhaaosAntiCheat::IssueStrike()</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800 space-y-2">
                  <div className="text-zinc-400 text-[11px]">
                    TESTAR CLASSIFICADOR DE VIOLAÇÕES &amp; POLÍTICA DE 3 STRIKES:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {EAC_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        size="sm"
                        variant={selectedPresetId === preset.id ? "default" : "outline"}
                        onClick={() => runEacPreset(preset)}
                        className="justify-start text-left h-auto py-2 px-3 font-mono text-[11px]"
                        data-testid={`button-eac-preset-${preset.id}`}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div
                className="p-4 rounded-md bg-zinc-900/90 border border-zinc-800 space-y-3 font-mono text-xs h-full"
                data-testid="eac-simulation-result"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    Telemetria de Validação EAC (Player #{lastEacEval.playerId})
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAccumulatedStrikes(0);
                      runEacPreset(EAC_PRESETS[0], true);
                    }}
                    className="h-7 px-2.5 text-[11px]"
                  >
                    Zerar Strikes
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px]">HANDLE &amp; DIGEST FNV-1A</div>
                    <div className="text-zinc-200 mt-0.5 truncate">{lastEacEval.clientHandle}</div>
                    <div className="text-cyan-400 text-[11px]">{lastEacEval.attestationDigestHex}</div>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px]">SEVERIDADE CLASSIFICADA</div>
                    <div className="text-amber-400 font-bold mt-0.5">{lastEacEval.category}</div>
                    <div className="text-zinc-400 text-[11px]">+{lastEacEval.strikesAssigned} Strike(s)</div>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px]">ACÚMULO DE STRIKES</div>
                    <div className="text-white font-bold mt-0.5">
                      {lastEacEval.totalStrikes} / 3 Strikes
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                    <div className="text-zinc-500 text-[10px]">AÇÃO DO SERVIDOR DEDICADO</div>
                    <div
                      className={`font-bold mt-0.5 ${
                        lastEacEval.kicked
                          ? "text-rose-400"
                          : lastEacEval.strikesAssigned > 0
                          ? "text-amber-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {lastEacEval.recommendedAction}
                    </div>
                  </div>
                </div>

                {lastEacEval.kicked && (
                  <div className="p-2.5 rounded bg-rose-950/60 border border-rose-500/50 text-rose-200 flex items-center gap-2 text-[11px]">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      Auto-Kick acionado via <code>GameSession-&gt;KickPlayer()</code> e cliente desregistrado do EAC Server.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
