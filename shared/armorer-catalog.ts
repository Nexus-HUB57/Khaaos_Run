export const ARMORER_CATALOG = [
  {
    id: "lamina-nano",
    name: "Lâmina Nano",
    type: "ARMA",
    priceKrc: 500,
    rarity: "COMUM",
    maxDurability: 100,
    stats: { damage: 18, range: 6 },
    description: "Dano 18 e alcance 6. Define o poder da arma equipada no loadout.",
    icon: "sword",
  },
  {
    id: "rifle-de-plasma",
    name: "Rifle de Plasma",
    type: "ARMA",
    priceKrc: 1200,
    rarity: "RARO",
    maxDurability: 100,
    stats: { damage: 35, range: 9 },
    description: "Dano 35 e alcance 9. Arma de alto impacto para o combate à distância.",
    icon: "sword",
  },
  {
    id: "colete-de-kevlar",
    name: "Colete de Kevlar",
    type: "DEFESA",
    priceKrc: 800,
    rarity: "COMUM",
    maxDurability: 100,
    stats: { defense: 20 },
    description: "Defesa 20: concede +5 à saúde máxima enquanto equipado.",
    icon: "shield",
  },
  {
    id: "escudo-tatico",
    name: "Escudo Tático",
    type: "DEFESA",
    priceKrc: 2000,
    rarity: "EPICO",
    maxDurability: 100,
    stats: { defense: 60 },
    description: "Defesa 60: concede +15 à saúde máxima enquanto equipado.",
    icon: "shield",
  },
  {
    id: "stim-pack",
    name: "Stim Pack",
    type: "CURATIVO",
    priceKrc: 100,
    rarity: "COMUM",
    maxDurability: 100,
    stats: { heal: 20 },
    description: "Restaura até 20 HP; a cura é limitada à saúde máxima do operativo.",
    icon: "box",
  },
  {
    id: "mochila-tatica",
    name: "Mochila Tática",
    type: "UTILIDADE",
    priceKrc: 150,
    rarity: "COMUM",
    maxDurability: 100,
    stats: { capacity: 20 },
    description: "Capacidade 20: adiciona até 20 pontos à capacidade de carga do loadout.",
    icon: "package",
  },
  {
    id: "granada-de-fragmentacao",
    name: "Granada de Fragmentação",
    type: "UTILIDADE",
    priceKrc: 600,
    rarity: "RARO",
    maxDurability: 100,
    stats: { damage: 30, radius: 5 },
    description: "Dano 30 em raio 5. Equipe-a para lançar pela PackBack durante a partida.",
    icon: "flame",
  },
  {
    id: "kit-medico-avancado",
    name: "Kit Médico Avançado",
    type: "CURATIVO",
    priceKrc: 350,
    rarity: "EPICO",
    maxDurability: 100,
    stats: { heal: 80 },
    description: "Restaura até 80 HP; a cura é limitada à saúde máxima do operativo.",
    icon: "package",
  },
] as const;

export type ArmorerProduct = (typeof ARMORER_CATALOG)[number];
export type ArmorerCatalogId = ArmorerProduct["id"];

export const ARMORER_CATALOG_IDS = ARMORER_CATALOG.map(({ id }) => id) as [
  ArmorerCatalogId,
  ...ArmorerCatalogId[],
];

export function getArmorerProduct(catalogId: string): ArmorerProduct | undefined {
  return ARMORER_CATALOG.find((product) => product.id === catalogId);
}

export function isArmorerCatalogId(value: string): value is ArmorerCatalogId {
  return ARMORER_CATALOG.some((product) => product.id === value);
}
