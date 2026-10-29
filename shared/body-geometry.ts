export type BodyId =
  | "kane"
  | "puri"
  | "voss"
  | "okada"
  | "hald"
  | "okonkwo"
  | "henricks"
  | "krapulla"
  | "uryan";

export type ZoneId = "head" | "torso" | "limb";
export type ViewId = "front" | "side";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BodyProfile {
  id: BodyId;
  name: string;
  stature: number;
  shoulder: number;
  head: number;
}

export interface Volume {
  id: string;
  label: string;
  zone: ZoneId;
  a: Vec3;
  b: Vec3;
  r: number;
}

export interface Rig {
  profile: BodyProfile;
  volumes: Volume[];
  bones: [Vec3, Vec3][];
  eyeY: number;
  reach: number;
  capsuleRadius: number;
  capsuleHalfHeight: number;
}

/** Metros. Origem no chão, entre os pés. +Y sobe. +X é a direita do corpo. +Z é a frente. */
export const BODIES: BodyProfile[] = [
  { id: "kane", name: "Idris Kane", stature: 1.88, shoulder: 0.48, head: 0.24 },
  { id: "puri", name: "Yara Puri", stature: 1.68, shoulder: 0.38, head: 0.22 },
  { id: "voss", name: "Leandro Voss", stature: 1.82, shoulder: 0.46, head: 0.23 },
  { id: "okada", name: "Mei Okada", stature: 1.62, shoulder: 0.36, head: 0.21 },
  { id: "hald", name: "Soren Hald", stature: 1.9, shoulder: 0.47, head: 0.24 },
  { id: "okonkwo", name: "Nia Okonkwo", stature: 1.76, shoulder: 0.4, head: 0.22 },
  { id: "henricks", name: "Henricks Hunterheads III", stature: 1.84, shoulder: 0.5, head: 0.24 },
  { id: "krapulla", name: "King Krapulla", stature: 1.78, shoulder: 0.44, head: 0.23 },
  { id: "uryan", name: "Uryan Horks", stature: 1.73, shoulder: 0.38, head: 0.22 },
];

const IDS = new Set<string>(BODIES.map((body) => body.id));

export function isBodyId(value: unknown): value is BodyId {
  return typeof value === "string" && IDS.has(value);
}

export function bodyById(id: BodyId): BodyProfile {
  const found = BODIES.find((body) => body.id === id);
  if (!found) throw new Error("corpo desconhecido");
  return found;
}

function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function capsule(id: string, label: string, zone: ZoneId, a: Vec3, b: Vec3, r: number): Volume {
  return { id, label, zone, a, b, r };
}

export function assemble(profile: BodyProfile): Rig {
  const s = profile.stature;
  const w = profile.shoulder;
  const headR = profile.head / 2;
  const hipY = 0.47 * s;
  const kneeY = 0.27 * s;
  const ankleY = 0.045 * s;
  const shoulderY = 0.818 * s;
  const headC = s - headR - 0.01;
  const neckBase = shoulderY + 0.02 * s;
  const chestY = shoulderY - 0.11 * s;
  const abdY = (chestY + hipY) * 0.5;
  const shX = w * 0.5;
  const hipX = w * 0.22;
  const armR = 0.042 * (s / 1.78);
  const thighR = 0.075 * (w / 0.42);
  const shinR = thighR * 0.72;
  const elbowY = shoulderY - 0.186 * s;
  const wristY = elbowY - 0.16 * s;
  const handY = wristY - 0.04 * s;

  const shoulderR = v(shX, shoulderY, 0);
  const shoulderL = v(-shX, shoulderY, 0);
  const elbowR = v(shX + 0.02, elbowY, 0.03);
  const elbowL = v(-shX - 0.02, elbowY, 0.03);
  const wristR = v(shX + 0.03, wristY, 0.04);
  const wristL = v(-shX - 0.03, wristY, 0.04);
  const handR = v(shX + 0.03, handY, 0.05);
  const handL = v(-shX - 0.03, handY, 0.05);
  const hipR = v(hipX, hipY, 0);
  const hipL = v(-hipX, hipY, 0);
  const kneeR = v(hipX, kneeY, 0.02);
  const kneeL = v(-hipX, kneeY, 0.02);
  const ankleR = v(hipX, ankleY, 0);
  const ankleL = v(-hipX, ankleY, 0);
  const toeR = v(hipX, 0.02, 0.14);
  const toeL = v(-hipX, 0.02, 0.14);
  const neckTop = v(0, headC - headR * 0.15, 0);
  const neckBot = v(0, neckBase, 0);
  const chest = v(0, chestY, 0.02);
  const abd = v(0, abdY, 0.015);
  const pelvis = v(0, hipY + 0.04, 0);

  const volumes: Volume[] = [
    capsule("head", "Cabeça", "head", v(0, headC, 0.01), v(0, headC, 0.01), headR),
    capsule("neck", "Pescoço", "torso", neckBot, neckTop, headR * 0.42),
    capsule("chest", "Tórax", "torso", v(0, chest.y - 0.06, 0.02), v(0, chest.y + 0.05, 0.02), w * 0.28),
    capsule("abdomen", "Abdômen", "torso", v(0, abd.y - 0.04, 0.01), v(0, abd.y + 0.04, 0.02), w * 0.22),
    capsule("pelvis", "Pelve", "torso", pelvis, v(0, hipY - 0.02, 0), w * 0.24),
    capsule("arm-r", "Braço direito", "limb", shoulderR, elbowR, armR),
    capsule("arm-l", "Braço esquerdo", "limb", shoulderL, elbowL, armR),
    capsule("fore-r", "Antebraço direito", "limb", elbowR, wristR, armR * 0.86),
    capsule("fore-l", "Antebraço esquerdo", "limb", elbowL, wristL, armR * 0.86),
    capsule("hand-r", "Mão direita", "limb", wristR, handR, armR * 0.7),
    capsule("hand-l", "Mão esquerda", "limb", wristL, handL, armR * 0.7),
    capsule("thigh-r", "Coxa direita", "limb", hipR, kneeR, thighR),
    capsule("thigh-l", "Coxa esquerda", "limb", hipL, kneeL, thighR),
    capsule("shin-r", "Canela direita", "limb", kneeR, ankleR, shinR),
    capsule("shin-l", "Canela esquerda", "limb", kneeL, ankleL, shinR),
    capsule("foot-r", "Pé direito", "limb", ankleR, toeR, 0.04),
    capsule("foot-l", "Pé esquerdo", "limb", ankleL, toeL, 0.04),
  ];

  const crown = v(0, headC + headR, 0);
  const head = v(0, headC, 0.01);
  const bones: [Vec3, Vec3][] = [
    [crown, head],
    [head, neckBot],
    [neckBot, chest],
    [chest, abd],
    [abd, pelvis],
    [pelvis, hipR],
    [pelvis, hipL],
    [shoulderR, shoulderL],
    [shoulderR, elbowR],
    [elbowR, wristR],
    [wristR, handR],
    [shoulderL, elbowL],
    [elbowL, wristL],
    [wristL, handL],
    [hipR, kneeR],
    [kneeR, ankleR],
    [ankleR, toeR],
    [hipL, kneeL],
    [kneeL, ankleL],
    [ankleL, toeL],
  ];

  const reach = Math.hypot(handR.x - shoulderR.x, handR.y - shoulderR.y, handR.z - shoulderR.z);
  const capsuleRadius = Math.min(0.34, Math.max(0.22, w * 0.55));
  const capsuleHalfHeight = Math.max(0.2, s / 2 - capsuleRadius);

  return {
    profile,
    volumes,
    bones,
    eyeY: headC + headR * 0.15,
    reach,
    capsuleRadius,
    capsuleHalfHeight,
  };
}

export function classify(zone: ZoneId): { statute: "headshot" | "corpo"; note: string } {
  if (zone === "head") {
    return { statute: "headshot", note: "A cabeça classifica o golpe como headshot. O XP continua o da tabela." };
  }
  return { statute: "corpo", note: "Tronco e membro usam o dano da arma. A largura não soma XP." };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * abx + (py - ay) * aby) / len2));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

export function probeMeters(volumes: Volume[], view: ViewId, u: number, v: number): Volume | null {
  const hits = volumes
    .map((volume) => {
      const ax = view === "front" ? volume.a.x : volume.a.z;
      const bx = view === "front" ? volume.b.x : volume.b.z;
      const depth = view === "front" ? (volume.a.z + volume.b.z) / 2 : (volume.a.x + volume.b.x) / 2;
      return { volume, depth, dist: segDist(u, v, ax, volume.a.y, bx, volume.b.y) };
    })
    .filter((hit) => hit.dist <= hit.volume.r)
    .sort((a, b) => b.depth - a.depth);
  return hits[0]?.volume ?? null;
}
