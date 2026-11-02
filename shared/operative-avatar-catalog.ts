import { KHAAOS_OPERATIVE_ARCHETYPES, type OperativeGender } from "./character-studio";

export interface OperativeAvatarOption {
  id: string;
  codename: string;
  fullName: string;
  gender: OperativeGender;
  rank: string;
  avatarPath: string;
  canonical: boolean;
}

function avatarPath(id: string, gender: OperativeGender): string {
  const folder = gender === "MASCULINO" ? "male" : "female";
  return `/avatars/${folder}/${id.toLowerCase()}.svg`;
}

/**
 * The 16 canonical operatives plus TALON, the already-shipped supplemental
 * avatar/runtime operative. Paths are local static assets, never user URLs.
 */
export const OPERATIVE_AVATAR_OPTIONS: readonly OperativeAvatarOption[] = [
  ...KHAAOS_OPERATIVE_ARCHETYPES.map((operative) => ({
    id: operative.id,
    codename: operative.codename,
    fullName: operative.fullName,
    gender: operative.gender,
    rank: operative.rank,
    avatarPath: avatarPath(operative.id, operative.gender),
    canonical: true,
  })),
  {
    id: "OP_MALE_TALON",
    codename: "TALON",
    fullName: "Talon · Corredor Urbano M-09",
    gender: "MASCULINO",
    rank: "ZHEERS",
    avatarPath: avatarPath("OP_MALE_TALON", "MASCULINO"),
    canonical: false,
  },
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
