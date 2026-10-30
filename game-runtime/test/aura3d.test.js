// Khaaos Run — Fase 36 — AURA SAZONAL DO HUD (módulo PURA aura3d.js).
//
// Camadas testadas:
//   1. ESTAÇÕES — seasonIndexForMonth cobre os 12 meses (hemisfério sul) e
//      é à prova de entrada suja (NaN/negativo/overflow);
//   2. MATIZ — shiftAuraHex desloca o hue preservando s/l e nunca repete a
//      aura de outra estação; hex inválido cai na assinatura;
//   3. DECISÃO — hudAuraFor: null sem skin mítica (HUD neutro, custo 0),
//      ativa com estação/durMul/shimmer coerentes e determinismo por data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUD_SEASONS, seasonIndexForMonth, seasonIndexFor, shiftAuraHex, hudAuraFor,
  weaponIconVars,   // F37 — ícone da arma no inventário (mapeamento puro)
  crosshairVars,    // F38 — mira/crosshair no festival por aura (mapeamento puro)
  killfeedVars, damageVars,           // F39 — killfeed + números de dano no festival
  MINIMAP_SEASON_TINTS, minimapTintFor, // F39 — tint sazonal do minimapa por estação
} from '../src/game3d/aura3d.js';
import { MYTHIC_SKINS } from '../src/game3d/attachments3d.js';

test('F36 · estações meteorológicas (hemisfério sul): 12 meses mapeados', () => {
  // verão: dez(11), jan(0), fev(1) · outono: mar-mai (2-4)
  // inverno: jun-ago (5-7) · primavera: set-nov (8-10)
  const expect = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0];
  for (let m = 0; m < 12; m++) assert.equal(seasonIndexForMonth(m), expect[m], `mês ${m}`);
  // robustez: entrada suja não quebra (NaN → 0; negativo → módulo; overflow → wrap)
  assert.equal(seasonIndexForMonth(NaN), 0);
  assert.equal(seasonIndexForMonth(-1), 0, '-1 = dezembro = verão');
  assert.equal(seasonIndexForMonth(14), expect[2], '14 wrap = março');
  assert.equal(seasonIndexForMonth(25), expect[1], '25 wrap = fevereiro');
});

test('F36 · seasonIndexFor: Date inválida cai no fallback determinístico', () => {
  assert.equal(seasonIndexFor(new Date(2026, 0, 15)), 0, '15/jan = verão');
  assert.equal(seasonIndexFor(new Date(2026, 6, 15)), 2, '15/jul = inverno');
  assert.equal(seasonIndexFor(new Date(2026, 8, 25)), 3, '25/set = primavera');
  assert.equal(seasonIndexFor(new Date(2026, 2, 1)), 1, '1/mar = outono');
  // fallback: sem data / data podre → guard determinístico (15/07 = inverno)
  assert.equal(seasonIndexFor(null), 2, 'fallback = inverno (data canônica)');
  assert.equal(seasonIndexFor(new Date('podre')), 2, 'Date podre = inverno (data canônica)');
});

test('F36 · shiftAuraHex: desloca matiz, preserva s/l, idempotente no shift 0', () => {
  const aura = '#ff2d78';
  assert.equal(shiftAuraHex(aura, 0), aura.toLowerCase(), 'shift 0 = aura intacta');
  // shift muda o hue MAS não repete nenhuma outra aura do catálogo
  const catalog = new Set(Object.values(MYTHIC_SKINS).map((d) => d.aura.toLowerCase()));
  for (const season of HUD_SEASONS) {
    if (season.hueShift === 0) continue;
    const shifted = shiftAuraHex(aura, season.hueShift);
    assert.notEqual(shifted, aura.toLowerCase(), `${season.id}: matiz deslocada`);
    assert.ok(/#[0-9a-f]{6}/.test(shifted), `${season.id}: hex válido (${shifted})`);
    assert.ok(!catalog.has(shifted.toLowerCase()) || shifted === aura.toLowerCase(),
      `${season.id}: estação não colide com outra aura do catálogo`);
  }
  // shift full-circle = identidade
  assert.equal(shiftAuraHex(aura, 360), aura.toLowerCase(), '360° = volta ao início');
  assert.equal(shiftAuraHex('não-é-cor', 8), '#ff2d78', 'hex inválido → assinatura');
});

test('F36 · hudAuraFor: null sem skin mítica (HUD neutro, custo zero)', () => {
  const july = new Date(2026, 6, 15);
  assert.equal(hudAuraFor({ weaponId: 'ar47', weaponSkin: 'LENDARIO', now: july }), null, 'skin não-mítica → null');
  assert.equal(hudAuraFor({ weaponId: 'ar47', weaponSkin: null, now: july }), null, 'sem skin → null');
  assert.equal(hudAuraFor({ weaponId: 'ar47', now: july }), null, 'weaponSkin ausente → null');
  // AGNÓSTICA por arma: a estação não depende do catálogo — o CHAMADOR (hud3d)
  // só invoca quando mythicSkinFor(weapon) existe; a decisão pura decide por
  // skin/estação (contrato documentado — não duplica o gate do catálogo).
  const unknown = hudAuraFor({ weaponId: 'desconhecida', weaponSkin: 'MITICA', now: july });
  assert.equal(unknown?.active, true, 'sem catálogo ainda decide (agnóstica por arma)');
});

test('F36 · hudAuraFor ativa: estação coerente com a data e ritmo da temporada', () => {
  const cases = [
    { date: new Date(2026, 0, 10), season: 'verao', durMul: 1, shimmer: 105 },
    { date: new Date(2026, 3, 20), season: 'outono', durMul: 1.18, shimmer: 121 },
    { date: new Date(2026, 6, 15), season: 'inverno', durMul: 1.4, shimmer: 75 },
    { date: new Date(2026, 9, 5), season: 'primavera', durMul: .84, shimmer: 137 },
  ];
  for (const c of cases) {
    const aura = hudAuraFor({ weaponId: 'shotgun', weaponSkin: 'MITICA', mythicStage: 3, now: c.date });
    assert.ok(aura, `${c.season}: decisão ativa`);
    assert.equal(aura.season, c.season);
    assert.equal(aura.durMul, c.durMul, `${c.season}: ritmo do festival`);
    assert.equal(aura.shimmerAngle, c.shimmer, `${c.season}: ângulo do shimmer`);
    assert.equal(aura.stage, 3, 'estágio mítico preservado');
    assert.equal(aura.seasonIdx, HUD_SEASONS.findIndex((s) => s.id === c.season));
  }
  // determinismo: mesma data → mesma decisão (byte a byte)
  const a = hudAuraFor({ weaponId: 'lmg', weaponSkin: 'MITICA', mythicStage: 2, now: new Date(2026, 6, 15) });
  const b = hudAuraFor({ weaponId: 'lmg', weaponSkin: 'MITICA', mythicStage: 2, now: new Date(2026, 6, 15) });
  assert.deepEqual({ ...a }, { ...b }, 'mesma data → mesma decisão');
  // fallback headless (sem now): decisão estável entre chamadas
  const c1 = hudAuraFor({ weaponId: 'lmg', weaponSkin: 'MITICA' });
  const c2 = hudAuraFor({ weaponId: 'lmg', weaponSkin: 'MITICA' });
  assert.deepEqual({ ...c1 }, { ...c2 }, 'fallback determinístico');
  // estágio sujo (0/NaN/99) clampa para 1..4
  assert.equal(hudAuraFor({ weaponSkin: 'MITICA', mythicStage: 99 }).stage, 4);
  assert.equal(hudAuraFor({ weaponSkin: 'MITICA', mythicStage: 0 }).stage, 1);
});

// ================================== Fase 37 — ícone da arma no inventário ====

test('F37 · weaponIconVars: variáveis da temporada mapeadas para o ícone (PURO)', () => {
  // com aura ativa + hex do catálogo: MESMAS variáveis do badge/vinheta
  const aura = hudAuraFor({ weaponId: 'shotgun', weaponSkin: 'MITICA', mythicStage: 2, now: new Date(2026, 6, 15) });
  const v = weaponIconVars(aura, '#ff2d78');
  assert.ok(v, 'aura mítica ativa → variáveis do ícone');
  assert.equal(v.aura, '#ff2d78', 'identidade da skin preservada (--aura)');
  assert.equal(v.season, shiftAuraHex('#ff2d78', aura.hueShift), 'glow TINGIDO pela estação (--aura-season)');
  assert.equal(v.dur, String(aura.durMul), 'ritmo da temporada (--aura-dur)');
  assert.equal(v.shimmerAngle, aura.shimmerAngle, 'ângulo do shimmer da estação');
  // 4 estações: season muda, identidade NUNCA
  for (const m of [0, 3, 6, 9]) {
    const a = hudAuraFor({ weaponSkin: 'MITICA', now: new Date(2026, m, 15) });
    const vv = weaponIconVars(a, '#4d9bff');
    assert.equal(vv.aura, '#4d9bff', `mês ${m}: identidade intacta`);
    assert.equal(vv.season, shiftAuraHex('#4d9bff', a.hueShift));
    assert.ok(/^#[0-9a-f]{6}$/i.test(vv.season), `mês ${m}: season hex canônico`);
  }
  // congelado (contrato de objeto compartilhado com o DOM)
  assert.ok(Object.isFrozen(v), 'retorno congelado');
});

test('F37 · weaponIconVars: null sem aura ou com hex inválido (ícone neutro, custo 0)', () => {
  // sem skin mítica → hudAuraFor null → ícone neutro
  assert.equal(weaponIconVars(null, '#ff2d78'), null, 'sem aura → null');
  // aura inativa (guard defensivo — hudAuraFor nunca devolve active:false, mas
  // o contrato do mapper é robusto)
  assert.equal(weaponIconVars({ active: false }, '#ff2d78'), null, 'aura.inactive → null');
  // hex inválido/lixo → null (catálogo é a fonte; HUD não inventa cor)
  const aura = hudAuraFor({ weaponSkin: 'MITICA', now: new Date(2026, 6, 15) });
  assert.equal(weaponIconVars(aura, null), null, 'hex null → null');
  assert.equal(weaponIconVars(aura, 'rosa'), null, 'hex lixo → null');
  assert.equal(weaponIconVars(aura, '#ff2d7'), null, 'hex curto → null');
  assert.equal(weaponIconVars(aura, '#ff2d788'), null, 'hex longo → null');
  assert.equal(weaponIconVars(aura, undefined), null, 'hex undefined → null');
});

// ================================================= Fase 38 — mira sazonal ====

test('F38 · crosshairVars: identidade nos braços, estação no ponto/glow, ritmo da temporada', () => {
  const july = new Date(2026, 6, 15); // inverno (hemisfério sul)
  const aura = hudAuraFor({ weaponSkin: 'MITICA', now: july });
  const v = crosshairVars(aura, '#ff2d78');
  assert.ok(v, 'mítica → variáveis da mira');
  assert.equal(v.aura, '#ff2d78', 'identidade da skin preservada (--ch-aura)');
  assert.equal(v.season, shiftAuraHex('#ff2d78', aura.hueShift), 'ponto/glow TINGIDO pela estação (--ch-season)');
  assert.equal(v.dur, String(aura.durMul), 'ritmo da temporada (--ch-dur)');
  // 4 estações: season muda, identidade NUNCA (mesma fonte única do badge/ícone)
  for (const m of [0, 3, 6, 9]) {
    const a = hudAuraFor({ weaponSkin: 'MITICA', now: new Date(2026, m, 15) });
    const vv = crosshairVars(a, '#4d9bff');
    assert.equal(vv.aura, '#4d9bff', `mês ${'primeiro+3m'.length && m}: identidade intacta`);
    assert.equal(vv.season, shiftAuraHex('#4d9bff', a.hueShift));
    assert.ok(/^#[0-9a-f]{6}$/i.test(vv.season), `mês ${m}: season hex canônico`);
  }
  assert.ok(Object.isFrozen(v), 'retorno congelado (contrato de objeto compartilhado com o DOM)');
});

test('F38 · crosshairVars: null sem aura/hex inválido (mira neutra, custo 0)', () => {
  assert.equal(crosshairVars(null, '#ff2d78'), null, 'sem aura → null');
  assert.equal(crosshairVars({ active: false }, '#ff2d78'), null, 'aura inativa → null');
  const aura = hudAuraFor({ weaponSkin: 'MITICA', now: new Date(2026, 6, 15) });
  assert.equal(crosshairVars(aura, null), null, 'hex null → null');
  assert.equal(crosshairVars(aura, 'rosa'), null, 'hex lixo → null');
  assert.equal(crosshairVars(aura, '#ff2d7'), null, 'hex curto → null');
  assert.equal(crosshairVars(aura, undefined), null, 'hex undefined → null');
});

// =============================== Fase 39 — killfeed/dano/minimapa sazonal ====

test('F39 · killfeedVars/damageVars: mesma fonte única (contrato do mapper puro)', () => {
  const july = new Date(2026, 6, 15); // inverno (hemisfério sul)
  const aura = hudAuraFor({ weaponSkin: 'MITICA', now: july });
  const kf = killfeedVars(aura, '#ff2d78');
  const dg = damageVars(aura, '#ff2d78');
  const base = weaponIconVars(aura, '#ff2d78');
  assert.ok(kf && dg && base, 'mítica → variáveis dos três consumidores');
  assert.deepEqual({ ...kf }, { ...base }, 'killfeedVars === weaponIconVars (fonte única)');
  assert.deepEqual({ ...dg }, { ...base }, 'damageVars === weaponIconVars (fonte única)');
  assert.equal(kf.aura, '#ff2d78', 'identidade da skin preservada');
  assert.equal(kf.season, shiftAuraHex('#ff2d78', aura.hueShift), 'glow tingido pela estação');
  assert.equal(kf.dur, String(aura.durMul), 'ritmo da temporada');
  assert.ok(Object.isFrozen(kf) && Object.isFrozen(dg), 'retornos congelados');
  // 4 estações: identidade NUNCA muda, season sempre hex canônico
  for (const m of [0, 3, 6, 9]) {
    const a = hudAuraFor({ weaponSkin: 'MITICA', now: new Date(2026, m, 15) });
    const v = killfeedVars(a, '#4d9bff');
    assert.equal(v.aura, '#4d9bff', `mês ${m}: identidade intacta`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(v.season), `mês ${m}: season hex canônico`);
  }
  // null guards (consumidor neutro, custo 0)
  assert.equal(killfeedVars(null, '#ff2d78'), null, 'sem aura → null');
  assert.equal(damageVars(null, '#ff2d78'), null, 'sem aura → null');
  assert.equal(killfeedVars(aura, 'lixo'), null, 'hex lixo → null');
  assert.equal(damageVars(aura, '#ff2d7'), null, 'hex curto → null');
});

test('F39 · MINIMAP_SEASON_TINTS: 4 estações congeladas, ids na ordem do calendário', () => {
  assert.equal(MINIMAP_SEASON_TINTS.length, 4, '4 estações');
  assert.deepEqual(MINIMAP_SEASON_TINTS.map((t) => t.id), HUD_SEASONS.map((s) => s.id),
    'mesma ordem/ids do calendário do festival (verão→outono→inverno→primavera)');
  for (const tint of MINIMAP_SEASON_TINTS) {
    assert.ok(Object.isFrozen(tint), `${tint.id}: entrada congelada`);
    assert.ok(/^rgba\(\d+,\d+,\d+,\.1\d?\)$/.test(tint.overlay.replace(/\s/g, '')),
      `${tint.id}: véu rgba com alpha ≤ .12 (${tint.overlay})`);
    assert.ok(/^rgba\(/.test(tint.grid), `${tint.id}: grade rgba`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(tint.edge), `${tint.id}: borda hex canônica`);
  }
  // semáforo funcional intacto: as cores dos marcadores NÃO estão na tabela
  // (terminal verde/loot ciano/recon âmbar/jogador dourado são semâforos fixos)
  const table = JSON.stringify(MINIMAP_SEASON_TINTS);
  assert.ok(!table.includes('#39ff88') && !table.includes('#ffd28a') && !table.includes('#ffb52e'),
    'tabela de tint NÃO toca os semáforos funcionais do radar');
});

test('F39 · minimapTintFor: determinístico, clamp módulo e estações distintas', () => {
  for (let i = 0; i < 4; i++) assert.equal(minimapTintFor(i), MINIMAP_SEASON_TINTS[i], `índice ${i}`);
  // entrada suja cai no módulo — o radar nunca fica sem estação
  assert.equal(minimapTintFor(NaN), MINIMAP_SEASON_TINTS[0], 'NaN → verão');
  assert.equal(minimapTintFor(-1), MINIMAP_SEASON_TINTS[3], '-1 → módulo → primavera');
  assert.equal(minimapTintFor(4), MINIMAP_SEASON_TINTS[0], '4 → verão');
  assert.equal(minimapTintFor(7), MINIMAP_SEASON_TINTS[3], '7 → primavera');
  assert.equal(minimapTintFor(99), MINIMAP_SEASON_TINTS[3], '99 → primavera');
  // retorno sempre congelado (objeto compartilhado com o DOM)
  assert.ok(Object.isFrozen(minimapTintFor(2)), 'retorno congelado');
  // estações visualmente distintas (grade e véu diferem — o tint é perceptível)
  const grids = new Set(MINIMAP_SEASON_TINTS.map((t) => t.grid));
  const edges = new Set(MINIMAP_SEASON_TINTS.map((t) => t.edge));
  assert.equal(grids.size, 4, '4 grades distintas');
  assert.equal(edges.size, 4, '4 bordas distintas');
  // integração com o calendário: julho (hemisfério sul) → inverno no radar
  assert.equal(minimapTintFor(seasonIndexFor(new Date(2026, 6, 15))).id, 'inverno',
    'julho → tint de inverno no minimapa');
});
