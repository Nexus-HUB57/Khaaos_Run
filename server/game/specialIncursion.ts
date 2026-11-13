import { createCampaignRandomIndex } from "./campaignProgression.ts";

/** Valores de protótipo para a CIE; eventos reais continuam desligados até integração e aprovação. */
export const CIE_RULES_PROTOTYPE = Object.freeze({
  capacity: 100,
  survivorSlots: 90,
  eliminatedSlotsMax: 10,
  registrationSeconds: 180,
  retryWindowSeconds: 30 * 60,
  maximumEventsPerDay: 1,
  campaignReturnThroughDay: 6,
  returnPlacementCut: 10,
  ringDurationSeconds: 10 * 60,
});

export type CieTriggerDecision =
  | { kind: "WAITING"; reason: "REGULAR_WINDOW_OPEN" | "BEFORE_SCHEDULED_TRIGGER" | "REGULAR_RING_ACTIVE" | "INSUFFICIENT_ONLINE_POOL"; retryUntilMs: number }
  | { kind: "OPEN"; day: number; registrationClosesAtMs: number }
  | { kind: "EXPIRED"; reason: "POOL_OR_RING_GATE_NOT_MET" }
  | { kind: "UNAVAILABLE"; reason: "DAY_OUT_OF_RANGE" | "DAY_7_HAS_NO_CAMPAIGN_RETURN" | "CIE_ALREADY_OPENED_TODAY" };

export interface CieTriggerInput {
  campaignDay: number;
  nowMs: number;
  regularWindowClosesAtMs: number;
  scheduledTriggerAtMs: number;
  retryUntilMs: number;
  activeRegularRings: number;
  onlineSurvivors: number;
  onlineEliminated: number;
  cieAlreadyOpenedToday: boolean;
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * The scheduler keeps scheduledTriggerAtMs private. A CIE can open only after
 * the regular 12-hour window and after all regular Rings resolve. Days 1–6 are
 * return-capable; day 7 is deliberately excluded from campaign resurrection.
 */
export function evaluateCieTrigger(input: CieTriggerInput): CieTriggerDecision {
  if (!Number.isInteger(input.campaignDay) || input.campaignDay < 1 || input.campaignDay > 7) {
    return { kind: "UNAVAILABLE", reason: "DAY_OUT_OF_RANGE" };
  }
  if (input.campaignDay === 7) return { kind: "UNAVAILABLE", reason: "DAY_7_HAS_NO_CAMPAIGN_RETURN" };
  if (input.cieAlreadyOpenedToday) return { kind: "UNAVAILABLE", reason: "CIE_ALREADY_OPENED_TODAY" };
  if (![input.nowMs, input.regularWindowClosesAtMs, input.scheduledTriggerAtMs, input.retryUntilMs].every(validTime)
    || input.retryUntilMs < input.scheduledTriggerAtMs
    || !Number.isInteger(input.activeRegularRings) || input.activeRegularRings < 0
    || !Number.isInteger(input.onlineSurvivors) || input.onlineSurvivors < 0
    || !Number.isInteger(input.onlineEliminated) || input.onlineEliminated < 0) {
    throw new RangeError("INVALID_CIE_TRIGGER_INPUT");
  }
  if (input.nowMs < input.regularWindowClosesAtMs) {
    return { kind: "WAITING", reason: "REGULAR_WINDOW_OPEN", retryUntilMs: input.retryUntilMs };
  }
  if (input.nowMs < input.scheduledTriggerAtMs) {
    return { kind: "WAITING", reason: "BEFORE_SCHEDULED_TRIGGER", retryUntilMs: input.retryUntilMs };
  }

  const enoughOnlinePool = input.onlineSurvivors >= CIE_RULES_PROTOTYPE.survivorSlots
    && input.onlineEliminated >= 1;
  const gatesMet = input.activeRegularRings === 0 && enoughOnlinePool;
  if (gatesMet) {
    return {
      kind: "OPEN",
      day: input.campaignDay,
      registrationClosesAtMs: input.nowMs + CIE_RULES_PROTOTYPE.registrationSeconds * 1000,
    };
  }
  if (input.nowMs >= input.retryUntilMs) return { kind: "EXPIRED", reason: "POOL_OR_RING_GATE_NOT_MET" };
  return {
    kind: "WAITING",
    reason: input.activeRegularRings > 0 ? "REGULAR_RING_ACTIVE" : "INSUFFICIENT_ONLINE_POOL",
    retryUntilMs: input.retryUntilMs,
  };
}

export interface CieCandidate {
  playerId: string;
  /** Must be online at roster lock; CIE never auto-selects offline accounts. */
  online: boolean;
  /** A previous successful return disqualifies this account from another return. */
  alreadyReturned?: boolean;
}

export type CieRosterDecision =
  | { kind: "WAITING"; reason: "REGISTRATION_WINDOW" | "NEED_90_ONLINE_SURVIVORS" | "NEED_ONLINE_ELIMINATED" }
  | { kind: "READY"; day: number; survivorIds: string[]; eliminatedIds: string[]; rosterIds: string[]; seed: string };

function requirePlayerId(playerId: string): string {
  if (typeof playerId !== "string" || !playerId.trim()) throw new TypeError("CIE_PLAYER_ID_REQUIRED");
  return playerId.trim();
}

function seededSample<T extends { playerId: string }>(candidates: T[], count: number, seed: string): T[] {
  const ordered = candidates.slice().sort((a, b) => a.playerId.localeCompare(b.playerId));
  if (ordered.length <= count) return ordered;
  const randomIndex = createCampaignRandomIndex(seed);
  for (let i = ordered.length - 1; i > 0; i -= 1) {
    const index = randomIndex(i + 1);
    [ordered[i], ordered[index]] = [ordered[index], ordered[i]];
  }
  return ordered.slice(0, count);
}

/**
 * Lock a CIE roster after its 3-minute online sign-up. Exactly 90 seats are
 * reserved for active survivors; 1–10 seats may be filled by eliminated users.
 * Unused return seats stay vacant; survivors never take the eliminated quota.
 */
export function decideCieRoster(input: {
  campaignDay: number;
  openedAtMs: number;
  nowMs: number;
  survivorSignups: CieCandidate[];
  eliminatedSignups: CieCandidate[];
  seed: string;
}): CieRosterDecision {
  if (!Number.isInteger(input.campaignDay) || input.campaignDay < 1 || input.campaignDay > CIE_RULES_PROTOTYPE.campaignReturnThroughDay) {
    throw new RangeError("CIE_RETURN_NOT_AVAILABLE_ON_THIS_DAY");
  }
  if (!validTime(input.openedAtMs) || !validTime(input.nowMs) || input.nowMs < input.openedAtMs) {
    throw new RangeError("INVALID_CIE_REGISTRATION_TIME");
  }
  const closesAt = input.openedAtMs + CIE_RULES_PROTOTYPE.registrationSeconds * 1000;
  if (input.nowMs < closesAt) return { kind: "WAITING", reason: "REGISTRATION_WINDOW" };
  if (typeof input.seed !== "string" || !input.seed.trim()) throw new TypeError("CIE_DRAW_SEED_REQUIRED");

  const survivors = new Map<string, CieCandidate>();
  for (const candidate of input.survivorSignups) {
    const playerId = requirePlayerId(candidate.playerId);
    if (survivors.has(playerId)) throw new TypeError("DUPLICATE_CIE_SIGNUP");
    if (candidate.online) survivors.set(playerId, { ...candidate, playerId });
  }
  const eliminated = new Map<string, CieCandidate>();
  for (const candidate of input.eliminatedSignups) {
    const playerId = requirePlayerId(candidate.playerId);
    if (survivors.has(playerId) || eliminated.has(playerId)) throw new TypeError("DUPLICATE_CIE_SIGNUP");
    if (candidate.online && !candidate.alreadyReturned) eliminated.set(playerId, { ...candidate, playerId });
  }
  if (survivors.size < CIE_RULES_PROTOTYPE.survivorSlots) return { kind: "WAITING", reason: "NEED_90_ONLINE_SURVIVORS" };
  if (eliminated.size < 1) return { kind: "WAITING", reason: "NEED_ONLINE_ELIMINATED" };

  const seed = input.seed.trim();
  const survivorIds = seededSample([...survivors.values()], CIE_RULES_PROTOTYPE.survivorSlots, `${seed}|survivors`)
    .map(({ playerId }) => playerId);
  const eliminatedIds = seededSample([...eliminated.values()], CIE_RULES_PROTOTYPE.eliminatedSlotsMax, `${seed}|eliminated`)
    .map(({ playerId }) => playerId);
  return {
    kind: "READY",
    day: input.campaignDay,
    survivorIds,
    eliminatedIds,
    rosterIds: [...survivorIds, ...eliminatedIds],
    seed,
  };
}

export type CieReturnDecision =
  | { outcome: "REMAINS_ELIMINATED"; nextCampaignDay: null; returnEligible: false }
  | { outcome: "RETURN_NEXT_DAY"; nextCampaignDay: number; returnEligible: true; reason: "TOP_10_RESULT" | "RETURN_SEAL_AND_SURVIVED" }
  | { outcome: "SURVIVOR_REMAINS_ACTIVE"; nextCampaignDay: number; returnEligible: false }
  | { outcome: "SURVIVOR_ELIMINATED_IN_CIE"; nextCampaignDay: null; returnEligible: false };

/** Resolve only the return entitlement; durable status change must be transactional and idempotent. */
export function resolveCieReturn(input: {
  role: "SURVIVOR" | "ELIMINATED";
  campaignDay: number;
  finalPlacement: number;
  aliveAtEnd: boolean;
  hasReturnSeal: boolean;
  alreadyReturned: boolean;
}): CieReturnDecision {
  if (!Number.isInteger(input.campaignDay) || input.campaignDay < 1 || input.campaignDay > 7
    || !Number.isInteger(input.finalPlacement) || input.finalPlacement < 1
    || typeof input.aliveAtEnd !== "boolean" || typeof input.hasReturnSeal !== "boolean"
    || typeof input.alreadyReturned !== "boolean") {
    throw new RangeError("INVALID_CIE_RESULT");
  }
  if (input.role === "SURVIVOR") {
    return input.aliveAtEnd
      ? { outcome: "SURVIVOR_REMAINS_ACTIVE", nextCampaignDay: Math.min(7, input.campaignDay + 1), returnEligible: false }
      : { outcome: "SURVIVOR_ELIMINATED_IN_CIE", nextCampaignDay: null, returnEligible: false };
  }
  if (input.role !== "ELIMINATED") throw new TypeError("INVALID_CIE_PARTICIPANT_ROLE");
  if (input.campaignDay > CIE_RULES_PROTOTYPE.campaignReturnThroughDay || input.alreadyReturned) {
    return { outcome: "REMAINS_ELIMINATED", nextCampaignDay: null, returnEligible: false };
  }
  if (input.finalPlacement <= CIE_RULES_PROTOTYPE.returnPlacementCut) {
    return { outcome: "RETURN_NEXT_DAY", nextCampaignDay: input.campaignDay + 1, returnEligible: true, reason: "TOP_10_RESULT" };
  }
  if (input.aliveAtEnd && input.hasReturnSeal) {
    return { outcome: "RETURN_NEXT_DAY", nextCampaignDay: input.campaignDay + 1, returnEligible: true, reason: "RETURN_SEAL_AND_SURVIVED" };
  }
  return { outcome: "REMAINS_ELIMINATED", nextCampaignDay: null, returnEligible: false };
}
