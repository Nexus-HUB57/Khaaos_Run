// Fase 56 — Avatares GLB (rigs reais Tripo): catálogo ↔ disco, normalização e
// contrato de falha deliberada (asset opcional — o jogo NUNCA quebra sem ele).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import * as THREE from 'three';
import {
  AVATAR_GLB_LIBRARY, AVATAR_TIERS, AVATAR_TARGET_HEIGHT,
  avatarById, avatarGlbUrl, normalizeAvatarScale, fitAvatarToGround,
  loadAvatarGlb, resetAvatarCache,
} from '../src/game3d/avatars3d.js';
import { loadHeroOperative, resetHeroAssetCache } from '../src/game3d/hero3d.js';

const here = dirname(fileURLToPath(import.meta.url));
const avatarsDir = join(here, '..', 'public', 'assets', 'avatars');

test('catálogo: 10 avatares, ids únicos, tiers/sexos válidos', () => {
  assert.equal(AVATAR_GLB_LIBRARY.length, 10);
  const ids = AVATAR_GLB_LIBRARY.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  for (const a of AVATAR_GLB_LIBRARY) {
    assert.ok(AVATAR_TIERS.includes(a.tier), `tier válido: ${a.id}`);
    assert.ok(['M', 'F'].includes(a.sex), `sexo válido: ${a.id}`);
    assert.match(a.file, /\.glb$/, `arquivo .glb: ${a.id}`);
  }
  // composição canônica: 4 estáticos + 5 rigged + 1 animated
  const tiers = Object.fromEntries(AVATAR_TIERS.map((t) => [t, 0]));
  for (const a of AVATAR_GLB_LIBRARY) tiers[a.tier] += 1;
  assert.deepEqual(tiers, { static: 4, rigged: 5, animated: 1 });
});

test('todo GLB do catálogo EXISTE no disco e é glTF 2.0 real (binário)', () => {
  for (const a of AVATAR_GLB_LIBRARY) {
    const path = join(avatarsDir, a.file);
    const st = statSync(path); // lança se ausente — o catálogo não mente
    assert.ok(st.size > 1_000_000, `${a.id} tem conteúdo real (>1 MB)`);
    const head = readFileSync(path).subarray(0, 4).toString('ascii');
    assert.equal(head, 'glTF', `${a.id} é binário glTF`);
    assert.equal(readFileSync(path).subarray(4, 6).readUInt16LE(0), 2, `${a.id} é glTF 2.0`);
  }
});

test('avatarById/avatarGlbUrl: id válido resolve; inválido → null (sem throw)', () => {
  assert.equal(avatarById('rigged-avatar-f-01')?.tier, 'rigged');
  assert.equal(avatarById('nao-existe'), null);
  assert.match(avatarGlbUrl('avatar-m-01'), /assets\/avatars\/avatar-m-01\.glb$/);
  assert.equal(avatarGlbUrl('nao-existe'), null);
});

test('normalizeAvatarScale: altura da bounding box → 1.8 m (mesma raiz)', () => {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1));
  mesh.position.y = 0.25;
  g.add(mesh);
  const out = normalizeAvatarScale(g);
  assert.equal(out, g, 'retorna a mesma raiz (encadeável)');
  g.updateMatrixWorld(true);
  const size = new THREE.Vector3();
  new THREE.Box3().setFromObject(g).getSize(size);
  assert.ok(Math.abs(size.y - AVATAR_TARGET_HEIGHT) < 1e-4, `altura ≈ 1.8 (obtido ${size.y.toFixed(4)})`);
});

test('normalizeAvatarScale: raiz inválida e bbox degenerada não explodem', () => {
  assert.equal(normalizeAvatarScale(null), null);
  const empty = new THREE.Group();
  normalizeAvatarScale(empty); // sem mesh → sem scale change
  assert.equal(empty.scale.x, 1);
});

test('fitAvatarToGround: pés no solo (bbox min.y → 0)', () => {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1));
  mesh.position.y = 2.4; // flutuando 1.5 m acima do solo
  g.add(mesh);
  g.updateMatrixWorld(true);
  fitAvatarToGround(g);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  assert.ok(Math.abs(box.min.y) < 1e-4, `min.y ≈ 0 (obtido ${box.min.y.toFixed(4)})`);
});

test('loadAvatarGlb headless: resolve null SEM quebrar (sem window/fetch real)', async () => {
  resetAvatarCache();
  const out = await loadAvatarGlb('rigged-avatar-m-01');
  assert.equal(out, null, 'falha deliberada — fallback procedural é o contrato');
});

test('loadAvatarGlb: id inválido → null imediato', async () => {
  assert.equal(await loadAvatarGlb('nao-existe'), null);
});

test('contrato do hero3d preservado: FBX ausente resolve null (fallback procedural)', async () => {
  resetHeroAssetCache();
  assert.equal(await loadHeroOperative(), null);
});
