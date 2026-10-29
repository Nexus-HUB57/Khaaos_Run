import { GAIT_LAW, gaitOf, type GaitGear, type Rig, type Volume } from "./body-geometry.ts";

/** Massa de referência 76 kg em 1,78 m com ombro de 0,44 m. O kit é o mesmo para os nove. */
export const BIOMECH = {
  refMassKg: 76,
  refShoulder: 0.44,
  kitKg: 8,
  fractions: {
    head: 0.081,
    trunk: 0.497,
    arm: 0.028,
    forearm: 0.016,
    hand: 0.006,
    thigh: 0.1,
    shank: 0.0465,
    foot: 0.0145,
  },
  swing: {
    walk: { thigh: 0.15, clearance: 0.1 },
    jog: { thigh: 0.2, clearance: 0.16 },
    sprint: { thigh: 0.25, clearance: 0.22 },
  },
  duty: { walk: 0.62, jog: 0.45, sprint: 0.32 },
  grf: { walk: 1.2, jog: 2.2, sprint: 2.8 },
} as const;

export interface SegmentRead {
  id: string;
  label: string;
  length: number;
  mass: number;
  side: "axial" | "pair";
}

export interface BiomechRead {
  mass: number;
  kit: number;
  total: number;
  comY: number;
  thigh: number;
  shank: number;
  arm: number;
  forearm: number;
  foot: number;
  segments: SegmentRead[];
  froude: number;
  stance: number;
  swing: number;
  flight: number;
  grf: number;
  grfBw: number;
  yawInertia: number;
  turn180: number;
  knee: number;
  clearance: number;
  hipDrop: number;
  airborne: boolean;
}

function volume(rig: Rig, id: string): Volume {
  const found = rig.volumes.find((item) => item.id === id);
  if (!found) throw new Error("volume ausente");
  return found;
}

function lengthOf(item: Volume): number {
  return Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y, item.b.z - item.a.z);
}

function mid(item: Volume): { x: number; y: number; z: number } {
  return {
    x: (item.a.x + item.b.x) / 2,
    y: (item.a.y + item.b.y) / 2,
    z: (item.a.z + item.b.z) / 2,
  };
}

export function bodyMass(rig: Rig): number {
  const stature = rig.profile.stature / GAIT_LAW.refStature;
  const shoulder = rig.profile.shoulder / BIOMECH.refShoulder;
  return BIOMECH.refMassKg * stature * shoulder * shoulder;
}

function kneeClearance(thigh: number, shank: number, hipY: number, alpha: number, clearance: number): number {
  for (let deg = 0; deg <= 150; deg += 1) {
    const phi = (deg * Math.PI) / 180;
    const footY = hipY - thigh * Math.cos(alpha) - shank * Math.cos(alpha - phi);
    if (footY >= clearance) return deg;
  }
  return 150;
}

export function biomechOf(rig: Rig, gear: GaitGear): BiomechRead {
  const mass = bodyMass(rig);
  const kit = BIOMECH.kitKg;
  const fractions = BIOMECH.fractions;
  const head = volume(rig, "head");
  const chest = volume(rig, "chest");
  const abdomen = volume(rig, "abdomen");
  const pelvis = volume(rig, "pelvis");
  const arm = volume(rig, "arm-r");
  const forearm = volume(rig, "fore-r");
  const hand = volume(rig, "hand-r");
  const thigh = volume(rig, "thigh-r");
  const shank = volume(rig, "shin-r");
  const foot = volume(rig, "foot-r");
  const armL = lengthOf(arm);
  const forearmL = lengthOf(forearm);
  const handL = lengthOf(hand);
  const thighL = lengthOf(thigh);
  const shankL = lengthOf(shank);
  const footL = lengthOf(foot);
  const trunkLength = lengthOf(chest) + lengthOf(abdomen) + lengthOf(pelvis);
  const trunkY =
    (mid(chest).y * lengthOf(chest) + mid(abdomen).y * lengthOf(abdomen) + mid(pelvis).y * lengthOf(pelvis)) / trunkLength;

  const segments: SegmentRead[] = [
    { id: "head", label: "Cabeça e pescoço", length: lengthOf(head), mass: fractions.head * mass, side: "axial" },
    { id: "trunk", label: "Tronco", length: trunkLength, mass: fractions.trunk * mass, side: "axial" },
    { id: "arm", label: "Braço", length: armL, mass: fractions.arm * mass, side: "pair" },
    { id: "forearm", label: "Antebraço", length: forearmL, mass: fractions.forearm * mass, side: "pair" },
    { id: "hand", label: "Mão", length: handL, mass: fractions.hand * mass, side: "pair" },
    { id: "thigh", label: "Coxa", length: thighL, mass: fractions.thigh * mass, side: "pair" },
    { id: "shank", label: "Canela", length: shankL, mass: fractions.shank * mass, side: "pair" },
    { id: "foot", label: "Pé", length: footL, mass: fractions.foot * mass, side: "pair" },
  ];

  const placed = [
    { ...mid(head), m: fractions.head * mass, rg: lengthOf(head) / 4 },
    { x: 0, y: trunkY, z: 0.02, m: fractions.trunk * mass, rg: rig.profile.shoulder * 0.28 },
    { ...mid(arm), m: fractions.arm * mass, rg: arm.r },
    { ...mid(volume(rig, "arm-l")), m: fractions.arm * mass, rg: arm.r },
    { ...mid(forearm), m: fractions.forearm * mass, rg: forearm.r },
    { ...mid(volume(rig, "fore-l")), m: fractions.forearm * mass, rg: forearm.r },
    { ...mid(hand), m: fractions.hand * mass, rg: hand.r },
    { ...mid(volume(rig, "hand-l")), m: fractions.hand * mass, rg: hand.r },
    { ...mid(thigh), m: fractions.thigh * mass, rg: thigh.r },
    { ...mid(volume(rig, "thigh-l")), m: fractions.thigh * mass, rg: thigh.r },
    { ...mid(shank), m: fractions.shank * mass, rg: shank.r },
    { ...mid(volume(rig, "shin-l")), m: fractions.shank * mass, rg: shank.r },
    { ...mid(foot), m: fractions.foot * mass, rg: foot.r },
    { ...mid(volume(rig, "foot-l")), m: fractions.foot * mass, rg: foot.r },
    { ...mid(chest), m: kit, rg: rig.profile.shoulder * 0.22 },
  ];
  const total = mass + kit;
  const comY = placed.reduce((sum, part) => sum + part.m * part.y, 0) / total;
  const yawInertia = placed.reduce((sum, part) => sum + part.m * (part.x * part.x + part.z * part.z + part.rg * part.rg), 0);
  const hipX = Math.abs(mid(thigh).x);
  const torque = GAIT_LAW.friction * total * GAIT_LAW.g * Math.max(0.08, hipX);
  const turn180 = 2 * Math.sqrt(Math.PI / (torque / yawInertia));

  const gait = gaitOf(rig);
  const read = gait.gears[gear];
  const period = 60 / read.cadence;
  const duty = BIOMECH.duty[gear];
  const stance = duty * period;
  const swingTime = (1 - duty) * period;
  const flight = duty < 0.5 ? (1 - 2 * duty) * period : 0;
  const froude = (read.speed * read.speed) / (GAIT_LAW.g * gait.leg);
  const law = BIOMECH.swing[gear];
  const hipY = GAIT_LAW.hipOfStature * rig.profile.stature;
  const offset = Math.min(read.step / 2, gait.leg * 0.98);
  const reached = Math.sqrt(Math.max(0, gait.leg * gait.leg - offset * offset));

  return {
    mass,
    kit,
    total,
    comY,
    thigh: thighL,
    shank: shankL,
    arm: armL,
    forearm: forearmL,
    foot: footL,
    segments,
    froude,
    stance,
    swing: swingTime,
    flight,
    grf: BIOMECH.grf[gear] * total * GAIT_LAW.g,
    grfBw: BIOMECH.grf[gear],
    yawInertia,
    turn180,
    knee: kneeClearance(thighL, shankL, hipY, law.thigh, law.clearance),
    clearance: law.clearance,
    hipDrop: Math.max(0, gait.leg - reached),
    airborne: froude > 0.5,
  };
}
