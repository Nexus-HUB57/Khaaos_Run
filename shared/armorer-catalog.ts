export const ARMORER_MATERIALS = [
  { id: "metal", code: 1, name: "Metal Recuperado", rarity: "COMUM", description: "Sucata metálica reaproveitável." },
  { id: "madeira", code: 2, name: "Madeira Estrutural", rarity: "COMUM", description: "Peças de madeira resistente para estruturas e cabos." },
  { id: "polimero", code: 3, name: "Polímero", rarity: "COMUM", description: "Material leve usado em blindagem e componentes." },
  { id: "polvora", code: 4, name: "Pólvora", rarity: "RARO", description: "Composto energético para cargas e munições." },
  { id: "componente-eletronico", code: 5, name: "Componente Eletrônico", rarity: "RARO", description: "Circuitos recuperados de equipamentos táticos." },
  { id: "fibra-tatica", code: 6, name: "Fibra Tática", rarity: "COMUM", description: "Tecido técnico para coletes, kits e mochilas." },
  { id: "gel-medico", code: 7, name: "Gel Médico", rarity: "COMUM", description: "Agente regenerativo usado em consumíveis médicos." },
  { id: "liga-cristalina", code: 8, name: "Liga Cristalina", rarity: "EPICO", description: "Liga escassa para equipamentos de alta defesa." },
] as const;

export type ArmorerMaterialId = (typeof ARMORER_MATERIALS)[number]["id"];
export type ArmorerMaterial = (typeof ARMORER_MATERIALS)[number];
export type ArmorerIngredient = { materialId: ArmorerMaterialId; quantity: number };

export const ARMORER_CATALOG = [
  {
    id: "lamina-nano",
    name: "Lâmina Nano",
    type: "ARMA",
    rarity: "COMUM",
    armorerFeeKrc: 120,
    recipe: [
      { materialId: "metal", quantity: 3 },
      { materialId: "madeira", quantity: 2 },
      { materialId: "polimero", quantity: 1 },
    ],
    maxDurability: 100,
    stats: { damage: 18, range: 6 },
    description: "Dano 18 e alcance 6. A lâmina de entrada, feita com metal e cabo reforçado.",
    icon: "sword",
  },
  {
    id: "rifle-de-plasma",
    name: "Rifle de Plasma",
    type: "ARMA",
    rarity: "RARO",
    armorerFeeKrc: 500,
    recipe: [
      { materialId: "metal", quantity: 8 },
      { materialId: "polimero", quantity: 4 },
      { materialId: "componente-eletronico", quantity: 3 },
      { materialId: "polvora", quantity: 2 },
    ],
    maxDurability: 100,
    stats: { damage: 35, range: 9 },
    description: "Dano 35 e alcance 9. Circuitos, componentes raros e montagem de alta precisão.",
    icon: "sword",
  },
  {
    id: "colete-de-kevlar",
    name: "Colete de Kevlar",
    type: "DEFESA",
    rarity: "COMUM",
    armorerFeeKrc: 180,
    recipe: [
      { materialId: "metal", quantity: 3 },
      { materialId: "fibra-tatica", quantity: 6 },
      { materialId: "polimero", quantity: 2 },
    ],
    maxDurability: 100,
    stats: { defense: 20 },
    description: "Defesa 20: concede +5 à saúde máxima enquanto equipado.",
    icon: "shield",
  },
  {
    id: "escudo-tatico",
    name: "Escudo Tático",
    type: "DEFESA",
    rarity: "EPICO",
    armorerFeeKrc: 900,
    recipe: [
      { materialId: "metal", quantity: 10 },
      { materialId: "polimero", quantity: 8 },
      { materialId: "componente-eletronico", quantity: 3 },
      { materialId: "liga-cristalina", quantity: 2 },
    ],
    maxDurability: 100,
    stats: { defense: 60 },
    description: "Defesa 60: concede +15 à saúde máxima. Exige liga cristalina e montagem especializada.",
    icon: "shield",
  },
  {
    id: "stim-pack",
    name: "Stim Pack",
    type: "CURATIVO",
    rarity: "COMUM",
    armorerFeeKrc: 25,
    recipe: [
      { materialId: "gel-medico", quantity: 2 },
      { materialId: "fibra-tatica", quantity: 1 },
    ],
    maxDurability: 100,
    stats: { heal: 20 },
    description: "Restaura até 20 HP; a cura é limitada à saúde máxima do operativo.",
    icon: "box",
  },
  {
    id: "mochila-tatica",
    name: "Mochila Tática",
    type: "UTILIDADE",
    rarity: "COMUM",
    armorerFeeKrc: 50,
    recipe: [
      { materialId: "madeira", quantity: 2 },
      { materialId: "fibra-tatica", quantity: 3 },
      { materialId: "polimero", quantity: 2 },
    ],
    maxDurability: 100,
    stats: { capacity: 20 },
    description: "Capacidade 20: adiciona até 20 pontos à capacidade de carga do loadout.",
    icon: "package",
  },
  {
    id: "granada-de-fragmentacao",
    name: "Granada de Fragmentação",
    type: "UTILIDADE",
    rarity: "RARO",
    armorerFeeKrc: 240,
    recipe: [
      { materialId: "metal", quantity: 2 },
      { materialId: "polvora", quantity: 3 },
      { materialId: "polimero", quantity: 1 },
    ],
    maxDurability: 100,
    stats: { damage: 30, radius: 5 },
    description: "Dano 30 em raio 5. Equipe-a para lançar pela PackBack durante a partida.",
    icon: "flame",
  },
  {
    id: "kit-medico-avancado",
    name: "Kit Médico Avançado",
    type: "CURATIVO",
    rarity: "EPICO",
    armorerFeeKrc: 650,
    recipe: [
      { materialId: "gel-medico", quantity: 6 },
      { materialId: "componente-eletronico", quantity: 2 },
      { materialId: "polimero", quantity: 3 },
    ],
    maxDurability: 100,
    stats: { heal: 80 },
    description: "Restaura até 80 HP; gel concentrado e controle eletrônico exigem serviço especializado.",
    icon: "package",
  },
] as const;

export type ArmorerProduct = (typeof ARMORER_CATALOG)[number];
export type ArmorerCatalogId = ArmorerProduct["id"];

export const ARMORER_CATALOG_IDS = ARMORER_CATALOG.map(({ id }) => id) as [
  ArmorerCatalogId,
  ...ArmorerCatalogId[],
];

export const ARMORER_MATERIAL_IDS = ARMORER_MATERIALS.map(({ id }) => id) as [
  ArmorerMaterialId,
  ...ArmorerMaterialId[],
];

export function getArmorerProduct(catalogId: string): ArmorerProduct | undefined {
  return ARMORER_CATALOG.find((product) => product.id === catalogId);
}

export function getArmorerMaterial(materialId: string): ArmorerMaterial | undefined {
  return ARMORER_MATERIALS.find((material) => material.id === materialId);
}

export function getArmorerMaterialByCode(code: number): ArmorerMaterial | undefined {
  return ARMORER_MATERIALS.find((material) => material.code === code);
}

export function isArmorerCatalogId(value: string): value is ArmorerCatalogId {
  return ARMORER_CATALOG.some((product) => product.id === value);
}
