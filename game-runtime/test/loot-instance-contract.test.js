// Khaaos Run — Fase 32 — CONTRATO DE IDS DO LOOT na sim offline (wart registrado).
//
// O wart: o spread do drop DEPOIS do `id:` deixava o id de catálogo VENCENDO o
// id de instância loot-N — (1) 2 drops iguais colidiam no Map do syncLoot do
// cliente (1 mesh para 2 instâncias: loot invisível + remoção prematura) e
// (2) o loot interior (loot-i*/loot-m*) mantinha o id canônico mas SEM as
// referências de catálogo, fazendo o #pickup cair no fallback g19 e
// inventar chaves de munição/recurso inexistentes ('loot-i0' no inventário).
//
// Contrato canônico (o MESMO do room3d desde a Fase 25/28):
//   id       = loot-N / loot-iN / loot-mN / loot-tN  (INSTÂNCIA, única)
//   weaponId/ammoId/resourceId/attachmentId = referência de CATÁLOGO
//   name     = nome do drop (arma) ou composto ('5.56 ×20', não-armas)
// O #pickup consome a referência com fallback `|| item.id` (bundles crus do
// deathBox/supplyDrop e loot sintético de testes continuam no mesmo caminho).
import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT, AMMO_CAP, WEAPONS3D } from '../src/game3d/sim3d.js';
import { WEAPONS } from '../src/shared/weapons.js';

const STEP = 1 / 30;
const idle = (yaw = 0, pitch = 0) => ({ ...DEFAULT_INPUT, yaw, pitch });

const REF_FIELDS = ['weaponId', 'ammoId', 'resourceId', 'attachmentId'];
const KIND_TO_REF = { weapon: 'weaponId', ammo: 'ammoId', resource: 'resourceId', attachment: 'attachmentId' };

// ---------------------------------------------------------------- 1 ----
test('F33 · loot geral: TODA instância nasce com id canônico loot-N ÚNICO (8 seeds)', () => {
  for (const seed of ['F33-A', 'F33-B', 'F33-C', 'F33-D', 'F33-E', 'F33-F', 'F33-G', 'F33-H']) {
    const s = new KhaaosSim3D({ seed, botCount: 0, airdrop: false });
    const ids = s.loot.map((i) => String(i.id));
    const general = ids.filter((id) => /^loot-\d+$/.test(id));
    assert.equal(general.length, 24, `${seed}: 24 instâncias gerais`);
    assert.equal(new Set(general).size, 24, `${seed}: ids ÚNICOS (regressão da colisão no syncLoot)`);
  }
});

// ---------------------------------------------------------------- 2 ----
test('F33 · contrato: referência de catálogo migra p/ weaponId/ammoId/resourceId/attachmentId (nunca no id)', () => {
  const s = new KhaaosSim3D({ seed: 'F33-REF', botCount: 0, airdrop: false });
  let byKind = { weapon: 0, ammo: 0, resource: 0, attachment: 0 };
  for (const it of s.loot) {
    if (!KIND_TO_REF[it.kind]) continue; // deathBox/frag/gloo/etc. fora do contrato de refs
    const refField = KIND_TO_REF[it.kind];
    byKind[it.kind]++;
    assert.ok(it[refField], `kind ${it.kind} precisa de ${refField} preenchido (id=${it.id})`);
    assert.doesNotMatch(String(it.id), /^(ar47|m4|mp5|g19|556|762|9mm)/, `id ${it.id} NÃO pode ser id de catálogo`);
    for (const f of REF_FIELDS) if (f !== refField) assert.equal(it[f], undefined, `${f} vazio em ${it.id}`);
    // o campo cru do gerador não vaza p/ a instância (contrato serializável do room3d)
    assert.equal(it.weapon, undefined, `campo 'weapon' (stats cru) não serializa em ${it.id}`);
  }
  // os 4 kinds existem no spawn de 24 + interiores — a amostra cobre todos
  for (const k of Object.keys(byKind)) assert.ok(byKind[k] > 0, `pool sem nenhum drop kind=${k} na seed F33-REF`);
});

// ---------------------------------------------------------------- 3 ----
test('F33 · nome: arma preserva o nome do catálogo; não-armas compostos tipo "5.56 ×20"', () => {
  const s = new KhaaosSim3D({ seed: 'F33-NAME', botCount: 0, airdrop: false });
  for (const it of s.loot) {
    if (it.kind === 'weapon') {
      assert.ok(it.name && it.name === WEAPONS[it.weaponId]?.name, `arma ${it.weaponId} preserva o nome`);
    } else if (it.kind === 'ammo') {
      assert.match(it.name, new RegExp(`^${it.ammoId.toUpperCase()}( ×\\d+)?$`), `nome composto p/ munição (${it.name})`);
    } else if (it.kind === 'resource') {
      assert.match(it.name, new RegExp(`^${it.resourceId.toUpperCase()}`), `nome composto p/ recurso (${it.name})`);
    }
  }
});

// ---------------------------------------------------------------- 4 ----
test('F33 · pickup de INSTÂNCIA: arma vem pelo weaponId (nunca fallback g19)', () => {
  const s = new KhaaosSim3D({ seed: 'F33-PICK', botCount: 0, airdrop: false });
  s.start('belt');
  const p = s.player;
  const weapon = s.loot.find((i) => i.kind === 'weapon' && i.weaponId && i.weaponId !== 'g19');
  assert.ok(weapon, 'seed F33-PICK precisa de 1 arma ≠ g19 no chão');
  p.x = weapon.x - .4; p.z = weapon.z; p.y = weapon.y;
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.weapon, weapon.weaponId, `pickup usa a REF de catálogo (${weapon.weaponId}), não o id de instância`);
  assert.equal(WEAPONS3D[p.weapon].ammo, WEAPONS3D[weapon.weaponId].ammo, 'stats vêm do catálogo certo');
});

// ---------------------------------------------------------------- 5 ----
test('F33 · pickup de munição por instância: inventário na chave do catálogo + teto AMMO_CAP', () => {
  const s = new KhaaosSim3D({ seed: 'F33-AMMO', botCount: 0, airdrop: false });
  s.start('belt');
  const p = s.player;
  const ammo = s.loot.find((i) => i.kind === 'ammo');
  assert.ok(ammo, 'seed precisa de 1 drop de munição');
  p.x = ammo.x - .4; p.z = ammo.z; p.y = ammo.y;
  const cap = AMMO_CAP[ammo.ammoId] || 100;
  p.inventory.ammo[ammo.ammoId] = cap - 2;          // 2 abaixo do teto
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.inventory.ammo[ammo.ammoId], cap, `soma respeita o teto de ${ammo.ammoId}`);
  assert.equal(p.inventory.ammo[String(ammo.id)], undefined, 'inventário NUNCA ganha chave de instância');
});

// ---------------------------------------------------------------- 6 ----
test('F33 · loot INTERIOR/MEZANINO: mesmo contrato — arma interior NÃO vira g19', () => {
  const s = new KhaaosSim3D({ seed: 'F33-INT', botCount: 0, airdrop: false });
  const interior = s.loot.filter((i) => String(i.id).startsWith('loot-i') || String(i.id).startsWith('loot-m'));
  assert.ok(interior.length > 0, 'layout precisa de loot interior');
  for (const it of interior) {
    assert.match(String(it.id), /^loot-[im]\d+$/, `id canônico de interior (${it.id})`);
    if (KIND_TO_REF[it.kind]) {
      const refField = KIND_TO_REF[it.kind];
      assert.ok(it[refField], `interior ${it.id} carrega ${refField} (wart do g19)`);
      assert.equal(it.weapon, undefined, 'stats crus não serializam no interior');
    }
  }
  const wInt = interior.find((i) => i.kind === 'weapon');
  if (wInt) {
    s.start('belt');
    const p = s.player;
    p.x = wInt.x - .4; p.z = wInt.z; p.y = wInt.y;
    s.step({ ...idle(), interact: true }, STEP);
    assert.equal(p.weapon, wInt.weaponId, 'arma interior é coletada como a arma REAL (nunca g19)');
  }
});

// ---------------------------------------------------------------- 7 ----
test('F33 · bundles crus (deathBox/supplyDrop) seguem pegáveis pelo fallback || item.id', () => {
  const s = new KhaaosSim3D({ seed: 'F33-BOX', botCount: 0, airdrop: false });
  s.start('belt');
  const p = s.player;
  // isola o interact (só a caixa ativa); g19 (22 dmg) fixa a regra anti-
  // rebaixamento do #grantBundle: bundle só troca se o dano SUBIR
  for (const it of s.loot) it.active = false;
  p.weapon = 'g19';
  // deathBox: bundle CRU do inventário do caído (id = catálogo, sem refs) —
  // mp5 (18 dmg) é RECUSADA pelo anti-rebaixamento; m4 (31 dmg) entra pelo
  // fallback `|| item.id` (prova do contrato nas 2 direções)
  const box = { id: 'deathbox-x', kind: 'deathBox', x: p.x + .4, y: .35, z: p.z, active: true,
    victimName: 'Alvo', accent: '#ff4633', seed: 7,
    bundle: [
      { id: 'mp5', kind: 'weapon', name: 'Submetralhadora MP5', rarity: 'RARO' },
      { id: 'm4', kind: 'weapon', name: 'Fuzil M4', rarity: 'RARO' },
      { id: '5.56', kind: 'ammo', amount: 30 },
    ] };
  s.loot.push(box);
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.weapon, 'm4', 'bundle cru: arma de MAIOR dano pelo fallback do id');
  assert.ok((p.inventory.ammo['5.56'] || 0) >= 30, 'bundle cru: munição na chave do catálogo');
});

// ---------------------------------------------------------------- 8 ----
test('F33 · drop DUPLICADO: 2 instâncias do mesmo drop mantêm ids distintos (fim da colisão do syncLoot)', () => {
  // força 2 drops idênticos (mesmo catálogo) e verifica ids/refs independentes
  const s = new KhaaosSim3D({ seed: 'F33-DUP', botCount: 0, airdrop: false });
  s.start('belt');
  const p = s.player;
  for (const it of s.loot) it.active = false;        // isola as 2 instâncias
  const a1 = { id: 'loot-dup-1', kind: 'ammo', ammoId: '5.56', name: '5.56 ×30', amount: 30, x: p.x + .4, z: p.z, y: .55, active: true };
  const a2 = { id: 'loot-dup-2', kind: 'ammo', ammoId: '5.56', name: '5.56 ×30', amount: 30, x: p.x + 1.2, z: p.z, y: .55, active: true };
  s.loot.push(a1, a2);
  const before = p.inventory.ammo['5.56'] || 0;
  s.step({ ...idle(), interact: true }, STEP);           // pega o mais próximo (a1)
  assert.ok(a1.active === false && a2.active === true, 'só a instância tocada desativa');
  s.step({ ...idle(), interact: true }, STEP);           // agora a2
  assert.ok(a2.active === false, 'segunda instância coletável de forma independente');
  assert.equal(p.inventory.ammo['5.56'], Math.min(AMMO_CAP['5.56'], before + 60), 'as 2 somas caem na MESMA chave de catálogo');
});

// ---------------------------------------------------------------- 9 ----
test('F33 · paridade room3d × sim: snapshot serializável — sem campos de função/stats crus', () => {
  const s = new KhaaosSim3D({ seed: 'F33-SNAP', botCount: 0, airdrop: false });
  for (const it of s.loot) {
    const json = JSON.parse(JSON.stringify(it));       // snapshot do batch/ws
    assert.equal(json.weapon, undefined, `${it.id}: stats de arma não atravessam o fio`);
    assert.ok(json.id && json.kind, `${it.id}: id + kind sempre presentes`);
    if (json.kind === 'weapon') assert.ok(json.weaponId, 'arma no fio carrega weaponId');
    if (json.kind === 'ammo') assert.ok(json.ammoId, 'munição no fio carrega ammoId');
  }
});
