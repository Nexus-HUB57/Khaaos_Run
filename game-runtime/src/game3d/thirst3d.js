// Khaaos Run — Sistema de Sede (Vitalidade / UKhaaosVitalityComponent parity)
// =============================================================================
// Espelho do sistema de fome (hunger3d.js). Atributo 0..100 (100 = hidratado).
// Drena com o tempo; mais rápido sob sprint, calor de mundo (Ckesalth) e pressão
// do anel. Limiares: WARN / WEAK / DEHYDRATE com penalidades de stamina e DPS.

export const THIRST = Object.freeze({
  MAX: 100,
  /** ~10 min do cheio ao vazio (um pouco mais agressivo que a fome). */
  DRAIN_IDLE: 100 / (10 * 60),
  DRAIN_SPRINT_MUL: 2.5,
  DRAIN_RING_MUL: 1.4,
  /** Mundos áridos (Ckesalth) aceleram a sede. */
  DRAIN_ARID_MUL: 1.55,
  /** Recuperação por 1 cantil / água de Safe Pack. */
  WATER_RESTORE: 32,
  WATER_STACK_MAX: 5,
  DRINK_COOLDOWN: 1.0,
  WARN_BELOW: 40,
  WEAK_BELOW: 22,
  DEHYDRATE_BELOW: 7,
  WEAK_DPS: 0.4,
  DEHYDRATE_DPS: 1.6,
  WARN_STAMINA_REGEN: 0.6,
  WEAK_SPEED: 0.9,
  DEHYDRATE_SPEED: 0.7,
});

export function thirstTier(thirst) {
  const h = Number(thirst);
  if (!Number.isFinite(h) || h <= THIRST.DEHYDRATE_BELOW) return 'dehydrate';
  if (h <= THIRST.WEAK_BELOW) return 'weak';
  if (h <= THIRST.WARN_BELOW) return 'warn';
  return 'ok';
}

export function thirstEffects(thirst) {
  const tier = thirstTier(thirst);
  switch (tier) {
    case 'dehydrate':
      return {
        tier, speedMul: THIRST.DEHYDRATE_SPEED, staminaRegenMul: 0.3,
        vitalityDps: THIRST.DEHYDRATE_DPS, label: 'DESIDRATAÇÃO',
      };
    case 'weak':
      return {
        tier, speedMul: THIRST.WEAK_SPEED, staminaRegenMul: 0.45,
        vitalityDps: THIRST.WEAK_DPS, label: 'SEDE',
      };
    case 'warn':
      return {
        tier, speedMul: 1, staminaRegenMul: THIRST.WARN_STAMINA_REGEN,
        vitalityDps: 0, label: 'SEDE',
      };
    default:
      return { tier: 'ok', speedMul: 1, staminaRegenMul: 1, vitalityDps: 0, label: '' };
  }
}

export function tickThirst(actor, dt, opts = {}) {
  if (!actor || opts.alive === false || actor.alive === false) {
    return { drained: 0, tier: thirstTier(actor?.thirst ?? THIRST.MAX), effects: thirstEffects(actor?.thirst ?? THIRST.MAX), vitalityDamage: 0 };
  }
  if (!Number.isFinite(actor.thirst)) actor.thirst = THIRST.MAX;

  let rate = THIRST.DRAIN_IDLE;
  if (opts.sprinting || opts.sliding || actor.sprinting || actor.sliding) rate *= THIRST.DRAIN_SPRINT_MUL;
  const pressure = Math.max(0, Math.min(1, opts.ringPressure ?? 0));
  if (pressure > 0) rate *= 1 + (THIRST.DRAIN_RING_MUL - 1) * pressure;
  if (opts.arid) rate *= THIRST.DRAIN_ARID_MUL;

  const before = actor.thirst;
  actor.thirst = Math.max(0, actor.thirst - rate * Math.max(0, dt));
  const effects = thirstEffects(actor.thirst);
  actor.thirstTier = effects.tier;
  const vitalityDamage = effects.vitalityDps * Math.max(0, dt);
  return { drained: before - actor.thirst, tier: effects.tier, effects, vitalityDamage };
}

export function drinkWater(actor, opts = {}) {
  if (!actor?.inventory) return { ok: false, restored: 0, thirst: actor?.thirst ?? 0, reason: 'no-inventory' };
  const water = actor.inventory.water ?? 0;
  if (water < 1) return { ok: false, restored: 0, thirst: actor.thirst ?? THIRST.MAX, reason: 'no-water' };
  if ((actor.drinkCd ?? 0) > 0 && !opts.ignoreCooldown) {
    return { ok: false, restored: 0, thirst: actor.thirst ?? THIRST.MAX, reason: 'cooldown' };
  }
  const before = Number.isFinite(actor.thirst) ? actor.thirst : THIRST.MAX;
  if (before >= THIRST.MAX - 0.5) return { ok: false, restored: 0, thirst: before, reason: 'full' };

  actor.inventory.water = water - 1;
  const restore = opts.restore ?? THIRST.WATER_RESTORE;
  actor.thirst = Math.min(THIRST.MAX, before + restore);
  actor.thirstTier = thirstTier(actor.thirst);
  actor.drinkCd = THIRST.DRINK_COOLDOWN;
  return { ok: true, restored: actor.thirst - before, thirst: actor.thirst };
}

export function pickupWater(actor, amount = 1) {
  if (!actor?.inventory) return 0;
  const cur = actor.inventory.water ?? 0;
  const add = Math.max(0, Math.floor(amount));
  const next = Math.min(THIRST.WATER_STACK_MAX, cur + add);
  actor.inventory.water = next;
  return next - cur;
}

export function thirstSnapshot(actor) {
  const thirst = Number.isFinite(actor?.thirst) ? actor.thirst : THIRST.MAX;
  const effects = thirstEffects(thirst);
  return {
    thirst,
    max: THIRST.MAX,
    tier: effects.tier,
    label: effects.label,
    water: actor?.inventory?.water ?? 0,
    speedMul: effects.speedMul,
    staminaRegenMul: effects.staminaRegenMul,
  };
}
