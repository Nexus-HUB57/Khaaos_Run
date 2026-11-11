import { KHAAOS_OPERATIVE_ARCHETYPES, KHAAOS_MILITIA_ARCHETYPES, type OperativeFaction } from "./character-studio";

export interface OperativeAvatarOption {
  id: string;
  codename: string;
  fullName: string;
  gender: OperativeGender;
  rank: string;
  /** Canonical UE character asset; supplemental avatars may be SVG-only. */
  ueAssetId: string | null;
  /** ADR-ESQUELETO-RIG-POR-SEXO runtime skeleton. */
  skeleton: "SK_Manny" | "SK_Gwen";
  avatarPath: string;
  /** Retrato fotorrealista local opcional; o SVG permanece o fallback canônico. */
  realisticAvatarPath?: string;
  canonical: boolean;
  /** Facção declarada: militares canônicos, milícias e gangues urbanas (Lote 4). */
  branch: OperativeFaction;
}

type OperativeGender = "MASCULINO" | "FEMININO";

export interface OperativeAvatarRuntime {
  id: string;
  codename: string;
  fullName: string;
  gender: OperativeGender;
  rank: string;
  ueAssetId: string | null;
  skeleton: "SK_Manny" | "SK_Gwen";
  avatarPath: string;
  canonical: boolean;
  branch: OperativeFaction;
}

function avatarPath(id: string, gender: OperativeGender): string {
  const folder = gender === "MASCULINO" ? "male" : "female";
  return `/avatars/${folder}/${id.toLowerCase()}.svg`;
}

function realisticAvatarPath(id: string, branch: OperativeFaction): string | undefined {
  if (branch === "MILITAR") return undefined;
  return `/avatars/realistic/${id.toLowerCase()}.webp`;
}

/**
 * The 16 canonical military operatives, TALON (already-shipped supplemental
 * avatar/runtime operative) and the Lote 4 militia/urban-gang batch — 33
 * selectable identities. Paths are local static assets, never user URLs.
 */
export const OPERATIVE_AVATAR_OPTIONS: readonly OperativeAvatarOption[] = [
  ...KHAAOS_OPERATIVE_ARCHETYPES.map((operative) => ({
    id: operative.id,
    codename: operative.codename,
    fullName: operative.fullName,
    gender: operative.gender,
    rank: operative.rank,
    ueAssetId: operative.ueAssetId,
    skeleton: operative.biomechanics.skeleton,
    avatarPath: avatarPath(operative.id, operative.gender),
    canonical: true,
    branch: "MILITAR" as const,
  })),
  {
    id: "OP_MALE_TALON",
    codename: "TALON",
    fullName: "Talon · Corredor Urbano M-09",
    gender: "MASCULINO",
    rank: "ZHEERS",
    ueAssetId: null,
    skeleton: "SK_Manny",
    avatarPath: avatarPath("OP_MALE_TALON", "MASCULINO"),
    canonical: false,
    branch: "MILITAR" as const,
  },
  ...KHAAOS_MILITIA_ARCHETYPES.map((operative) => ({
    id: operative.id,
    codename: operative.codename,
    fullName: operative.fullName,
    gender: operative.gender,
    rank: operative.rank,
    ueAssetId: operative.ueAssetId,
    skeleton: operative.biomechanics.skeleton,
    avatarPath: avatarPath(operative.id, operative.gender),
    realisticAvatarPath: realisticAvatarPath(operative.id, operative.faction ?? "MILITAR"),
    canonical: true,
    branch: operative.faction ?? ("MILITAR" as const),
  })),
];

export const DEFAULT_OPERATIVE_AVATAR_ID = "OP_MALE_VANGUARD";

const operativeAvatarIds = new Set(OPERATIVE_AVATAR_OPTIONS.map(({ id }) => id));

export function isOperativeAvatarId(value: unknown): value is string {
  return typeof value === "string" && operativeAvatarIds.has(value);
}

export function getOperativeAvatarOption(value: unknown): OperativeAvatarOption {
  return OPERATIVE_AVATAR_OPTIONS.find(({ id }) => id === value)
    ?? OPERATIVE_AVATAR_OPTIONS.find(({ id }) => id === DEFAULT_OPERATIVE_AVATAR_ID)!;
}

/** Stable wire/runtime projection derived only from the trusted catalog. */
export function getOperativeAvatarRuntime(value: unknown): OperativeAvatarRuntime {
  return getOperativeAvatarOption(value);
}
