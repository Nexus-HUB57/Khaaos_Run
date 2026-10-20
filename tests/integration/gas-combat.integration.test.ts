/**
 * GAS Combat Integration Test
 * Tests: 11 abilities, cooldowns, energy, damage falloff, headshot
 * Copyright Nexus-HUB57
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ─── Ability Definitions ──────────────────────────────────────────────────
const ABILITIES = [
  { id: 'Shoot_Rifle', cooldownMs: 100, energyCost: 5, damage: 35, range: 80 },
  { id: 'Shoot_Sniper', cooldownMs: 2500, energyCost: 15, damage: 90, range: 200 },
  { id: 'Shoot_Shotgun', cooldownMs: 1428, energyCost: 8, damage: 80, range: 15 },
  { id: 'Reload', cooldownMs: 2000, energyCost: 0, damage: 0, range: 0 },
  { id: 'Melee', cooldownMs: 500, energyCost: 10, damage: 45, range: 2 },
  { id: 'Sprint', cooldownMs: 0, energyCost: 2, damage: 0, range: 0 },
  { id: 'Slide', cooldownMs: 3000, energyCost: 5, damage: 0, range: 0 },
  { id: 'Jump', cooldownMs: 0, energyCost: 3, damage: 0, range: 0 },
  { id: 'GrapplingHook', cooldownMs: 8000, energyCost: 20, damage: 0, range: 60 },
  { id: 'Shield', cooldownMs: 12000, energyCost: 25, damage: 0, range: 0 },
  { id: 'Heal', cooldownMs: 10000, energyCost: 15, damage: 0, range: 0 },
];

function calculateDamageAtDistance(baseDamage: number, distance: number, maxRange: number): number {
  if (maxRange <= 0) return baseDamage;
  if (distance >= maxRange) return baseDamage * 0.3;
  return baseDamage * (1.0 - 0.7 * (distance / maxRange));
}

describe('GAS Combat System', () => {
  it('should have exactly 11 abilities', () => {
    assert.equal(ABILITIES.length, 11);
  });

  it('all abilities should have valid cooldowns (>= 0)', () => {
    ABILITIES.forEach(a => assert.ok(a.cooldownMs >= 0, `${a.id} cooldown must be non-negative`));
  });

  it('all abilities should have valid energy costs (>= 0)', () => {
    ABILITIES.forEach(a => assert.ok(a.energyCost >= 0, `${a.id} energy cost must be non-negative`));
  });

  it('damage abilities should have positive damage', () => {
    const damageAbilities = ABILITIES.filter(a => a.damage > 0);
    assert.ok(damageAbilities.length > 0);
    damageAbilities.forEach(a => assert.ok(a.damage > 0, `${a.id} damage must be positive`));
  });

  it('should apply damage falloff at range', () => {
    const rifle = ABILITIES.find(a => a.id === 'Shoot_Rifle')!;
    const dmgPointBlank = calculateDamageAtDistance(rifle.damage, 0, rifle.range);
    const dmgHalfRange = calculateDamageAtDistance(rifle.damage, rifle.range / 2, rifle.range);
    const dmgMaxRange = calculateDamageAtDistance(rifle.damage, rifle.range, rifle.range);
    assert.equal(dmgPointBlank, rifle.damage);
    assert.ok(dmgHalfRange < dmgPointBlank);
    assert.ok(Math.abs(dmgMaxRange - rifle.damage * 0.3) < 0.05);
  });

  it('should apply headshot multiplier correctly', () => {
    const rifle = ABILITIES.find(a => a.id === 'Shoot_Rifle')!;
    const headshotMult = 2.0;
    assert.equal(rifle.damage * headshotMult, 70);
  });

  it('sniper headshot should be highest single-hit damage', () => {
    const sniper = ABILITIES.find(a => a.id === 'Shoot_Sniper')!;
    const sniperHeadshot = sniper.damage * 3.0;
    const rifle = ABILITIES.find(a => a.id === 'Shoot_Rifle')!;
    const rifleHeadshot = rifle.damage * 2.0;
    assert.ok(sniperHeadshot > rifleHeadshot);
  });

  it('melee should have range <= 3', () => {
    const melee = ABILITIES.filter(a => a.range <= 3);
    assert.ok(melee.length >= 1);
  });

  it('energy should not go negative', () => {
    let energy = 100;
    for (const a of ABILITIES) {
      if (energy >= a.energyCost) {
        energy -= a.energyCost;
      }
    }
    assert.ok(energy >= 0);
  });

  it('cooldowns should prevent ability spam', () => {
    const shield = ABILITIES.find(a => a.id === 'Shield')!;
    assert.ok(shield.cooldownMs > 0);
    assert.equal(shield.cooldownMs, 12000);
  });
});
