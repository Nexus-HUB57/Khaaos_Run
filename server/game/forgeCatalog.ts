export type ForgeItemType = "ARMA" | "DEFESA" | "CURATIVO" | "UTILIDADE";
export type ForgeItemRarity = "COMUM" | "RARO" | "EPICO" | "LENDARIO" | "MITICO";

export interface ForgeCatalogItem {
  catalogId: string;
  name: string;
  type: ForgeItemType;
  rarity: ForgeItemRarity;
  description: string;
  priceKrc: number;
}

/**
 * Canonical v1 catalog for the web Forge. Prices are whole KRC amounts.
 * The client may display these values but never supplies price/name/type to a purchase.
 */
export const FORGE_CATALOG: readonly ForgeCatalogItem[] = [
  {
    catalogId: "nano_blade",
    name: "Lâmina Nano",
    type: "ARMA",
    rarity: "COMUM",
    description: "Arma corpo a corpo padrão. Eficiente em combate próximo.",
    priceKrc: 500,
  },
  {
    catalogId: "plasma_rifle",
    name: "Rifle de Plasma",
    type: "ARMA",
    rarity: "RARO",
    description: "Arma de alto impacto energético. Dano devastador à distância.",
    priceKrc: 1200,
  },
  {
    catalogId: "kevlar_vest",
    name: "Colete de Kevlar",
    type: "DEFESA",
    rarity: "COMUM",
    description: "Proteção balística básica. Absorve impacto de projéteis.",
    priceKrc: 800,
  },
  {
    catalogId: "tactical_shield",
    name: "Escudo Tático",
    type: "DEFESA",
    rarity: "EPICO",
    description: "Barreira defensiva avançada. Alta resistência ao dano.",
    priceKrc: 2000,
  },
  {
    catalogId: "stim_pack",
    name: "Stim Pack",
    type: "CURATIVO",
    rarity: "COMUM",
    description: "Restaura 20 HP instantaneamente. Essencial na PackBack.",
    priceKrc: 100,
  },
  {
    catalogId: "energy_cell",
    name: "Célula de Energia",
    type: "UTILIDADE",
    rarity: "COMUM",
    description: "Recarrega as reservas de energia do operativo.",
    priceKrc: 150,
  },
  {
    catalogId: "fragmentation_grenade",
    name: "Granada de Fragmentação",
    type: "ARMA",
    rarity: "RARO",
    description: "Explosivo de área. Causa dano múltiplo em batalha.",
    priceKrc: 600,
  },
  {
    catalogId: "advanced_medkit",
    name: "Kit Médico Avançado",
    type: "CURATIVO",
    rarity: "EPICO",
    description: "Restaura 80 HP e remove debuffs. Item premium.",
    priceKrc: 350,
  },
];

const catalogById = new Map(FORGE_CATALOG.map((item) => [item.catalogId, item]));

export function getForgeCatalog(): ForgeCatalogItem[] {
  return FORGE_CATALOG.map((item) => ({ ...item }));
}

export function getForgeCatalogItem(catalogId: string): ForgeCatalogItem | undefined {
  const item = catalogById.get(catalogId);
  return item ? { ...item } : undefined;
}
