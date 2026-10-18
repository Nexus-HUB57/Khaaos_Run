/**
 * Multi-World Integration Test
 * Tests: CIGKV → W1 → W2 → W3 → W4, rank-gated progression
 * Copyright Nexus-HUB57
 */
import { describe, it, expect } from 'vitest';

// ─── World & Rank Definitions ─────────────────────────────────────────────
const WORLDS = [
  { id: 'CIGKV',    players: 50,  requiredRank: 'RECRUTA',  order: 0 },
  { id: 'Barburhen', players: 100, requiredRank: 'HURAN',   order: 1 },
  { id: 'Priadus',  players: 75,  requiredRank: 'VENEX',   order: 2 },
  { id: 'Ckesalth', players: 60,  requiredRank: 'SKEETW',  order: 3 },
  { id: 'Arukheea', players: 80,  requiredRank: 'ONITH',   order: 4 },
];

const RANK_ORDER = ['RECRUTA', 'HURAN', 'VENEX', 'SKEETW', 'ONITH', 'OVERLORD', 'MALAKOR'];

function canAccessWorld(playerRank: string, worldId: string): boolean {
  const world = WORLDS.find(w => w.id === worldId);
  if (!world) return false;
  const playerIdx = RANK_ORDER.indexOf(playerRank);
  const requiredIdx = RANK_ORDER.indexOf(world.requiredRank);
  return playerIdx >= requiredIdx;
}

describe('Multi-World Progression', () => {
  it('should have 5 worlds in order', () => {
    expect(WORLDS).toHaveLength(5);
    WORLDS.forEach((w, i) => expect(w.order).toBe(i));
  });

  it('RECRUTA can only access CIGKV', () => {
    expect(canAccessWorld('RECRUTA', 'CIGKV')).toBe(true);
    expect(canAccessWorld('RECRUTA', 'Barburhen')).toBe(false);
    expect(canAccessWorld('RECRUTA', 'Priadus')).toBe(false);
    expect(canAccessWorld('RECRUTA', 'Ckesalth')).toBe(false);
    expect(canAccessWorld('RECRUTA', 'Arukheea')).toBe(false);
  });

  it('HURAN can access CIGKV + Barburhen', () => {
    expect(canAccessWorld('HURAN', 'CIGKV')).toBe(true);
    expect(canAccessWorld('HURAN', 'Barburhen')).toBe(true);
    expect(canAccessWorld('HURAN', 'Priadus')).toBe(false);
  });

  it('VENEX can access CIGKV + Barburhen + Priadus', () => {
    expect(canAccessWorld('VENEX', 'CIGKV')).toBe(true);
    expect(canAccessWorld('VENEX', 'Barburhen')).toBe(true);
    expect(canAccessWorld('VENEX', 'Priadus')).toBe(true);
    expect(canAccessWorld('VENEX', 'Ckesalth')).toBe(false);
  });

  it('SKEETW can access W0-W3', () => {
    expect(canAccessWorld('SKEETW', 'Ckesalth')).toBe(true);
    expect(canAccessWorld('SKEETW', 'Arukheea')).toBe(false);
  });

  it('ONITH can access all 5 worlds', () => {
    WORLDS.forEach(w => {
      expect(canAccessWorld('ONITH', w.id)).toBe(true);
    });
  });

  it('OVERLORD and MALAKOR can access all worlds', () => {
    ['OVERLORD', 'MALAKOR'].forEach(rank => {
      WORLDS.forEach(w => {
        expect(canAccessWorld(rank, w.id)).toBe(true);
      });
    });
  });

  it('world player counts are valid', () => {
    WORLDS.forEach(w => {
      expect(w.players).toBeGreaterThan(0);
      expect(w.players).toBeLessThanOrEqual(100);
    });
  });

  it('CIGKV is the starting world (order 0)', () => {
    expect(WORLDS[0].id).toBe('CIGKV');
    expect(WORLDS[0].requiredRank).toBe('RECRUTA');
  });

  it('Barburhen has highest player count (100)', () => {
    const max = Math.max(...WORLDS.map(w => w.players));
    expect(max).toBe(100);
  });
});
