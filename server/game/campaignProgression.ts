import { createHash } from "node:crypto";

/**
 * Khaaos Run — regras server-authoritative para Rings da campanha de sete dias.
 *
 * Este módulo é puro: o chamador confiável fornece roster, sobrevivência, HP e
 * métricas persistidas; o resultado deve ser salvo atomicamente. Nunca aceite
 * posições, vida, XP, abates ou status de sobrevivência enviados pelo cliente.
 */

export const CAMPAIGN_RULES_PROTOTYPE = Object.freeze({
  totalDays: 7,
  maxPlayers: 100,
  registrationTimeoutSeconds: 180,
  ringEvaluationSeconds: 10 * 60,
  dailyWindowHours: 12,
  rankedAttemptsPerDay: 1,
  promotionShare: 0.1,
  maximumAutomaticSurvivors: 10,
  protectionHours: [12, 24, 36, 72] as const,
});

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type CampaignStatus = "READY" | "IN_RING" | "ELIMINATED" | "COMPLETED";
export type CampaignOutcome = "QUALIFIED" | "ELIMINATED" | "CHAMPION";
export type RingFinishReason = "LAST_SURVIVOR" | "TIME_LIMIT";
export type CampaignResolutionReason =
  | "LAST_SURVIVOR"
  | "SURVIVED_AND_WITHIN_TOP_10"
  | "AUTOMATIC_ADVANCE_AT_TEN_OR_FEWER"
  | "OUTSIDE_TOP_10"
  | "DID_NOT_SURVIVE_TO_EVALUATION"
  | "FINAL_DAY_CHAMPION"
  | "FINAL_DAY_NOT_CHAMPION";

export interface CampaignProgress {
  version: 2;
  campaignId: string;
  playerId: string;
  day: number;
  status: CampaignStatus;
  attemptsUsedToday: number;
  activeMatchId: string | null;
  processedResults: CampaignResolution[];
}

export interface CampaignRosterCandidate {
  playerId: string;
  online: boolean;
  protectedUntilMs: number | null;
  /** When present, signed-up candidates sort by this time for capacity control. */
  registeredAtMs?: number;
}

export type CampaignRosterDecision =
  | { kind: "WAITING"; reason: "REGISTRATION_WINDOW" | "NOT_ENOUGH_ELIGIBLE_SURVIVORS"; remainingSlots: number }
  | { kind: "READY"; roster: CampaignRosterCandidate[]; filledRandomly: string[]; drawSeed: string | null };

export interface RingSurvivorMetrics {
  playerId: string;
  aliveAtEvaluation: boolean;
  /** Server-authoritative current HP at the 10-minute cutoff (or early finish). */
  currentHealth: number;
  /** Persistent account metrics snapshotted by the server. */
  accountXp: number;
  battlesPlayed: number;
  lifetimeKills: number;
  lifetimeDeaths: number;
  /** CSPRNG ticket persisted with the Ring; only consulted if every named metric ties. */
  randomTieBreak?: number;
}

export interface CampaignResolution {
  matchId: string;
  playerId: string;
  day: number;
  outcome: CampaignOutcome;
  participantCount: number;
  survivorCount: number;
  survivorRank: number | null;
  advancingLimit: number;
  advancedAutomatically: boolean;
  finishReason: RingFinishReason;
  currentHealth: number;
  accountXp: number;
  battlesPlayed: number;
  lifetimeKills: number;
  lifetimeDeaths: number;
  kdRatio: number;
  reason: CampaignResolutionReason;
}

export interface CampaignRingResolution {
  matchId: string;
  day: number;
  finishReason: RingFinishReason;
  participantCount: number;
  survivorCount: number;
  advancingLimit: number;
  orderedSurvivorIds: string[];
  advancingPlayerIds: string[];
  championId: string | null;
  results: CampaignResolution[];
}

export interface ApplyCampaignResolutionResult {
  progress: CampaignProgress;
  resolution: CampaignResolution;
  replayed: boolean;
}

function requireText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function assertDay(day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > CAMPAIGN_RULES_PROTOTYPE.totalDays) {
    throw new RangeError("CAMPAIGN_DAY_OUT_OF_RANGE");
  }
}

function assertProgress(progress: CampaignProgress): void {
  if (!progress || progress.version !== 2) throw new TypeError("INVALID_CAMPAIGN_PROGRESS");
  requireText(progress.campaignId, "campaignId");
  requireText(progress.playerId, "playerId");
  assertDay(progress.day);
  if (!( ["READY", "IN_RING", "ELIMINATED", "COMPLETED"] as string[]).includes(progress.status)) {
    throw new TypeError("INVALID_CAMPAIGN_STATUS");
  }
  if (progress.attemptsUsedToday !== 0 && progress.attemptsUsedToday !== 1) {
    throw new RangeError("INVALID_DAILY_ATTEMPT_COUNT");
  }
  if (progress.status === "IN_RING") {
    if (progress.attemptsUsedToday !== 1 || !progress.activeMatchId) {
      throw new TypeError("INVALID_ACTIVE_CAMPAIGN_ATTEMPT");
    }
  } else if (progress.activeMatchId !== null) {
    throw new TypeError("UNEXPECTED_ACTIVE_CAMPAIGN_MATCH");
  }
  if (progress.status === "READY" && progress.attemptsUsedToday !== 0) {
    throw new TypeError("READY_CAMPAIGN_DAY_MUST_HAVE_UNUSED_ATTEMPT");
  }
  if ((progress.status === "ELIMINATED" || progress.status === "COMPLETED") && progress.attemptsUsedToday !== 1) {
    throw new TypeError("TERMINAL_CAMPAIGN_STATE_MUST_HAVE_USED_ATTEMPT");
  }
  if (!Array.isArray(progress.processedResults) || progress.processedResults.length > CAMPAIGN_RULES_PROTOTYPE.totalDays) {
    throw new TypeError("INVALID_CAMPAIGN_RESULT_HISTORY");
  }
}

export function createCampaignProgress(campaignId: string, playerId: string): CampaignProgress {
  return {
    version: 2,
    campaignId: requireText(campaignId, "campaignId"),
    playerId: requireText(playerId, "playerId"),
    day: 1,
    status: "READY",
    attemptsUsedToday: 0,
    activeMatchId: null,
    processedResults: [],
  };
}

/** Consume the single attempt for the current campaign day using a server match ID. */
export function startCampaignAttempt(progress: CampaignProgress, matchId: string): CampaignProgress {
  assertProgress(progress);
  const normalizedMatchId = requireText(matchId, "matchId");
  if (progress.status !== "READY" || progress.attemptsUsedToday >= CAMPAIGN_RULES_PROTOTYPE.rankedAttemptsPerDay) {
    throw new Error("CAMPAIGN_ATTEMPT_NOT_AVAILABLE");
  }
  if (progress.processedResults.some((result) => result.matchId === normalizedMatchId)) {
    throw new Error("CAMPAIGN_MATCH_ALREADY_PROCESSED");
  }
  return {
    ...progress,
    status: "IN_RING",
    attemptsUsedToday: progress.attemptsUsedToday + 1,
    activeMatchId: normalizedMatchId,
  };
}

function isValidMetric(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Project convention: a zero-death K/D uses kills / 1 rather than infinity. */
export function campaignKdRatio(kills: number, deaths: number): number {
  if (!isValidMetric(kills) || !isValidMetric(deaths)) throw new RangeError("INVALID_CAMPAIGN_KD_METRICS");
  return kills / Math.max(1, deaths);
}

/** Deterministic PRNG adapter: persist the high-entropy seed to replay the roster draw. */
export function createCampaignRandomIndex(seed: string): (upperExclusive: number) => number {
  const normalizedSeed = requireText(seed, "drawSeed");
  let counter = 0;
  return (upperExclusive: number) => {
    if (!Number.isInteger(upperExclusive) || upperExclusive < 1) throw new RangeError("INVALID_RANDOM_UPPER_BOUND");
    const range = 0x1_0000_0000;
    const limit = range - (range % upperExclusive);
    while (true) {
      const bytes = createHash("sha256")
        .update(`KHAAOS-RUN-ROSTER-v1|${normalizedSeed}|${counter++}`)
        .digest();
      const value = bytes.readUInt32BE(0);
      if (value < limit) return value % upperExclusive;
    }
  };
}

function compareSurvivors(a: RingSurvivorMetrics, b: RingSurvivorMetrics): number {
  const kdA = campaignKdRatio(a.lifetimeKills, a.lifetimeDeaths);
  const kdB = campaignKdRatio(b.lifetimeKills, b.lifetimeDeaths);
  return b.currentHealth - a.currentHealth
    || b.accountXp - a.accountXp
    || b.battlesPlayed - a.battlesPlayed
    || kdB - kdA
    || (b.randomTieBreak ?? 0) - (a.randomTieBreak ?? 0)
    || a.playerId.localeCompare(b.playerId);
}

/**
 * Resolve one authoritative 100-player Ring as a group, so the top-10 cut is
 * applied once and consistently. At 10 or fewer survivors all advance on days
 * 1–6. On day 7, the same survivor ordering determines the champion if the
 * timer expires with multiple survivors; a last survivor wins immediately.
 */
export function resolveCampaignRing(input: {
  matchId: string;
  day: number;
  finishReason: RingFinishReason;
  participants: RingSurvivorMetrics[];
}): CampaignRingResolution {
  const matchId = requireText(input.matchId, "matchId");
  assertDay(input.day);
  if (input.finishReason !== "LAST_SURVIVOR" && input.finishReason !== "TIME_LIMIT") {
    throw new TypeError("INVALID_RING_FINISH_REASON");
  }
  if (!Array.isArray(input.participants) || input.participants.length !== CAMPAIGN_RULES_PROTOTYPE.maxPlayers) {
    throw new RangeError("CAMPAIGN_RING_REQUIRES_100_PARTICIPANTS");
  }
  const seen = new Set<string>();
  for (const participant of input.participants) {
    const playerId = requireText(participant.playerId, "playerId");
    if (seen.has(playerId)) throw new TypeError("DUPLICATE_CAMPAIGN_PLAYER");
    seen.add(playerId);
    if (typeof participant.aliveAtEvaluation !== "boolean") throw new TypeError("INVALID_SURVIVOR_STATUS");
    for (const metric of [participant.currentHealth, participant.accountXp, participant.battlesPlayed, participant.lifetimeKills, participant.lifetimeDeaths]) {
      if (!isValidMetric(metric)) throw new RangeError("INVALID_CAMPAIGN_RANKING_METRIC");
    }
    if (participant.aliveAtEvaluation && participant.currentHealth < 1) throw new RangeError("ALIVE_PLAYER_MUST_HAVE_POSITIVE_HP");
    if (!participant.aliveAtEvaluation && participant.currentHealth !== 0) throw new RangeError("ELIMINATED_PLAYER_MUST_HAVE_ZERO_HP_AT_EVALUATION");
    if (participant.randomTieBreak !== undefined && !isValidMetric(participant.randomTieBreak)) {
      throw new RangeError("INVALID_CAMPAIGN_RANDOM_TIE_BREAK");
    }
  }

  const survivors = input.participants.filter((participant) => participant.aliveAtEvaluation).slice().sort(compareSurvivors);
  const survivorCount = survivors.length;
  const advancingLimit = Math.floor(CAMPAIGN_RULES_PROTOTYPE.maxPlayers * CAMPAIGN_RULES_PROTOTYPE.promotionShare);
  const orderedSurvivorIds = survivors.map(({ playerId }) => playerId);
  const championId = input.day === CAMPAIGN_RULES_PROTOTYPE.totalDays ? (orderedSurvivorIds[0] ?? null) : null;
  const advancingPlayerIds = input.day === CAMPAIGN_RULES_PROTOTYPE.totalDays
    ? []
    : survivorCount <= CAMPAIGN_RULES_PROTOTYPE.maximumAutomaticSurvivors
      ? orderedSurvivorIds.slice()
      : orderedSurvivorIds.slice(0, advancingLimit);
  const survivorRanks = new Map(survivors.map((participant, index) => [participant.playerId, index + 1]));
  const advancing = new Set(advancingPlayerIds);
  const results = input.participants.map((participant): CampaignResolution => {
    const survivorRank = survivorRanks.get(participant.playerId) ?? null;
    const rank = survivorRank;
    let outcome: CampaignOutcome;
    let reason: CampaignResolutionReason;
    let advancedAutomatically = false;

    if (input.day === CAMPAIGN_RULES_PROTOTYPE.totalDays) {
      outcome = participant.playerId === championId ? "CHAMPION" : "ELIMINATED";
      reason = outcome === "CHAMPION" ? "FINAL_DAY_CHAMPION" : "FINAL_DAY_NOT_CHAMPION";
    } else if (!participant.aliveAtEvaluation) {
      outcome = "ELIMINATED";
      reason = "DID_NOT_SURVIVE_TO_EVALUATION";
    } else if (advancing.has(participant.playerId)) {
      outcome = "QUALIFIED";
      advancedAutomatically = survivorCount <= CAMPAIGN_RULES_PROTOTYPE.maximumAutomaticSurvivors;
      reason = advancedAutomatically
        ? input.finishReason === "LAST_SURVIVOR" && survivorCount === 1
          ? "LAST_SURVIVOR"
          : "AUTOMATIC_ADVANCE_AT_TEN_OR_FEWER"
        : "SURVIVED_AND_WITHIN_TOP_10";
    } else {
      outcome = "ELIMINATED";
      reason = "OUTSIDE_TOP_10";
    }

    return {
      matchId,
      playerId: participant.playerId,
      day: input.day,
      outcome,
      participantCount: input.participants.length,
      survivorCount,
      survivorRank: rank,
      advancingLimit: input.day === CAMPAIGN_RULES_PROTOTYPE.totalDays ? 1 : advancingLimit,
      advancedAutomatically,
      finishReason: input.finishReason,
      currentHealth: participant.currentHealth,
      accountXp: participant.accountXp,
      battlesPlayed: participant.battlesPlayed,
      lifetimeKills: participant.lifetimeKills,
      lifetimeDeaths: participant.lifetimeDeaths,
      kdRatio: campaignKdRatio(participant.lifetimeKills, participant.lifetimeDeaths),
      reason,
    };
  });

  return {
    matchId,
    day: input.day,
    finishReason: input.finishReason,
    participantCount: input.participants.length,
    survivorCount,
    advancingLimit: input.day === CAMPAIGN_RULES_PROTOTYPE.totalDays ? 1 : advancingLimit,
    orderedSurvivorIds,
    advancingPlayerIds,
    championId,
    results,
  };
}

/** Apply a group resolution to one player's persisted progression snapshot. */
export function applyCampaignResolution(
  progress: CampaignProgress,
  resolution: CampaignResolution,
): ApplyCampaignResolutionResult {
  assertProgress(progress);
  const matchId = requireText(resolution.matchId, "matchId");
  if (resolution.playerId !== progress.playerId) throw new TypeError("CAMPAIGN_RESULT_PLAYER_MISMATCH");
  const previous = progress.processedResults.find((entry) => entry.matchId === matchId);
  if (previous) return { progress, resolution: previous, replayed: true };
  if (progress.status !== "IN_RING" || progress.activeMatchId !== matchId || progress.day !== resolution.day) {
    throw new Error("CAMPAIGN_MATCH_NOT_ACTIVE");
  }

  const nextProgress: CampaignProgress = {
    ...progress,
    day: resolution.outcome === "QUALIFIED" ? progress.day + 1 : progress.day,
    status: resolution.outcome === "QUALIFIED" ? "READY" : resolution.outcome === "CHAMPION" ? "COMPLETED" : "ELIMINATED",
    attemptsUsedToday: resolution.outcome === "QUALIFIED" ? 0 : progress.attemptsUsedToday,
    activeMatchId: null,
    processedResults: [...progress.processedResults, resolution],
  };
  return { progress: nextProgress, resolution, replayed: false };
}

/**
 * Registration cannot be withdrawn by the player. Before the 3-minute cutoff,
 * the system waits for 100 sign-ups. At timeout it fills vacant slots randomly
 * from unprotected surviving candidates, whether online or offline. A partial
 * Ring is never started.
 */
export function decideCampaignRoster(input: {
  openedAtMs: number;
  nowMs: number;
  registered: CampaignRosterCandidate[];
  eligibleSurvivors: CampaignRosterCandidate[];
  drawSeed: string;
  randomIndex?: (upperExclusive: number) => number;
}): CampaignRosterDecision {
  if (!Number.isSafeInteger(input.openedAtMs) || !Number.isSafeInteger(input.nowMs) || input.nowMs < input.openedAtMs) {
    throw new RangeError("INVALID_CAMPAIGN_REGISTRATION_TIME");
  }
  const openedAtMs = input.openedAtMs;
  const elapsedMs = input.nowMs - openedAtMs;
  const timeoutMs = CAMPAIGN_RULES_PROTOTYPE.registrationTimeoutSeconds * 1000;
  const registered = input.registered.slice().sort((a, b) => (a.registeredAtMs ?? 0) - (b.registeredAtMs ?? 0) || a.playerId.localeCompare(b.playerId));
  const signedIds = new Set<string>();
  for (const candidate of registered) {
    requireText(candidate.playerId, "playerId");
    if (signedIds.has(candidate.playerId)) throw new TypeError("DUPLICATE_CAMPAIGN_REGISTRATION");
    signedIds.add(candidate.playerId);
  }
  if (registered.length > CAMPAIGN_RULES_PROTOTYPE.maxPlayers) throw new RangeError("CAMPAIGN_REGISTRATION_CAPACITY_EXCEEDED");
  if (registered.length === CAMPAIGN_RULES_PROTOTYPE.maxPlayers) {
    return { kind: "READY", roster: registered, filledRandomly: [], drawSeed: null };
  }

  const remainingSlots = CAMPAIGN_RULES_PROTOTYPE.maxPlayers - registered.length;
  if (elapsedMs < timeoutMs) {
    return { kind: "WAITING", reason: "REGISTRATION_WINDOW", remainingSlots };
  }

  const candidates = input.eligibleSurvivors.filter((candidate) => {
    requireText(candidate.playerId, "playerId");
    return !signedIds.has(candidate.playerId)
      && !(candidate.protectedUntilMs !== null && candidate.protectedUntilMs > input.nowMs);
  });
  const uniqueCandidates = new Map<string, CampaignRosterCandidate>();
  for (const candidate of candidates) {
    if (!uniqueCandidates.has(candidate.playerId)) uniqueCandidates.set(candidate.playerId, candidate);
  }
  const pool = [...uniqueCandidates.values()];
  if (pool.length < remainingSlots) {
    return { kind: "WAITING", reason: "NOT_ENOUGH_ELIGIBLE_SURVIVORS", remainingSlots };
  }
  if (!input.drawSeed.trim()) throw new TypeError("CAMPAIGN_DRAW_SEED_REQUIRED");

  const shuffled = pool.slice();
  const randomIndex = input.randomIndex ?? createCampaignRandomIndex(input.drawSeed);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const index = randomIndex(i + 1);
    if (!Number.isInteger(index) || index < 0 || index > i) throw new RangeError("INVALID_CAMPAIGN_RANDOM_INDEX");
    [shuffled[i], shuffled[index]] = [shuffled[index], shuffled[i]];
  }
  const selected = shuffled.slice(0, remainingSlots);
  return {
    kind: "READY",
    roster: [...registered, ...selected],
    filledRandomly: selected.map(({ playerId }) => playerId),
    drawSeed: input.drawSeed,
  };
}

/** Check the 12-hour UTC intake window; each campaign day is a 24-hour interval. */
export function campaignWindowAt(startedAtMs: number, nowMs: number) {
  if (!Number.isSafeInteger(startedAtMs) || !Number.isSafeInteger(nowMs) || nowMs < startedAtMs) {
    return { open: false, day: null as number | null, opensAtMs: null as number | null, closesAtMs: null as number | null };
  }
  const day = Math.floor((nowMs - startedAtMs) / DAY_MS) + 1;
  if (day < 1 || day > CAMPAIGN_RULES_PROTOTYPE.totalDays) {
    return { open: false, day: null as number | null, opensAtMs: null as number | null, closesAtMs: null as number | null };
  }
  const opensAtMs = startedAtMs + (day - 1) * DAY_MS;
  const closesAtMs = opensAtMs + CAMPAIGN_RULES_PROTOTYPE.dailyWindowHours * HOUR_MS;
  return { open: nowMs < closesAtMs, day, opensAtMs, closesAtMs };
}

/** Protect against random campaign selection for a duration; duration never shortens an active protection. */
export function extendRingProtection(existingUntilMs: number | null, durationHours: number, nowMs: number): number {
  if (!CAMPAIGN_RULES_PROTOTYPE.protectionHours.includes(durationHours as 12 | 24 | 36 | 72)) {
    throw new RangeError("INVALID_RING_PROTECTION_DURATION");
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError("INVALID_RING_PROTECTION_TIME");
  const base = existingUntilMs !== null && Number.isSafeInteger(existingUntilMs) ? Math.max(nowMs, existingUntilMs) : nowMs;
  return base + durationHours * HOUR_MS;
}
