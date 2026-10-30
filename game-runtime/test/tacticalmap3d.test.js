// Khaaos Run — Fase 40 — MAPA TÁTICO EM TELA CHEIA (módulo PURO tacticalmap3d.js).
//
// Camadas testadas (mesmo contrato headless de aura3d/perf3d):
//   1. PROJEÇÃO — escala estável, origem no centro, convenção idêntica ao
//      radar F35 (+x → direita, +z → baixo), entrada suja sem NaN;
//   2. MARKERS — gate determinístico (loot ativo, bots SÓ revelados,
//      terminais todos com flag), distritos/anéis/jogador completos e
//      degradação com graça (sem sim/layout → radar vazio, sem throw);
//   3. CONTAGEM/HOTKEY — telemetria por kind e a tecla 'm' como fonte única
//      (main3d binda por constante — sem literal espalhado).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TACTICAL_HOTKEY, TACTICAL_WORLD,
  tacticalScale, tacticalProject, tacticalMarkers, tacticalMarkerCounts,
} from '../src/game3d/tacticalmap3d.js';

test('F40 · projeção: origem no centro, convenção do radar e entrada suja', () => {
  assert.equal(TACTICAL_WORLD, 420, 'mesma janela do minimapa F35');
  assert.equal(tacticalScale(720), 720 / 420, 'escala = size/janela');
  assert.equal(tacticalScale(0), 0, 'size 0 → escala 0');
  assert.ok(Number.isFinite(tacticalScale(-10)), 'negativo não gera NaN');
  // centro do mundo → centro do canvas (mesmo size 720)
  const c = tacticalProject(0, 0, 720);
  assert.equal(c.px, 360);
  assert.equal(c.py, 360);
  // convenção do radar: +x → direita, +z → baixo (sem espelho — leitura única)
  const east = tacticalProject(100, 0, 720);
  const south = tacticalProject(0, 100, 720);
  assert.ok(east.px > 360 && east.py === 360, '+x vai p/ a direita');
  assert.ok(south.py > 360 && south.px === 360, '+z vai p/ baixo');
  // entrada suja → centro (nada desenha fora; sem NaN)
  const dirty = tacticalProject(NaN, undefined, 720);
  assert.equal(dirty.px, 360);
  assert.equal(dirty.py, 360);
});

test('F40 · markers: gate determinístico igual ao radar (loot ativo, bots revelados)', () => {
  const world = {
    player: { x: 12, z: -34, yaw: 1.2 },
    ring: { x: 5, z: 5, radius: 120, target: 80, pulse: 2 },
    terminals: [
      { id: 'zex-0', x: 0, z: 0, active: true },
      { id: 'zex-1', x: 30, z: 40, active: false },
    ],
    bots: [
      { id: 'b1', alive: true, x: 10, z: 10, revealedTicks: 30 },   // revelado (offline)
      { id: 'b2', alive: true, x: 20, z: 20, revealed: true },      // revelado (online, Fase 8)
      { id: 'b3', alive: true, x: 25, z: 25 },                      // NÃO revelado → fora
      { id: 'b4', alive: false, x: 30, z: 30, revealedTicks: 10 },  // morto → fora
      { id: 'b5', alive: true, x: NaN, z: 5, revealedTicks: 10 },   // pos suja → fora
    ],
    loot: [
      { x: 1, z: 2, active: true },
      { x: 3, z: 4, active: false },                                // coletado → fora
    ],
    districts: [
      { name: 'SETOR A', cx: -95, cz: -95, r: 62 },
      { name: 'SETOR B', cx: 95, cz: 95, r: 66 },
      { name: 'QUEBRADO', cx: NaN, cz: 0, r: 10 },                  // sujo → fora
    ],
  };
  const markers = tacticalMarkers(world);
  const counts = tacticalMarkerCounts(markers);
  assert.equal(counts.district, 2, 'só distritos válidos');
  assert.equal(counts.ring, 1, 'anel corrente');
  assert.equal(counts.ringTarget, 1, 'anel alvo');
  assert.equal(counts.terminal, 2, 'TODOS os terminais (semáforo funcional — mapa nunca esconde)');
  assert.equal(counts.loot, 1, 'só loot ativo');
  assert.equal(counts.recon, 2, 'bots revelados (ticks ou flag), nunca os ocultos/mortos/sujos');
  assert.equal(counts.player, 1, 'sempre o jogador');
  // campos preservados p/ o desenho (r/label/active/yaw)
  const district = markers.find((m) => m.kind === 'district');
  assert.equal(district.label, 'SETOR A');
  assert.equal(district.r, 62);
  const ring = markers.find((m) => m.kind === 'ring');
  assert.equal(ring.r, 120);
  const terminal = markers.find((m) => m.kind === 'terminal' && m.id === 'zex-1');
  assert.equal(terminal.active, false);
  const player = markers.find((m) => m.kind === 'player');
  assert.equal(player.yaw, 1.2);
});

test('F40 · markers: degradação com graça e contagem robusta (sem throw)', () => {
  // sim/layout ausentes → radar vazio, NUNCA quebra a partida
  assert.deepEqual(tacticalMarkers(), []);
  assert.deepEqual(tacticalMarkers({}), []);
  assert.deepEqual(tacticalMarkers({ bots: null, loot: undefined, districts: 42 }), [],
    'entradas não-iteráveis/lixo → vazio (guard, sem throw)');
  // contagem: kind desconhecido não explode (chave ausente é ignorada)
  assert.deepEqual(tacticalMarkerCounts([{ kind: 'district' }, { kind: 'fantasma' }, null]),
    { district: 1, ring: 0, ringTarget: 0, terminal: 0, loot: 0, recon: 0, player: 0 });
});

test('F40 · hotkey: fonte única main3d↔módulo (sem literal espalhado)', () => {
  assert.equal(TACTICAL_HOTKEY, 'm', 'tecla M do mapa tático');
  assert.equal(typeof TACTICAL_HOTKEY, 'string');
});
