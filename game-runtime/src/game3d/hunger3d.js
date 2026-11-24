// Khaaos Run — Sistema de Fome (Vitalidade / UKhaaosVitalityComponent parity)
// =============================================================================
// Atributo de sobrevivência 0..100 (100 = saciado). Drena com o tempo e mais
// rápido sob esforço (sprint/slide). Abaixo de limiares aplica penalidades:
//   WARN   — stamina regenera mais devagar
//   WEAK   — velocidade reduzida + drain de vida leve
//   STARVE — drain de vida agressivo (morte por inanição possível)
//
// Contrato puro (headless / testável): tickHunger, eatFood, hungerEffects.
// A sim (sim3d) aplica o resultado em player.life / speed / stamina.

/** Limiares e taxas canônicas (segundos de match ~10–15 min). */
export const HUNGER = Object.freeze({
  MAX: 100,
  /** Drain base por segundo em repouso / caminhada. */
  DRAIN_IDLE: 100 / (12 * 60),       // ~12 min do cheio ao vazio
  /** Multiplicador extra enquanto sprinta ou desliza. */
  DRAIN_SPRINT_MUL: 2.2,
  /** Multiplicador sob pressão do anel (agitation 0..1). */
  DRAIN_RING_MUL: 1.35,
  /** Recuperação ao comer 1 ration. */
  FOOD_RESTORE: 28,
  /** Máximo de rations no inventário. */
  FOOD_STACK_MAX: 5,
  /** Cooldown entre usos de comida (s). */
  EAT_COOLDOWN: 1.2,
  /** Limiares de efeito (fome restante). */
  WARN_BELOW: 45,
  WEAK_BELOW: 25,
  STARVE_BELOW: 8,
  /** Dano de vitalidade por segundo nos estados fracos. */
  WEAK_DPS: 0.35,
  STARVE_DPS: 1.4,
  /** Multiplicadores de stamina regen / move speed. */
  WARN_STAMINA_REGEN: 0.65,
  WEAK_SPEED: 0.88,
  STARVE_SPEED: 0.72,
});

/**
 * @param {number} hunger
 * @returns {'ok'|'warn'|'weak'|'starve'}
 */
export function hungerTier(hunger) {
  const h = Number(hunger);
  if (!Number.isFinite(h) || h <= HUNGER.STARVE_BELOW) return 'starve';
  if (h <= HUNGER.WEAK_BELOW) return 'weak';
  if (h <= HUNGER.WARN_BELOW) return 'warn';
  return 'ok';
}

/**
 * Efeitos derivados do nível de fome (puros).
 * @returns {{ tier, speedMul, staminaRegenMul, vitalityDps, label }}
 */
export function hungerEffects(hunger) {
  const tier = hungerTier(hunger);
  switch (tier) {
    case 'starve':
      return {
        tier, speedMul: HUNGER.STARVE_SPEED, staminaRegenMul: 0.35,
        vitalityDps: HUNGER.STARVE_DPS, label: 'INANIÇÃO',
      };
    case 'weak':
      return {
        tier, speedMul: HUNGER.WEAK_SPEED, staminaRegenMul: 0.5,
        vitalityDps: HUNGER.WEAK_DPS, label: 'FRAQUEZA',
      };
    case 'warn':
      return {
        tier, speedMul: 1, staminaRegenMul: HUNGER.WARN_STAMINA_REGEN,
        vitalityDps: 0, label: 'FOME',
      };
    default:
      return { tier: 'ok', speedMul: 1, staminaRegenMul: 1, vitalityDps: 0, label: '' };
  }
}

/**
 * Avança a fome de um ator por dt segundos.
 * @param {object} actor — mutado: hunger, opcionalmente marca hungerTier
 * @param {number} dt
 * @param {{ sprinting?: boolean, sliding?: boolean, ringPressure?: number, alive?: boolean }} opts
 * @returns {{ drained: number, tier: string, effects: object, vitalityDamage: number }}
 */
export function tickHunger(actor, dt, opts = {}) {
  if (!actor || opts.alive === false || actor.alive === false) {
    return { drained: 0, tier: hungerTier(actor?.hunger ?? HUNGER.MAX), effects: hungerEffects(actor?.hunger ?? HUNGER.MAX), vitalityDamage: 0 };
  }
  if (!Number.isFinite(actor.hunger)) actor.hunger = HUNGER.MAX;

  let rate = HUNGER.DRAIN_IDLE;
  if (opts.sprinting || opts.sliding || actor.sprinting || actor.sliding) {
    rate *= HUNGER.DRAIN_SPRINT_MUL;
  }
  const pressure = Math.max(0, Math.min(1, opts.ringPressure ?? 0));
  if (pressure > 0) rate *= 1 + (HUNGER.DRAIN_RING_MUL - 1) * pressure;

  const before = actor.hunger;
  actor.hunger = Math.max(0, actor.hunger - rate * Math.max(0, dt));
  const effects = hungerEffects(actor.hunger);
  actor.hungerTier = effects.tier;

  const vitalityDamage = effects.vitalityDps * Math.max(0, dt);
  return {
    drained: before - actor.hunger,
    tier: effects.tier,
    effects,
    vitalityDamage,
  };
}

/**
 * Consome 1 unidade de comida do inventário e restaura fome.
 * @returns {{ ok: boolean, restored: number, hunger: number, reason?: string }}
 */
export function eatFood(actor, opts = {}) {
  if (!actor?.inventory) return { ok: false, restored: 0, hunger: actor?.hunger ?? 0, reason: 'no-inventory' };
  const food = actor.inventory.food ?? 0;
  if (food < 1) return { ok: false, restored: 0, hunger: actor.hunger ?? HUNGER.MAX, reason: 'no-food' };

  const cd = actor.eatCd ?? 0;
  if (cd > 0 && !opts.ignoreCooldown) {
    return { ok: false, restored: 0, hunger: actor.hunger ?? HUNGER.MAX, reason: 'cooldown' };
  }

  const before = Number.isFinite(actor.hunger) ? actor.hunger : HUNGER.MAX;
  if (before >= HUNGER.MAX - 0.5) {
    return { ok: false, restored: 0, hunger: before, reason: 'full' };
  }

  actor.inventory.food = food - 1;
  const restore = opts.restore ?? HUNGER.FOOD_RESTORE;
  actor.hunger = Math.min(HUNGER.MAX, before + restore);
  actor.hungerTier = hungerTier(actor.hunger);
  actor.eatCd = HUNGER.EAT_COOLDOWN;

  return { ok: true, restored: actor.hunger - before, hunger: actor.hunger };
}

/** Aplica item de loot de comida ao inventário. */
export function pickupFood(actor, amount = 1) {
  if (!actor?.inventory) return 0;
  const cur = actor.inventory.food ?? 0;
  const add = Math.max(0, Math.floor(amount));
  const next = Math.min(HUNGER.FOOD_STACK_MAX, cur + add);
  actor.inventory.food = next;
  return next - cur;
}

/** Snapshot serializável para HUD / net. */
export function hungerSnapshot(actor) {
  const hunger = Number.isFinite(actor?.hunger) ? actor.hunger : HUNGER.MAX;
  const effects = hungerEffects(hunger);
  return {
    hunger,
    max: HUNGER.MAX,
    tier: effects.tier,
    label: effects.label,
    food: actor?.inventory?.food ?? 0,
    speedMul: effects.speedMul,
    staminaRegenMul: effects.staminaRegenMul,
  };
}

// =============================================================================
// Caça / carne de animais + Safe Pack (ração humana)
// =============================================================================

/** Rendimento de comida ao abater espécie (unidades de inventory.food). */
export const ANIMAL_MEAT = Object.freeze({
  rat: Object.freeze({ food: 1, hp: 18, label: 'Carne de rato' }),
  crab: Object.freeze({ food: 1, hp: 22, label: 'Carne de caranguejo' }),
  scorpion: Object.freeze({ food: 1, hp: 16, label: 'Carne de escorpião' }),
  croc: Object.freeze({ food: 3, hp: 90, label: 'Carne de jacaré' }),
  // tubarão: opcional / alto risco — fora da arena jogável; não spawnado como caça
  locust: Object.freeze({ food: 1, hp: 8, label: 'Insetos' }),
});

/** Conteúdo garantido do Safe Pack (supply drop / airdrop). */
export const SAFE_PACK = Object.freeze({
  food: 2,   // rações humanas
  water: 2,  // cantis
  medkit: 1,
  label: 'Safe Pack',
});

/**
 * Lista de nós de caça a partir do plano de fauna (contagens por espécie).
 * Positions are approximate anchors — sim places them with rng.
 */
export function huntSpeciesForScenario(scenarioId) {
  const table = {
    CIGKV: ['rat', 'locust'],
    Barburhen: ['rat'],
    Priadus: ['croc'],
    Ckesalth: ['scorpion', 'locust'],
    Arukheea: ['crab'],
  };
  return table[scenarioId] ?? ['rat'];
}
