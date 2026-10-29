export const RARITIES = {
  COMUM: { color: '#b7c2c7', weight: 58, multiplier: 1 },
  INCOMUM: { color: '#42d9de', weight: 25, multiplier: 1.12 },
  RARO: { color: '#a875ff', weight: 12, multiplier: 1.28 },
  LENDARIO: { color: '#ffb52e', weight: 4.2, multiplier: 1.5 },
  // Fase 30 — MÍTICA: skin evolutiva (4 estágios por abates, attachments3d)
  MITICA: { color: '#ff2d78', weight: 0.8, multiplier: 1.75 },
};

// Fase 30 — catálogo leve dos anexos no lado shared (a malha vive no 3d).
// A AR-47 é a única arma com sockets na Fase 28 — compat espelha isso.
export const ATTACHMENT_IDS = Object.freeze(['mira4x', 'silenciador', 'magestendida', 'gripvertical']);
export const ATTACHMENT_NAMES = Object.freeze({
  mira4x: 'Mira 4x', silenciador: 'Silenciador',
  magestendida: 'Mag Estendida', gripvertical: 'Empunhadura Vertical',
});

export const WEAPONS = {
  sucata: { id: 'sucata', name: 'Lança de Sucata', category: 'melee', rarity: 'COMUM', damage: 24, fireRate: 1.1, range: 48, projectileSpeed: 0, magazine: 1, ammo: 'none', weight: 30 },
  g19: { id: 'g19', name: 'Pistola 9MM', category: 'sidearm', rarity: 'COMUM', damage: 22, fireRate: 4.8, range: 300, projectileSpeed: 570, magazine: 15, ammo: '9MM', weight: 28 },
  m4: { id: 'm4', name: 'Fuzil de Assalto M4', category: 'rifle', rarity: 'INCOMUM', damage: 31, fireRate: 8, range: 410, projectileSpeed: 690, magazine: 30, ammo: '5.56', weight: 18 },
  ar47: { id: 'ar47', name: 'Fuzil de Assalto AR-47', category: 'rifle', rarity: 'RARO', damage: 36, fireRate: 6.6, range: 395, projectileSpeed: 660, magazine: 40, ammo: '7.62', weight: 12, sockets: ['muzzle', 'optic', 'mag', 'grip'] },
  mp5: { id: 'mp5', name: 'Submetralhadora MP5', category: 'smg', rarity: 'INCOMUM', damage: 18, fireRate: 12, range: 250, projectileSpeed: 620, magazine: 32, ammo: '9MM', weight: 15 },
  barrett: { id: 'barrett', name: 'Barrett MRAD MK22', category: 'sniper', rarity: 'RARO', damage: 92, fireRate: .65, range: 780, projectileSpeed: 900, magazine: 5, ammo: '.338', weight: 6 },
  pulse: { id: 'pulse', name: 'Rifle de Pulso General', category: 'energy', rarity: 'LENDARIO', damage: 48, fireRate: 6, range: 530, projectileSpeed: 760, magazine: 24, ammo: 'CELL', weight: 3 },
};

export const LOOT_POOLS = {
  armory: [{ kind:'weapon', id:'g19', weight:30 }, { kind:'weapon', id:'m4', weight:22 }, { kind:'weapon', id:'mp5', weight:17 }, { kind:'weapon', id:'ar47', weight:9 }, { kind:'weapon', id:'barrett', weight:7 }, { kind:'weapon', id:'pulse', weight:2 }, { kind:'ammo', id:'9MM', amount:30, weight:14 }, { kind:'ammo', id:'7.62', amount:30, weight:7 }, { kind:'helmet', id:'helmet', level:1, weight:6 }, { kind:'vest', id:'vest', level:1, weight:6 }, { kind:'pack', id:'pack', level:1, weight:6 }, { kind:'attachment', id:'mira4x', weight:4 }, { kind:'attachment', id:'magestendida', weight:4 }],
  industrial: [{ kind:'resource', id:'metal', amount:3, weight:27 }, { kind:'resource', id:'components', amount:2, weight:22 }, { kind:'weapon', id:'m4', weight:15 }, { kind:'weapon', id:'ar47', weight:8 }, { kind:'ammo', id:'5.56', amount:20, weight:14 }, { kind:'ammo', id:'7.62', amount:20, weight:7 }, { kind:'vest', id:'vest', level:2, weight:5 }, { kind:'pack', id:'pack', level:2, weight:5 }, { kind:'resource', id:'fuel', amount:2, weight:12 }, { kind:'attachment', id:'silenciador', weight:4 }, { kind:'attachment', id:'gripvertical', weight:4 }],
  park: [{ kind:'resource', id:'wood', amount:4, weight:32 }, { kind:'consumable', id:'medkit', amount:1, weight:23 }, { kind:'resource', id:'components', amount:2, weight:18 }, { kind:'weapon', id:'sucata', weight:18 }, { kind:'helmet', id:'helmet', level:2, weight:5 }, { kind:'pack', id:'pack', level:1, weight:6 }],
  extraction: [{ kind:'consumable', id:'medkit', amount:1, weight:30 }, { kind:'armor', id:'ceramic', amount:18, weight:30 }, { kind:'ammo', id:'9MM', amount:20, weight:16 }, { kind:'vest', id:'vest', level:3, weight:6 }, { kind:'helmet', id:'helmet', level:3, weight:5 }, { kind:'weapon', id:'barrett', weight:9 }, { kind:'weapon', id:'ar47', weight:8 }, { kind:'attachment', id:'mira4x', weight:3 }],
  // Fase 28 — pool exclusivo da caixa de airdrop (AR-47 LENDÁRIO garantido)
  supplyDrop: [{ kind:'weapon', id:'ar47', rarity:'LENDARIO', weight:60 }, { kind:'consumable', id:'medkit', amount:2, weight:22 }, { kind:'armor', id:'ceramic', amount:40, weight:18 }],
};

export function weightedPick(rng, entries) { const total = entries.reduce((sum, e) => sum + e.weight, 0); let cursor = rng.next() * total; for (const entry of entries) { cursor -= entry.weight; if (cursor <= 0) return { ...entry }; } return { ...entries.at(-1) }; }
export function rollRarity(rng) { const entries = Object.entries(RARITIES).map(([id, data]) => ({ id, weight: data.weight })); return weightedPick(rng, entries).id; }
export function rollLoot(rng, zone = 'armory', count = 1) {
  const pool = LOOT_POOLS[zone] ?? LOOT_POOLS.armory;
  return Array.from({ length: count }, () => {
    const drop = weightedPick(rng, pool);
    if (drop.kind === 'weapon') {
      const weapon = WEAPONS[drop.id];
      // Fase 28 — raridade pré-definida (pool do airdrop) tem precedência
      const rarity = drop.rarity ?? (drop.id === 'pulse' ? 'LENDARIO' : rollRarity(rng));
      return { ...drop, rarity, name: weapon.name, weapon: { ...weapon, damage: Math.round(weapon.damage * RARITIES[rarity].multiplier) } };
    }
    if (drop.kind === 'attachment') {
      // Fase 30 — anexo avulso: nome resolvido do catálogo leve (mesh no 3d)
      return { ...drop, name: ATTACHMENT_NAMES[drop.id] ?? drop.id };
    }
    return drop;
  });
}

// Fase 30 — anexos de SÉRIE por raridade da arma (PURO, determinístico pelo
// rng do chamador). LENDÁRIO sai com 1-2 anexos; o airdrop (LENDÁRIO fixo da
// AR-47) sai COMPLETO — os 4 sockets equipados, assinatura da caixa vermelha.
export function attachmentsForDrop(rng, weaponId, rarity) {
  if (weaponId !== 'ar47') return undefined;
  if (rarity === 'MITICA') return ['mira4x', 'silenciador', 'magestendida', 'gripvertical'];
  if (rarity !== 'LENDARIO') return undefined;
  const all = ['mira4x', 'silenciador', 'magestendida', 'gripvertical'];
  const n = rng.next() < .5 ? 2 : 1;
  const picked = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng.next() * all.length) % all.length;
    if (!picked.includes(all[idx])) picked.push(all[idx]);
  }
  return picked.length ? picked : undefined;
}
