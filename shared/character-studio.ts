import type { WorldId } from "./worlds";
import type { Rank, SpecializationId } from "./schema";

export type OperativeGender = "MASCULINO" | "FEMININO";

/**
 * Facção do operante: os 16 militares canônicos são MILITAR (implícito);
 * o Lote 4 declara MILICIA_URBANA (MIL-01..08) e GANGUE_URBANA (GNG-01..08).
 */
export type OperativeFaction = "MILITAR" | "MILICIA_URBANA" | "GANGUE_URBANA";

export type CameraFramingMode =
  | "PORTRAIT_35MM"
  | "FULL_BODY_TACTICAL"
  | "ORTHO_3D_APOSE";

export type SkinRarityTier = "COMUM" | "RARO" | "EPICO" | "LENDARIO" | "MITICO";

export interface OperativeArchetype {
  id: string;
  ueAssetId: string;
  codename: string;
  fullName: string;
  gender: OperativeGender;
  rank: Rank;
  specializationId: SpecializationId;
  defaultWorldId: WorldId;
  skinRarity: SkinRarityTier;
  roleTitle: string;
  /** Facção do operante (ausente = MILITAR, os 16 canônicos). */
  faction?: OperativeFaction;
  /** Ethnicity and cultural lineage (8 Masculine & 8 Feminine representation) */
  ethnicity: string;
  /** Background lore, survival lineage and tactical doctrine within Khaaos Run */
  heritageLore: string;
  /** Procedural/SVG avatar visual representation specifications */
  avatarVisual: {
    skinToneHex: string;
    hairStyle: string;
    hairColorHex: string;
    eyeColorHex: string;
    facialFeature: string;
    headgearOrVisor: string;
    avatarThemeGradient: [string, string];
  };
  /** Physical appearance descriptor for live-action prompt injection */
  appearancePromptEn: string;
  appearancePromptPt: string;
  /** Signature tactical outfit & Khaaos Run identity elements */
  wardrobePromptEn: string;
  wardrobePromptPt: string;
  /** Primary weapon & trigger discipline descriptor */
  weaponHandlingEn: string;
  weaponHandlingPt: string;
  /** Color palette accents (Vulcanic Orange, Khaaos Purple, Battle Million Gold) */
  accentColors: {
    primaryHex: string;
    secondaryHex: string;
    trimHex: string;
    label: string;
  };
  /** Biomechanics & UE5 Lyra / Mannequin specs */
  biomechanics: {
    heightCm: number;
    massKg: number;
    sprintSpeedMps: number;
    slideFrictionCoeff: number;
    recoilAbsorptionDeg: number;
    vaultClearanceCm: number;
    /** Rig base do operante: por SEXO (ADR-ESQUELETO-RIG-POR-SEXO). */
    skeleton: "SK_Manny" | "SK_Gwen";
    lyraHeroBridge: "KhaaosLyraHeroComponent";
    targetPolycount: number;
    lodCount: number;
  };
}

export interface VideoTimelineKeyframe {
  timestampSec: number;
  windowLabel: string;
  actionTitle: string;
  biomechanicalCueEn: string;
  biomechanicalCuePt: string;
  ue5AnimationAsset: string;
}

export interface SyncedToolPipeline {
  id: string;
  name: string;
  category: "3D_ENGINE" | "3D_GENERATION" | "LIVE_ACTION_VIDEO" | "CONCEPT_IMAGE";
  repoSyncPath: string;
  status: "SINCRONIZADO" | "PRONTO_EXPORTACAO";
  description: string;
  recommendedParams: Record<string, string | number | boolean>;
  cliOrScriptCommand: string;
}

export interface CompiledCharacterPromptBundle {
  operative: OperativeArchetype;
  gender: OperativeGender;
  worldId: WorldId;
  framing: CameraFramingMode;
  skinRarity: SkinRarityTier;
  imagePromptEn: string;
  imagePromptPt: string;
  videoPromptEn: string;
  videoPromptPt: string;
  negativePrompt: string;
  biomechanicalClauseEn: string;
  timelineKeyframes: VideoTimelineKeyframe[];
  quickTips: string[];
  ue5ManifestEntry: {
    id: string;
    name: string;
    gender: OperativeGender;
    skeleton: string;
    lod_count: number;
    target_polycount: number;
    dimensions_cm: { width: number; depth: number; height: number };
    components: string[];
    textures: string[];
    animations: string[];
    variants: string[];
    lyra_bridges: string[];
  };
}

/**
 * Base canonical prompts provided and validated by the user, enhanced with
 * Khaaos Run identity, male/female modularity, and biomechanical physics.
 */
export const CANONICAL_BASE_PROMPTS = {
  imageBaseEn:
    "Live-action cinematic portrait of an original battle-royale operator inspired by Free Fire aesthetics, not an existing character. Athletic young adult, realistic skin texture, sweat and dirt, focused expression. Wearing a tactical vest, cargo pants, fingerless gloves, lightweight backpack, knee pads, combat boots, and subtle neon-orange accents. Holding a realistic assault rifle with trigger discipline. Tropical urban battlefield background with concrete walls, shipping containers, palm trees, smoke and dust. Cinematic lighting, 35mm lens, shallow depth of field, photorealistic, 4K, high detail, natural proportions, no game HUD, no cartoon style.",
  videoBaseEn:
    "Photorealistic live-action battle-royale scene, original operator inspired by Free Fire, single continuous tracking shot, 10 seconds. The character sprints through a tropical urban combat zone with realistic weight, momentum and foot placement. At 2s, performs a controlled tactical slide behind a concrete barrier, dust rising naturally. At 4s, shoulders the rifle, peeks from cover and fires a short controlled burst with realistic recoil, muzzle flash, ejected casing and slight body absorption. At 6s, reloads efficiently, strafes to a new position and vaults over a low wall, landing with believable impact. At 8s, crouches, scans the area and makes a hand signal through smoke. Handheld camera with slight shake, 35mm lens, 24fps, cinematic motion blur, natural lighting, realistic physics, tactical combat choreography, no exaggerated game animation. No HUD, no health bars, no floating damage numbers, no cartoon, no slow motion, no gore.",
  negativeBaseEn:
    "game UI, HUD, health bar, damage numbers, cartoon, anime, plastic skin, unrealistic physics, floating, sliding without friction, exaggerated recoil, extra limbs, distorted hands, wrong fingers, weapon deformation, duplicate weapons, low resolution, blurry, oversaturated, gore, blood spray, logos, watermark, text",
  biomechanicalClauseEn:
    "physically accurate weight, momentum, foot placement, natural weapon handling and trigger discipline",
} as const;

export const KHAAOS_VIDEO_TIMELINE_10S: VideoTimelineKeyframe[] = [
  {
    timestampSec: 0,
    windowLabel: "0.0s – 2.0s",
    actionTitle: "Sprint Tático & Inércia Real",
    biomechanicalCueEn:
      "The character sprints through the combat zone with realistic weight, forward torso lean, grounded momentum and precise foot placement on uneven terrain.",
    biomechanicalCuePt:
      "Arranque explosivo com transferência real de massa, inclinação de tronco à frente, impulsão plantar firme e oscilação natural do equipamento PackBack.",
    ue5AnimationAsset: "AS_Sprint",
  },
  {
    timestampSec: 2,
    windowLabel: "2.0s – 4.0s",
    actionTitle: "Slide Tático Controlado & Atrito",
    biomechanicalCueEn:
      "At 2s, performs a controlled tactical slide on articulated knee pads behind a concrete barrier, decelerating with real surface friction as dust and gravel rise naturally.",
    biomechanicalCuePt:
      "Aos 2s, executa slide tático controlado sobre a joelheira articulada atrás de barreira de concreto, desacelerando com atrito físico real e levantando poeira densa.",
    ue5AnimationAsset: "AS_Slide",
  },
  {
    timestampSec: 4,
    windowLabel: "4.0s – 6.0s",
    actionTitle: "Empunhadura, Peek & Rajada Curta",
    biomechanicalCueEn:
      "At 4s, shoulders the rifle firmly into the tactical vest pocket, peeks from cover and fires a short controlled burst with realistic recoil, muzzle flash, ejected brass casing and slight upper-body absorption.",
    biomechanicalCuePt:
      "Aos 4s, encaixa a coronha no ombro, faz peek angular da cobertura e dispara rajada curta controlada com recuo plausível, flash de cano, ejeção de cápsulas e absorção escapular.",
    ue5AnimationAsset: "AS_Shoot",
  },
  {
    timestampSec: 6,
    windowLabel: "6.0s – 8.0s",
    actionTitle: "Recarga Tática, Strafe & Vault",
    biomechanicalCueEn:
      "At 6s, reloads efficiently with economy of motion, strafes laterally to a new position and vaults over a low concrete wall, landing with believable knee flexion and weight impact.",
    biomechanicalCuePt:
      "Aos 6s, realiza troca de carregador tática sem olhar, desloca-se em strafe lateral e transpõe (vault) mureta baixa com apoio de mão e amortecimento de impacto nos joelhos.",
    ue5AnimationAsset: "AS_Reload + AS_Jump",
  },
  {
    timestampSec: 8,
    windowLabel: "8.0s – 10.0s",
    actionTitle: "Agachamento, Varredura & Sinal Tático",
    biomechanicalCueEn:
      "At 8s, crouches into a low center-of-gravity stance, scans the perimeter with rifle indexed and makes a crisp two-finger tactical hand signal through drifting smoke.",
    biomechanicalCuePt:
      "Aos 8s, estabiliza em agachamento tático de baixo centro de gravidade, varre o setor mantendo disciplina de gatilho e emite sinal manual de esquadrão através da fumaça.",
    ue5AnimationAsset: "AS_Crouch",
  },
];

export const KHAAOS_OPERATIVE_ARCHETYPES: OperativeArchetype[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 8 MASCULINE OPERATIVES (DIVERSE ETHNICITIES & RACES)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "OP_MALE_VANGUARD",
    ueAssetId: "CHR_Zheers_Male_Vanguard",
    codename: "KHAEL VANCE",
    fullName: "Khael Vance · Operador Vanguarda M-01",
    gender: "MASCULINO",
    rank: "ONITH",
    specializationId: "FUZILEIROS",
    defaultWorldId: "CIGKV",
    skinRarity: "EPICO",
    roleTitle: "Operador de Assalto Urbano & Incursão ZEX",
    ethnicity: "Afro-Latino / Pardo Brasileiro",
    heritageLore:
      "Nascido nas favelas verticais de alta tecnologia em torno do perímetro do CIGKV. Especialista em combate aproximado (CQB) e quebra rápida de linhas defensivas.",
    avatarVisual: {
      skinToneHex: "#8d5524",
      hairStyle: "Buzz-cut fade com navalhado",
      hairColorHex: "#171717",
      eyeColorHex: "#f59e0b",
      facialFeature: "Cicatriz tática na sobrancelha direita e microtextura de suor",
      headgearOrVisor: "Fone tático de ouvido com rádio militar integrado",
      avatarThemeGradient: ["#f97316", "#7c3aed"],
    },
    appearancePromptEn:
      "Athletic young adult Afro-Latino male operator (26 years old), high fade buzz cut, tactical eyebrow scar, realistic weathered skin texture with sweat droplets, sharp jawline, intense focused amber eyes",
    appearancePromptPt:
      "Operador masculino jovem-adulto afro-latino atlético (26 anos), corte militar buzz cut com degradê, cicatriz tática na sobrancelha, textura de pele realista com suor e fuligem, mandíbula firme e olhar determinado",
    wardrobePromptEn:
      "Wearing an original Khaaos Run modular matte-charcoal tactical plate carrier vest, reinforced ripstop cargo pants, fingerless knuckle-guarded gloves, compact PackBack tactical rig with glowing telemetry strip, articulated carbon knee pads, heavy combat boots, and subtle volcanic neon-orange (#F97316) and deep Khaaos violet (#7C3AED) accents with brushed Battle Million metallic gold emblem",
    wardrobePromptPt:
      "Vestindo colete modular tático preto-grafite original Khaaos Run, calça cargo ripstop reforçada, luvas táticas sem dedos, mochila leve PackBack de 5 slots, joelheiras articuladas de carbono, coturnos de combate e detalhes sutis em laranja-vulcânico neon (#F97316), roxo Khaaos (#7C3AED) e insígnia dourada metálica Battle Million",
    weaponHandlingEn:
      "Holding a realistic modular Khaaos-47 assault rifle (WPN_AssaultRifle_MK1) with holographic sight and vertical grip, strict index-finger trigger discipline along the receiver",
    weaponHandlingPt:
      "Empunhando fuzil de assalto modular realista Khaaos-47 (WPN_AssaultRifle_MK1) com mira holográfica e grip vertical, disciplina estrita de gatilho com dedo indicador estendido junto ao receptor",
    accentColors: {
      primaryHex: "#F97316",
      secondaryHex: "#7C3AED",
      trimHex: "#EAB308",
      label: "Laranja Vulcânico + Roxo Khaaos + Ouro Battle Million",
    },
    biomechanics: {
      heightCm: 182,
      massKg: 81,
      sprintSpeedMps: 7.4,
      slideFrictionCoeff: 0.68,
      recoilAbsorptionDeg: 2.8,
      vaultClearanceCm: 115,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MALE_BREACHER",
    ueAssetId: "CHR_Onith_Male_Breacher",
    codename: "DRAXEN KORR",
    fullName: "Draxen Korr · Operador Couraça M-02",
    gender: "MASCULINO",
    rank: "HURAN",
    specializationId: "ENGENHARIA_TATICA",
    defaultWorldId: "Barburhen",
    skinRarity: "EPICO",
    roleTitle: "Breacher de Linha de Frente & Contenção Balística",
    ethnicity: "Eslavo Nórdico / Leste Europeu",
    heritageLore:
      "Sobrevivente dos complexos mineiros de Barburhen. Seu treinamento em forja vulcânica conferiu resistência extrema ao calor, explosões e chuva ácida.",
    avatarVisual: {
      skinToneHex: "#ffdbac",
      hairStyle: "Degradê raspado loiro platinado militar",
      hairColorHex: "#e2e8f0",
      eyeColorHex: "#38bdf8",
      facialFeature: "Queixo anguloso com cicatriz de estilhaço térmico",
      headgearOrVisor: "Colar cervical blindado de contenção e placas balísticas",
      avatarThemeGradient: ["#ea580c", "#6d28d9"],
    },
    appearancePromptEn:
      "Muscular athletic young adult Slavic male operator (28 years old), blonde buzz-cut fade, faint tactical thermal scar across jawline, pale weathered skin texture, heavy sweat and volcanic ash smudges, stoic calm gaze",
    appearancePromptPt:
      "Operador masculino eslavo robusto (28 anos), cabelo loiro militar muito curto, cicatriz de fragmento no queixo, textura de pele clara marcada por fuligem vulcânica e suor, olhar frio e analítico",
    wardrobePromptEn:
      "Wearing heavy modular Khaaos Run ballistic collar vest, reinforced tactical cargo trousers with shell holders, fingerless impact gloves, rugged PackBack frame, dual-strap knee guards, steel-toe combat boots, and glowing ember-orange and obsidian-purple tactical markings",
    wardrobePromptPt:
      "Vestindo colete balístico pesado com protetor cervical modular, calça cargo reforçada com porta-cartuchos, luvas de impacto sem dedos, estrutura PackBack robusta, joelheiras duplas e marcações em brasa-laranja e roxo-obsidiana",
    weaponHandlingEn:
      "Holding a realistic tactical assault rifle and secondary breach shotgun slung across chest, strict trigger discipline with grounded center of mass",
    weaponHandlingPt:
      "Empunhando fuzil tático realista com escopeta de brecha (WPN_Shotgun_Breach) em bandoleira de transição rápida, disciplina total de gatilho",
    accentColors: {
      primaryHex: "#EA580C",
      secondaryHex: "#6D28D9",
      trimHex: "#D97706",
      label: "Brasa Barburhen + Roxo Obsidiana + Bronze Dourado",
    },
    biomechanics: {
      heightCm: 187,
      massKg: 90,
      sprintSpeedMps: 7.0,
      slideFrictionCoeff: 0.74,
      recoilAbsorptionDeg: 1.9,
      vaultClearanceCm: 108,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MALE_RECON_ASIAN",
    ueAssetId: "CHR_Skeetw_Male_Kage",
    codename: "REN TANAKA",
    fullName: "Ren Tanaka (Kage) · Sombra Silenciosa M-03",
    gender: "MASCULINO",
    rank: "SKEETW",
    specializationId: "RASTREADORES",
    defaultWorldId: "Priadus",
    skinRarity: "LENDARIO",
    roleTitle: "Infiltrador Furtivo & Reconhecimento Noturno",
    ethnicity: "Leste-Asiático (Japonês)",
    heritageLore:
      "Oriundo dos esquadrões de reconhecimento avançado de Tóquio Subterrânea. Mestre em navegação na neblina densa de Priadus sem ativar sensores acústicos.",
    avatarVisual: {
      skinToneHex: "#f1c27d",
      hairStyle: "Undercut liso texturizado preto-azulado",
      hairColorHex: "#09090b",
      eyeColorHex: "#06b6d4",
      facialFeature: "Olhos monolídeos afiados e meia-máscara tática de filtragem",
      headgearOrVisor: "Meia-máscara de polímero com filtro de esporos e HUD ciano",
      avatarThemeGradient: ["#06b6d4", "#4338ca"],
    },
    appearancePromptEn:
      "Athletic lean East Asian Japanese male operator (25 years old), sharp monolid gaze, dark textured undercut, smooth weathered skin with perspiration, high-tech carbon ninja half-mask with glowing cyan air intake filter",
    appearancePromptPt:
      "Operador masculino leste-asiático japonês ágil e esguio (25 anos), olhar penetrante monolídeo, cabelo liso escuro com corte undercut, meia-máscara tática de carbono com filtro ciano para esporos de Priadus",
    wardrobePromptEn:
      "Wearing lightweight silent-friction ballistic suit, tactical harness with dual tanto blade sheaths, low-profile PackBack, silent-tread stealth boots, and muted cyan and midnight violet accents",
    wardrobePromptPt:
      "Vestindo traje balístico de baixo atrito sonoro, arnês tático com lâminas duplas, módulo PackBack aerodinâmico, calçados silenciosos e detalhes em ciano fosco e violeta noturno",
    weaponHandlingEn:
      "Holding a suppressed tactical submachine gun with high-ready index position and C-clamp grip, instant readiness",
    weaponHandlingPt:
      "Empunhando submetralhadora tática suprimida em posição high-ready com empunhadura C-clamp firme e dedos de gatilho alinhados",
    accentColors: {
      primaryHex: "#06B6D4",
      secondaryHex: "#6366F1",
      trimHex: "#38BDF8",
      label: "Ciano Espectral + Violeta Priadus + Prata Neon",
    },
    biomechanics: {
      heightCm: 176,
      massKg: 69,
      sprintSpeedMps: 8.1,
      slideFrictionCoeff: 0.58,
      recoilAbsorptionDeg: 2.3,
      vaultClearanceCm: 124,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MALE_MEDIC_AFRICAN",
    ueAssetId: "CHR_Khael_Male_Medic",
    codename: "TARIQ BAKARI",
    fullName: "Tariq Bakari · Médico Balístico M-04",
    gender: "MASCULINO",
    rank: "KHAEL",
    specializationId: "MEDICO_COMBATE",
    defaultWorldId: "Ckesalth",
    skinRarity: "LENDARIO",
    roleTitle: "Cirurgião de Campo & Engenheiro Bioquímico",
    ethnicity: "Africano Subsaariano (Quênia / Nigéria)",
    heritageLore:
      "Veterano dos postos médicos avançados nos poços de petróleo em chamas de Ckesalth. Desenvolveu os kits de coagulação rápida e adrenalina para esquadrões de elite.",
    avatarVisual: {
      skinToneHex: "#3c2009",
      hairStyle: "Cabeça raspada limpa com linha de precisão",
      hairColorHex: "#0a0a0a",
      eyeColorHex: "#10b981",
      facialFeature: "Monóculo HUD bio-médico com cruz esmeralda no olho esquerdo",
      headgearOrVisor: "Monóculo cibernético de diagnóstico bio-celular e colar médico",
      avatarThemeGradient: ["#10b981", "#065f46"],
    },
    appearancePromptEn:
      "Tall athletic Sub-Saharan African male operator (29 years old), clean shaven head, deep rich ebony skin texture with natural sweat sheen, calm commanding expression, tactical holographic green medical monocle over left eye",
    appearancePromptPt:
      "Operador masculino africano subsaariano alto e atlético (29 anos), cabeça raspada, pele escura retinta fotorrealista com brilho de suor, monóculo médico holográfico esmeralda no olho esquerdo e semblante focado",
    wardrobePromptEn:
      "Wearing high-collar bio-hazard resistant medical tactical rig, trauma shears harness, emergency defib packs, dark olive-drab combat gear with emerald green crosses and gold Battle Million trim",
    wardrobePromptPt:
      "Vestindo colete médico reforçado resistente a bio-riscos, coldre de tesoura de trauma e injetores de adrenalina, uniforme verde-oliva com cruzes esmeralda e detalhes dourados",
    weaponHandlingEn:
      "Holding a compact tactical carbine with quick-detach sling, ready for instant transition to medical trauma kit",
    weaponHandlingPt:
      "Empunhando carabina tática compacta em bandoleira de liberação rápida, permitindo transição imediata para o estojo médico de campo",
    accentColors: {
      primaryHex: "#10B981",
      secondaryHex: "#047857",
      trimHex: "#FACC15",
      label: "Verde Esmeralda + Oliva Balístico + Ouro Cirúrgico",
    },
    biomechanics: {
      heightCm: 188,
      massKg: 86,
      sprintSpeedMps: 7.3,
      slideFrictionCoeff: 0.69,
      recoilAbsorptionDeg: 2.2,
      vaultClearanceCm: 116,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MALE_HUNTER_INDIGENOUS",
    ueAssetId: "CHR_Venex_Male_Hunter",
    codename: "ARANI YVY",
    fullName: "Arani Yvy · Rastreador Primordial M-05",
    gender: "MASCULINO",
    rank: "VENEX",
    specializationId: "COMANDOS_SELVA",
    defaultWorldId: "Priadus",
    skinRarity: "MITICO",
    roleTitle: "Mestre de Selva & Emboscadas com Arco Tático",
    ethnicity: "Indígena Sul-Americano (Tupi-Guarani / Amazônico)",
    heritageLore:
      "Guardião ancestral das bacias fluviais transformadas na floresta escura de Priadus. Capaz de pressentir aproximação de anéis e rotas inimigas pelo odor do ar e vibração do solo.",
    avatarVisual: {
      skinToneHex: "#a25828",
      hairStyle: "Cabelo preto liso na altura dos ombros",
      hairColorHex: "#050505",
      eyeColorHex: "#d97706",
      facialFeature: "Pintura facial de urucum vermelho em linhas geométricas pelas bochechas",
      headgearOrVisor: "Faixa de cabeça trançada em fibras táticas com sensores térmicos",
      avatarThemeGradient: ["#ef4444", "#15803d"],
    },
    appearancePromptEn:
      "Athletic muscular Indigenous South American male operator (27 years old), straight dark hair framing jawline, rich bronze-toned skin, bold red urucum geometric war paint across nose bridge and cheekbones, intense predator focus",
    appearancePromptPt:
      "Operador masculino indígena sul-americano atlético e ágil (27 anos), cabelos longos pretos lisos, pele bronzeada avermelhada, pintura de guerra geométrica em urucum vermelho no nariz e bochechas, olhar aguçado de predador",
    wardrobePromptEn:
      "Wearing breathable jungle camouflage battle fatigues, reinforced arm guards, composite compound bow quiver harness, tactical knife holster, and earthy green and crimson fiber weave accents",
    wardrobePromptPt:
      "Vestindo farda tática de camuflagem de selva, protetores de antebraço reforçados, aljava para flechas táticas e faca de sobrevivência, com grafismos em verde-terra e vermelho-urucum",
    weaponHandlingEn:
      "Holding a tactical compound bow with integrated laser rangefinder, or secondary high-accuracy burst rifle with index discipline",
    weaponHandlingPt:
      "Empunhando arco composto tático com telêmetro laser integrado ou fuzil de rajada de alta precisão com empunhadura instintiva",
    accentColors: {
      primaryHex: "#EF4444",
      secondaryHex: "#15803D",
      trimHex: "#F59E0B",
      label: "Vermelho Urucum + Verde Priadus + Ouro Âmbar",
    },
    biomechanics: {
      heightCm: 178,
      massKg: 74,
      sprintSpeedMps: 7.9,
      slideFrictionCoeff: 0.61,
      recoilAbsorptionDeg: 2.0,
      vaultClearanceCm: 125,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MALE_MARKSMAN_MENA",
    ueAssetId: "CHR_Skeetw_Male_Zayn",
    codename: "ZAYN AL-MANSOOR",
    fullName: "Zayn Al-Mansoor · Olho do Vento M-06",
    gender: "MASCULINO",
    rank: "SKEETW",
    specializationId: "SNIPER",
    defaultWorldId: "Ckesalth",
    skinRarity: "LENDARIO",
    roleTitle: "Franco-Atirador de Longo Alcance & Miragens do Deserto",
    ethnicity: "Oriente Médio / Norte da África (Árabe-Beduíno)",
    heritageLore:
      "Criado entre os comboios mercantes do deserto das almas esquecidas de Ckesalth. Calcula balística levando em conta refração de calor sobre as chamas de petróleo.",
    avatarVisual: {
      skinToneHex: "#c68642",
      hairStyle: "Lenço tático Shemagh marrom/dourado envolvendo cabeça",
      hairColorHex: "#1c1917",
      eyeColorHex: "#f59e0b",
      facialFeature: "Barba curta cerrada bem cuidada e olhar semicerrado de atirador",
      headgearOrVisor: "Shemagh tático com óculos balísticos anti-areia no topo",
      avatarThemeGradient: ["#d97706", "#78350f"],
    },
    appearancePromptEn:
      "Lean weather-hardened Middle Eastern Arabic male sniper (30 years old), neatly trimmed dark beard, olive-tan skin with fine desert dust, wearing a desert sand and gold tactical Shemagh scarf, intense piercing hazel eyes",
    appearancePromptPt:
      "Atirador masculino árabe-beduíno do Oriente Médio (30 anos), barba curta desenhada, pele oliva bronzeada com fina poeira de deserto, lenço tático Shemagh em tons de areia e ouro, olhar clínico de atirador",
    wardrobePromptEn:
      "Wearing desert sniper ghillie shroud over sand-colored tactical chest rig, ballistic rangefinder harness, reinforced knee pads, and warm ochre and gold metallic trim",
    wardrobePromptPt:
      "Vestindo capa de atirador de deserto sobre colete tático bege, arnês com telêmetro balístico de precisão e detalhes em ocre e ouro metálico",
    weaponHandlingEn:
      "Holding a heavy long-range anti-material sniper rifle (WPN_Sniper_DMR) with cheek-weld alignment and rock-solid bipod discipline",
    weaponHandlingPt:
      "Empunhando rifle de precisão de longo alcance (WPN_Sniper_DMR) com postura de bochecha perfeitamente apoiada e dedo indicador repousando no guarda-mato",
    accentColors: {
      primaryHex: "#D97706",
      secondaryHex: "#92400E",
      trimHex: "#FDE047",
      label: "Ocre Ckesalth + Areia Dourada + Bronze Nômade",
    },
    biomechanics: {
      heightCm: 181,
      massKg: 75,
      sprintSpeedMps: 7.5,
      slideFrictionCoeff: 0.65,
      recoilAbsorptionDeg: 2.1,
      vaultClearanceCm: 114,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MALE_BERSERKER_PACIFIC",
    ueAssetId: "CHR_Huran_Male_Manoa",
    codename: "MANOA TUILAGI",
    fullName: "Manoa Tuilagi · Quebrador de Marés M-07",
    gender: "MASCULINO",
    rank: "HURAN",
    specializationId: "INFANTARIA",
    defaultWorldId: "Arukheea",
    skinRarity: "EPICO",
    roleTitle: "Infantaria de Choque & Demolição Pesada",
    ethnicity: "Polinésio / Ilhas do Pacífico (Samoano / Maori)",
    heritageLore:
      "Oriundo das muralhas costeiras de Arukheea. Sua estrutura física imponente foi forjada enfrentando os impactos do tsunami hidráulico e tempestades oceânicas.",
    avatarVisual: {
      skinToneHex: "#a0522d",
      hairStyle: "Coque guerreiro alto com laterais raspadas",
      hairColorHex: "#0c0a09",
      eyeColorHex: "#38bdf8",
      facialFeature: "Tatuagens tradicionais Ta Moko na têmpora e queixo largo maciço",
      headgearOrVisor: "Protetor peitoral de impacto titânico com ombreiras largas",
      avatarThemeGradient: ["#0284c7", "#0f172a"],
    },
    appearancePromptEn:
      "Imposing muscular Polynesian Samoan male operator (31 years old), top-knot warrior hairstyle, warm brown skin with intricate cyan-glowing Ta Moko tribal patterns on temple, thick neck and powerful shoulders, stoic fierce warrior face",
    appearancePromptPt:
      "Operador masculino polinésio samoano imponente e musculoso (31 anos), coque samurai guerreiro, pele morena com tatuagens tribais Ta Moko azuladas na têmpora, pescoço largo e expressão implacável de combate",
    wardrobePromptEn:
      "Wearing reinforced shock-absorption torso armor with broad shoulder pauldrons, combat kilt utility skirt over ballistic trousers, spiked impact gloves, deep ocean blue and volcanic orange accents",
    wardrobePromptPt:
      "Vestindo armadura de absorção de choque com ombreiras maciças, cinta tática sobre calça balística reforçada, luvas de impacto pesado e detalhes em azul oceânico e laranja vulcânico",
    weaponHandlingEn:
      "Shouldering a heavy automatic battle cannon or breaching shotgun with firm two-handed authority",
    weaponHandlingPt:
      "Empunhando canhão automático de batalha ou escopeta de assalto pesado com firmeza absoluta de ambas as mãos",
    accentColors: {
      primaryHex: "#0284C7",
      secondaryHex: "#0369A1",
      trimHex: "#F97316",
      label: "Azul Arukheea + Maré Noturna + Laranja Choque",
    },
    biomechanics: {
      heightCm: 194,
      massKg: 105,
      sprintSpeedMps: 6.8,
      slideFrictionCoeff: 0.78,
      recoilAbsorptionDeg: 1.5,
      vaultClearanceCm: 104,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MALE_TECH_INDIAN",
    ueAssetId: "CHR_Overlord_Male_Devan",
    codename: "DEVAN SHARMA",
    fullName: "Devan Sharma · Espectro Eletrônico M-08",
    gender: "MASCULINO",
    rank: "OVERLORD",
    specializationId: "COMUNICACOES_HACKER",
    defaultWorldId: "CIGKV",
    skinRarity: "MITICO",
    roleTitle: "Mestre de Guerra Cibernética & Radar Quântico",
    ethnicity: "Sul-Asiático (Indiano)",
    heritageLore:
      "Mente brilhante responsável pela rede de telemetria dos anéis de confinamento no CIGKV. Interfere em frequências inimigas e antecipa o fechamento do anel com precisão micrométrica.",
    avatarVisual: {
      skinToneHex: "#8b5a2b",
      hairStyle: "Cabelo escuro penteado para trás com risca lateral militar",
      hairColorHex: "#111827",
      eyeColorHex: "#38bdf8",
      facialFeature: "Óculos táticos inteligentes com exibição de telemetria HUD",
      headgearOrVisor: "Óculos de realidade aumentada com diodo de varredura quântica",
      avatarThemeGradient: ["#38bdf8", "#8b5cf6"],
    },
    appearancePromptEn:
      "Sharp analytical South Asian Indian male tactical hacker (27 years old), stylish brushed-back dark hair, warm medium-brown skin texture, wearing futuristic dual-lens cyan augmented reality HUD glasses with streaming code reflection",
    appearancePromptPt:
      "Estrategista masculino sul-asiático indiano (27 anos), cabelo escuro alinhado para trás, pele castanha média com textura realista, usando óculos táticos de realidade aumentada com reflexo de linhas de código em ciano",
    wardrobePromptEn:
      "Wearing lightweight graphite hacker rig with wrist-mounted holocorder terminal, integrated signal jammers, high-mobility pants, and electric cyan and imperial purple accents",
    wardrobePromptPt:
      "Vestindo colete de guerra eletrônica em grafite com terminal holográfico de pulso, bloqueadores de sinal de rádio e acabamento em ciano elétrico e roxo imperial",
    weaponHandlingEn:
      "Holding an ergonomic compact PDW with one hand while interacting with wrist holographic data interface, surgical precision",
    weaponHandlingPt:
      "Empunhando PDW tática compacta com uma mão enquanto aciona o console de pulso holográfico, máxima economia de movimento",
    accentColors: {
      primaryHex: "#38BDF8",
      secondaryHex: "#8B5CF6",
      trimHex: "#FACC15",
      label: "Ciano Quântico + Roxo Cibernético + Ouro CIGKV",
    },
    biomechanics: {
      heightCm: 180,
      massKg: 76,
      sprintSpeedMps: 7.7,
      slideFrictionCoeff: 0.63,
      recoilAbsorptionDeg: 2.5,
      vaultClearanceCm: 118,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8 FEMININE OPERATIVES (DIVERSE ETHNICITIES & RACES)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "OP_FEMALE_VALKYRIE",
    ueAssetId: "CHR_Zheers_Female_Valkyrie",
    codename: "NYRA VEX",
    fullName: "Nyra Vex · Operadora Valkyrie F-01",
    gender: "FEMININO",
    rank: "SKEETW",
    specializationId: "RASTREADORES",
    defaultWorldId: "CIGKV",
    skinRarity: "LENDARIO",
    roleTitle: "Especialista em Mobilidade Tática & Flanqueamento",
    ethnicity: "Afro-Brasileira / Afro-Caribenha",
    heritageLore:
      "Líder dos esquadrões de parkour e infiltração rápida no CIGKV. Combina reflexos acrobáticos e manuseio cirúrgico de carabina de assalto leve.",
    avatarVisual: {
      skinToneHex: "#8c532b",
      hairStyle: "Tranças dreadlocks funcionais presas em coque alto com fios soltos",
      hairColorHex: "#09090b",
      eyeColorHex: "#a855f7",
      facialFeature: "Pintura dourada em chevron sutil na testa e olhar destemido",
      headgearOrVisor: "Microfone tático de garganta e headset ultraleve de esquadrão",
      avatarThemeGradient: ["#f97316", "#a855f7"],
    },
    appearancePromptEn:
      "Athletic young adult Afro-Brazilian female operator (24 years old), toned agile build, dark braided tactical ponytail with natural loose strands framing the face, rich dark-brown skin micro-texture with pores and sweat sheen, fierce determined expression",
    appearancePromptPt:
      "Operadora feminina afro-brasileira jovem e atlética (24 anos), biotipo ágil e definido, tranças táticas presas em coque funcional, pele negra acetinada com suor de combate, marcação dourada na testa e olhar determinado",
    wardrobePromptEn:
      "Wearing an original Khaaos Run ergonomic fitted tactical chest rig over breathable ballistic compression top, high-mobility utility cargo pants with War'I belt harness, fingerless tactical gloves, sleek lightweight PackBack unit, contoured knee pads, lace-locked combat boots, and signature volcanic neon-orange (#F97316) and iridescent Khaaos violet (#7C3AED) seam accents with metallic gold rank insignia",
    wardrobePromptPt:
      "Vestindo chest rig tático ergonômico ajustado sobre camisa balística respirável, calça cargo de alta mobilidade com cinto de translação War'I, luvas sem dedos, mochila leve PackBack aerodinâmica, joelheiras anatômicas, coturnos táticos e filetes em laranja-vulcânico neon (#F97316), roxo Khaaos (#7C3AED) e divisa em ouro metálico",
    weaponHandlingEn:
      "Holding a realistic compact tactical assault carbine (WPN_AssaultRifle_MK1) with suppressor and angled foregrip, natural C-clamp support hand and strict trigger discipline",
    weaponHandlingPt:
      "Empunhando carabina tática de assalto realista (WPN_AssaultRifle_MK1) com supressor e empunhadura C-clamp firme, mantendo disciplina estrita de gatilho",
    accentColors: {
      primaryHex: "#F97316",
      secondaryHex: "#A855F7",
      trimHex: "#FACC15",
      label: "Neon Vulcânico + Violeta Áureo + Prata/Ouro KR",
    },
    biomechanics: {
      heightCm: 171,
      massKg: 64,
      sprintSpeedMps: 7.8,
      slideFrictionCoeff: 0.64,
      recoilAbsorptionDeg: 2.4,
      vaultClearanceCm: 120,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_FEMALE_SNIPER",
    ueAssetId: "CHR_Skeetw_Female_Ghost",
    codename: "LYRA SOLIS",
    fullName: "Lyra Solis · Operadora Mira F-02",
    gender: "FEMININO",
    rank: "VENEX",
    specializationId: "SNIPER",
    defaultWorldId: "Priadus",
    skinRarity: "MITICO",
    roleTitle: "Atiradora de Precisão & Vigilância de Zonas Críticas",
    ethnicity: "Latina Mestiza (Andina / Mexicana)",
    heritageLore:
      "Vigilante dos picos de extração em Priadus. Conhecida por abates limpos a mais de 800 metros através da folhagem úmida e fumaça densa.",
    avatarVisual: {
      skinToneHex: "#c68642",
      hairStyle: "Trança lateral tática com lateral esquerda raspada (undercut)",
      hairColorHex: "#292524",
      eyeColorHex: "#f59e0b",
      facialFeature: "Retículo holográfico âmbar projetado sobre o olho esquerdo",
      headgearOrVisor: "Lente de contato tática de zoom balístico e protetor auditivo",
      avatarThemeGradient: ["#fb923c", "#8b5cf6"],
    },
    appearancePromptEn:
      "Athletic young adult Latina Mestiza female operator (25 years old), sharp observant eyes, undercut side-braid hair, golden-tan skin texture with sweat droplets and camouflage dirt, composed sniper focus with amber micro-reticle overlay",
    appearancePromptPt:
      "Operadora feminina latina jovem-adulta atlética (25 anos), olhar analítico de alta precisão, cabelo com trança lateral e lateral raspada, pele morena dourada com microgotas de suor, retículo óptico âmbar no olho e concentração absoluta",
    wardrobePromptEn:
      "Wearing a streamlined Khaaos Run recon chest harness with laser-cut MOLLE webbing, articulated stealth cargo pants, fingerless precision shooting gloves, low-profile PackBack module, flexible knee pads, silent-tread combat boots, and subtle neon-orange, deep violet and Battle Million gold ballistic trim",
    wardrobePromptPt:
      "Vestindo arnês tático de reconhecimento com sistema MOLLE cortado a laser, calça cargo furtiva articulada, luvas de tiro de precisão sem dedos, módulo PackBack de perfil baixo, joelheiras flexíveis, botas de solado silencioso e detalhes em laranja neon, violeta profundo e dourado Battle Million",
    weaponHandlingEn:
      "Holding a realistic precision DMR/Assault Rifle hybrid (WPN_Sniper_DMR / AR configuration) with low-profile optic, cheek-weld readiness and strict trigger discipline",
    weaponHandlingPt:
      "Empunhando rifle tático de precisão/assalto (WPN_Sniper_DMR / AR) com óptica de perfil baixo, postura pronta para visada e disciplina estrita de gatilho",
    accentColors: {
      primaryHex: "#FB923C",
      secondaryHex: "#8B5CF6",
      trimHex: "#FDE047",
      label: "Âmbar Solar + Violeta Espectral + Ouro Puro",
    },
    biomechanics: {
      heightCm: 174,
      massKg: 62,
      sprintSpeedMps: 7.9,
      slideFrictionCoeff: 0.62,
      recoilAbsorptionDeg: 2.1,
      vaultClearanceCm: 122,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_FEMALE_STEALTH_ASIAN",
    ueAssetId: "CHR_Skeetw_Female_MeiLing",
    codename: "MEI-LING ZHOU",
    fullName: "Mei-Ling Zhou · Lâmina Crepuscular F-03",
    gender: "FEMININO",
    rank: "SKEETW",
    specializationId: "PARAQUEDISTAS",
    defaultWorldId: "Barburhen",
    skinRarity: "EPICO",
    roleTitle: "Especialista em Salto Tático & Eliminação Furtiva",
    ethnicity: "Leste-Asiático (Chinesa)",
    heritageLore:
      "Veterana de inserções aéreas de alta altitude sobre as zonas industriais de Barburhen. Realiza descidas noturnas com planador e ataques relâmpago pelas costas.",
    avatarVisual: {
      skinToneHex: "#ffe0bd",
      hairStyle: "Corte bob angular reto preto profundo com mechas roxas",
      hairColorHex: "#030712",
      eyeColorHex: "#a855f7",
      facialFeature: "Traços faciais finos, olhar concentrado e meia-máscara preta de silício",
      headgearOrVisor: "Meia-máscara de silício acústico e altímetro digital no pulso",
      avatarThemeGradient: ["#a855f7", "#1e1b4b"],
    },
    appearancePromptEn:
      "Athletic agile East Asian Chinese female operator (24 years old), sleek straight black bob haircut, pale porcelain skin with fine dust smudges, sharp dark eyes, high-tech matte-black stealth half-mask",
    appearancePromptPt:
      "Operadora feminina leste-asiática chinesa ágil (24 anos), cabelo preto liso corte bob com franja definida, pele clara com poeira de combate, olhar afiado e meia-máscara tática preta de perfil baixo",
    wardrobePromptEn:
      "Wearing lightweight wingsuit-compatible ballistic rig, drop-leg holsters, carbon-fiber climbing daggers, and glowing violet neon seams",
    wardrobePromptPt:
      "Vestindo macacão balístico aerodinâmico para saltos táticos, coldres de saque rápido, adagas de carbono e costuras em neon violeta",
    weaponHandlingEn:
      "Holding an ultra-compact suppressed submachine gun in close-retention posture, ready for instant knife transition",
    weaponHandlingPt:
      "Empunhando submetralhadora ultracompacta suprimida em postura de retenção próxima, pronta para transição imediata para lâmina",
    accentColors: {
      primaryHex: "#A855F7",
      secondaryHex: "#6366F1",
      trimHex: "#38BDF8",
      label: "Violeta Crepuscular + Índigo Aéreo + Ciano Flash",
    },
    biomechanics: {
      heightCm: 168,
      massKg: 58,
      sprintSpeedMps: 8.0,
      slideFrictionCoeff: 0.60,
      recoilAbsorptionDeg: 2.5,
      vaultClearanceCm: 123,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_FEMALE_HEAVY_AFRICAN",
    ueAssetId: "CHR_Khael_Female_Amara",
    codename: "AMARA DIALLO",
    fullName: "Amara Diallo · Muralha de Cinzas F-04",
    gender: "FEMININO",
    rank: "KHAEL",
    specializationId: "MOTORISTA_PESADOS",
    defaultWorldId: "Barburhen",
    skinRarity: "LENDARIO",
    roleTitle: "Comandante de Veículos Blindados & Contenção Pesada",
    ethnicity: "Oeste-Africana (Senegalesa / Wolof)",
    heritageLore:
      "Piloto líder de comboios de carga pesada que furaram o cerco do Zu 1 em direção à refinaria de Barburhen. Especialista em veículos blindados e transporte de esquadrão sob chuva ácida.",
    avatarVisual: {
      skinToneHex: "#4a2c11",
      hairStyle: "Afro curto escultural com degradê geométrico",
      hairColorHex: "#0a0a0a",
      eyeColorHex: "#eab308",
      facialFeature: "Pontos rituais brancos de foco na têmpora e cicatriz de blindagem",
      headgearOrVisor: "Colar reforçado com placas de titânio e intercomunicador de frota",
      avatarThemeGradient: ["#f97316", "#78350f"],
    },
    appearancePromptEn:
      "Statuesque powerful West African Wolof female operator (29 years old), sculptural short afro fade, deep dark radiant skin with white geometric warrior dots near temples, piercing amber eyes, imposing authoritative presence",
    appearancePromptPt:
      "Operadora feminina oeste-africana senegalesa imponente e atlética (29 anos), corte afro curto esculpido, pele escura retinta radiante com marcas pontilhadas brancas nas têmporas e olhar de comando",
    wardrobePromptEn:
      "Wearing heavy reinforced blast-suit vest with thermal insulation collar, heavy utility belt, steel-plated gauntlets, and volcanic orange and burnished bronze accents",
    wardrobePromptPt:
      "Vestindo colete balístico anti-impacto com isolamento térmico, cinto reforçado para equipamentos pesados, manoplas de aço e detalhes em laranja vulcânico e bronze fosco",
    weaponHandlingEn:
      "Holding a heavy breach assault rifle with firm two-handed stance, total control over heavy recoil",
    weaponHandlingPt:
      "Empunhando fuzil de assalto de grosso calibre com postura firme de duas mãos, controle total do recuo",
    accentColors: {
      primaryHex: "#F97316",
      secondaryHex: "#78350F",
      trimHex: "#FACC15",
      label: "Laranja Blindagem + Terra Queimada + Ouro Wolof",
    },
    biomechanics: {
      heightCm: 184,
      massKg: 82,
      sprintSpeedMps: 7.2,
      slideFrictionCoeff: 0.72,
      recoilAbsorptionDeg: 1.8,
      vaultClearanceCm: 112,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_FEMALE_SURVIVOR_INDIGENOUS",
    ueAssetId: "CHR_Onith_Female_Kayaen",
    codename: "KAYAEN APINAJÉ",
    fullName: "Kayaen Apinajé · Flor Venenosa F-05",
    gender: "FEMININO",
    rank: "ONITH",
    specializationId: "COMANDOS_SELVA",
    defaultWorldId: "Priadus",
    skinRarity: "RARO",
    roleTitle: "Rastreadora de Trilhas & Especialista em Toxinas",
    ethnicity: "Indígena Brasileira (Cerrado / Tocantins - Apinajé)",
    heritageLore:
      "Herdeira das técnicas de manipulação de resinas e toxinas das matas de galeria. Desenvolveu antídotos botânicos que permitem aos operativos respirar durante as ondas de esporos em Priadus.",
    avatarVisual: {
      skinToneHex: "#a25828",
      hairStyle: "Longas tranças pretas duplas adornadas com miçangas térmicas",
      hairColorHex: "#050505",
      eyeColorHex: "#10b981",
      facialFeature: "Pintura facial de jenipapo escuro e urucum em linhas horizontais nas bochechas",
      headgearOrVisor: "Gargantilha de fibras naturais com sensor microclimático",
      avatarThemeGradient: ["#10b981", "#ef4444"],
    },
    appearancePromptEn:
      "Agile Indigenous Brazilian Apinajé female operator (23 years old), twin long dark braids with utility beads, warm copper skin with traditional black jenipapo and red urucum geometric markings, alert emerald eyes",
    appearancePromptPt:
      "Operadora feminina indígena brasileira Apinajé ágil (23 anos), tranças duplas longas e escuras com contas funcionais, pele acobreada com grafismos tradicionais em jenipapo preto e urucum, olhar verde-esmeralda atento",
    wardrobePromptEn:
      "Wearing lightweight tropical camouflage fatigues, toxic spore filter mask slung at neck, arm wraps, silent moccasin-style combat boots, and forest green and ember red accents",
    wardrobePromptPt:
      "Vestindo farda camuflada leve para clima úmido, máscara de filtro de esporos no pescoço, braçadeiras de couro tático e detalhes em verde-floresta e vermelho-brasa",
    weaponHandlingEn:
      "Holding a lightweight tactical marksman carbine with instinctual shoulder mount and silent trigger action",
    weaponHandlingPt:
      "Empunhando carabina leve de atirador com visada instintiva e acionamento silencioso de gatilho",
    accentColors: {
      primaryHex: "#10B981",
      secondaryHex: "#EF4444",
      trimHex: "#F59E0B",
      label: "Verde Botânico + Vermelho Urucum + Ouro Nativo",
    },
    biomechanics: {
      heightCm: 167,
      massKg: 59,
      sprintSpeedMps: 8.0,
      slideFrictionCoeff: 0.60,
      recoilAbsorptionDeg: 2.3,
      vaultClearanceCm: 122,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_FEMALE_PILOT_EURO",
    ueAssetId: "CHR_Venex_Female_Freja",
    codename: "FREJA LINDSTROM",
    fullName: "Freja Lindstrom · Asa de Gelo F-06",
    gender: "FEMININO",
    rank: "VENEX",
    specializationId: "PILOTO_AERONAVES",
    defaultWorldId: "Arukheea",
    skinRarity: "LENDARIO",
    roleTitle: "Piloto de Evacuação ZEX & Drones Aéreos",
    ethnicity: "Escandinava / Europeia Nórdica (Sueca)",
    heritageLore:
      "Piloto de helicópteros de resgate tático em tempestades severas. Conduz aeronaves através da parede de água de Arukheea para resgatar esquadrões sobreviventes nos helipontos de extração.",
    avatarVisual: {
      skinToneHex: "#ffe0bd",
      hairStyle: "Trança militar loira platinada puxada para trás",
      hairColorHex: "#f8fafc",
      eyeColorHex: "#0284c7",
      facialFeature: "Viseira HUD de aviação azulada inclinada sobre o capacete leve",
      headgearOrVisor: "Capacete de piloto com óculos polarizados e microfone flexível",
      avatarThemeGradient: ["#0284c7", "#38bdf8"],
    },
    appearancePromptEn:
      "Athletic Nordic Scandinavian female pilot operator (26 years old), platinum blonde braided hair, pale Nordic skin with faint frost-air blush, sharp ice-blue eyes, tactical pilot helmet with flip-up tinted HUD visor",
    appearancePromptPt:
      "Operadora feminina nórdica escandinava piloto (26 anos), cabelo loiro platinado trançado, pele clara com rubor suave do vento costeiro, olhos azuis gélidos, capacete leve de voo com visor HUD escamoteável",
    wardrobePromptEn:
      "Wearing a high-G flight suit adapted for tactical ground combat, survival beacon harness, insulated flight gloves, and storm-blue and arctic white accents with gold pilot wings",
    wardrobePromptPt:
      "Vestindo macacão de voo pressurizado adaptado para combate terrestre, arnês de rádio-farol de emergência, luvas térmicas e acabamento em azul tempestade e branco ártico",
    weaponHandlingEn:
      "Holding a compact high-rate-of-fire personal defense weapon (PDW) with single-point sling, optimized for cramped cockpits and helipads",
    weaponHandlingPt:
      "Empunhando PDW compacta de alta cadência em bandoleira de um ponto, otimizada para manuseio em cabines de helicóptero e helipontos",
    accentColors: {
      primaryHex: "#0284C7",
      secondaryHex: "#38BDF8",
      trimHex: "#FACC15",
      label: "Azul Tempestade + Branco Ártico + Ouro Aviação",
    },
    biomechanics: {
      heightCm: 173,
      massKg: 63,
      sprintSpeedMps: 7.7,
      slideFrictionCoeff: 0.65,
      recoilAbsorptionDeg: 2.2,
      vaultClearanceCm: 119,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_FEMALE_DISRUPTOR_MENA",
    ueAssetId: "CHR_Huran_Female_Soraya",
    codename: "SORAYA HADD",
    fullName: "Soraya Hadd · Tempestade de Areia F-07",
    gender: "FEMININO",
    rank: "HURAN",
    specializationId: "ANTI_BOMBAS",
    defaultWorldId: "Ckesalth",
    skinRarity: "EPICO",
    roleTitle: "Desativação de Explosivos & Granadas Sônicas",
    ethnicity: "Levantina / Oriente Médio (Libanesa)",
    heritageLore:
      "Engenheira de demolição e desativação de minas em zonas de conflito urbano em Beirute reconstruída. Desarma armadilhas de proximidade e emprega granadas térmicas nas refinarias de Ckesalth.",
    avatarVisual: {
      skinToneHex: "#c68642",
      hairStyle: "Cabelo escuro ondulado volumoso preso em rabo de cavalo alto",
      hairColorHex: "#1c1917",
      eyeColorHex: "#ef4444",
      facialFeature: "Delineador tático kohl e headset com cancelamento de ruído explosivo",
      headgearOrVisor: "Abafadores auriculares táticos de alta redução sonora (dB)",
      avatarThemeGradient: ["#ef4444", "#78350f"],
    },
    appearancePromptEn:
      "Confident athletic Middle Eastern Levantine Lebanese female operator (27 years old), wavy dark hair in a high tactical ponytail, olive skin texture with fine soot dust, intense dark eyes with natural kohl definition, tactical over-ear blast suppression headset",
    appearancePromptPt:
      "Operadora feminina levantina libanesa confiante e ágil (27 anos), cabelos escuros ondulados em rabo de cavalo tático, pele oliva com poeira fina de fuligem, olhos expressivos definidos por kohl e fones de proteção balística",
    wardrobePromptEn:
      "Wearing a bomb-disposal reinforced chest protector, blast-resistant arm sleeves, utility pouches loaded with disarm kits and flashbangs, and crimson red and desert sand accents",
    wardrobePromptPt:
      "Vestindo protetor peitoral anti-fragmentação reforçado, mangas resistentes a chamas, bolsas com kits de desativação de minas e granadas de concussão, detalhes em vermelho rubi e areia",
    weaponHandlingEn:
      "Holding an engineered tactical shotgun for door breaching and mine neutralization, disciplined grounded posture",
    weaponHandlingPt:
      "Empunhando escopeta tática calibrada para destruição de obstáculos e minas, com postura grounded e dedo fora do gatilho",
    accentColors: {
      primaryHex: "#EF4444",
      secondaryHex: "#78350F",
      trimHex: "#F59E0B",
      label: "Vermelho Rubi + Areia Levantina + Bronze Granada",
    },
    biomechanics: {
      heightCm: 172,
      massKg: 66,
      sprintSpeedMps: 7.6,
      slideFrictionCoeff: 0.67,
      recoilAbsorptionDeg: 2.1,
      vaultClearanceCm: 117,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_FEMALE_TACTICIAN_SOUTHASIAN",
    ueAssetId: "CHR_Skeetw_Female_Priya",
    codename: "PRIYA NAIR",
    fullName: "Priya Nair · Égide Kalari F-08",
    gender: "FEMININO",
    rank: "SKEETW",
    specializationId: "INFANTARIA",
    defaultWorldId: "Arukheea",
    skinRarity: "MITICO",
    roleTitle: "Estrategista de Barreira & Defesa Hemisférica",
    ethnicity: "Sul-Asiática (Dravidiana / Sul da Índia - Kerala)",
    heritageLore:
      "Praticante de Kalaripayattu adaptado à guerra tática moderna. Comanda a projeção de barreiras de plasma Égide para resguardar posições vulneráveis durante o choque das marés de Arukheea.",
    avatarVisual: {
      skinToneHex: "#8d5524",
      hairStyle: "Longa trança escura reluzente entrelaçada com fio de ouro",
      hairColorHex: "#09090b",
      eyeColorHex: "#f59e0b",
      facialFeature: "Sensor tático bindi âmbar na fronte e postura nobre impecável",
      headgearOrVisor: "Colar emissor de escudo energético hemisférico Égide",
      avatarThemeGradient: ["#f59e0b", "#6d28d9"],
    },
    appearancePromptEn:
      "Graceful powerful South Asian Dravidian female operator (26 years old), long glossy dark braid with gold wire accents, rich warm brown skin with delicate facial symmetry, amber sensor marking on forehead, calm focused gaze",
    appearancePromptPt:
      "Operadora feminina sul-asiática indiana de Kerala elegante e atlética (26 anos), trança longa preta com fio dourado, pele morena quente com simetria marcante, sensor tático bindi âmbar na testa e olhar sereno e focado",
    wardrobePromptEn:
      "Wearing a high-tech armored Kalari combat tunic over ballistic compression gear, energy-emitter gauntlets, and royal purple and radiant gold Battle Million accents",
    wardrobePromptPt:
      "Vestindo túnica de combate balística reforçada estilo Kalari, manoplas emissoras de energia defensiva, calça tática e detalhes em roxo real e ouro Battle Million",
    weaponHandlingEn:
      "Holding a modular tactical assault rifle with balanced two-handed stance, fluid transition to personal energy shield",
    weaponHandlingPt:
      "Empunhando fuzil de assalto modular com empunhadura equilibrada e transição suave para ativação da barreira de plasma",
    accentColors: {
      primaryHex: "#F59E0B",
      secondaryHex: "#6D28D9",
      trimHex: "#FDE047",
      label: "Ouro Kalari + Roxo Imperial + Âmbar Égide",
    },
    biomechanics: {
      heightCm: 170,
      massKg: 61,
      sprintSpeedMps: 7.9,
      slideFrictionCoeff: 0.62,
      recoilAbsorptionDeg: 2.2,
      vaultClearanceCm: 121,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
];

/**
 * Lote 4 — Milícias e Gangues Urbanas (16 operantes não-militares).
 * Complementam os 16 militares canônicos: controle territorial informal
 * (milícias, MIL-01..08) e facções de rua (gangues, GNG-01..08).
 * Rig base por sexo (ADR-ESQUELETO-RIG-POR-SEXO); facção declarada em `faction`.
 */
export const KHAAOS_MILITIA_ARCHETYPES: OperativeArchetype[] = [

  // ── Milícias urbanas: controle territorial, estrutura paramilitar informal ──
  {
    id: "OP_MIL_MALE_VULTO",
    ueAssetId: "CHR_Zheers_Male_Vulto",
    codename: "VULTO",
    fullName: "Rui 'Vulto' Nascimento · Comandante de Bloco MIL-01",
    gender: "MASCULINO",
    faction: "MILICIA_URBANA",
    rank: "ONITH",
    specializationId: "INFANTARIA",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Comando Territorial & Defesa de Perímetro",
    ethnicity: "Afro-Brasileiro / Sertão Nordestino",
    heritageLore:
      "Comandante de bloco em Barburhen, ex-bombeiro civil que perdeu a equipe no primeiro colapso do anel urbano. Governa 4 lajes e 2 galerias com regras próprias: ninguém passa sem registro e ninguém morre de sede sob sua guarda.",
    avatarVisual: {
      skinToneHex: "#7A4A24",
      hairStyle: "Buzz-cut com degradê militar",
      hairColorHex: "#9CA3AF",
      eyeColorHex: "#F59E0B",
      facialFeature: "Cicatriz de queimadura no antebraço direito e olhar de quem já ordenou luto",
      headgearOrVisor: "Bandana âmbar de perímetro com nó lateral",
      avatarThemeGradient: ["#D97706", "#4B5563"],
    },
    appearancePromptEn:
      "Weathered Afro-Brazilian male militia block commander (44 years old), salt-and-pepper buzz cut, trimmed goatee, burn-scarred forearms, broad tired shoulders, steady commanding gaze under a dusty amber bandana",
    appearancePromptPt:
      "Comandante de bloco miliciano afro-brasileiro de pele marcada (44 anos), cabeça raspada com os cabelos salpicados de grisalho, cavanhaque aparado, antebraços com cicatriz de queimadura, ombros largos e cansados, olhar firme sob bandana âmbar empoeirada",
    wardrobePromptEn:
      "Wearing a worn-out grey Khaaos Run militia plate carrier patched with mismatched ceramic plates, folded sleeves of a faded brick-red work shirt, zip-tied spare mag pouches, civilian steel-toe boots, amber taxi-yellow perimeter armband, and a hand-painted block number on the chest",
    wardrobePromptPt:
      "Vestindo colete miliciano cinza desbotado do Khaaos Run com placas cerâmicas desparejas amarradas por abraçadeiras, manga dobrada de camisa de trabalho tijolo, porta-cartuchos improvisados, bota de obra, braçadeira amarelo-táxi de perímetro e o número do bloco pintado à mão no peito",
    weaponHandlingEn:
      "Holding a battered pump shotgun with electrical-tape grip wrap (WPN_Shotgun_Breach), steady two-hand hold with strict trigger discipline learned in fire brigades",
    weaponHandlingPt:
      "Empunhando escopeta de bombeamento gasta com fita isolante no punho (WPN_Shotgun_Breach), empunhadura firme de duas mãos e disciplina de gatilho aprendida no corpo de bombeiros",
    accentColors: {
      primaryHex: "#D97706",
      secondaryHex: "#4B5563",
      trimHex: "#FACC15",
      label: "Âmbar Laje + Cinza-Urubu + Amarelo-Táxi",
    },
    biomechanics: {
      heightCm: 184,
      massKg: 88,
      sprintSpeedMps: 7.0,
      slideFrictionCoeff: 0.74,
      recoilAbsorptionDeg: 2.2,
      vaultClearanceCm: 112,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_MALE_ECO",
    ueAssetId: "CHR_Skeetw_Male_Eco",
    codename: "ECO",
    fullName: "Zico 'Eco' Amaral · Radarista das Lajes MIL-02",
    gender: "MASCULINO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "COMUNICACOES_HACKER",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Vigilância de Laje & Rede Rádio da Milícia",
    ethnicity: "Pardo Amazônido / Ribeirinho Belenense",
    heritageLore:
      "Subiu no telhado do CIGKV aos 12 anos e nunca mais desceu: das lajes coordena a rede de rádios HT e espelhos solares da milícia. Dizem que escuta um drone ligando 3 quadras antes de ele aparecer no horizonte.",
    avatarVisual: {
      skinToneHex: "#B07B4F",
      hairStyle: "Dreadlocks curtos com argolas",
      hairColorHex: "#1F2937",
      eyeColorHex: "#22D3EE",
      facialFeature: "Rosto enxuto com olhos sempre em rotação de vigia e marca de sol em arco no pescoço",
      headgearOrVisor: "Headset de vigia com antena improvisada",
      avatarThemeGradient: ["#0EA5E9", "#374151"],
    },
    appearancePromptEn:
      "Lean river-dwelling mixed-heritage male militia radio watcher (22 years old), short dreadlocks with tiny reflective rings, sun-arc tan line on the neck, quick scanning eyes, cyan-tinted tactical headset with improvised antenna",
    appearancePromptPt:
      "Vigia de rádio miliciano pardo amazônido magro (22 anos), dreadlocks curtos com argolinhas refletivas, marca de sol em arco no pescoço, olhos em varredura constante e headset tático ciano com antena improvisada",
    wardrobePromptEn:
      "Wearing a faded sky-blue militia windbreaker over a mesh tracer vest with zip-tied radio batteries, lightweight cargo shorts over compression leggings, worn running shoes, clipboard of patrol codes taped to the PackBack strap",
    wardrobePromptPt:
      "Vestindo corta-vento azul-céu de milícia desbotado sobre colete de rastreamento com pilhas de rádio amarradas, bermuda cargo sobre legging de compressão, tênis de corrida gasto e prancheta de códigos de ronda presa à alça da PackBack",
    weaponHandlingEn:
      "Holding a compact survival pistol (WPN_Pistol_MK1) low-ready in one hand while the other taps the radio keyer, trigger finger indexed along the slide",
    weaponHandlingPt:
      "Segurando pistola compacta de sobrevivência (WPN_Pistol_MK1) em guarda baixa com uma mão enquanto a outra toca o manipulador do rádio, dedo de gatilho alinhado ao ferrolho",
    accentColors: {
      primaryHex: "#0EA5E9",
      secondaryHex: "#374151",
      trimHex: "#22D3EE",
      label: "Céu-Laje + Grafite + Ciano-Radar",
    },
    biomechanics: {
      heightCm: 174,
      massKg: 63,
      sprintSpeedMps: 7.6,
      slideFrictionCoeff: 0.62,
      recoilAbsorptionDeg: 3.4,
      vaultClearanceCm: 124,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_MALE_FERRAZ",
    ueAssetId: "CHR_Onith_Male_Ferraz",
    codename: "FERRAZ",
    fullName: "Tonho Ferraz · Armeiro de Quintal MIL-03",
    gender: "MASCULINO",
    faction: "MILICIA_URBANA",
    rank: "ONITH",
    specializationId: "ENGENHARIA_TATICA",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Fabricação Artesanal & Manutenção de Campo",
    ethnicity: "Caipira Paulista / Italiano-Luso",
    heritageLore:
      "Transforma gás, cano de água e mola de caminhão em escopeta confiável dentro do quintal de Barburhen. A milícia inteira atira com o que a bancada dele aprova — e o punho do Ferraz grava o lacre de qualidade em cada arma.",
    avatarVisual: {
      skinToneHex: "#E8B98A",
      hairStyle: "Cabeça raspada com brilho de suor",
      hairColorHex: "#6B7280",
      eyeColorHex: "#78716C",
      facialFeature: "Bigode de açogueiro sobre barba grisalha e queimaduras de solda nos antebraços",
      headgearOrVisor: "Óculos de solda pousados na testa",
      avatarThemeGradient: ["#B45309", "#57534E"],
    },
    appearancePromptEn:
      "Heavyset back-yard gunsmith male militia artisan (51 years old), shaved head with grey stubble shadow, thick butcher moustache over a grey beard, weld-burn speckles on forearms, calm craftsman squint",
    appearancePromptPt:
      "Armeiro de quintal miliciano de porte pesado (51 anos), cabeça raspada com sombra de barba grisalha, bigode grosso sobre barba cinza, salpicos de queimadura de solda nos antebraços e olhar sereno de artesão",
    wardrobePromptEn:
      "Wearing a scorched leather blacksmith apron over a bronze-brown Khaaos Run militia overalls, rolled sleeves with duct-tape tool loops, heavy welding gloves hooked on the belt, stamped quality seal hanging from the neck chain",
    wardrobePromptPt:
      "Vestindo avental de forja couro chamuscado sobre jardineira milicia bronze do Khaaos Run, mangas enroladas com laços de fita isolante para ferramentas, luvas de solda grossas no cinto e lacre de qualidade estampado pendurado na corrente do pescoço",
    weaponHandlingEn:
      "Holding his own hand-stamped breach shotgun (WPN_Shotgun_Breach) with raw-steel finish and hand-filed rifling, confident relaxed muzzle-down carry",
    weaponHandlingPt:
      "Empunhando escopeta de brecha estampada por ele mesmo (WPN_Shotgun_Breach) com acabamento de aço cru e cano raiado à lima, cano para baixo em portea confiante",
    accentColors: {
      primaryHex: "#B45309",
      secondaryHex: "#57534E",
      trimHex: "#F59E0B",
      label: "Bronze-Fornalha + Metal Sujo + Âmbar",
    },
    biomechanics: {
      heightCm: 178,
      massKg: 97,
      sprintSpeedMps: 6.4,
      slideFrictionCoeff: 0.78,
      recoilAbsorptionDeg: 1.9,
      vaultClearanceCm: 100,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_MALE_GRAU",
    ueAssetId: "CHR_Venex_Male_Grau",
    codename: "GRAU",
    fullName: "Márcio 'Grau' Quispe · Motoqueiro de Esquina MIL-04",
    gender: "MASCULINO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "MOTORISTA_PESADOS",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Mobilidade Moto & Recado Urgente da Milícia",
    ethnicity: "Mestiço Andino / Peruano-Limeño",
    heritageLore:
      "Atravessa o CIGKV de costas da moto em 4 minutos no pico do bloqueio. É o recado vivo da milícia: se o Grau chegou de mau humor, o perímetro já sabe que algo caiu.",
    avatarVisual: {
      skinToneHex: "#C68A53",
      hairStyle: "Undercut com coque alto",
      hairColorHex: "#111827",
      eyeColorHex: "#65A30D",
      facialFeature: "Nariz torto de queda de moto e meio-sorriso desafiador",
      headgearOrVisor: "Boné verde-oliva virado com pin",
      avatarThemeGradient: ["#65A30D", "#44403C"],
    },
    appearancePromptEn:
      " wiry Andean mixed-heritage male militia moto-runner (25 years old), black undercut topknot, crooked nose from a bike crash, defiant half-smile, olive-green backwards cap, highway dust on the cheekbones",
    appearancePromptPt:
      "Motoqueiro miliciano mestiço andino magro (25 anos), undercut preto com coque, nariz torto de queda de moto, meio-sorriso desafiador, boné verde-oliva virado e poeira de estrada nos maçãs do rosto",
    wardrobePromptEn:
      "Wearing a delivery-scarred olive-green militia moto jacket with reflective taxi-yellow tape strips, armored knee slides, fingerless riding gloves, mismatched shin guards and a coiled tow strap over the shoulder",
    wardrobePromptPt:
      "Vestindo jaqueta moto milícia verde-oliva marcada por entregas com fitas refletivas amarelo-táxi, joelheiras de deslizamento, luvas de pilotar sem dedos, caneleiras desparejas e cinta de reboque enrolada no ombro",
    weaponHandlingEn:
      "Holding a compact submachine gun (WPN_SMG_MK2) sideways-ready across the tank of his bike, disciplined index finger despite the showy angle",
    weaponHandlingPt:
      "Segurando submetralhadora compacta (WPN_SMG_MK2) atravessada no tanque da moto, dedo indicador disciplinado apesar do ângulo exibido",
    accentColors: {
      primaryHex: "#65A30D",
      secondaryHex: "#44403C",
      trimHex: "#FDE047",
      label: "Verde-Entrega + Asfalto + Amarelo-Farol",
    },
    biomechanics: {
      heightCm: 173,
      massKg: 68,
      sprintSpeedMps: 7.4,
      slideFrictionCoeff: 0.66,
      recoilAbsorptionDeg: 2.9,
      vaultClearanceCm: 122,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_FEMALE_NOTA",
    ueAssetId: "CHR_Zheers_Female_Nota",
    codename: "NOTA",
    fullName: "Dandara 'Nota' Lisboa · Cobradora de Proteção MIL-05",
    gender: "FEMININO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "FUZILEIROS",
    defaultWorldId: "Barburhen",
    skinRarity: "COMUM",
    roleTitle: "Cobrança Territorial & Controle de Loot da Milícia",
    ethnicity: "Afro-Brasileira / Periferia Carioca",
    heritageLore:
      "Cobradora de 'proteção' com caderneta mimeografada: cada venda de Barburhen tem sua linha, cada linha tem prazo. Trata a caderneta como arquivo de guerra — quem a acha, acha o mapa inteiro do território.",
    avatarVisual: {
      skinToneHex: "#5C3A21",
      hairStyle: "Tranças box com miçangas brancas",
      hairColorHex: "#101010",
      eyeColorHex: "#E879F9",
      facialFeature: "Brincos de argola pesados e olhar de contadora de guerra",
      headgearOrVisor: "Bandana vermelha no pescoço e argola dourada",
      avatarThemeGradient: ["#DC2626", "#52525B"],
    },
    appearancePromptEn:
      "Sharp-featured Afro-Brazilian female militia toll collector (29 years old), box braids with small white beads, heavy gold hoop earrings, ledger-keeper's focused gaze, red neck bandana, ink smudge on the wrist",
    appearancePromptPt:
      "Cobradora miliciana afro-brasileira de traços marcados (29 anos), tranças box com miçangas brancas, argolas douradas pesadas, olhar focado de quem confere contas, bandana vermelha no pescoço e mancha de tinta no pulso",
    wardrobePromptEn:
      "Wearing a brick-red militia armband over a patched utility vest with transparent card pockets full of stamped collection slips, reinforced cargo skirt over tactical leggings, laced ankle boots, mimeographed ledger strapped to the thigh",
    wardrobePromptPt:
      "Vestindo braçadeira milícia vermelho-tijolo sobre colete utilitário remendado com portas-cartão cheios de comprovantes carimbados, saia cargo reforçada sobre legging tática, bota de cano alto amarrada e caderneta mimeografada presa à coxa",
    weaponHandlingEn:
      "Holding a worn militia-pattern assault rifle (WPN_AssaultRifle_MK1) with red-taped magazine, strict trigger discipline while the ledger dangles from the wrist strap",
    weaponHandlingPt:
      "Empunhando fuzil de padrão miliciano desgastado (WPN_AssaultRifle_MK1) com carregador marcado por fita vermelha, disciplina estrita de gatilho com a caderneta balançando na alça do pulso",
    accentColors: {
      primaryHex: "#DC2626",
      secondaryHex: "#52525B",
      trimHex: "#E7E5E4",
      label: "Vermelho-Tijolo + Zinco + Papel-Moeda",
    },
    biomechanics: {
      heightCm: 170,
      massKg: 64,
      sprintSpeedMps: 7.2,
      slideFrictionCoeff: 0.68,
      recoilAbsorptionDeg: 2.6,
      vaultClearanceCm: 116,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_FEMALE_SIRENE",
    ueAssetId: "CHR_Khael_Female_Sirene",
    codename: "SIRENE",
    fullName: "Marisa 'Sirene' Kalinda · Oradora de Perímetro MIL-06",
    gender: "FEMININO",
    faction: "MILICIA_URBANA",
    rank: "SKEETW",
    specializationId: "COMUNICACOES_HACKER",
    defaultWorldId: "CIGKV",
    skinRarity: "RARO",
    roleTitle: "Propaganda de Guerra & Moral da Milícia",
    ethnicity: "Cigana Calon (Romani Brasileira) / Interior Sudeste",
    heritageLore:
      "Comanda o alto-falante de 400 watts no topo da laje-mãe do CIGKV: anúncio de curfew, listagem de desaparecidos e hinos de resistência. Os portões abrem quando a Sirene fala — e fecham quando ela repete três vezes.",
    avatarVisual: {
      skinToneHex: "#C99B6E",
      hairStyle: "Cabelo longo ondulado preso",
      hairColorHex: "#2B1D12",
      eyeColorHex: "#A78BFA",
      facialFeature: "Lenço de flores amarrado à cabeça e olhar que mede plateias inteiras",
      headgearOrVisor: "Lenço roxo de flores amarrado à cabeça",
      avatarThemeGradient: ["#7C3AED", "#3F3F46"],
    },
    appearancePromptEn:
      "Charismatic Calon Romani Brazilian female militia perimeter orator (38 years old), long wavy dark-brown hair under a purple floral headscarf, expressive wide gaze, small gold tooth glint, sun-lifted chin of someone addressing a crowd",
    appearancePromptPt:
      "Oradora miliciana cigana calon carismática (38 anos), cabelo castanho escuro longo e ondulado sob lenço roxo de flores, olhar largo e expressivo, brilho de dente de ouro e queixo erguido de quem fala para plateia",
    wardrobePromptEn:
      "Wearing a smoke-grey militia speaker vest with a hand-painted megaphone emblem, layered calico skirts over thermal leggings, fingerless gloves, portable PA rig clipped to the PackBack frame, purple ribbon around the wrist",
    wardrobePromptPt:
      "Vestindo colete milícia cinza-fumaça com emblema de megafone pintado à mão, saias de chita em camadas sobre legging térmica, luvas sem dedos, módulo de som portátil preso à estrutura PackBack e fita roxa no pulso",
    weaponHandlingEn:
      "Holding a compact carbine (WPN_AssaultRifle_MK1) slung across the back while both hands keep the megaphone steady, disciplined posture of a commander who speaks before shooting",
    weaponHandlingPt:
      "Carabina compacta (WPN_AssaultRifle_MK1) a tiracolo nas costas enquanto as duas mãos firmam o megafone, postura disciplinada de comandante que fala antes de atirar",
    accentColors: {
      primaryHex: "#7C3AED",
      secondaryHex: "#3F3F46",
      trimHex: "#FB7185",
      label: "Roxo-Corredor + Fumaça + Rosa-Sirene",
    },
    biomechanics: {
      heightCm: 168,
      massKg: 66,
      sprintSpeedMps: 6.8,
      slideFrictionCoeff: 0.7,
      recoilAbsorptionDeg: 3.1,
      vaultClearanceCm: 108,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_FEMALE_SORO",
    ueAssetId: "CHR_Huran_Female_Soro",
    codename: "SORO",
    fullName: "Hana 'Soro' Seo · Enfermeira de Clínica MIL-07",
    gender: "FEMININO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "MEDICO_COMBATE",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Suporte Médico Improvisado & Estabilização",
    ethnicity: "Coreana / Liberdade, São Paulo",
    heritageLore:
      "Mantém a clínica de andar térreo de Barburhen funcionando com soro caseiro, anestesia de aquário e luz de celular. A regra dela é absoluta: dentro da sala, nenhuma arma carregada — nem a da milícia.",
    avatarVisual: {
      skinToneHex: "#F3C89D",
      hairStyle: "Bob liso com franja reta",
      hairColorHex: "#2D1B0E",
      eyeColorHex: "#38BDF8",
      facialFeature: "Olhos calmos sob franja reta e mãos com tinta de iodo persistente",
      headgearOrVisor: "Touca cirúrgica verde com máscara no queixo",
      avatarThemeGradient: ["#10B981", "#475569"],
    },
    appearancePromptEn:
      "Composed Korean-Brazilian female militia clinic nurse (31 years old), straight-fringe bob, calm steady eyes, persistent iodine stains on the hands, green surgical cap slightly askew, surgical mask pulled under the chin",
    appearancePromptPt:
      "Enfermeira de clínica miliciana coreano-brasileira serena (31 anos), bob com franja reta, olhos calmos e firmes, manchas de iodo persistentes nas mãos, touca cirúrgica verde levemente torta e máscara abaixada no queixo",
    wardrobePromptEn:
      "Wearing a clinic-green militia tabard with red cross patch stitched from salvage, triple-stacked trauma shears on a chest loop, zip-tied IV bags, sturdy trousers with knee reinforcement, slip-resistant shoes",
    wardrobePromptPt:
      "Vestindo tabardo milícia verde-clínica com remendo de cruz vermelha costurado de sucata, tesouras de trauma triplas no peitoral, bolsas de soro amarradas, calça reforçada nos joelhos e sapato antiderrapante",
    weaponHandlingEn:
      "Holding a compact service pistol (WPN_Pistol_MK1) with magazine removed as house rule, calm two-hand grip that signals she can use it when rules break",
    weaponHandlingPt:
      "Segurando pistola de serviço compacta (WPN_Pistol_MK1) com carregador retirado por regra da casa, empunhadura calma de duas mãos que avisa que ela sabe usar quando a regra quebra",
    accentColors: {
      primaryHex: "#10B981",
      secondaryHex: "#475569",
      trimHex: "#5EEAD4",
      label: "Verde-Enfermaria + Aço + Menta-Soro",
    },
    biomechanics: {
      heightCm: 165,
      massKg: 57,
      sprintSpeedMps: 7.0,
      slideFrictionCoeff: 0.66,
      recoilAbsorptionDeg: 3.3,
      vaultClearanceCm: 110,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_MIL_FEMALE_CORUJA",
    ueAssetId: "CHR_Skeetw_Female_Coruja",
    codename: "CORUJA",
    fullName: "Nina 'Coruja' Mamani · Vigia Noturna MIL-08",
    gender: "FEMININO",
    faction: "MILICIA_URBANA",
    rank: "ZHEERS",
    specializationId: "RASTREADORES",
    defaultWorldId: "Priadus",
    skinRarity: "COMUM",
    roleTitle: "Observação Noturna & Avanço Silencioso",
    ethnicity: "Boliviana Aymara / El Alto",
    heritageLore:
      "Vigia as bordas do perímetro de Priadus das 22h às 5h da milícia do posto avançado. Treinou os olhos nas madrugadas frias de El Alto: conta silhuetas antes de contar estrelas e nunca acende lamparina perto do vidro.",
    avatarVisual: {
      skinToneHex: "#A9714B",
      hairStyle: "Coque baixo compacto",
      hairColorHex: "#141414",
      eyeColorHex: "#FBBF24",
      facialFeature: "Olhos amendoados acostumados ao escuro e mantô de lã fino no pescoço",
      headgearOrVisor: "Capuz azul-ardósia de vigia noturna",
      avatarThemeGradient: ["#334155", "#1E293B"],
    },
    appearancePromptEn:
      "Quiet Aymara Bolivian female militia night watcher (27 years old), dark hair pulled into a low bun under a slate-blue hood, almond eyes adapted to darkness, thin alpaca wool scarf, still patient posture",
    appearancePromptPt:
      "Vigia noturna miliciana aymara boliviana silenciosa (27 anos), cabelo escuro preso em coque baixo sob capuz azul-ardósia, olhos amendoados adaptados ao escuro, mantô de lã de alpaca fino e postura parada e paciente",
    wardrobePromptEn:
      "Wearing a slate-blue militia watcher hood over a quilted liner vest, muted grey poncho folded on the PackBack, soft-soled scout boots, matte binoculars hanging on the chest, watch rotation chalk marks on the sleeve",
    wardrobePromptPt:
      "Vestindo capuz milícia azul-ardósia sobre colete acolchoado de forro, poncho cinza apagado dobrado na PackBack, bota de batedora de sola macia, binóculo fosco no peito e marcas de giz da escala de vigília na manga",
    weaponHandlingEn:
      "Holding a suppressed bolt rifle (WPN_Sniper_MK3) resting on the parapet, disciplined slow breathing between observation sweeps",
    weaponHandlingPt:
      "Segurando rifle ferrolhado com supressor (WPN_Sniper_MK3) apoiado no parapeito, respiração lenta e disciplinada entre varreduras de observação",
    accentColors: {
      primaryHex: "#334155",
      secondaryHex: "#1E293B",
      trimHex: "#94A3B8",
      label: "Azul-Laje Noturna + Sombra + Prata-Lua",
    },
    biomechanics: {
      heightCm: 162,
      massKg: 58,
      sprintSpeedMps: 7.1,
      slideFrictionCoeff: 0.72,
      recoilAbsorptionDeg: 2.8,
      vaultClearanceCm: 118,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },

  // ── Gangues urbanas: facções de rua, velocidade, infiltração e comando de zona ──
  {
    id: "OP_GNG_MALE_SPRAY",
    ueAssetId: "CHR_Khael_Male_Spray",
    codename: "SPRAY",
    fullName: "Dudu 'Spray' Cavalcanti · Grafiteiro de Viaduto GNG-01",
    gender: "MASCULINO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "INFANTARIA",
    defaultWorldId: "Barburhen",
    skinRarity: "COMUM",
    roleTitle: "Marcação Territorial & CQB de Viaduto",
    ethnicity: "Pardo Nordestino / Recife",
    heritageLore:
      "Marca território da facção com grafite visível só sob luz negra — mapa codificado que a polícia fotografa e não entende. Dentro do viaduto, ele conhece cada pilar de cor e cada rota de fuga pintada à mão.",
    avatarVisual: {
      skinToneHex: "#8D5524",
      hairStyle: "Afro curto com desenho navalhado",
      hairColorHex: "#151515",
      eyeColorHex: "#A3E635",
      facialFeature: "Manchas de tinta spray nas costas da mão e sorriso rápido",
      headgearOrVisor: "Respirador verde de tinta no pescoço",
      avatarThemeGradient: ["#22C55E", "#6D28D9"],
    },
    appearancePromptEn:
      "Energetic mixed-heritage northeast-Brazilian male gang graffiti tagger (23 years old), short afro with a shaved line design, spray-paint freckles on the hands, quick grin, green respirator mask hanging on the neck, lime-green accents",
    appearancePromptPt:
      "Grafiteiro de gangue pardo nordestino inquieto (23 anos), afro curto com desenho navalhado, sardas de tinta spray nas mãos, sorriso rápido, respirador verde pendurado no pescoço e acentos verde-lima",
    wardrobePromptEn:
      "Wearing an indigo hooded gang jacket with paint-bleached patches, cargo pants stiff with layered overspray, duct-wrapped sneakers, lime-green spray can holsters on the belt, stencil tag patch sewn on the chest",
    wardrobePromptPt:
      "Vestindo jaqueta de gangue índigo com capuz e remendos clareados por tinta, calça cargo endurecida de tinta em camadas, tênis enrolados de fita, porta-latas verde-lima no cinto e remendo de tag estencil costurado no peito",
    weaponHandlingEn:
      "Holding a sawed-off improvisation shotgun (WPN_Shotgun_Breach) one-handed at low ready inside tight viaduct pillars, disciplined trigger despite street swagger",
    weaponHandlingPt:
      "Segurando escopeta serrada improvisada (WPN_Shotgun_Breach) com uma mão em guarda baixa entre os pilares do viaduto, disciplina de gatilho apesar da pose de rua",
    accentColors: {
      primaryHex: "#22C55E",
      secondaryHex: "#6D28D9",
      trimHex: "#A3E635",
      label: "Verde-Spray + Índigo + Lima-Neon",
    },
    biomechanics: {
      heightCm: 176,
      massKg: 70,
      sprintSpeedMps: 7.5,
      slideFrictionCoeff: 0.64,
      recoilAbsorptionDeg: 3.0,
      vaultClearanceCm: 125,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_MALE_VENTANIA",
    ueAssetId: "CHR_Venex_Male_Ventania",
    codename: "VENTANIA",
    fullName: "Leleco 'Ventania' Souza · Corredor de Galho GNG-02",
    gender: "MASCULINO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "RASTREADORES",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Fuga de Alta Velocidade & Linhas de Borrão",
    ethnicity: "Afro-Brasileiro / Pelourinho, Salvador",
    heritageLore:
      "Corredor de galho da facção do CIGKV: atravessa laje, muro e varal sem derrubar uma prega de roupa. Corre porque é o único do bairro que consegue — e volta com o lanche de todos.",
    avatarVisual: {
      skinToneHex: "#4A2C17",
      hairStyle: "Dreads altos amarrados em nó",
      hairColorHex: "#101010",
      eyeColorHex: "#FDBA74",
      facialFeature: "Sorriso largo de quem respira fácil e cicatriz de varal no ombro",
      headgearOrVisor: "Faixa de suor laranja de corredor",
      avatarThemeGradient: ["#F97316", "#1F2937"],
    },
    appearancePromptEn:
      "Bouncy Afro-Brazilian male gang runner (20 years old), tall dreads tied up in a high knot, wide easy grin, rooftop-run callouses, orange sweatband, lean sprinter build caught mid-stride",
    appearancePromptPt:
      "Corredor de gangue afro-brasileiro solto (20 anos), dreads altos amarrados em nó, sorriso largo e fácil, calos de corrida de laje, faixa de suor laranja e biotipo de velocista em passada",
    wardrobePromptEn:
      "Wearing a charcoal sleeveless gang hoodie tied at the waist, taped fingerless running gloves, lightweight parkour trousers with knee scuffs, worn flat-soled running shoes, orange flag-line wound around the forearm",
    wardrobePromptPt:
      "Vestindo moletom de gangue sem mangas amarrado na cintura, luvas de corrida sem dedos enroladas de fita, calça de parkour leve com roções no joelho, tênis de sola lisa gasto e corda de bandeirinha laranja enrolada no antebraço",
    weaponHandlingEn:
      "Holding a compact SMG (WPN_SMG_MK2) pressed against the chest on a one-point sling so it does not bounce while sprinting, trigger discipline absolute",
    weaponHandlingPt:
      "Segurando submetralhadora compacta (WPN_SMG_MK2) colada no peito em sling de um ponto para não balançar na corrida, disciplina de gatilho absoluta",
    accentColors: {
      primaryHex: "#F97316",
      secondaryHex: "#1F2937",
      trimHex: "#FDBA74",
      label: "Laranja-Ventania + Carvão + Pêssego",
    },
    biomechanics: {
      heightCm: 175,
      massKg: 62,
      sprintSpeedMps: 7.9,
      slideFrictionCoeff: 0.6,
      recoilAbsorptionDeg: 3.5,
      vaultClearanceCm: 128,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_MALE_CORTA",
    ueAssetId: "CHR_Onith_Male_Corta",
    codename: "CORTA",
    fullName: "Goran 'Corta' Vukas · Soldado de Facção GNG-03",
    gender: "MASCULINO",
    faction: "GANGUE_URBANA",
    rank: "ONITH",
    specializationId: "INFANTARIA",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Combate de Facção & Pressão de Rua",
    ethnicity: "Balcânico Bósnio / Imigrante Brasileiro",
    heritageLore:
      "Soldado de primeira linha da facção de Barburhen, veterano de duas guerras que não têm nome nos mapas. Ensina os mais novos a contar cartuchos antes de contar vítimas — a facção dele atira para terminar discussão, não para abri-la.",
    avatarVisual: {
      skinToneHex: "#E0AC69",
      hairStyle: "Buzz-cut com linhas navalhadas",
      hairColorHex: "#6B4423",
      eyeColorHex: "#57534E",
      facialFeature: "Quebrado no nariz duas vezes e olhar que fecha assunto",
      headgearOrVisor: "Bandana balística vermelha com listras",
      avatarThemeGradient: ["#EF4444", "#171717"],
    },
    appearancePromptEn:
      "Stoic Bosnian-Brazilian male gang enforcer (34 years old), buzz cut with shaved ruled lines, twice-broken nose, ash-grey eyes that end conversations, red ballistic bandana, quiet heavy stance",
    appearancePromptPt:
      "Capanga de facção bósnio-brasileiro estoico (34 anos), cabeça raspada com linhas navalhadas, nariz quebrado duas vezes, olhos cinza-fuligem que fecham conversa, bandana balística vermelha e postura pesada silenciosa",
    wardrobePromptEn:
      "Wearing a black gang field jacket with torn insignia, chest rig of mismatched pouches, ribbed knuckle gloves, steel-toe boots with red laces, faction stencil sprayed on the shoulder plate",
    wardrobePromptPt:
      "Vestindo jaqueta de campo de gangue preta com insígnia rasgada, colete de peitoral de porta-cartuchos desparejos, luvas de malha com proteção de nódos, coturno com cadarço vermelho e stencil da facção sprayado na placa do ombro",
    weaponHandlingEn:
      "Holding a full-size faction assault rifle (WPN_AssaultRifle_MK1) with red-lace sling, unshaking C-clamp grip and a carry that says the argument is over",
    weaponHandlingPt:
      "Segurando fuzil de facção completo (WPN_AssaultRifle_MK1) com sling de cadarço vermelho, empunhadura C-clamp imóvel e porte que encerra a discussão",
    accentColors: {
      primaryHex: "#EF4444",
      secondaryHex: "#171717",
      trimHex: "#F87171",
      label: "Vermelho-Facção + Preto-Asfalto + Brasa",
    },
    biomechanics: {
      heightCm: 186,
      massKg: 92,
      sprintSpeedMps: 6.8,
      slideFrictionCoeff: 0.76,
      recoilAbsorptionDeg: 1.8,
      vaultClearanceCm: 106,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_MALE_BAILE",
    ueAssetId: "CHR_Khael_Male_Baile",
    codename: "BAILE",
    fullName: "Ras 'Baile' Thompson · DJ do Comando GNG-04",
    gender: "MASCULINO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "COMUNICACOES_HACKER",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Sonorização de Zona & Comando de Baile",
    ethnicity: "Afro-Caribenho / Jamaicano-Paulistano",
    heritageLore:
      "É o DJ que avisa por som qual rua está livre no CIGKV: o baile começa quando o perímetro está limpo e acaba em scratch se algo dá errado. A pista dele é o radar — quem dança, está seguro; quem sai, avisa os outros.",
    avatarVisual: {
      skinToneHex: "#4A2F1A",
      hairStyle: "Fios de rasta sob gorro escuro",
      hairColorHex: "#1C1917",
      eyeColorHex: "#22D3EE",
      facialFeature: "Fones DJ no pescoço e olhos que leem pista e porta ao mesmo tempo",
      headgearOrVisor: "Fones DJ magenta com brilho de LED",
      avatarThemeGradient: ["#EC4899", "#18181B"],
    },
    appearancePromptEn:
      "Magnetic Afro-Caribbean male gang block-party DJ (28 years old), rasta strands under a dark beanie, trimmed goatee, DJ headphones around the neck, cyan LED glint in the eyes, relaxed crowd-reading stance",
    appearancePromptPt:
      "DJ de baile de gangue afro-caribenho magnético (28 anos), fios de rasta sob gorro escuro, cavanhaque aparado, fones de DJ no pescoço, brilho de LED ciano nos olhos e postura relaxada de quem lê a pista e a porta",
    wardrobePromptEn:
      "Wearing a magenta-accented gang bomber over a black tank top, gold chain over the collarbone, mix-desk calluses, cargo joggers with cable loops, limited-edition sneakers, cable-coiled belt",
    wardrobePromptPt:
      "Vestindo bomber de gangue com acentos magenta sobre regata preta, corrente de ouro sobre a clavícula, calos de mesa de mixagem, jogger cargo com laços de cabo, tênis de edição limitada e cinto enrolado de cabos",
    weaponHandlingEn:
      "Holding a compact pistol (WPN_Pistol_MK1) tucked but ready on the booth edge, hand near but never on it while the set runs",
    weaponHandlingPt:
      "Segurando pistola compacta (WPN_Pistol_MK1) pousada na mesa, à mão mas nunca empunhada enquanto o set roda",
    accentColors: {
      primaryHex: "#EC4899",
      secondaryHex: "#18181B",
      trimHex: "#22D3EE",
      label: "Magenta-Baile + Carvão + Ciano-LED",
    },
    biomechanics: {
      heightCm: 180,
      massKg: 76,
      sprintSpeedMps: 7.0,
      slideFrictionCoeff: 0.68,
      recoilAbsorptionDeg: 2.7,
      vaultClearanceCm: 114,
      skeleton: "SK_Manny",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_FEMALE_ROTA",
    ueAssetId: "CHR_Venex_Female_Rota",
    codename: "ROTA",
    fullName: "Mirta 'Rota' Benítez · Entregadora da Facção GNG-05",
    gender: "FEMININO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "MOTORISTA_PESADOS",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Logística de Moto & Rota de Fuga",
    ethnicity: "Paraguaia / Ciudad del Este",
    heritageLore:
      "Leva e traz a logística da facção pelas ciclovias do CIGKV: nenhum checkpoint olha duas vezes para uma entregadora de app. Guarda o mapa das rotas na cabeça e a chave de contato no punho.",
    avatarVisual: {
      skinToneHex: "#D29B6E",
      hairStyle: "Rabo de cavalo alto de motoqueira",
      hairColorHex: "#3B2314",
      eyeColorHex: "#84CC16",
      facialFeature: "Cicatriz fina de capacete na testa e olhar de trajeto calculado",
      headgearOrVisor: "Capacete de moto âmbar de viseira aberta",
      avatarThemeGradient: ["#F59E0B", "#3F3F46"],
    },
    appearancePromptEn:
      "Alert Paraguayan female gang moto-courier (26 years old), high ponytail escaping an amber open-face moto helmet, thin visor scar on the forehead, route-calculating eyes, delivery-bag strap crossing the chest",
    appearancePromptPt:
      "Entregadora de gangue paraguaia atenta (26 anos), rabo de cavalo alto escapando do capacete âmbar de moto aberto, cicatriz fina de viseira na testa, olhos que calculam rota e alça de bag de entrega cruzada no peito",
    wardrobePromptEn:
      "Wearing a scuffed amber moto jacket with gang patch taped over, thermal-lined gloves, knee-slide plates, waterproof delivery bag repainted with the faction mark, ankle holster",
    wardrobePromptPt:
      "Vestindo jaqueta moto âmbar riscada com remendo de facção por cima, luvas térmicas, placas de deslizamento no joelho, bag de entrega impermeável repintada com a marca da facção e coldre de canela",
    weaponHandlingEn:
      "Holding a compact carbine (WPN_AssaultRifle_MK1) resting across the handlebars, quick-draw discipline of a courier who plans two exits per street",
    weaponHandlingPt:
      "Segurando carabina compacta (WPN_AssaultRifle_MK1) apoiada no guidão, disciplina de saque rápido de entregadora que planeja duas saídas por rua",
    accentColors: {
      primaryHex: "#F59E0B",
      secondaryHex: "#3F3F46",
      trimHex: "#FBBF24",
      label: "Amarelo-Rota + Zinco + Sinalização",
    },
    biomechanics: {
      heightCm: 167,
      massKg: 60,
      sprintSpeedMps: 7.3,
      slideFrictionCoeff: 0.66,
      recoilAbsorptionDeg: 2.9,
      vaultClearanceCm: 120,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_FEMALE_COTOVELA",
    ueAssetId: "CHR_Zheers_Female_Cotovela",
    codename: "COTOVELA",
    fullName: "Iara 'Cotovela' Teixeira · Lutadora de Galpão GNG-06",
    gender: "FEMININO",
    faction: "GANGUE_URBANA",
    rank: "ONITH",
    specializationId: "INFANTARIA",
    defaultWorldId: "Barburhen",
    skinRarity: "RARO",
    roleTitle: "Luta Corporal & Demolição de Galpão",
    ethnicity: "Nordestina Litorânea / Fortaleza",
    heritageLore:
      "Campeã do galpão: luta por dinheiro e por respeito no anel improvisado de Barburhen. A facção a levou quando descobriu que ela abre portas blindadas com cotovelada e fecha discussões com uma só.",
    avatarVisual: {
      skinToneHex: "#9C6644",
      hairStyle: "Moicano tingido com laterais desbotadas",
      hairColorHex: "#EC4899",
      eyeColorHex: "#F43F5E",
      facialFeature: "Sobrancelha partida e ombro tatuado com o escudo do galpão",
      headgearOrVisor: "Protetor auricular rosa de ringue",
      avatarThemeGradient: ["#F43F5E", "#292524"],
    },
    appearancePromptEn:
      "Powerful coastal northeast-Brazilian female gang pit-fighter (30 years old), dyed pink mohawk with faded sides, split eyebrow, shoulder tattoo of the warehouse crest, taped knuckles, champion's calm before the bell",
    appearancePromptPt:
      "Lutadora de galpão nordestina litorânea forte (30 anos), moicano rosa com laterais desbotadas, sobrancelha partida, tatuagem do escudo do galpão no ombro, nós dos dedos enrolados de fita e calma de campeã antes do sino",
    wardrobePromptEn:
      "Wearing a rose-accented ring jacket with the sleeves cut off, taped forearms, fight shorts over compression leggings, wrestling ear protector, gold-champion belt buckle repurposed as the PackBack latch",
    wardrobePromptPt:
      "Vestindo jaqueta de ringue com acentos rosa e mangas cortadas, antebraços enfaixados, short de luta sobre legging de compressão, protetor auricular de luta e fivela de cinturão de campeã adaptada como fecho da PackBack",
    weaponHandlingEn:
      "Holding a compact SMG (WPN_SMG_MK2) like an extension of the taped fist, short controlled bursts of the same economy as her punches",
    weaponHandlingPt:
      "Segurando submetralhadora compacta (WPN_SMG_MK2) como extensão do punho enfaixado, rajadas curtas com a mesma economia dos seus golpes",
    accentColors: {
      primaryHex: "#F43F5E",
      secondaryHex: "#292524",
      trimHex: "#FBBF24",
      label: "Rosa-Lona + Carvão + Ouro-Cinto",
    },
    biomechanics: {
      heightCm: 172,
      massKg: 72,
      sprintSpeedMps: 7.1,
      slideFrictionCoeff: 0.7,
      recoilAbsorptionDeg: 2.1,
      vaultClearanceCm: 118,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_FEMALE_SOMBRA",
    ueAssetId: "CHR_Huran_Female_Sombra",
    codename: "SOMBRA",
    fullName: "Bruna 'Sombra' Bellini · Batedora de Território GNG-07",
    gender: "FEMININO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "RASTREADORES",
    defaultWorldId: "CIGKV",
    skinRarity: "COMUM",
    roleTitle: "Infiltração Silenciosa & Recon de Território",
    ethnicity: "Italo-Gaúcha / Serra Rio-Grandense",
    heritageLore:
      "Bate o território antes de qualquer movimento da facção: entra pelo telhado, conta camêras, cães e turnos, e sai sem som. Nunca foi vista duas vezes no mesmo ponto — os rivalês acham que Sombra são duas pessoas.",
    avatarVisual: {
      skinToneHex: "#F0C8A0",
      hairStyle: "Cabelo preto liso em camadas",
      hairColorHex: "#0B0B0C",
      eyeColorHex: "#94A3B8",
      facialFeature: "Rosto neutro impossível de lembrar e reflexo prateado nos olhos sob luz de lanterna",
      headgearOrVisor: "Capuz fino cinza fosco de batedora",
      avatarThemeGradient: ["#64748B", "#0F172A"],
    },
    appearancePromptEn:
      "Unremarkable-by-design Italian-Gaucho female gang scout (24 years old), straight black hair under a thin slate hood, forgettable neutral face with a silver glint under flashlight, silent flat-footed stance",
    appearancePromptPt:
      "Batedora de gangue ítalo-gaúcha de rosto proposital esquecível (24 anos), cabelo preto liso sob capuz fino cinza, fisionomia neutra com reflexo prateado sob lanterna e passos silenciosos e planos",
    wardrobePromptEn:
      "Wearing a slim slate-grey scout shell over a dark base layer, soft-shell gloves with grip pads, quiet-flex tactical trousers, reflective thread stripe on the PackBack for roof recognition, hood edges taped matte",
    wardrobePromptPt:
      "Vestindo casca fina de batedora cinza-ardósia sobre camada escura, luvas soft-shell com almofadas de grip, calça tática de movimento silencioso, fio refletivo na PackBack para reconhecimento de telhado e aba do capuz coberta de fosco",
    weaponHandlingEn:
      "Holding a suppressed compact pistol (WPN_Pistol_MK1) angled down, weight shifted to keep floorboards silent",
    weaponHandlingPt:
      "Segurando pistola compacta com supressor (WPN_Pistol_MK1) apontada para baixo, peso deslocado para não ranger o assoalho",
    accentColors: {
      primaryHex: "#64748B",
      secondaryHex: "#0F172A",
      trimHex: "#CBD5E1",
      label: "Cinza-Sombra + Meia-noite + Prata",
    },
    biomechanics: {
      heightCm: 168,
      massKg: 59,
      sprintSpeedMps: 7.4,
      slideFrictionCoeff: 0.74,
      recoilAbsorptionDeg: 3.2,
      vaultClearanceCm: 122,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
  {
    id: "OP_GNG_FEMALE_PIXEL",
    ueAssetId: "CHR_Skeetw_Female_Pixel",
    codename: "PIXEL",
    fullName: "Linh 'Pixel' Trần · Hacker de Lan House GNG-08",
    gender: "FEMININO",
    faction: "GANGUE_URBANA",
    rank: "ZHEERS",
    specializationId: "COMUNICACOES_HACKER",
    defaultWorldId: "Ckesalth",
    skinRarity: "RARO",
    roleTitle: "Clonagem de Chip & Guerra Eletrônica de Rua",
    ethnicity: "Vietnamita-Brasileira / Zona Leste de São Paulo",
    heritageLore:
      "Roda a lan house da facção num entreposto de Ckesalth: clona chip, quebra bloqueio de drone e vende sinal para quem precisa. Dizem que ela derruba o saldo do rival na hora do saque — e que o led ciano nunca apaga antes dela.",
    avatarVisual: {
      skinToneHex: "#F5CBA7",
      hairStyle: "Bob assimétrico com mechas ciano",
      hairColorHex: "#22D3EE",
      eyeColorHex: "#A78BFA",
      facialFeature: "Mecas ciano no bob assimétrico e olhos de quem lê código no ar",
      headgearOrVisor: "Óculos AR ciano com código refletido",
      avatarThemeGradient: ["#06B6D4", "#27272A"],
    },
    appearancePromptEn:
      "Focused Vietnamese-Brazilian female gang street-hacker (21 years old), asymmetric bob with cyan-dyed streaks, violet AR visor glasses with scrolling reflections, keyboard-typed callouses, coiled USB cable on the wrist",
    appearancePromptPt:
      "Hacker de rua vietnamita-brasileira de gangue focada (21 anos), bob assimétrico com mecas tingidas de ciano, óculos AR violeta com reflexos de código rolando, calos de teclado e cabo USB enrolado no pulso",
    wardrobePromptEn:
      "Wearing a cyan-accented oversized tech jacket with patched LAN-house logos, cargo joggers with drive pockets, fingerless typing gloves, clipped RFID cloner on the chest strap, cyan cable braided through the PackBack",
    wardrobePromptPt:
      "Vestindo jaqueta tech oversized com acentos ciano e logos de lan house remendados, jogger cargo com porta-drives, luvas de digitação sem dedos, clonador RFID preso no peitoral e cabo ciano trançado na PackBack",
    weaponHandlingEn:
      "Holding a compact SMG (WPN_SMG_MK2) between the knees while both hands run the cloner, disciplined muzzle direction learned the hard way",
    weaponHandlingPt:
      "Segurando submetralhadora compacta (WPN_SMG_MK2) entre os joelhos enquanto as duas mãos rodam o clonador, direção de cano disciplinada aprendida do jeito difícil",
    accentColors: {
      primaryHex: "#06B6D4",
      secondaryHex: "#27272A",
      trimHex: "#A78BFA",
      label: "Ciano-Pixel + Carvão + Violeta-Circuito",
    },
    biomechanics: {
      heightCm: 163,
      massKg: 55,
      sprintSpeedMps: 7.2,
      slideFrictionCoeff: 0.64,
      recoilAbsorptionDeg: 3.3,
      vaultClearanceCm: 116,
      skeleton: "SK_Gwen",
      lyraHeroBridge: "KhaaosLyraHeroComponent",
      targetPolycount: 80000,
      lodCount: 4,
    },
  },
];

/** Roster jogável completo: militares canônicos + lote de milícias/gangues. */
export const ALL_KHAAOS_OPERATIVE_ARCHETYPES: OperativeArchetype[] = [
  ...KHAAOS_OPERATIVE_ARCHETYPES,
  ...KHAAOS_MILITIA_ARCHETYPES,
];

export const WORLD_BACKDROP_PROMPTS: Record<
  WorldId,
  {
    name: string;
    backdropEn: string;
    backdropPt: string;
    lightingEn: string;
  }
> = {
  CIGKV: {
    name: "CIGKV · Khaaos Ville (Campo Urbano Tropical)",
    backdropEn:
      "Tropical urban battlefield background with weathered concrete walls, shipping containers, palm trees, drifting smoke and sun-lit dust particles",
    backdropPt:
      "Campo de batalha urbano tropical com muros de concreto desgastados, contêineres marítimos, palmeiras, fumaça densa e poeira iluminada pelo sol",
    lightingEn:
      "Golden-hour tactical sunlight cutting through urban smoke with subtle neon-orange rim reflection",
  },
  Barburhen: {
    name: "Mundo 1 · Barburhen (Ruínas Industriais & Cinzas)",
    backdropEn:
      "Industrial volcanic battlefield background with scorched concrete barriers, rusted shipping containers, tropical palm silhouettes, drifting ash, smoke and glowing embers",
    backdropPt:
      "Zona de combate industrial vulcânica com barreiras de concreto chamuscadas, contêineres oxidados, silhuetas de palmeiras, cinzas em suspensão e fumaça",
    lightingEn:
      "High-contrast cinematic daylight mixed with warm volcanic ember bounce light",
  },
  Priadus: {
    name: "Mundo 2 · Priadus (Selva Densa & Bunkers de Concreto)",
    backdropEn:
      "Overgrown tropical jungle combat zone with moss-covered concrete walls, tactical cargo containers, towering palm trees, humid mist, smoke and kicked-up dirt",
    backdropPt:
      "Zona de combate em selva tropical densa com muros de concreto cobertos de musgo, contêineres táticos, palmeiras altas, névoa úmida e fumaça",
    lightingEn:
      "Natural dappled canopy sunlight with atmospheric volumetric shafts through smoke",
  },
  Ckesalth: {
    name: "Mundo 3 · Ckesalth (Porto Costeiro & Contêineres Sob Tempestade)",
    backdropEn:
      "Coastal urban port battlefield with wet concrete floodwalls, stacked shipping containers, wind-swept palm trees, tactical smoke and fine sea spray",
    backdropPt:
      "Porto urbano costeiro sob tempestade com muralhas de concreto úmidas, contêineres empilhados, palmeiras ao vento, fumaça tática e maresia",
    lightingEn:
      "Dramatic overcast storm light with crisp specular reflections on wet concrete and tactical gear",
  },
  Arukheea: {
    name: "Mundo 4 · Arukheea (Cidadela Final do Khaaos)",
    backdropEn:
      "High-stakes shattered urban citadel battlefield with monolithic concrete walls, armored supply containers, palm trees, purple-tinted atmospheric smoke, dust and golden sparks",
    backdropPt:
      "Cidadela urbana fragmentada de alto risco com paredes monolíticas de concreto, contêineres blindados, palmeiras, fumaça atmosférica e fagulhas douradas",
    lightingEn:
      "Cinematic twilight directional key light with subtle volcanic orange and deep violet atmospheric contrast",
  },
};

export const FRAMING_MODES: Record<
  CameraFramingMode,
  {
    label: string;
    lensSpecEn: string;
    compositionEn: string;
    compositionPt: string;
  }
> = {
  PORTRAIT_35MM: {
    label: "Retrato Cinematográfico 35mm (Hero Portrait)",
    lensSpecEn: "35mm prime cinema lens, f/2.0, shallow depth of field, medium close-up chest-up framing",
    compositionEn: "Live-action cinematic portrait",
    compositionPt: "Retrato cinematográfico live-action (enquadramento médio do peito para cima, foco cravado nos olhos e textura de pele)",
  },
  FULL_BODY_TACTICAL: {
    label: "Corpo Inteiro em Ação (Full-Body Tactical Stance)",
    lensSpecEn: "35mm anamorphic lens, f/2.8, grounded low-angle full-body combat stance showing boots and terrain contact",
    compositionEn: "Live-action full-body cinematic shot",
    compositionPt: "Plano geral de corpo inteiro em postura tática (exibindo coturnos, joelheiras, colete, PackBack e contato físico com o solo)",
  },
  ORTHO_3D_APOSE: {
    label: "Sheet 3D / Skin Modeling (A-Pose Front/Back Reference)",
    lensSpecEn: "50mm distortion-free lens, f/5.6, studio-grade even rim lighting for 3D photogrammetry and character skin modeling",
    compositionEn: "Photorealistic live-action full-body character modeling reference in symmetrical tactical A-pose",
    compositionPt: "Referência de modelagem 3D de corpo inteiro em A-Pose tática simétrica (ideal para Image-to-3D, Blender e UE5 MetaHuman)",
  },
};

export const SYNCED_HIGH_TECH_TOOLS: SyncedToolPipeline[] = [
  {
    id: "TOOL_UE5_LYRA_METAHUMAN",
    name: "Unreal Engine 5.8 · Lyra + MetaHuman + Control Rig IK",
    category: "3D_ENGINE",
    repoSyncPath: "Unreal/KhaaosRun/Content/Characters/Zheers/ & epic_integration/lyra_mapping.json",
    status: "SINCRONIZADO",
    description:
      "Pipeline oficial sincronizado aos rigs base por sexo (SK_Manny/SK_Gwen) com camadas de espécie (mesh variant + ABP_Zheers_Base), KhaaosLyraHeroComponent, KhaaosLyraWeaponBridge e validação de movimento server-authoritative.",
    recommendedParams: {
      skeleton: "SK_Manny / SK_Gwen (rig base por sexo)",
      heroComponent: "KhaaosLyraHeroComponent",
      weaponBridge: "KhaaosLyraWeaponBridge",
      targetPolycount: 80000,
      lodLevels: 4,
      textureResolution: "2048x2048 (D, N, ORM, E)",
      ikFootPlacement: true,
      chaosClothSimulation: true,
    },
    cliOrScriptCommand:
      "python3 scripts/ue5_editor/khaaos_asset_importer.py Content/Assets/asset_manifest.json /Game/Characters/Zheers/",
  },
  {
    id: "TOOL_BLENDER_HEADLESS_FBX",
    name: "Blender Headless 4.x · Gerador FBX/DAE & PBR UV",
    category: "3D_GENERATION",
    repoSyncPath: "scripts/mvp/step4_3d_assets/blender_generate_assets.py",
    status: "SINCRONIZADO",
    description:
      "Script automatizado de malha humanóide e armas em escala UE5 (1 unit = 1 cm, -Z Forward, Y Up), gerando UVs, materiais Principled BSDF e colisão cápsula.",
    recommendedParams: {
      scaleFactor: "1.0 (1 unit = 1 cm)",
      axisForward: "-Z",
      axisUp: "Y",
      smoothShadingAngleDeg: 45,
      exportFormat: "FBX + DAE",
      pbrChannels: "BaseColor, Metallic, Roughness, Emissive",
    },
    cliOrScriptCommand:
      "blender --background --python scripts/mvp/step4_3d_assets/blender_generate_assets.py",
  },
  {
    id: "TOOL_IMAGE_TO_3D_PBR",
    name: "High-Tech Image-to-3D Skin Modeler (Meshy-4 / Rodin / Tripo3D / CC4)",
    category: "3D_GENERATION",
    repoSyncPath: "Content/Assets/asset_manifest.json",
    status: "PRONTO_EXPORTACAO",
    description:
      "Converte o retrato/corpo inteiro gerados com o Prompt de Imagem Khaaos Run em malha 3D PBR quad-dominant pronta para retopologia e rig no esqueleto base UE5 (SK_Manny/SK_Gwen por sexo).",
    recommendedParams: {
      topology: "Quad-Dominant Retopology",
      targetPolycount: 80000,
      poseMode: "A-Pose Symmetrical",
      pbrMaps: "4K Albedo, Normal (OpenGL/DirectX), ORM (Occlusion/Roughness/Metallic), Emissive",
      delighting: true,
    },
    cliOrScriptCommand:
      "bash scripts/mvp/step4_3d_assets/validate_assets.sh",
  },
  {
    id: "TOOL_IMAGE_TO_VIDEO_KINETIC",
    name: "Live-Action Image-to-Video (Runway Gen-3 / Veo 2 / Kling 1.6 Pro)",
    category: "LIVE_ACTION_VIDEO",
    repoSyncPath: "shared/character-studio.ts",
    status: "SINCRONIZADO",
    description:
      "Pipeline Image-to-Video usando a imagem de referência do operador para gerar clipe contínuo de 8–10s (24fps, lente 35mm) com sprint, slide, rajada curta, recarga, vault e sinal tático.",
    recommendedParams: {
      mode: "Image-to-Video (Reference Character Lock)",
      durationSeconds: 10,
      fps: 24,
      lens: "35mm Cinema Prime",
      shotType: "Single Continuous Tracking Shot",
      motionPhysics: "Physically accurate weight, momentum, foot placement, natural weapon handling and trigger discipline",
    },
    cliOrScriptCommand:
      "curl -s /api/characters/studio | jq '.defaultBundle.videoPromptEn'",
  },
];

export const QUICK_PRODUCTION_TIPS = [
  "Use Image-to-Video com a imagem de referência do personagem (Masculino ou Feminino) para manter 100% de consistência facial, de colete e de iluminação entre os takes.",
  "Peça sempre 'single continuous tracking shot' e 'realistic tactical movement' para evitar animações artificiais ou flutuantes de videogame.",
  "Duração ideal: 8–10 segundos por clipe; depois emende cenas de corrida (0–2s), slide/cobertura (2–4s), disparo controlado (4–6s), recarga/vault (6–8s) e varredura tática (8–10s).",
  "Adicione a cláusula biomecânica de alta precisão: 'physically accurate weight, momentum, foot placement, natural weapon handling and trigger discipline'.",
  "Para modelagem 3D/Skin compatível com os rigs base SK_Manny/SK_Gwen e Lyra, gere uma variante em enquadramento 'Sheet 3D / A-Pose' antes de exportar os mapas PBR (T_D, T_N, T_ORM, T_E).",
];

export function buildOperativePromptBundle(options?: {
  archetypeId?: string;
  gender?: OperativeGender;
  worldId?: WorldId;
  framing?: CameraFramingMode;
  skinRarity?: SkinRarityTier;
  includeBiomechanicalClause?: boolean;
}): CompiledCharacterPromptBundle {
  const genderFilter = options?.gender;
  let operative =
    ALL_KHAAOS_OPERATIVE_ARCHETYPES.find((a) => a.id === options?.archetypeId) ??
    (genderFilter
      ? ALL_KHAAOS_OPERATIVE_ARCHETYPES.find((a) => a.gender === genderFilter)
      : undefined) ??
    ALL_KHAAOS_OPERATIVE_ARCHETYPES[0];

  if (genderFilter && operative.gender !== genderFilter) {
    operative =
      ALL_KHAAOS_OPERATIVE_ARCHETYPES.find((a) => a.gender === genderFilter) ??
      operative;
  }

  const worldId: WorldId = options?.worldId ?? operative.defaultWorldId ?? "CIGKV";
  const framing: CameraFramingMode = options?.framing ?? "PORTRAIT_35MM";
  const skinRarity: SkinRarityTier = options?.skinRarity ?? operative.skinRarity;
  const includeBio = options?.includeBiomechanicalClause ?? true;

  const worldBackdrop = WORLD_BACKDROP_PROMPTS[worldId] ?? WORLD_BACKDROP_PROMPTS.CIGKV;
  const framingSpec = FRAMING_MODES[framing] ?? FRAMING_MODES.PORTRAIT_35MM;

  const rarityFinishEn: Record<SkinRarityTier, string> = {
    COMUM: "matte field-tested ballistic finish",
    RARO: "reinforced carbon-weave finish with subtle cobalt-orange tactical piping",
    EPICO: "high-tech carbon and kevlar weave with subtle neon-orange (#F97316) and deep Khaaos violet (#7C3AED) accents",
    LENDARIO: "elite custom-forged tactical finish with volcanic neon-orange (#F97316), Khaaos violet (#7C3AED) and brushed Battle Million metallic gold trim",
    MITICO: "prestige Overlord-grade tactical finish with micro-etched obsidian armor plates, volcanic neon-orange (#F97316), deep violet and subtle metallic gold Battle Million insignia",
  };

  const biomechanicalClauseEn = CANONICAL_BASE_PROMPTS.biomechanicalClauseEn;

  const imagePromptEn = [
    `${framingSpec.compositionEn} of an original battle-royale ${operative.gender === "FEMININO" ? "female" : "male"} operator inspired by Free Fire and Fortnite tactical silhouette readability, infused with original Khaaos Run identity, not an existing character.`,
    `${operative.appearancePromptEn}.`,
    `${operative.wardrobePromptEn} (${rarityFinishEn[skinRarity]}).`,
    `${operative.weaponHandlingEn}.`,
    `${worldBackdrop.backdropEn}.`,
    `${worldBackdrop.lightingEn}, ${framingSpec.lensSpecEn}, photorealistic, 4K, high detail, natural human proportions${includeBio ? `, ${biomechanicalClauseEn}` : ""}, no game HUD, no cartoon style.`,
  ].join(" ");

  const imagePromptPt = [
    `${framingSpec.compositionPt} de ${operative.gender === "FEMININO" ? "uma operadora original" : "um operador original"} de battle-royale inspirado na leitura visual tática de Free Fire + Fortnite, porém 100% original com a identidade Khaaos Run.`,
    `${operative.appearancePromptPt}.`,
    `${operative.wardrobePromptPt}.`,
    `${operative.weaponHandlingPt}.`,
    `${worldBackdrop.backdropPt}.`,
    `Iluminação cinematográfica realista, lente 35mm, profundidade de campo rasa, fotorrealista, 4K, altíssimo nível de detalhe, proporções humanas naturais, peso e postura fisicamente plausíveis, sem HUD de jogo, sem estilo cartoon.`,
  ].join(" ");

  const genderPronounEn = operative.gender === "FEMININO" ? "She" : "He";
  const genderPossessiveEn = operative.gender === "FEMININO" ? "her" : "his";

  const videoPromptEn = [
    `Photorealistic live-action battle-royale scene, original ${operative.gender === "FEMININO" ? "female" : "male"} Khaaos Run operator (${operative.codename}) inspired by Free Fire and Fortnite tactical aesthetics, single continuous tracking shot, 10 seconds.`,
    `The character (${operative.appearancePromptEn}, wearing tactical vest, cargo pants, fingerless gloves, lightweight PackBack backpack, knee pads, combat boots, and subtle volcanic neon-orange and Khaaos violet accents) sprints through a ${worldBackdrop.backdropEn.toLowerCase()} with realistic weight, momentum and foot placement.`,
    `At 2s, ${genderPronounEn.toLowerCase()} performs a controlled tactical slide behind a concrete barrier, dust rising naturally with real surface friction.`,
    `At 4s, ${genderPronounEn.toLowerCase()} shoulders ${genderPossessiveEn} rifle, peeks from cover and fires a short controlled burst with realistic recoil, muzzle flash, ejected casing and slight body absorption.`,
    `At 6s, ${genderPronounEn.toLowerCase()} reloads efficiently, strafes to a new position and vaults over a low wall, landing with believable impact and knee flexion.`,
    `At 8s, ${genderPronounEn.toLowerCase()} crouches, scans the area and makes a tactical hand signal through smoke.`,
    `Handheld camera with slight shake, 35mm lens, 24fps, cinematic motion blur, natural lighting, realistic physics, tactical combat choreography${includeBio ? `, ${biomechanicalClauseEn}` : ""}, no exaggerated game animation. No HUD, no health bars, no floating damage numbers, no cartoon, no slow motion, no gore.`,
  ].join(" ");

  const videoPromptPt = [
    `Cena live-action fotorrealista de battle-royale, ${operative.gender === "FEMININO" ? "operadora original" : "operador original"} Khaaos Run (${operative.codename}) inspirado em Free Fire + Fortnite, plano-sequência único contínuo (single continuous tracking shot), 10 segundos.`,
    `0s–2s: Corre pela zona de combate (${worldBackdrop.name}) com peso real, momento linear e apoio de pé biomecanicamente correto.`,
    `2s–4s: Executa um slide tático controlado atrás de uma barreira de concreto, poeira subindo naturalmente pelo atrito real.`,
    `4s–6s: Encaixa o fuzil no ombro, faz peek da cobertura e dispara uma rajada curta controlada com recuo realista, flash de cano, cápsula ejetada e leve absorção corporal.`,
    `6s–8s: Recarrega com eficiência tática, faz strafe para nova posição e salta (vault) sobre um muro baixo, aterrissando com impacto crível.`,
    `8s–10s: Agacha, varre o perímetro mantendo disciplina de gatilho e faz um sinal manual tático através da fumaça.`,
    `Câmera na mão com leve vibração orgânica, lente 35mm, 24fps, motion blur cinematográfico, iluminação natural, física realista, sem HUD, sem barras de vida, sem números de dano flutuantes, sem cartoon, sem câmera lenta, sem gore.`,
  ].join(" ");

  const ue5ManifestEntry = {
    id: operative.ueAssetId,
    name: operative.fullName,
    gender: operative.gender,
    skeleton: operative.biomechanics.skeleton,
    lod_count: operative.biomechanics.lodCount,
    target_polycount: operative.biomechanics.targetPolycount,
    dimensions_cm: {
      width: 60,
      depth: 40,
      height: operative.biomechanics.heightCm,
    },
    components: [
      "SkeletalMesh*Mesh",
      "Material_Override",
      "AnimationBlueprint",
      "KhaaosLyraHeroComponent",
      "KhaaosLyraWeaponBridge",
    ],
    textures: [
      `T_${operative.ueAssetId}_D`,
      `T_${operative.ueAssetId}_N`,
      `T_${operative.ueAssetId}_ORM`,
      `T_${operative.ueAssetId}_E`,
    ],
    animations: [
      "Anim_Idle",
      "Anim_Walk",
      "Anim_Run",
      "Anim_Sprint",
      "Anim_Crouch",
      "Anim_Slide",
      "Anim_Jump",
      "Anim_Dash",
      "Anim_Vault_LowWall",
      "Anim_Peek_Cover",
      "Anim_Shoot_ControlledBurst",
      "Anim_Reload_Tactical",
      "Anim_HandSignal_Smoke",
      "Anim_WarI_Cinto",
      "Anim_WarI_Saltar",
      "Anim_WarI_Mascara",
      "Anim_Downed",
      "Anim_Dead",
    ],
    variants: [
      `${operative.codename.replace(/\s+/g, "_")}_Assault`,
      `${operative.codename.replace(/\s+/g, "_")}_Tactical`,
      `${operative.codename.replace(/\s+/g, "_")}_BattleMillion_Gold`,
    ],
    lyra_bridges: [
      "KhaaosLyraHeroComponent",
      "KhaaosLyraAbilityBridge",
      "KhaaosLyraWeaponBridge",
      "KhaaosLyraInputBridge",
    ],
  };

  return {
    operative,
    gender: operative.gender,
    worldId,
    framing,
    skinRarity,
    imagePromptEn,
    imagePromptPt,
    videoPromptEn,
    videoPromptPt,
    negativePrompt: CANONICAL_BASE_PROMPTS.negativeBaseEn,
    biomechanicalClauseEn,
    timelineKeyframes: KHAAOS_VIDEO_TIMELINE_10S,
    quickTips: QUICK_PRODUCTION_TIPS,
    ue5ManifestEntry,
  };
}
