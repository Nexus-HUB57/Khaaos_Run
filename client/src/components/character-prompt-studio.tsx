import { useState, useMemo, useEffect } from "react";
import {
  Camera,
  Video,
  ShieldAlert,
  Copy,
  Check,
  Sparkles,
  Cpu,
  Layers,
  Play,
  Pause,
  UserCheck,
  Sliders,
  Terminal,
  FileJson,
  Eye,
  Crosshair,
  Move,
  Globe,
  Search,
} from "lucide-react";
import { CyberCard } from "@/components/cyber-card";
import { OperativeAvatarBadge } from "@/components/operative-avatar-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { playTacticalSfx } from "@/lib/tactical-sfx";
import {
  KHAAOS_OPERATIVE_ARCHETYPES,
  WORLD_BACKDROP_PROMPTS,
  FRAMING_MODES,
  SYNCED_HIGH_TECH_TOOLS,
  CANONICAL_BASE_PROMPTS,
  buildOperativePromptBundle,
  type OperativeGender,
  type CameraFramingMode,
  type SkinRarityTier,
} from "@shared/character-studio";
import {
  PROTECTED_CONSOLE_PATHS,
  TRACKED_REPO_PRS,
  validatePRPathsSafety,
} from "@shared/repo-pr-coordination";
import type { WorldId } from "@shared/worlds";

const WORLD_IDS: WorldId[] = ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"];
const SKIN_TIERS: SkinRarityTier[] = ["COMUM", "RARO", "EPICO", "LENDARIO", "MITICO"];
const FRAMING_KEYS: CameraFramingMode[] = [
  "PORTRAIT_35MM",
  "FULL_BODY_TACTICAL",
  "ORTHO_3D_APOSE",
];

export function CharacterPromptStudio() {
  const { toast } = useToast();
  const [genderFilter, setGenderFilter] = useState<"ALL" | OperativeGender>("ALL");
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>("OP_MALE_VANGUARD");
  const [worldId, setWorldId] = useState<WorldId>("CIGKV");
  const [framing, setFraming] = useState<CameraFramingMode>("PORTRAIT_35MM");
  const [skinRarity, setSkinRarity] = useState<SkinRarityTier>("LENDARIO");
  const [includeBioClause, setIncludeBioClause] = useState<boolean>(true);
  const [promptLang, setPromptLang] = useState<"EN" | "PT" | "BASE">("EN");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [simulateConsoleTouch, setSimulateConsoleTouch] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");

  const prSafetyValidation = useMemo(() => {
    const baseFiles = [
      "shared/character-studio.ts",
      "shared/repo-pr-coordination.ts",
      "client/src/components/character-prompt-studio.tsx",
      "Content/Assets/asset_manifest.json",
      "scripts/khaaos_workflow.sh",
      ".github/workflows/dev-coordination.yml",
      ".github/workflows/pr-checks.yml",
    ];
    if (simulateConsoleTouch) {
      baseFiles.push("server/game/marshalConsole.ts", "client/src/pages/marshal-console.tsx");
    }
    return validatePRPathsSafety({
      modifiedFiles: baseFiles,
      deletedFiles: [],
      allowConsoleTouch: false,
      allowDeletions: false,
    });
  }, [simulateConsoleTouch]);

  // Interactive 10-second live-action choreography preview timer
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(true);
  const [timelineSec, setTimelineSec] = useState<number>(0);

  useEffect(() => {
    if (!isPlayingTimeline) return;
    const timer = window.setInterval(() => {
      setTimelineSec((prev) => {
        const next = prev + 0.2;
        return next >= 10 ? 0 : Number(next.toFixed(1));
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, [isPlayingTimeline]);

  const maleCount = useMemo(
    () => KHAAOS_OPERATIVE_ARCHETYPES.filter((op) => op.gender === "MASCULINO").length,
    [],
  );
  const femaleCount = useMemo(
    () => KHAAOS_OPERATIVE_ARCHETYPES.filter((op) => op.gender === "FEMININO").length,
    [],
  );

  const filteredArchetypes = useMemo(() => {
    let list = KHAAOS_OPERATIVE_ARCHETYPES;
    if (genderFilter !== "ALL") {
      list = list.filter((op) => op.gender === genderFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (op) =>
          op.codename.toLowerCase().includes(q) ||
          op.fullName.toLowerCase().includes(q) ||
          op.ethnicity.toLowerCase().includes(q) ||
          op.roleTitle.toLowerCase().includes(q),
      );
    }
    return list;
  }, [genderFilter, searchTerm]);

  const bundle = useMemo(
    () =>
      buildOperativePromptBundle({
        archetypeId: selectedArchetypeId,
        worldId,
        framing,
        skinRarity,
        includeBiomechanicalClause: includeBioClause,
      }),
    [selectedArchetypeId, worldId, framing, skinRarity, includeBioClause],
  );

  const activeKeyframeIndex = useMemo(() => {
    if (timelineSec < 2) return 0;
    if (timelineSec < 4) return 1;
    if (timelineSec < 6) return 2;
    if (timelineSec < 8) return 3;
    return 4;
  }, [timelineSec]);

  const activeKeyframe = bundle.timelineKeyframes[activeKeyframeIndex];

  const handleSelectArchetype = (id: string) => {
    const found = KHAAOS_OPERATIVE_ARCHETYPES.find((a) => a.id === id);
    setSelectedArchetypeId(id);
    if (found) {
      setWorldId(found.defaultWorldId);
      setSkinRarity(found.skinRarity);
    }
    playTacticalSfx("packback_use");
  };

  const handleCopy = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      playTacticalSfx("loot_pickup");
      toast({
        title: "PROMPT COPIADO PARA O CLIPBOARD",
        description: `${label} pronto para colar na ferramenta de geração/modelagem.`,
      });
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast({
        title: "FALHA AO COPIAR",
        description: "Selecione o texto manualmente para copiar.",
        variant: "destructive",
      });
    }
  };

  const displayedImagePrompt =
    promptLang === "BASE"
      ? CANONICAL_BASE_PROMPTS.imageBaseEn
      : promptLang === "PT"
      ? bundle.imagePromptPt
      : bundle.imagePromptEn;

  const displayedVideoPrompt =
    promptLang === "BASE"
      ? CANONICAL_BASE_PROMPTS.videoBaseEn
      : promptLang === "PT"
      ? bundle.videoPromptPt
      : bundle.videoPromptEn;

  return (
    <div className="space-y-6" data-testid="character-prompt-studio">
      {/* Studio Header Banner */}
      <CyberCard className="border-primary/40 bg-gradient-to-r from-black/90 via-primary/10 to-purple-950/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <Badge className="bg-primary/20 text-primary border-primary/40 font-mono text-[10px] tracking-widest">
                ESTÚDIO DE PERSONAGENS & SKINS 3D
              </Badge>
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 font-mono text-[10px] tracking-widest">
                FREE FIRE + FORTNITE × IDENTIDADE KHAAOS RUN
              </Badge>
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 font-mono text-[10px] tracking-widest">
                LIVE-ACTION 35MM · 4K · UE5.8 LYRA SYNC
              </Badge>
            </div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground tracking-wide">
              ARQUITETURA DE OPERADORES MASCULINOS & FEMININOS (IMAGEM + VÍDEO 10S + RIG 3D)
            </h2>
            <p className="text-xs font-mono text-muted-foreground mt-1 max-w-3xl">
              Prompts paramétricos fotorrealistas com biomecânica plausível, disciplina de gatilho, atrito físico real e
              exportação direta para <span className="text-primary">UE5_Mannequin (SK_Zheers_Base)</span>,{" "}
              <span className="text-cyan-300">Blender FBX/DAE</span>, <span className="text-purple-300">Image-to-3D PBR</span> e{" "}
              <span className="text-amber-300">Image-to-Video (Single Continuous Shot)</span>.
            </p>
          </div>

          {/* Search and Gender Filter Switcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por etnia, codinome..."
                className="bg-black/60 border border-border/50 text-[11px] font-mono pl-8 pr-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 w-full sm:w-48"
              />
            </div>

            <div className="flex items-center gap-1 bg-black/60 p-1 border border-border/50">
              <button
                type="button"
                onClick={() => setGenderFilter("ALL")}
                data-testid="filter-gender-all"
                className={`px-2.5 py-1 text-[10px] font-mono tracking-widest transition-all ${
                  genderFilter === "ALL"
                    ? "bg-primary text-black font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                TODOS ({KHAAOS_OPERATIVE_ARCHETYPES.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setGenderFilter("MASCULINO");
                  const firstMale = KHAAOS_OPERATIVE_ARCHETYPES.find((a) => a.gender === "MASCULINO");
                  if (firstMale) handleSelectArchetype(firstMale.id);
                }}
                data-testid="filter-gender-male"
                className={`px-2.5 py-1 text-[10px] font-mono tracking-widest transition-all ${
                  genderFilter === "MASCULINO"
                    ? "bg-cyan-500 text-black font-bold"
                    : "text-muted-foreground hover:text-cyan-300"
                }`}
              >
                ♂ MASCULINOS ({maleCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  setGenderFilter("FEMININO");
                  const firstFemale = KHAAOS_OPERATIVE_ARCHETYPES.find((a) => a.gender === "FEMININO");
                  if (firstFemale) handleSelectArchetype(firstFemale.id);
                }}
                data-testid="filter-gender-female"
                className={`px-2.5 py-1 text-[10px] font-mono tracking-widest transition-all ${
                  genderFilter === "FEMININO"
                    ? "bg-purple-500 text-white font-bold"
                    : "text-muted-foreground hover:text-purple-300"
                }`}
              >
                ♀ FEMININOS ({femaleCount})
              </button>
            </div>
          </div>
        </div>
      </CyberCard>

      {/* Operative Archetypes Grid (8 Male & 8 Female with Bespoke SVG Avatars & Ethnicities) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {filteredArchetypes.map((op) => {
          const isSelected = op.id === bundle.operative.id;
          return (
            <button
              key={op.id}
              type="button"
              onClick={() => handleSelectArchetype(op.id)}
              data-testid={`select-operative-${op.id}`}
              className={`text-left p-3 border transition-all relative overflow-hidden group ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-[0_0_20px_-5px_hsla(25,95%,55%,0.4)] ring-1 ring-primary/40"
                  : "border-border/40 bg-black/40 hover:border-primary/40 hover:bg-black/60"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <OperativeAvatarBadge
                  operative={op}
                  size="md"
                  showRankBadge={false}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span
                      className={`text-[8px] font-mono px-1.5 py-0.2 border ${
                        op.gender === "FEMININO"
                          ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
                          : "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                      }`}
                    >
                      {op.gender === "FEMININO" ? "♀ FEM" : "♂ MASC"}
                    </span>
                    <span className="text-[8px] font-mono text-amber-300 tracking-wider">
                      {op.rank}
                    </span>
                  </div>

                  <div className="font-display font-bold text-sm text-foreground tracking-wider truncate">
                    {op.codename}
                  </div>
                  <div className="text-[9px] font-mono text-primary truncate">
                    {op.roleTitle}
                  </div>
                  <div className="text-[8px] font-mono text-cyan-300/80 truncate mt-0.5">
                    {op.ethnicity}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-border/30 flex items-center justify-between text-[8px] font-mono text-muted-foreground">
                <span className="truncate">{op.defaultWorldId} · {op.specializationId}</span>
                <span className="shrink-0">
                  {op.biomechanics.heightCm}cm / {op.biomechanics.massKg}kg
                </span>
              </div>

              {/* Color identity bar */}
              <div className="mt-1.5 flex h-1 w-full overflow-hidden">
                <div className="flex-1" style={{ backgroundColor: op.accentColors.primaryHex }} />
                <div className="flex-1" style={{ backgroundColor: op.accentColors.secondaryHex }} />
                <div className="flex-1" style={{ backgroundColor: op.accentColors.trimHex }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Studio Grid: Left = Visualizer & Parameters, Right = Compiled Prompts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Visual Rig Blueprint + Parameter Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Avatar Reference & Ethnic Heritage Dossier */}
          <CyberCard
            title={`AVATAR & IDENTIDADE ÉTNICA · ${bundle.operative.codename}`}
            subtitle={`${bundle.operative.ethnicity} · ${
              bundle.operative.gender === "FEMININO" ? "♀ OPERADORA FEMININA" : "♂ OPERADOR MASCULINO"
            }`}
          >
            <div className="space-y-3.5">
              <div className="flex items-center gap-3.5 bg-black/60 border border-border/40 p-3">
                <OperativeAvatarBadge
                  operative={bundle.operative}
                  size="lg"
                  showRankBadge={true}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <Badge variant="outline" className="text-[9px] font-mono border-primary/50 text-primary">
                      {bundle.operative.rank}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] font-mono border-cyan-500/50 text-cyan-300">
                      {bundle.operative.defaultWorldId}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] font-mono border-amber-500/50 text-amber-300">
                      {bundle.operative.skinRarity}
                    </Badge>
                  </div>
                  <h3 className="font-display font-bold text-lg text-foreground tracking-wider">
                    {bundle.operative.fullName}
                  </h3>
                  <p className="text-xs font-mono text-primary/90 mt-0.5">
                    {bundle.operative.roleTitle}
                  </p>
                  <p className="text-[11px] font-mono text-cyan-200/90 mt-1">
                    <span className="text-muted-foreground">Etnia / Origem:</span> {bundle.operative.ethnicity}
                  </p>
                </div>
              </div>

              {/* Cultural Lore & Factional Background */}
              <div className="bg-black/40 border border-border/30 p-2.5 text-xs font-mono text-muted-foreground leading-relaxed">
                <div className="text-[10px] font-bold text-amber-300 tracking-wider uppercase mb-1">
                  Doutrina & Herança de Sobrevivência
                </div>
                {bundle.operative.heritageLore}
              </div>

              {/* Visual Facial & Cybernetic Attributes */}
              {bundle.operative.avatarVisual && (
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div className="bg-black/50 border border-border/30 p-2">
                    <span className="text-muted-foreground block text-[9px]">TOM DE PELE</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ backgroundColor: bundle.operative.avatarVisual.skinToneHex }}
                      />
                      <span className="text-foreground">{bundle.operative.avatarVisual.skinToneHex}</span>
                    </div>
                  </div>
                  <div className="bg-black/50 border border-border/30 p-2">
                    <span className="text-muted-foreground block text-[9px]">CABELO & CORTE</span>
                    <span className="text-foreground truncate block mt-0.5">
                      {bundle.operative.avatarVisual.hairStyle}
                    </span>
                  </div>
                  <div className="bg-black/50 border border-border/30 p-2">
                    <span className="text-muted-foreground block text-[9px]">OLHOS / ÓPTICA</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ backgroundColor: bundle.operative.avatarVisual.eyeColorHex }}
                      />
                      <span className="text-foreground">{bundle.operative.avatarVisual.eyeColorHex}</span>
                    </div>
                  </div>
                  <div className="bg-black/50 border border-border/30 p-2">
                    <span className="text-muted-foreground block text-[9px]">EQUIPAMENTO FACIAL</span>
                    <span className="text-foreground truncate block mt-0.5">
                      {bundle.operative.avatarVisual.headgearOrVisor}
                    </span>
                  </div>
                </div>
              )}

              {/* Quick Copy Avatar Prompt & Download SVG */}
              <div className="pt-1 space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleCopy(
                      `avatar-${bundle.operative.id}`,
                      `Live-action cinematic headshot avatar portrait of original battle royale operator ${bundle.operative.fullName}. ${bundle.operative.appearancePromptEn}, ${bundle.operative.wardrobePromptEn}. Photorealistic 4k, 35mm lens, sharp focus, natural skin texture, dramatic lighting, no HUD, no cartoon.`,
                      `Prompt de Avatar de ${bundle.operative.codename}`,
                    )
                  }
                  className="w-full text-xs font-mono border-primary/40 hover:bg-primary/20 text-primary-foreground flex items-center justify-center gap-1.5"
                >
                  {copiedKey === `avatar-${bundle.operative.id}` ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> PROMPT DO AVATAR COPIADO!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> COPIAR PROMPT DO AVATAR 4K (MIDJOURNEY / SDXL / FLUX)
                    </>
                  )}
                </Button>

                <div className="flex gap-2">
                  <a
                    href={`/avatars/${bundle.operative.gender === "FEMININO" ? "female" : "male"}/${bundle.operative.id.toLowerCase()}.svg`}
                    download={`${bundle.operative.id.toLowerCase()}.svg`}
                    data-testid="download-avatar-svg"
                    className="flex-1 py-1.5 px-2 text-[10px] font-mono text-center border border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-900/30 text-cyan-300 transition-all flex items-center justify-center gap-1"
                  >
                    BAIXAR VETOR SVG (512×512)
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const folder = bundle.operative.gender === "FEMININO" ? "female" : "male";
                      const filename = bundle.operative.id.toLowerCase();
                      handleCopy(
                        `svg-path-${bundle.operative.id}`,
                        `Content/Avatars/${folder}/${filename}.svg`,
                        `Caminho do Asset SVG (${bundle.operative.codename})`
                      );
                    }}
                    className="py-1.5 px-2.5 text-[10px] font-mono border border-border/50 bg-black/60 hover:bg-border/20 text-muted-foreground hover:text-white transition-all"
                  >
                    {copiedKey === `svg-path-${bundle.operative.id}` ? "COPIADO!" : "PATH UE5"}
                  </button>
                </div>
              </div>
            </div>
          </CyberCard>

          <CyberCard
            title={`RIG BIOMECÂNICO · ${bundle.operative.codename}`}
            subtitle={`${bundle.operative.ueAssetId} · ESQUELETO ${bundle.operative.biomechanics.skeleton}`}
          >
            {/* Interactive Live-Action Silhouette & Rig Telemetry Preview */}
            <div className="relative bg-black/80 border border-border/50 p-4 overflow-hidden">
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-3">
                <span className="flex items-center gap-1.5 text-primary">
                  <Camera className="w-3.5 h-3.5" /> 35MM CINEMA · 24FPS · 4K RAW
                </span>
                <span className="text-emerald-400">TRIGGER DISCIPLINE: LOCKED</span>
              </div>

              {/* SVG Tactical Operator Rig Diagram */}
              <div className="relative h-56 flex items-center justify-center border border-border/30 bg-gradient-to-b from-primary/5 via-purple-950/15 to-black/90">
                <svg
                  viewBox="0 0 260 220"
                  className="w-full h-full max-h-52"
                  aria-label="Diagrama Biomecânico do Operador Khaaos Run"
                >
                  {/* Grid lines */}
                  <line x1="0" y1="195" x2="260" y2="195" stroke="rgba(249,115,22,0.3)" strokeWidth="1" />
                  <line x1="130" y1="10" x2="130" y2="205" stroke="rgba(124,58,237,0.25)" strokeDasharray="3 3" />

                  {/* PackBack Tactical Rig Glow */}
                  <rect
                    x="106"
                    y="58"
                    width="48"
                    height="56"
                    rx="4"
                    fill="rgba(124,58,237,0.18)"
                    stroke={bundle.operative.accentColors.secondaryHex}
                    strokeWidth="1.5"
                  />

                  {/* Head & Tactical Focus */}
                  <circle
                    cx="130"
                    cy="34"
                    r="14"
                    fill="rgba(255,255,255,0.06)"
                    stroke={bundle.operative.accentColors.primaryHex}
                    strokeWidth="1.8"
                  />
                  {/* Female braid cue if FEMININO */}
                  {bundle.operative.gender === "FEMININO" && (
                    <path
                      d="M142 36 Q155 48 150 66"
                      fill="none"
                      stroke={bundle.operative.accentColors.secondaryHex}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Modular Tactical Vest (Torso) */}
                  <polygon
                    points={
                      bundle.operative.gender === "FEMININO"
                        ? "110,54 150,54 144,112 116,112"
                        : "105,54 155,54 148,114 112,114"
                    }
                    fill="rgba(249,115,22,0.14)"
                    stroke={bundle.operative.accentColors.primaryHex}
                    strokeWidth="1.8"
                  />

                  {/* War'I Tactical Belt (Gold Trim) */}
                  <rect
                    x="112"
                    y="110"
                    width="36"
                    height="7"
                    fill={bundle.operative.accentColors.trimHex}
                    opacity="0.85"
                  />

                  {/* Arms + Fingerless Gloves + Assault Rifle with Trigger Discipline */}
                  <path
                    d="M108 60 L92 92 L118 96"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M152 60 L166 90 L138 94"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  {/* WPN_AssaultRifle_MK1 Silhouette */}
                  <line
                    x1="96"
                    y1="95"
                    x2="178"
                    y2="87"
                    stroke={bundle.operative.accentColors.primaryHex}
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <line
                    x1="135"
                    y1="92"
                    x2="138"
                    y2="106"
                    stroke={bundle.operative.accentColors.trimHex}
                    strokeWidth="3"
                  />

                  {/* Cargo Pants & Articulated Knee Pads */}
                  <line x1="120" y1="117" x2="114" y2="188" stroke="#cbd5e1" strokeWidth="4.5" />
                  <line x1="140" y1="117" x2="146" y2="188" stroke="#cbd5e1" strokeWidth="4.5" />
                  {/* Knee Pads */}
                  <circle cx="116" cy="152" r="4.5" fill={bundle.operative.accentColors.primaryHex} />
                  <circle cx="144" cy="152" r="4.5" fill={bundle.operative.accentColors.primaryHex} />
                  {/* Combat Boots */}
                  <rect x="106" y="186" width="14" height="7" fill="#f97316" />
                  <rect x="140" y="186" width="14" height="7" fill="#f97316" />

                  {/* Callout Labels */}
                  <text x="8" y="34" fill="#f97316" fontSize="7" fontFamily="monospace">
                    PELE REAL + SUOR/POEIRA
                  </text>
                  <text x="8" y="68" fill="#c084fc" fontSize="7" fontFamily="monospace">
                    PACKBACK + COLETE TÁTICO
                  </text>
                  <text x="8" y="98" fill="#facc15" fontSize="7" fontFamily="monospace">
                    DISCIPLINA DE GATILHO
                  </text>
                  <text x="8" y="155" fill="#38bdf8" fontSize="7" fontFamily="monospace">
                    JOELHEIRA + SLIDE ATRITO
                  </text>
                  <text x="8" y="191" fill="#4ade80" fontSize="7" fontFamily="monospace">
                    FOOT PLACEMENT IK REAL
                  </text>
                </svg>
              </div>

              {/* Biomechanical Telemetry Grid */}
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="bg-black/60 border border-border/40 p-2">
                  <div className="text-[9px] font-mono text-muted-foreground">VELOCIDADE SPRINT</div>
                  <div className="text-xs font-display font-bold text-primary">
                    {bundle.operative.biomechanics.sprintSpeedMps} m/s
                  </div>
                </div>
                <div className="bg-black/60 border border-border/40 p-2">
                  <div className="text-[9px] font-mono text-muted-foreground">ATRITO DE SLIDE</div>
                  <div className="text-xs font-display font-bold text-cyan-300">
                    μ = {bundle.operative.biomechanics.slideFrictionCoeff}
                  </div>
                </div>
                <div className="bg-black/60 border border-border/40 p-2">
                  <div className="text-[9px] font-mono text-muted-foreground">ABSORÇÃO RECUO</div>
                  <div className="text-xs font-display font-bold text-amber-300">
                    {bundle.operative.biomechanics.recoilAbsorptionDeg}°
                  </div>
                </div>
              </div>
            </div>

            {/* Parameter Controls */}
            <div className="space-y-3 mt-4">
              <div>
                <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  1. MUNDO / BIOMA DE FUNDO (BACKGROUND)
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {WORLD_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setWorldId(id)}
                      data-testid={`studio-world-${id}`}
                      className={`py-1.5 text-[10px] font-mono border transition-all ${
                        worldId === id
                          ? "border-primary bg-primary/20 text-primary font-bold"
                          : "border-border/40 bg-black/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {id}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] font-mono text-cyan-300/90 mt-1">
                  {WORLD_BACKDROP_PROMPTS[worldId].name}
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  2. ENQUADRAMENTO & MODO DE CAPTURA
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {FRAMING_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFraming(key)}
                      data-testid={`studio-framing-${key}`}
                      className={`px-3 py-2 text-left text-[10px] font-mono border transition-all flex items-center justify-between ${
                        framing === key
                          ? "border-cyan-400 bg-cyan-950/30 text-cyan-200 font-bold"
                          : "border-border/40 bg-black/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>{FRAMING_MODES[key].label}</span>
                      {framing === key && <span className="text-cyan-400">ATIVO</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                  3. RARIDADE DA SKIN / ACABAMENTO PBR
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {SKIN_TIERS.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setSkinRarity(tier)}
                      data-testid={`studio-rarity-${tier}`}
                      className={`py-1.5 text-[9px] font-mono border transition-all ${
                        skinRarity === tier
                          ? "border-amber-400 bg-amber-500/20 text-amber-300 font-bold"
                          : "border-border/40 bg-black/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between border-t border-border/30">
                <span className="text-[10px] font-mono text-muted-foreground">
                  Cláusula Física (Weight, Momentum, Foot Placement, Trigger)
                </span>
                <button
                  type="button"
                  onClick={() => setIncludeBioClause((prev) => !prev)}
                  data-testid="toggle-bio-clause"
                  className={`px-2.5 py-1 text-[10px] font-mono border ${
                    includeBioClause
                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                      : "border-border/40 bg-black/40 text-muted-foreground"
                  }`}
                >
                  {includeBioClause ? "INCLUÍDA" : "OMITIDA"}
                </button>
              </div>
            </div>
          </CyberCard>
        </div>

        {/* Right Column: Compiled Prompts (Image, Video 10s, Negative, Timeline) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Prompt Language / Mode Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-black/60 border border-border/50 p-2.5">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>VERSÃO DO PROMPT:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPromptLang("EN")}
                data-testid="prompt-lang-en"
                className={`px-3 py-1 text-[10px] font-mono border ${
                  promptLang === "EN"
                    ? "border-primary bg-primary text-black font-bold"
                    : "border-border/40 text-muted-foreground"
                }`}
              >
                EN · EXPANDIDO KHAAOS RUN ({bundle.operative.gender})
              </button>
              <button
                type="button"
                onClick={() => setPromptLang("PT")}
                data-testid="prompt-lang-pt"
                className={`px-3 py-1 text-[10px] font-mono border ${
                  promptLang === "PT"
                    ? "border-cyan-400 bg-cyan-400 text-black font-bold"
                    : "border-border/40 text-muted-foreground"
                }`}
              >
                PT-BR · DIREÇÃO TÉCNICA
              </button>
              <button
                type="button"
                onClick={() => setPromptLang("BASE")}
                data-testid="prompt-lang-base"
                className={`px-3 py-1 text-[10px] font-mono border ${
                  promptLang === "BASE"
                    ? "border-amber-400 bg-amber-400 text-black font-bold"
                    : "border-border/40 text-muted-foreground"
                }`}
              >
                BASE CANÔNICO ORIGINAL
              </button>
            </div>
          </div>

          {/* 1. Image Prompt Card */}
          <CyberCard
            title="PROMPT DE PERSONAGEM (IMAGEM · LIVE-ACTION 4K)"
            subtitle={`${bundle.operative.fullName} · ${FRAMING_MODES[framing].label}`}
          >
            <div className="relative">
              <pre
                data-testid="compiled-image-prompt"
                className="whitespace-pre-wrap break-words bg-black/80 border border-primary/30 p-3.5 text-xs font-mono text-foreground leading-relaxed"
              >
                {displayedImagePrompt}
              </pre>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-muted-foreground">
                  Compatível com: Midjourney v6.1, Flux.1 Pro, Imagen 3, Meshy/Rodin Reference
                </span>
                <Button
                  size="sm"
                  onClick={() =>
                    handleCopy("image", displayedImagePrompt, "Prompt de Personagem (Imagem)")
                  }
                  data-testid="copy-image-prompt"
                  className="font-mono text-[10px] tracking-widest gap-1.5"
                >
                  {copiedKey === "image" ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> COPIADO
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> COPIAR PROMPT DE IMAGEM
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CyberCard>

          {/* 2. Video Prompt Card + Interactive 10s Timeline Choreography */}
          <CyberCard
            title="PROMPT DE VÍDEO (LIVE ACTION + MOVIMENTO REAL · 10S)"
            subtitle="SINGLE CONTINUOUS TRACKING SHOT · 24FPS · LENTE 35MM · FÍSICA REAL"
          >
            {/* Interactive 10s Choreography Scrubber */}
            <div className="mb-3 bg-black/70 border border-cyan-500/30 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlayingTimeline((p) => !p)}
                    data-testid="toggle-timeline-playback"
                    className="p-1.5 border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                  >
                    {isPlayingTimeline ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <span className="text-[10px] font-mono text-cyan-300 tracking-widest">
                    TIMELINE DE COREOGRAFIA ({timelineSec.toFixed(1)}s / 10.0s)
                  </span>
                </div>
                <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-500/40 font-mono text-[9px]">
                  UE5 ASSET: {activeKeyframe.ue5AnimationAsset}
                </Badge>
              </div>

              {/* 5 Segment Buttons (0s, 2s, 4s, 6s, 8s) */}
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {bundle.timelineKeyframes.map((kf, idx) => {
                  const isActive = idx === activeKeyframeIndex;
                  return (
                    <button
                      key={kf.timestampSec}
                      type="button"
                      onClick={() => {
                        setIsPlayingTimeline(false);
                        setTimelineSec(kf.timestampSec + 0.2);
                      }}
                      className={`p-1.5 border text-left transition-all ${
                        isActive
                          ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                          : "border-border/40 bg-black/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="text-[9px] font-mono font-bold">{kf.windowLabel}</div>
                      <div className="text-[8px] font-mono truncate">{kf.actionTitle}</div>
                    </button>
                  );
                })}
              </div>

              <div className="text-xs font-mono text-foreground bg-black/60 p-2 border border-border/40">
                <span className="text-cyan-400 font-bold">[{activeKeyframe.windowLabel}] {activeKeyframe.actionTitle}: </span>
                <span>{promptLang === "PT" ? activeKeyframe.biomechanicalCuePt : activeKeyframe.biomechanicalCueEn}</span>
              </div>
            </div>

            <pre
              data-testid="compiled-video-prompt"
              className="whitespace-pre-wrap break-words bg-black/80 border border-cyan-500/30 p-3.5 text-xs font-mono text-foreground leading-relaxed"
            >
              {displayedVideoPrompt}
            </pre>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground">
                Compatível com: Runway Gen-3 Alpha, Google Veo 2, Kling 1.6 Pro, Luma Ray2 (Image-to-Video)
              </span>
              <Button
                size="sm"
                onClick={() =>
                  handleCopy("video", displayedVideoPrompt, "Prompt de Vídeo (10s Live-Action)")
                }
                data-testid="copy-video-prompt"
                className="font-mono text-[10px] tracking-widest gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-black"
              >
                {copiedKey === "video" ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> COPIADO
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5" /> COPIAR PROMPT DE VÍDEO (10S)
                  </>
                )}
              </Button>
            </div>
          </CyberCard>

          {/* 3. Negative Prompt + Biomechanical Clause Card */}
          <CyberCard
            title="NEGATIVE PROMPT & CLÁUSULA FÍSICA AVANÇADA"
            subtitle="BLINDAGEM CONTRA HUD, CARTOON, PELE PLÁSTICA E FÍSICA IRREAL"
          >
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-[10px] font-mono text-red-400 mb-1">
                  <span>NEGATIVE PROMPT (ANTI-ARTEFATOS & ANTI-GAME UI)</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy("negative", bundle.negativePrompt, "Negative Prompt")
                    }
                    data-testid="copy-negative-prompt"
                    className="text-red-300 hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> {copiedKey === "negative" ? "COPIADO!" : "COPIAR NEGATIVE"}
                  </button>
                </div>
                <pre
                  data-testid="compiled-negative-prompt"
                  className="whitespace-pre-wrap break-words bg-red-950/20 border border-red-500/30 p-3 text-xs font-mono text-red-200"
                >
                  {bundle.negativePrompt}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400 mb-1">
                  <span>PARÂMETRO ADICIONAL DE FÍSICA & DISCIPLINA TÁTICA</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy("bio", bundle.biomechanicalClauseEn, "Cláusula Biomecânica")
                    }
                    data-testid="copy-bio-clause"
                    className="text-emerald-300 hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> {copiedKey === "bio" ? "COPIADO!" : "COPIAR CLÁUSULA"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap break-words bg-emerald-950/20 border border-emerald-500/30 p-2.5 text-xs font-mono text-emerald-200">
                  {bundle.biomechanicalClauseEn}
                </pre>
              </div>
            </div>
          </CyberCard>
        </div>
      </div>

      {/* Synchronized High-Tech Tools & UE5/Blender Export Pipeline */}
      <CyberCard
        title="TOOLS SINCRONIZADOS & PIPELINE DE MODELAGEM 3D / SKIN"
        subtitle="INTEGRAÇÃO DIRETA COM UE5.8 LYRA, BLENDER HEADLESS, IMAGE-TO-3D E IMAGE-TO-VIDEO"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {SYNCED_HIGH_TECH_TOOLS.map((tool) => (
            <div
              key={tool.id}
              className="border border-border/50 bg-black/50 p-3.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-display font-bold text-sm text-foreground">
                    {tool.name}
                  </span>
                  <Badge
                    className={`font-mono text-[9px] ${
                      tool.status === "SINCRONIZADO"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    }`}
                  >
                    {tool.status}
                  </Badge>
                </div>
                <p className="text-[10px] font-mono text-primary mb-2">
                  Path: {tool.repoSyncPath}
                </p>
                <p className="text-xs text-muted-foreground mb-3">{tool.description}</p>
              </div>

              <div className="bg-black/80 border border-border/40 p-2 font-mono text-[10px] text-cyan-300 flex items-center justify-between gap-2">
                <span className="truncate">{tool.cliOrScriptCommand}</span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(tool.id, tool.cliOrScriptCommand, `Comando ${tool.name}`)
                  }
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  {copiedKey === tool.id ? "OK" : "COPIAR"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Exportable UE5 Asset Manifest Entry & Quick Production Tips */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-border/30">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-display font-bold text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> DICAS RÁPIDAS DE CONSISTÊNCIA & EMENDA DE CENAS
              </span>
            </div>
            <ul className="space-y-2 text-xs font-mono text-muted-foreground">
              {bundle.quickTips.map((tip, i) => (
                <li
                  key={i}
                  className="p-2 bg-black/40 border-l-2 border-primary text-foreground/90"
                >
                  · {tip}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-display font-bold text-cyan-300 flex items-center gap-1.5">
                <FileJson className="w-4 h-4" /> PAYLOAD UE5 / LYRA ASSET MANIFEST ({bundle.ue5ManifestEntry.id})
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  handleCopy(
                    "manifest",
                    JSON.stringify(bundle.ue5ManifestEntry, null, 2),
                    "Payload UE5 Asset Manifest",
                  )
                }
                data-testid="copy-ue5-manifest"
                className="h-7 font-mono text-[10px]"
              >
                {copiedKey === "manifest" ? "JSON COPIADO" : "COPIAR JSON UE5"}
              </Button>
            </div>
            <pre className="bg-black/80 border border-border/50 p-3 text-[10px] font-mono text-cyan-200 max-h-56 overflow-y-auto">
              {JSON.stringify(bundle.ue5ManifestEntry, null, 2)}
            </pre>
          </div>
        </div>
      </CyberCard>

      {/* MULTI-DEV REPO PR & CONSOLE PROTECTION SHIELD */}
      <CyberCard
        variant={prSafetyValidation.safeToCommitAndPush ? "default" : "alert"}
        className="border border-emerald-500/30 bg-black/55"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border/40 pb-3 mb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[10px] font-mono tracking-widest px-2 py-0.5 border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
                MULTI-DEV GIT GUARD · NEXUS-HUB57/KHAAOS_RUN
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 border ${
                  prSafetyValidation.safeToCommitAndPush
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-500/50 bg-amber-500/15 text-amber-200"
                }`}
              >
                {prSafetyValidation.safeToCommitAndPush
                  ? "ESCUDO ATIVO · ZERO SOBREPOSIÇÃO COM CONSOLE"
                  : "BLOQUEIO PREVENTIVO · ARQUIVO DO CONSOLE DETECTADO"}
              </span>
            </div>
            <h4 className="text-sm font-display font-bold tracking-wider text-white">
              SINCRONIZAÇÃO CAUTELOSA DE REPO PRs & PROTEÇÃO DOS DEVS DO CONSOLE
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Impede <span className="font-mono text-amber-200">git add -A</span> destrutivo, bloqueia exclusão de arquivos/pastas (<span className="font-mono text-cyan-200">--diff-filter=D</span>) e protege integralmente os arquivos do Console do Marechal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSimulateConsoleTouch((prev) => !prev)}
              data-testid="toggle-simulate-console-shield"
              className="h-8 font-mono text-[10px] border-amber-500/40 text-amber-200"
            >
              {simulateConsoleTouch ? "RESTAURAR ESCOPO SEGURO" : "TESTAR BLOQUEIO DE CONSOLE"}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                handleCopy(
                  "pr-safe-cmds",
                  prSafetyValidation.safeCommands.join("\n"),
                  "Comandos de Sincronização Segura de PR",
                )
              }
              data-testid="copy-safe-pr-commands"
              className="h-8 font-mono text-[10px] bg-emerald-500 hover:bg-emerald-400 text-black font-bold"
            >
              {copiedKey === "pr-safe-cmds" ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1" /> COMANDOS COPIADOS
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" /> COPIAR COMANDOS PR SAFE-SYNC
                </>
              )}
            </Button>
          </div>
        </div>

        {!prSafetyValidation.safeToCommitAndPush && (
          <div className="mb-4 border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-100">
            <p className="font-mono font-bold text-amber-300 mb-1">
              🛡️ ESCUDO ACIONADO — ARQUIVOS DE OUTROS DEVS NO CONSOLE DESMARCADOS AUTOMATICAMENTE:
            </p>
            <ul className="space-y-1 font-mono text-[11px]">
              {prSafetyValidation.protectedConsoleTouches.map((touch) => (
                <li key={touch.file}>
                  • <span className="text-white">{touch.file}</span> — {touch.rule.ownerTeam} ({touch.rule.protectionLevel})
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Protected Console Files */}
          <div className="border border-border/50 bg-black/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-display font-bold text-emerald-300">
                CAMINHOS BLINDADOS DO CONSOLE ({PROTECTED_CONSOLE_PATHS.length})
              </span>
              <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/40 text-emerald-300">
                INTACTOS
              </Badge>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {PROTECTED_CONSOLE_PATHS.map((rule) => (
                <div
                  key={rule.pathPattern}
                  className="border border-border/40 bg-black/50 px-2.5 py-1.5 text-[10px] font-mono"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white truncate">{rule.pathPattern}</span>
                    <span className="text-[9px] text-emerald-400 shrink-0">{rule.protectionLevel}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{rule.ownerTeam}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Active PR Waves */}
          <div className="border border-border/50 bg-black/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-display font-bold text-cyan-300">
                ONDAS DE PRs SINCRONIZADAS (#48, #52–#60)
              </span>
              <Badge variant="outline" className="text-[9px] font-mono border-cyan-500/40 text-cyan-300">
                SEM COLISÃO
              </Badge>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {TRACKED_REPO_PRS.map((pr) => (
                <div
                  key={pr.prNumber}
                  className={`border px-2.5 py-1.5 text-[10px] font-mono ${
                    pr.protectedConsoleOverlap
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-border/40 bg-black/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white">
                      PR #{pr.prNumber} · {pr.wave}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 border ${
                        pr.protectedConsoleOverlap
                          ? "border-amber-400/50 text-amber-200"
                          : "border-cyan-500/30 text-cyan-300"
                      }`}
                    >
                      {pr.protectedConsoleOverlap ? "CONSOLE DEV" : "ISOLADO"}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground truncate mt-0.5">{pr.title}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Non-Destructive CLI Sequence */}
          <div className="border border-border/50 bg-black/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-display font-bold text-purple-300">
                PIPELINE CLI NÃO-DESTRUTIVO (KHAAOS_WORKFLOW.SH)
              </span>
              <span className="text-[9px] font-mono text-purple-300">--sync-prs</span>
            </div>
            <pre className="bg-black/80 border border-border/50 p-2.5 text-[10px] font-mono text-emerald-200 max-h-48 overflow-y-auto whitespace-pre-wrap">
              {prSafetyValidation.safeCommands.join("\n")}
            </pre>
          </div>
        </div>
      </CyberCard>
    </div>
  );
}
