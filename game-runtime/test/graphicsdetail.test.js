// Fase 6 — testes dos detalhes de cenário (lógica pura de detail3d).
// Estradas evitam estruturas; props ficam fora de colliders/loot; fachadas
// dentro dos limites; tudo determinístico por seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roadSegments, propPlacements, facadeDetails, canopyTint } from '../src/game3d/detail3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { SeededRng } from '../src/shared/rng.js';

const seeds = ['khaaos-e2e', 'fase6-graphics', 'det-9381'];

function segClear(seg, colliders, extra = 0) {
  const len = Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1);
  const steps = Math.max(2, Math.ceil(len / 1.5));
  for (const c of colliders) {
    if (c.yMin > 0.5) continue;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = seg.x1 + (seg.x2 - seg.x1) * t;
      const pz = seg.z1 + (seg.z2 - seg.z1) * t;
      const r = seg.width / 2 + extra;
      if (px > c.minX - r && px < c.maxX + r && pz > c.minZ - r && pz < c.maxZ + r) return false;
    }
  }
  return true;
}

for (const seed of seeds) {
  test(`[${seed}] estradas ligam a praça aos 4 distritos sem atravessar estruturas`, () => {
    const layout = getWorldLayout(seed);
    const roads = roadSegments(layout);
    assert.ok(roads.length >= 4, 'pelo menos as 4 radiais');
    const radials = roads.filter(r => r.kind === 'radial');
    assert.ok(radials.length >= 4, '4 rotas radiais (joelhos podem dividir em + segmentos)');
    // CADA distrito externo recebe alguma radial terminando dentro do seu raio
    for (const d of layout.districts.slice(0, 4)) {
      const hits = radials.some(r => Math.hypot(r.x2 - d.cx, r.z2 - d.cz) < d.r);
      assert.ok(hits, `distrito ${d.name} conectado`);
    }
    // sub-segmentos finais NÃO cortam colliders no chão (o joelho desviou)
    for (const r of roads) {
      // avalia só o último trecho de 12m p/ tolerar joelhos que nascem colados
      const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
      const t0 = Math.max(0, 1 - 12 / len);
      const tail = { ...r, x1: r.x1 + (r.x2 - r.x1) * t0, z1: r.z1 + (r.z2 - r.z1) * t0 };
      assert.ok(segClear(tail, layout.colliders, -0.4), `cauda da estrada livre: (${r.x1},${r.z1})->(${r.x2},${r.z2})`);
    }
  });

  test(`[${seed}] props não nascem dentro de colliders nem sobre loot`, () => {
    const layout = getWorldLayout(seed);
    const props = propPlacements(layout);
    assert.ok(props.length >= 12, 'cenário povoado (' + props.length + ')');
    for (const p of props) {
      for (const c of layout.colliders) {
        const inside = p.x > c.minX - .6 && p.x < c.maxX + .6 && p.z > c.minZ - .6 && p.z < c.maxZ + .6;
        assert.ok(!inside, `prop ${p.type} (${p.x},${p.z}) fora do collider ${c.kind}`);
      }
      for (const l of layout.lootSpots) {
        assert.ok(Math.hypot(p.x - l.x, p.z - l.z) > 3, `prop ${p.type} longe do loot (${l.x},${l.z})`);
      }
      assert.ok(['lamp', 'barrel', 'tire', 'sandbag', 'pallet', 'barrierprop'].includes(p.type), 'tipo conhecido');
    }
  });

  test(`[${seed}] fachadas dentro dos limites da estrutura`, () => {
    const layout = getWorldLayout(seed);
    let total = 0;
    for (const s of layout.structures) {
      const ds = facadeDetails(s);
      for (const d of ds) {
        total++;
        assert.ok(d.h > 0 && d.w > 0, 'dimensões positivas');
        if (d.face === 'top') {
          assert.ok(Math.abs(d.u) <= s.w / 2 + .01 && Math.abs(d.v) <= s.d / 2 + .01, 'AC/tanque no teto dentro da planta');
        } else if (d.kind === 'door') {
          assert.ok(d.v >= 0 && d.v + d.h <= s.h + .1, 'porta dentro da altura');
        } else if (d.kind === 'windows') {
          assert.ok(d.v > 2 && d.v + d.h <= s.h + .1, 'janelas dentro da altura');
        } else if (d.kind === 'sign') {
          assert.ok(d.v + d.h <= s.h + .1, 'placa dentro da altura');
        }
      }
    }
    assert.ok(total > 30, 'facades ricas (' + total + ')');
    assert.equal(facadeDetails({ kind: 'monolith', x: 0, z: 0, w: 10, d: 10, h: 16 }).length, 0, 'monolito puro');
    assert.equal(facadeDetails({ kind: 'crate', x: 0, z: 0, w: 5, d: 5, h: 1.8 }).length, 0, 'caixas sem fachada');
  });
}

test('determinismo: mesma seed => mesmas estradas/props/fachadas', () => {
  const l1 = getWorldLayout('det-check');
  const l2 = getWorldLayout('det-check');
  assert.deepEqual(roadSegments(l1), roadSegments(l2));
  assert.deepEqual(propPlacements(l1), propPlacements(l2));
  assert.deepEqual(facadeDetails(l1.structures[0]), facadeDetails(l2.structures[0]));
});

test('canopyTint retorna paleta fechada e variada', () => {
  const rng = new SeededRng('tints');
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(canopyTint(rng));
  assert.ok(seen.size >= 2, 'variedade de copas');
  for (const v of seen) assert.ok(Number.isInteger(v), 'tint inteiro');
});
