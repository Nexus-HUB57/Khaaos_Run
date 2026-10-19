export const RARITIES = {
  COMUM: { color: '#b7c2c7', weight: 58, multiplier: 1 },
  INCOMUM: { color: '#42d9de', weight: 25, multiplier: 1.12 },
  RARO: { color: '#a875ff', weight: 12, multiplier: 1.28 },
  LENDARIO: { color: '#ffb52e', weight: 5, multiplier: 1.5 },
};

export const WEAPONS = {
  sucata: { id: 'sucata', name: 'Lança de Sucata', category: 'melee', rarity: 'COMUM', damage: 24, fireRate: 1.1, range: 48, projectileSpeed: 0, magazine: 1, ammo: 'none', weight: 30 },
  g19: { id: 'g19', name: 'Pistola 9MM', category: 'sidearm', rarity: 'COMUM', damage: 22, fireRate: 4.8, range: 300, projectileSpeed: 570, magazine: 15, ammo: '9MM', weight: 28 },
  m4: { id: 'm4', name: 'Fuzil de Assalto M4', category: 'rifle', rarity: 'INCOMUM', damage: 31, fireRate: 8, range: 410, projectileSpeed: 690, magazine: 30, ammo: '5.56', weight: 18 },
  mp5: { id: 'mp5', name: 'Submetralhadora MP5', category: 'smg', rarity: 'INCOMUM', damage: 18, fireRate: 12, range: 250, projectileSpeed: 620, magazine: 32, ammo: '9MM', weight: 15 },
  barrett: { id: 'barrett', name: 'Barrett MRAD MK22', category: 'sniper', rarity: 'RARO', damage: 92, fireRate: .65, range: 780, projectileSpeed: 900, magazine: 5, ammo: '.338', weight: 6 },
  pulse: { id: 'pulse', name: 'Rifle de Pulso General', category: 'energy', rarity: 'LENDARIO', damage: 48, fireRate: 6, range: 530, projectileSpeed: 760, magazine: 24, ammo: 'CELL', weight: 3 },
};

export const LOOT_POOLS = {
  armory: [{ kind:'weapon', id:'g19', weight:32 }, { kind:'weapon', id:'m4', weight:24 }, { kind:'weapon', id:'mp5', weight:18 }, { kind:'weapon', id:'barrett', weight:7 }, { kind:'weapon', id:'pulse', weight:2 }, { kind:'ammo', id:'9MM', amount:30, weight:17 }],
  industrial: [{ kind:'resource', id:'metal', amount:3, weight:30 }, { kind:'resource', id:'components', amount:2, weight:25 }, { kind:'weapon', id:'m4', weight:16 }, { kind:'ammo', id:'5.56', amount:20, weight:17 }, { kind:'resource', id:'fuel', amount:2, weight:12 }],
  park: [{ kind:'resource', id:'wood', amount:4, weight:35 }, { kind:'consumable', id:'medkit', amount:1, weight:25 }, { kind:'resource', id:'components', amount:2, weight:20 }, { kind:'weapon', id:'sucata', weight:20 }],
  extraction: [{ kind:'consumable', id:'medkit', amount:1, weight:35 }, { kind:'armor', id:'ceramic', amount:18, weight:35 }, { kind:'ammo', id:'9MM', amount:20, weight:20 }, { kind:'weapon', id:'barrett', weight:10 }],
};

export function weightedPick(rng, entries) { const total = entries.reduce((sum, e) => sum + e.weight, 0); let cursor = rng.next() * total; for (const entry of entries) { cursor -= entry.weight; if (cursor <= 0) return { ...entry }; } return { ...entries.at(-1) }; }
export function rollRarity(rng) { const entries = Object.entries(RARITIES).map(([id, data]) => ({ id, weight: data.weight })); return weightedPick(rng, entries).id; }
export function rollLoot(rng, zone = 'armory', count = 1) {
  const pool = LOOT_POOLS[zone] ?? LOOT_POOLS.armory;
  return Array.from({ length: count }, () => {
    const drop = weightedPick(rng, pool);
    if (drop.kind === 'weapon') {
      const weapon = WEAPONS[drop.id];
      const rarity = drop.id === 'pulse' ? 'LENDARIO' : rollRarity(rng);
      return { ...drop, rarity, name: weapon.name, weapon: { ...weapon, damage: Math.round(weapon.damage * RARITIES[rarity].multiplier) } };
    }
    return drop;
  });
}
