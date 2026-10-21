/**
 * Multi-World Integration Test
 * Tests: CIGKV → W1 → W2 → W3 → W4, rank-gated progression
 * Copyright Nexus-HUB57
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
    assert.equal(WORLDS.length, 5);
    WORLDS.forEach((w, i) => assert.equal(w.order, i));
  });

  it('RECRUTA can only access CIGKV', () => {
    assert.equal(canAccessWorld('RECRUTA', 'CIGKV'), true);
    assert.equal(canAccessWorld('RECRUTA', 'Barburhen'), false);
    assert.equal(canAccessWorld('RECRUTA', 'Priadus'), false);
    assert.equal(canAccessWorld('RECRUTA', 'Ckesalth'), false);
    assert.equal(canAccessWorld('RECRUTA', 'Arukheea'), false);
  });

  it('HURAN can access CIGKV + Barburhen', () => {
    assert.equal(canAccessWorld('HURAN', 'CIGKV'), true);
    assert.equal(canAccessWorld('HURAN', 'Barburhen'), true);
    assert.equal(canAccessWorld('HURAN', 'Priadus'), false);
  });

  it('VENEX can access CIGKV + Barburhen + Priadus', () => {
    assert.equal(canAccessWorld('VENEX', 'CIGKV'), true);
    assert.equal(canAccessWorld('VENEX', 'Barburhen'), true);
    assert.equal(canAccessWorld('VENEX', 'Priadus'), true);
    assert.equal(canAccessWorld('VENEX', 'Ckesalth'), false);
  });

  it('SKEETW can access W0-W3', () => {
    assert.equal(canAccessWorld('SKEETW', 'Ckesalth'), true);
    assert.equal(canAccessWorld('SKEETW', 'Arukheea'), false);
  });

  it('ONITH can access all 5 worlds', () => {
    WORLDS.forEach(w => {
      assert.equal(canAccessWorld('ONITH', w.id), true);
    });
  });

  it('OVERLORD and MALAKOR can access all worlds', () => {
    ['OVERLORD', 'MALAKOR'].forEach(rank => {
      WORLDS.forEach(w => {
        assert.equal(canAccessWorld(rank, w.id), true);
      });
    });
  });

  it('world player counts are valid', () => {
    WORLDS.forEach(w => {
      assert.ok(w.players > 0);
      assert.ok(w.players <= 100);
    });
  });

  it('CIGKV is the starting world (order 0)', () => {
    assert.equal(WORLDS[0].id, 'CIGKV');
    assert.equal(WORLDS[0].requiredRank, 'RECRUTA');
  });

  it('Barburhen has highest player count (100)', () => {
    const max = Math.max(...WORLDS.map(w => w.players));
    assert.equal(max, 100);
  });
});
