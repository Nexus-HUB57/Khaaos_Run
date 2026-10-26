#!/usr/bin/env node
/**
 * Khaaos Run — 16 Canonical Operative Avatar Reference Generator
 * Devs Ph.D | UE5.8 | Copyright Nexus-HUB57. All Rights Reserved.
 *
 * Generates standalone 512x512 tactical SVG avatar references and JSON catalog
 * for 8 Masculine and 8 Feminine Operatives (diverse ethnicities & races).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const CONTENT_AVATARS_DIR = path.join(ROOT_DIR, "Content", "Avatars");
const PUBLIC_AVATARS_DIR = path.join(ROOT_DIR, "client", "public", "avatars");

fs.mkdirSync(path.join(CONTENT_AVATARS_DIR, "male"), { recursive: true });
fs.mkdirSync(path.join(CONTENT_AVATARS_DIR, "female"), { recursive: true });
fs.mkdirSync(path.join(PUBLIC_AVATARS_DIR, "male"), { recursive: true });
fs.mkdirSync(path.join(PUBLIC_AVATARS_DIR, "female"), { recursive: true });

// Operatives data definition
const OPERATIVES = [
  // ── MASCULINE (8) ──
  {
    id: "OP_MALE_VANGUARD",
    filename: "op_male_vanguard",
    gender: "MASCULINO",
    folder: "male",
    codename: "KHAEL VANCE",
    fullName: "Khael Vance · Operador Vanguarda M-01",
    ethnicity: "Afro-Latino / Pardo Brasileiro",
    rank: "ONITH",
    spec: "FUZILEIROS",
    world: "CIGKV",
    skin: "#8d5524",
    hair: "#171717",
    eyes: "#f59e0b",
    primary: "#F97316",
    secondary: "#7C3AED",
    trim: "#EAB308",
    lore: "Nascido nas favelas verticais em torno do CIGKV. Especialista em CQB e incursão.",
    featuresSvg: `
      <!-- Buzz cut fade -->
      <path d="M143 163 C143 82 369 82 369 163 C369 179 348 189 348 189 C328 133 184 133 164 189 Z" fill="#171717" />
      <!-- Tactical eyebrow scar -->
      <line x1="307" y1="215" x2="333" y2="235" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.9" />
      <!-- Tactical comms headset -->
      <circle cx="133" cy="276" r="15" fill="#F97316" />
      <path d="M133 292 Q143 333 174 348" stroke="#F97316" stroke-width="7" fill="none" />
    `
  },
  {
    id: "OP_MALE_BREACHER",
    filename: "op_male_breacher",
    gender: "MASCULINO",
    folder: "male",
    codename: "DRAXEN KORR",
    fullName: "Draxen Korr · Operador Couraça M-02",
    ethnicity: "Eslavo Nórdico / Leste Europeu",
    rank: "HURAN",
    spec: "ENGENHARIA_TATICA",
    world: "Barburhen",
    skin: "#ffdbac",
    hair: "#e2e8f0",
    eyes: "#38bdf8",
    primary: "#EA580C",
    secondary: "#6D28D9",
    trim: "#D97706",
    lore: "Sobrevivente dos complexos mineiros de Barburhen. Treinado em forja vulcânica.",
    featuresSvg: `
      <!-- Blonde buzz cut -->
      <path d="M148 169 C148 87 364 87 364 169 C343 123 169 123 148 169 Z" fill="#e2e8f0" />
      <!-- Heavy jaw thermal scar -->
      <path d="M215 338 L241 358 L230 379" stroke="#ff8888" stroke-width="6" fill="none" stroke-linecap="round" />
      <!-- Neck ballistic armor collar -->
      <path d="M123 379 Q256 420 389 379 L410 451 Q256 486 102 451 Z" fill="#1e293b" stroke="#6D28D9" stroke-width="7" />
    `
  },
  {
    id: "OP_MALE_RECON_ASIAN",
    filename: "op_male_recon_asian",
    gender: "MASCULINO",
    folder: "male",
    codename: "REN TANAKA",
    fullName: "Ren Tanaka (Kage) · Sombra Silenciosa M-03",
    ethnicity: "Leste-Asiático (Japonês)",
    rank: "SKEETW",
    spec: "RASTREADORES",
    world: "Priadus",
    skin: "#f1c27d",
    hair: "#09090b",
    eyes: "#06b6d4",
    primary: "#06B6D4",
    secondary: "#6366F1",
    trim: "#38BDF8",
    lore: "Esquadrões de reconhecimento avançado de Tóquio Subterrânea. Furtividade em Priadus.",
    featuresSvg: `
      <!-- Textured dark undercut -->
      <path d="M138 174 C138 77 374 77 374 174 C333 102 179 102 138 174 Z" fill="#09090b" />
      <path d="M215 113 L266 179 L241 184 Z" fill="#09090b" />
      <!-- Ninja cybernetic half-mask -->
      <path d="M174 297 Q256 328 338 297 L348 389 Q256 430 164 389 Z" fill="#0f172a" stroke="#06B6D4" stroke-width="6" />
      <circle cx="256" cy="358" r="15" fill="#06B6D4" />
      <!-- Monolid eyes -->
      <path d="M179 225 Q215 215 236 230" stroke="#06b6d4" stroke-width="7" fill="none" stroke-linecap="round" />
      <path d="M276 230 Q297 215 333 225" stroke="#06b6d4" stroke-width="7" fill="none" stroke-linecap="round" />
    `
  },
  {
    id: "OP_MALE_MEDIC_AFRICAN",
    filename: "op_male_medic_african",
    gender: "MASCULINO",
    folder: "male",
    codename: "TARIQ BAKARI",
    fullName: "Tariq Bakari · Médico Balístico M-04",
    ethnicity: "Africano Subsaariano (Quênia / Nigéria)",
    rank: "KHAEL",
    spec: "MEDICO_COMBATE",
    world: "Ckesalth",
    skin: "#3c2009",
    hair: "#0a0a0a",
    eyes: "#10b981",
    primary: "#10B981",
    secondary: "#047857",
    trim: "#FACC15",
    lore: "Cirurgião de trauma em Ckesalth. Desenvolveu injetores de coagulação rápida sob fogo.",
    featuresSvg: `
      <!-- Clean shaved scalp line -->
      <path d="M154 164 C154 92 358 92 358 164" stroke="#FACC15" stroke-width="5" stroke-dasharray="10 10" fill="none" />
      <!-- Green medical HUD monocle over left eye -->
      <circle cx="312" cy="230" r="35" fill="none" stroke="#10b981" stroke-width="7" />
      <line x1="312" y1="210" x2="312" y2="250" stroke="#10b981" stroke-width="7" />
      <line x1="292" y1="230" x2="332" y2="230" stroke="#10b981" stroke-width="7" />
      <!-- Biohazard medical collar -->
      <path d="M143 399 Q256 430 369 399 L379 461 Q256 492 133 461 Z" fill="#064e3b" stroke="#10b981" stroke-width="5" />
    `
  },
  {
    id: "OP_MALE_HUNTER_INDIGENOUS",
    filename: "op_male_hunter_indigenous",
    gender: "MASCULINO",
    folder: "male",
    codename: "ARANI YVY",
    fullName: "Arani Yvy · Rastreador Primordial M-05",
    ethnicity: "Indígena Sul-Americano (Tupi-Guarani / Amazônico)",
    rank: "VENEX",
    spec: "COMANDOS_SELVA",
    world: "Priadus",
    skin: "#a25828",
    hair: "#050505",
    eyes: "#d97706",
    primary: "#EF4444",
    secondary: "#15803D",
    trim: "#F59E0B",
    lore: "Mestre de selva e emboscada. Pressente correntes de ar e fechamento de anéis em Priadus.",
    featuresSvg: `
      <!-- Shoulder length black hair framing jaw -->
      <path d="M133 174 C133 72 379 72 379 174 L394 317 L364 307 L364 184 C333 102 179 102 148 184 L148 307 L118 317 Z" fill="#050505" />
      <!-- Geometric Urucum war paint -->
      <path d="M154 251 L236 246 L256 261 L276 246 L358 251" stroke="#ef4444" stroke-width="12" stroke-linecap="round" fill="none" />
      <circle cx="174" cy="276" r="8" fill="#ef4444" />
      <circle cx="338" cy="276" r="8" fill="#ef4444" />
    `
  },
  {
    id: "OP_MALE_MARKSMAN_MENA",
    filename: "op_male_marksman_mena",
    gender: "MASCULINO",
    folder: "male",
    codename: "ZAYN AL-MANSOOR",
    fullName: "Zayn Al-Mansoor · Olho do Vento M-06",
    ethnicity: "Oriente Médio / Norte da África (Árabe-Beduíno)",
    rank: "SKEETW",
    spec: "SNIPER",
    world: "Ckesalth",
    skin: "#c68642",
    hair: "#1c1917",
    eyes: "#f59e0b",
    primary: "#D97706",
    secondary: "#92400E",
    trim: "#FDE047",
    lore: "Franco-atirador de longo alcance. Balística calculada sobre refração de calor em Ckesalth.",
    featuresSvg: `
      <!-- Tactical desert Shemagh cowl -->
      <path d="M123 154 Q256 92 389 154 L379 215 Q256 184 133 215 Z" fill="#78350f" stroke="#FDE047" stroke-width="5" />
      <path d="M133 317 Q256 369 379 317 L399 451 Q256 481 113 451 Z" fill="#78350f" stroke="#D97706" stroke-width="6" />
      <!-- Trimmed dark beard -->
      <path d="M184 317 Q256 399 328 317 L317 358 Q256 420 195 358 Z" fill="#1c1917" />
      <!-- Kohl sniper eye line -->
      <path d="M174 225 Q215 215 241 230" stroke="#000" stroke-width="10" fill="none" stroke-linecap="round" />
      <path d="M271 230 Q297 215 338 225" stroke="#000" stroke-width="10" fill="none" stroke-linecap="round" />
    `
  },
  {
    id: "OP_MALE_BERSERKER_PACIFIC",
    filename: "op_male_berserker_pacific",
    gender: "MASCULINO",
    folder: "male",
    codename: "MANOA TUILAGI",
    fullName: "Manoa Tuilagi · Quebrador de Marés M-07",
    ethnicity: "Polinésio / Ilhas do Pacífico (Samoano / Maori)",
    rank: "HURAN",
    spec: "INFANTARIA",
    world: "Arukheea",
    skin: "#a0522d",
    hair: "#0c0a09",
    eyes: "#38bdf8",
    primary: "#0284C7",
    secondary: "#0369A1",
    trim: "#F97316",
    lore: "Estrutura maciça forjada enfrentando ondas oceânicas em Arukheea. Infantaria de choque.",
    featuresSvg: `
      <!-- Top knot warrior bun -->
      <circle cx="256" cy="92" r="41" fill="#0c0a09" />
      <path d="M154 154 C154 92 358 92 358 154 C328 123 184 123 154 154 Z" fill="#0c0a09" />
      <!-- Ta Moko tribal cyan tattoos -->
      <path d="M164 256 Q184 297 215 317 M174 287 Q195 328 230 338" stroke="#06b6d4" stroke-width="7" fill="none" stroke-linecap="round" />
      <!-- Heavy trapezius combat collar -->
      <path d="M92 399 Q256 440 420 399 L440 471 Q256 512 72 471 Z" fill="#0f172a" stroke="#0284C7" stroke-width="7" />
    `
  },
  {
    id: "OP_MALE_TECH_INDIAN",
    filename: "op_male_tech_indian",
    gender: "MASCULINO",
    folder: "male",
    codename: "DEVAN SHARMA",
    fullName: "Devan Sharma · Espectro Eletrônico M-08",
    ethnicity: "Sul-Asiático (Indiano)",
    rank: "OVERLORD",
    spec: "COMUNICACOES_HACKER",
    world: "CIGKV",
    skin: "#8b5a2b",
    hair: "#111827",
    eyes: "#38bdf8",
    primary: "#38BDF8",
    secondary: "#8B5CF6",
    trim: "#FACC15",
    lore: "Guerra eletrônica e antecipação de anéis de confinamento no CIGKV por telemetria quântica.",
    featuresSvg: `
      <!-- Clean parted dark hair -->
      <path d="M143 164 C143 82 369 82 369 164 C338 113 184 123 143 164 Z" fill="#111827" />
      <!-- AR HUD dual glasses -->
      <rect x="164" y="205" width="82" height="51" rx="15" fill="none" stroke="#38bdf8" stroke-width="8" />
      <rect x="266" y="205" width="82" height="51" rx="15" fill="none" stroke="#38bdf8" stroke-width="8" />
      <line x1="246" y1="230" x2="266" y2="230" stroke="#38bdf8" stroke-width="7" />
      <!-- Hex telemetry collar badge -->
      <polygon points="256,399 276,415 276,445 256,461 236,445 236,415" fill="#FACC15" />
    `
  },

  // ── FEMININE (8) ──
  {
    id: "OP_FEMALE_VALKYRIE",
    filename: "op_female_valkyrie",
    gender: "FEMININO",
    folder: "female",
    codename: "NYRA VEX",
    fullName: "Nyra Vex · Operadora Valkyrie F-01",
    ethnicity: "Afro-Brasileira / Afro-Caribenha",
    rank: "SKEETW",
    spec: "RASTREADORES",
    world: "CIGKV",
    skin: "#8c532b",
    hair: "#09090b",
    eyes: "#a855f7",
    primary: "#F97316",
    secondary: "#A855F7",
    trim: "#FACC15",
    lore: "Líder de parkour e infiltração rápida no CIGKV. Reflexos acrobáticos e flanqueamento.",
    featuresSvg: `
      <!-- Braided high dreadlocks bun -->
      <path d="M143 154 C143 72 369 72 369 154 C338 113 174 113 143 154 Z" fill="#09090b" />
      <path d="M236 82 L225 41 L287 41 L276 82 Z" fill="#09090b" />
      <path d="M154 133 L123 235 M358 133 L389 235" stroke="#09090b" stroke-width="15" stroke-linecap="round" />
      <!-- Golden chevron forehead marking -->
      <polygon points="256,143 271,169 256,164 241,169" fill="#FACC15" />
      <!-- Tactical choker & comms mic -->
      <rect x="184" y="348" width="143" height="20" rx="10" fill="#1e1b4b" stroke="#A855F7" stroke-width="5" />
      <circle cx="143" cy="287" r="13" fill="#F97316" />
      <path d="M143 297 Q164 338 195 343" stroke="#F97316" stroke-width="6" fill="none" />
    `
  },
  {
    id: "OP_FEMALE_SNIPER",
    filename: "op_female_sniper",
    gender: "FEMININO",
    folder: "female",
    codename: "LYRA SOLIS",
    fullName: "Lyra Solis · Operadora Mira F-02",
    ethnicity: "Latina Mestiza (Andina / Mexicana)",
    rank: "VENEX",
    spec: "SNIPER",
    world: "Priadus",
    skin: "#c68642",
    hair: "#292524",
    eyes: "#f59e0b",
    primary: "#FB923C",
    secondary: "#8B5CF6",
    trim: "#FDE047",
    lore: "Atiradora de precisão em Priadus. Abates limpos a 800m através de névoa e fumaça densa.",
    featuresSvg: `
      <!-- Side swept braid with undercut -->
      <path d="M154 164 C154 82 358 82 358 164 C328 123 184 123 154 164 Z" fill="#292524" />
      <path d="M154 164 L123 328 L143 338 L174 195 Z" fill="#292524" />
      <!-- Amber sniper reticle on left eye -->
      <circle cx="307" cy="230" r="30" fill="none" stroke="#f59e0b" stroke-width="7" />
      <circle cx="307" cy="230" r="8" fill="#f59e0b" />
      <line x1="266" y1="230" x2="348" y2="230" stroke="#f59e0b" stroke-width="4" stroke-dasharray="5 5" />
      <!-- Camo paint streak -->
      <line x1="169" y1="266" x2="215" y2="287" stroke="#d97706" stroke-width="10" stroke-linecap="round" />
    `
  },
  {
    id: "OP_FEMALE_STEALTH_ASIAN",
    filename: "op_female_stealth_asian",
    gender: "FEMININO",
    folder: "female",
    codename: "MEI-LING ZHOU",
    fullName: "Mei-Ling Zhou · Lâmina Crepuscular F-03",
    ethnicity: "Leste-Asiático (Chinesa)",
    rank: "SKEETW",
    spec: "PARAQUEDISTAS",
    world: "Barburhen",
    skin: "#ffe0bd",
    hair: "#030712",
    eyes: "#a855f7",
    primary: "#A855F7",
    secondary: "#6366F1",
    trim: "#38BDF8",
    lore: "Descidas noturnas com planador sobre zonas industriais em Barburhen. Combate ágil e adagas.",
    featuresSvg: `
      <!-- Angular black bob haircut with bangs -->
      <path d="M133 174 C133 72 379 72 379 174 L394 287 L353 256 L364 184 C333 123 179 123 148 184 L159 256 L118 287 Z" fill="#030712" />
      <!-- Stealth black half-mask -->
      <path d="M184 287 Q256 317 328 287 L338 379 Q256 420 174 379 Z" fill="#111827" stroke="#6366F1" stroke-width="7" />
      <line x1="225" y1="328" x2="241" y2="328" stroke="#a855f7" stroke-width="7" stroke-linecap="round" />
      <line x1="271" y1="328" x2="287" y2="328" stroke="#a855f7" stroke-width="7" stroke-linecap="round" />
    `
  },
  {
    id: "OP_FEMALE_HEAVY_AFRICAN",
    filename: "op_female_heavy_african",
    gender: "FEMININO",
    folder: "female",
    codename: "AMARA DIALLO",
    fullName: "Amara Diallo · Muralha de Cinzas F-04",
    ethnicity: "Oeste-Africana (Senegalesa / Wolof)",
    rank: "KHAEL",
    spec: "MOTORISTA_PESADOS",
    world: "Barburhen",
    skin: "#4a2c11",
    hair: "#0a0a0a",
    eyes: "#eab308",
    primary: "#F97316",
    secondary: "#78350F",
    trim: "#FACC15",
    lore: "Piloto de comboios pesados sob chuva ácida em Barburhen. Armadura térmica e liderança.",
    featuresSvg: `
      <!-- Sculptural afro fade -->
      <path d="M133 164 C133 62 379 62 379 164 C348 102 164 102 133 164 Z" fill="#0a0a0a" />
      <!-- Ceremonial white dots on temples -->
      <circle cx="154" cy="215" r="5" fill="#fff" />
      <circle cx="154" cy="235" r="5" fill="#fff" />
      <circle cx="154" cy="256" r="5" fill="#fff" />
      <circle cx="358" cy="215" r="5" fill="#fff" />
      <circle cx="358" cy="235" r="5" fill="#fff" />
      <circle cx="358" cy="256" r="5" fill="#fff" />
      <!-- Heavy blast collar -->
      <path d="M113 379 Q256 420 399 379 L420 451 Q256 492 92 451 Z" fill="#334155" stroke="#F97316" stroke-width="9" />
    `
  },
  {
    id: "OP_FEMALE_SURVIVOR_INDIGENOUS",
    filename: "op_female_survivor_indigenous",
    gender: "FEMININO",
    folder: "female",
    codename: "KAYAEN APINAJÉ",
    fullName: "Kayaen Apinajé · Flor Venenosa F-05",
    ethnicity: "Indígena Brasileira (Cerrado / Tocantins - Apinajé)",
    rank: "ONITH",
    spec: "COMANDOS_SELVA",
    world: "Priadus",
    skin: "#a25828",
    hair: "#050505",
    eyes: "#10b981",
    primary: "#10B981",
    secondary: "#EF4444",
    trim: "#F59E0B",
    lore: "Manipulação de toxinas botânicas e filtros naturais de esporos na selva de Priadus.",
    featuresSvg: `
      <!-- Long twin braids -->
      <path d="M138 164 C138 77 374 77 374 164 L384 317 L358 297 L358 174 C328 113 184 113 154 174 L154 297 L128 317 Z" fill="#050505" />
      <!-- Traditional facial markings -->
      <polygon points="256,225 276,251 236,251" fill="#10b981" />
      <line x1="169" y1="266" x2="220" y2="266" stroke="#ef4444" stroke-width="10" stroke-linecap="round" />
      <line x1="292" y1="266" x2="343" y2="266" stroke="#ef4444" stroke-width="10" stroke-linecap="round" />
      <!-- Natural fiber choker -->
      <rect x="184" y="348" width="143" height="20" rx="5" fill="#78350f" stroke="#F59E0B" stroke-width="4" />
    `
  },
  {
    id: "OP_FEMALE_PILOT_EURO",
    filename: "op_female_pilot_euro",
    gender: "FEMININO",
    folder: "female",
    codename: "FREJA LINDSTROM",
    fullName: "Freja Lindstrom · Asa de Gelo F-06",
    ethnicity: "Escandinava / Europeia Nórdica (Sueca)",
    rank: "VENEX",
    spec: "PILOTO_AERONAVES",
    world: "Arukheea",
    skin: "#ffe0bd",
    hair: "#f8fafc",
    eyes: "#0284c7",
    primary: "#0284C7",
    secondary: "#38BDF8",
    trim: "#FACC15",
    lore: "Piloto de helicóptero e resgate em tempestades na parede de água de Arukheea.",
    featuresSvg: `
      <!-- Platinum blonde tactical braid -->
      <path d="M148 164 C148 82 364 82 364 164 C333 113 179 113 148 164 Z" fill="#f8fafc" />
      <path d="M241 92 L271 92 L281 184 L230 184 Z" fill="#f8fafc" />
      <!-- Tinted aviator HUD visor -->
      <path d="M154 205 Q256 184 358 205 L353 251 Q256 235 159 251 Z" fill="#38bdf8" fill-opacity="0.5" stroke="#0284c7" stroke-width="7" />
      <!-- Pilot boom microphone -->
      <circle cx="369" cy="266" r="15" fill="#0284c7" />
      <path d="M369 281 Q348 328 307 338" stroke="#0284c7" stroke-width="7" fill="none" />
    `
  },
  {
    id: "OP_FEMALE_DISRUPTOR_MENA",
    filename: "op_female_disruptor_mena",
    gender: "FEMININO",
    folder: "female",
    codename: "SORAYA HADDAD",
    fullName: "Soraya Haddad · Tempestade de Areia F-07",
    ethnicity: "Levantina / Oriente Médio (Libanesa)",
    rank: "HURAN",
    spec: "ANTI_BOMBAS",
    world: "Ckesalth",
    skin: "#c68642",
    hair: "#1c1917",
    eyes: "#ef4444",
    primary: "#EF4444",
    secondary: "#78350F",
    trim: "#F59E0B",
    lore: "Desativação de explosivos e granadas sônicas. Engenheira de demolição em Ckesalth.",
    featuresSvg: `
      <!-- High voluminous ponytail bun -->
      <circle cx="256" cy="92" r="46" fill="#1c1917" />
      <path d="M143 164 C143 82 369 82 369 164 C333 123 179 123 143 164 Z" fill="#1c1917" />
      <!-- Sound damper headset over ears -->
      <rect x="102" y="225" width="36" height="77" rx="15" fill="#b91c1c" stroke="#f87171" stroke-width="5" />
      <rect x="374" y="225" width="36" height="77" rx="15" fill="#b91c1c" stroke="#f87171" stroke-width="5" />
      <path d="M123 225 Q256 113 389 225" stroke="#f87171" stroke-width="10" fill="none" />
      <!-- Winged kohl eyes -->
      <path d="M169 235 Q205 220 236 235" stroke="#000" stroke-width="9" fill="none" stroke-linecap="round" />
      <path d="M276 235 Q307 220 343 235" stroke="#000" stroke-width="9" fill="none" stroke-linecap="round" />
    `
  },
  {
    id: "OP_FEMALE_TACTICIAN_SOUTHASIAN",
    filename: "op_female_tactician_southasian",
    gender: "FEMININO",
    folder: "female",
    codename: "PRIYA NAIR",
    fullName: "Priya Nair · Égide Kalari F-08",
    ethnicity: "Sul-Asiática (Dravidiana / Sul da Índia - Kerala)",
    rank: "SKEETW",
    spec: "INFANTARIA",
    world: "Arukheea",
    skin: "#8d5524",
    hair: "#09090b",
    eyes: "#f59e0b",
    primary: "#F59E0B",
    secondary: "#6D28D9",
    trim: "#FDE047",
    lore: "Kalaripayattu tático e projeção de barreira Égide contra as marés de choque em Arukheea.",
    featuresSvg: `
      <!-- Long glossy dark braid with gold wire -->
      <path d="M143 164 C143 77 369 77 369 164 C333 113 179 113 143 164 Z" fill="#09090b" />
      <path d="M246 102 L266 102 L276 195 L236 195 Z" fill="#09090b" />
      <!-- Tactical bindi third-eye sensor -->
      <circle cx="256" cy="195" r="13" fill="#f59e0b" stroke="#fff" stroke-width="4" />
      <!-- Aegis barrier energy emitter collar -->
      <path d="M154 379 Q256 410 358 379 L374 451 Q256 481 138 451 Z" fill="#1e1b4b" stroke="#FDE047" stroke-width="7" />
    `
  }
];

function generateSvg(op) {
  const isFemale = op.gender === "FEMININO";
  const rx = isFemale ? 92 : 102;
  const ry = isFemale ? 112 : 118;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background glow gradient -->
    <radialGradient id="bgGlow-${op.id}" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${op.primary}" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#050508" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="1"/>
    </radialGradient>

    <!-- Skin gradient with realistic ambient occlusion -->
    <linearGradient id="skinGrad-${op.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${op.skin}"/>
      <stop offset="100%" stop-color="${op.skin}cc"/>
    </linearGradient>

    <!-- Tactical armor chest gradient -->
    <linearGradient id="armorGrad-${op.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>

    <!-- Clip path for circular reticle portrait -->
    <clipPath id="circleClip-${op.id}">
      <rect x="0" y="0" width="512" height="512" rx="24"/>
    </clipPath>
  </defs>

  <g clip-path="url(#circleClip-${op.id})">
    <!-- Dark Tactical Background -->
    <rect width="512" height="512" fill="url(#bgGlow-${op.id})" />

    <!-- Cybernetic Hex & Radar Grid -->
    <circle cx="256" cy="256" r="235" fill="none" stroke="${op.primary}" stroke-width="2" stroke-dasharray="15 15" opacity="0.3"/>
    <circle cx="256" cy="256" r="180" fill="none" stroke="${op.secondary}" stroke-width="1.5" stroke-dasharray="8 8" opacity="0.25"/>
    <line x1="0" y1="256" x2="512" y2="256" stroke="${op.primary}" stroke-width="1.5" opacity="0.2"/>
    <line x1="256" y1="0" x2="256" y2="512" stroke="${op.primary}" stroke-width="1.5" opacity="0.2"/>

    <!-- Neck Structure -->
    <path d="M215 307 L215 384 Q256 399 297 384 L297 307 Z" fill="url(#skinGrad-${op.id})" />

    <!-- Shoulders & Heavy Tactical Armor Base -->
    <path d="M92 430 Q256 471 420 430 L451 512 L61 512 Z" fill="url(#armorGrad-${op.id})" stroke="${op.primary}" stroke-width="5"/>

    <!-- Anatomical Head & Face Shape -->
    <ellipse cx="256" cy="246" rx="${rx}" ry="${ry}" fill="url(#skinGrad-${op.id})" />

    <!-- Eyes (Sclera & Iris) -->
    <ellipse cx="205" cy="235" rx="18" ry="10" fill="#ffffff" />
    <circle cx="205" cy="235" r="8" fill="${op.eyes}" />
    <ellipse cx="307" cy="235" rx="18" ry="10" fill="#ffffff" />
    <circle cx="307" cy="235" r="8" fill="${op.eyes}" />

    <!-- Nose Bridge -->
    <path d="M251 235 L246 271 L266 271" stroke="${op.skin}88" stroke-width="6" stroke-linecap="round" fill="none" />

    <!-- Stoic Mouth Line -->
    <line x1="230" y1="297" x2="282" y2="297" stroke="#713f12" stroke-width="7" stroke-linecap="round" />

    <!-- Operative Unique Cultural / Ethnic / Tactical Features -->
    ${op.featuresSvg}

    <!-- Tactical HUD Corner Brackets -->
    <path d="M41 92 L41 41 L92 41" stroke="${op.primary}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M471 92 L471 41 L420 41" stroke="${op.primary}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M41 420 L41 471 L92 471" stroke="${op.primary}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M471 420 L471 471 L420 471" stroke="${op.primary}" stroke-width="7" fill="none" stroke-linecap="round"/>

    <!-- Operative Tactical Identification Overlay Tag -->
    <rect x="24" y="24" width="180" height="32" rx="4" fill="#000000" fill-opacity="0.8" stroke="${op.primary}" stroke-width="2"/>
    <text x="34" y="46" font-family="monospace" font-size="14" font-weight="bold" fill="#ffffff">
      ${isFemale ? "♀ FEMALE" : "♂ MALE"} · ${op.rank}
    </text>

    <!-- Codename & Ethnicity Watermark -->
    <rect x="24" y="456" width="464" height="36" rx="4" fill="#000000" fill-opacity="0.85" stroke="${op.primary}66" stroke-width="1.5"/>
    <text x="36" y="480" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" fill="#ffffff">
      ${op.codename} <tspan fill="${op.trim}" font-size="12">(${op.ethnicity})</tspan>
    </text>
  </g>
</svg>`;
}

const catalog = [];

console.log(`[AVATARS] Generating 16 canonical operative avatar reference files (8 male / 8 female)...`);

for (const op of OPERATIVES) {
  const svgContent = generateSvg(op);
  const contentPath = path.join(CONTENT_AVATARS_DIR, op.folder, `${op.filename}.svg`);
  const publicPath = path.join(PUBLIC_AVATARS_DIR, op.folder, `${op.filename}.svg`);

  fs.writeFileSync(contentPath, svgContent, "utf8");
  fs.writeFileSync(publicPath, svgContent, "utf8");

  catalog.push({
    id: op.id,
    codename: op.codename,
    fullName: op.fullName,
    gender: op.gender,
    ethnicity: op.ethnicity,
    rank: op.rank,
    specialization: op.spec,
    defaultWorld: op.world,
    svgPathContent: `Content/Avatars/${op.folder}/${op.filename}.svg`,
    svgPathPublic: `/avatars/${op.folder}/${op.filename}.svg`,
    colors: {
      primary: op.primary,
      secondary: op.secondary,
      trim: op.trim,
      skinTone: op.skin,
      eyes: op.eyes,
      hair: op.hair,
    },
    lore: op.lore,
  });

  console.log(`  ✅ [${op.gender}] ${op.codename} (${op.ethnicity}) -> ${op.filename}.svg`);
}

const catalogJson = JSON.stringify(catalog, null, 2);
fs.writeFileSync(path.join(CONTENT_AVATARS_DIR, "avatar_catalog.json"), catalogJson, "utf8");
fs.writeFileSync(path.join(PUBLIC_AVATARS_DIR, "avatar_catalog.json"), catalogJson, "utf8");

console.log(`[AVATARS] Complete! 16 SVG avatars and catalog saved in:`);
console.log(`  - Content/Avatars/ (male/, female/, avatar_catalog.json)`);
console.log(`  - client/public/avatars/ (male/, female/, avatar_catalog.json)`);
