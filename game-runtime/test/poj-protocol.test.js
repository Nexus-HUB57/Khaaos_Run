// Khaaos Run — Protocolo de Ordem de Jogo (POJ): os 11 artigos + preceito da
// vida única. Motor puro com tempo comprimido (daySeconds pequeno) para testes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProtocoloDeOrdemDeJogo, PojError, POJ_RULES, FASES,
  PATENTE_HIERARQUIA, pesoPatente, rule9Minutes, TIEBREAK_CRITERIA,
} from '../src/game3d/poj.js';

const DAY = 240; // dia canônico comprimido (24 h → 240 s; 1 h = 10 s)

const make = (over = {}) => new ProtocoloDeOrdemDeJogo({
  daySeconds: DAY, marshalSeed: 'teste-marechal',
  enlistmentTotal: over.total ?? 10, cigkvTrigger: over.trigger ?? 5,
  ...over,
});

// registra N alistados de uma vez
const enlist = (proto, n, patente = 'Recruta') => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(proto.register(`p${i + 1}`, { patente }).playerId);
  return out;
};

// abre a guerra (consumindo a contagem de 24 h do 3º artigo)
const openWar = (proto) => proto.advance(POJ_RULES.CLOSURE_COUNTDOWN_SECONDS);

// Marcha protegida até (mundo, dia, fração): participa de uma incursão por dia
// para cada id protegido — sem isso a anti-covardia julga quem fica parado.
function marchTo(proto, ids, world, day, frac = 0) {
  const target = POJ_RULES.CLOSURE_COUNTDOWN_SECONDS + (world * POJ_RULES.WORLD_DAYS + (day - 1)) * DAY + frac * DAY;
  let guard = 0;
  while (proto.clock < target && guard++ < 200) {
    const remaining = target - proto.clock;
    if (proto.phase === FASES.GUERRA) {
      const inc = proto.summonIncursion();
      for (const id of ids) {
        const p = proto.snapshot().players.find((x) => x.id === id);
        if (p?.alive && p?.status === 'ativo') proto.attendIncursion(inc.id, id);
      }
      proto.closeIncursion(inc.id);
      proto.advance(Math.min(remaining, DAY - proto.dayElapsed));
    } else {
      proto.advance(remaining);
    }
  }
}

const expect = (fn, code) => assert.throws(fn, (e) => e instanceof PojError && e.code === code);

// ---------- artigos 1º–3º: alistamento, CIGKV e contagem ----------
test('poj 1º: alistamento aberto registra jogadores com patente canônica', () => {
  const proto = make();
  const ids = enlist(proto, 3, 'Sargento');
  assert.equal(proto.registrations, 3);
  assert.equal(proto.phase, FASES.ALISTAMENTO);
  const snap = proto.snapshot();
  assert.ok(snap.players.every((p) => p.alive && p.status === 'ativo'));
  assert.equal(snap.players[0].patente, 'Sargento');
  assert.ok(ids.length === 3);
});

test('poj 1º: patente fora da hierarquia cai como Recruta', () => {
  const proto = make();
  proto.register('p1', { patente: 'Almirante Supremo' });
  assert.equal(proto.snapshot().players[0].patente, 'Recruta');
});

test('poj 2º: 50% das inscrições abrem o CIGKV', () => {
  const proto = make({ total: 10, trigger: 5 });
  enlist(proto, 4);
  assert.equal(proto.cigkvOpen, false);
  proto.register('p5');
  assert.equal(proto.cigkvOpen, true, 'CIGKV aberto na metade (5/10)');
  assert.ok(proto.events.some((e) => e.type === 'cigkv_aberto'));
});

test('poj 3º: 1.000.000ª inscrição encerra alistamento e arma contagem de 24 h', () => {
  const proto = make({ total: 10, trigger: 5 });
  enlist(proto, 10);
  assert.equal(proto.phase, FASES.CONTAGEM);
  assert.ok(proto.countdown > 0);
  expect(() => proto.register('p11'), 'alistamento_encerrado');
  expect(() => proto.register('p1'), 'inscricao_duplicada');
  // avança 23 h: ainda em contagem
  proto.advance(23 * 3600);
  assert.equal(proto.phase, FASES.CONTAGEM);
  proto.advance(3600); // completa 24 h
  assert.equal(proto.phase, FASES.GUERRA);
  assert.equal(proto.cigkvOpen, false, 'CIGKV fecha com o início dos Rings');
  assert.equal(proto.snapshot().world, 'Barburhen');
  assert.equal(proto.snapshot().day, 1);
});

test('poj 3º: contagem canônica é de 24 h (86400 s)', () => {
  assert.equal(POJ_RULES.CLOSURE_COUNTDOWN_SECONDS, 86400);
  assert.equal(POJ_RULES.ENLISTMENT_TOTAL, 1_000_000);
  assert.equal(POJ_RULES.CIGKV_TRIGGER, 500_000);
});

// ---------- preceito fundamental: UMA vida, sem reingresso ----------
test('poj preceito: morte consome a única chance e bloqueia reingresso', () => {
  const proto = make();
  enlist(proto, 10);
  const a = 'p1';
  openWar(proto);
  const inc = proto.summonIncursion();
  proto.attendIncursion(inc.id, a, { died: true });
  expect(() => proto.attendIncursion(inc.id, a), 'sem_reingresso');
  expect(() => proto.eliminate(a), 'sem_reingresso');
  const snap = proto.snapshot();
  const dead = snap.players.find((p) => p.id === a);
  assert.equal(dead.alive, false);
  assert.equal(dead.status, 'eliminado');
});

// ---------- incursões e convocação ----------
test('poj convocação: todos os sobreviventes ativos são convocados', () => {
  const proto = make({ total: 4, trigger: 2 });
  const ids = enlist(proto, 4);
  openWar(proto);
  const inc = proto.summonIncursion();
  assert.deepEqual(inc.summoned.sort(), [...ids].sort());
  proto.attendIncursion(inc.id, ids[0]);
  proto.attendIncursion(inc.id, ids[1]);
  const { ausentes } = proto.closeIncursion(inc.id);
  assert.deepEqual(ausentes.sort(), [ids[2], ids[3]].sort());
  const p = proto.snapshot().players.find((x) => x.id === ids[0]);
  assert.equal(p.incursoes, 1);
});

test('poj incursões só existem em guerra', () => {
  const proto = make();
  enlist(proto, 2);
  expect(() => proto.summonIncursion(), 'fora_de_guerra');
});

// ---------- covardia: zero incursões no mundo → Corte Marcial ----------
test('poj preceito anti-covardia: sobrevivente sem incursão no mundo é julgado', () => {
  const proto = make();
  enlist(proto, 10);
  const [a, b] = ['p1', 'p2'];
  openWar(proto); // Barburhen dia 1
  const inc = proto.summonIncursion();
  proto.attendIncursion(inc.id, a);
  proto.closeIncursion(inc.id);
  // termina os 7 dias de Barburhen: b nunca participou → julgado no fechamento
  marchTo(proto, [a], 1, 1); // mundo 1 (Priadus), dia 1 (protegendo apenas a)
  const snap = proto.snapshot();
  const covarde = snap.players.find((x) => x.id === b);
  assert.equal(covarde.status, 'corte_marcial');
  assert.equal(covarde.alive, false);
  assert.ok(proto.events.some((e) => e.type === 'corte_marcial' && e.motivo === 'covardia_mundial'));
  assert.ok(proto.snapshot().survivors.includes(a), 'participante prossegue');
});

// ---------- 7º artigo: oficiais no início do 7º dia de Arukheea ----------
test('poj 7º: >10% dos inscritos → 3 oficiais por no mínimo 3 min por Ring', () => {
  const proto = make();
  const ids = enlist(proto, 10);
  openWar(proto);
  marchTo(proto, ids, 3, 7, 0.3); // Arukheea, dia 7, fora da janela das últimas 6 h
  // Fase 11 — limiar proporcional em alistamento comprimido: 10% de 10 = 1
  assert.equal(proto.rule7MinSurvivors, 1);
  const plan = proto.officerEntryPlan(2); // 2 sobreviventes de 10 (> 10%)
  assert.equal(plan.allowed, true);
  assert.equal(plan.article, '7º');
  assert.equal(plan.minutesPerRing, 3);
  assert.equal(plan.officers, 3);
  const noEntry = proto.officerEntryPlan(1); // exatamente 10% NÃO autoriza (> 1)
  assert.equal(noEntry.allowed, false);
  // canônico: 1.000.000 → limiar exato dos 100.000 do regramento
  const canonical = new (proto.constructor)();
  assert.equal(canonical.rule7MinSurvivors, 100_000);
  const outOfWindow = canonical.officerEntryPlan(999_999); // fora do 7º dia
  assert.equal(outOfWindow.allowed, false);
  assert.equal(outOfWindow.article, null);
});

// ---------- 9º artigo: faixas das últimas 6 horas ----------
test('poj 9º: rule9Minutes aplica as faixas canônicas', () => {
  assert.equal(rule9Minutes(1001), 5);
  assert.equal(rule9Minutes(1000), 3);
  assert.equal(rule9Minutes(751), 3);
  assert.equal(rule9Minutes(750), 1);
  assert.equal(rule9Minutes(500), 1);
  assert.equal(rule9Minutes(499), 0);
  assert.equal(rule9Minutes(0), 0);
});

test('poj 9º: plano de entrada na janela das últimas 6 h do 7º dia', () => {
  const proto = make();
  const ids = enlist(proto, 10);
  openWar(proto);
  marchTo(proto, ids, 3, 7, 0.8); // Arukheea, dia 7, últimas 6 h (frac ≥ 0.75)
  const plan = proto.officerEntryPlan(1200);
  assert.equal(plan.article, '9º');
  assert.equal(plan.minutesPerRing, 5);
  assert.equal(plan.allowed, true);
  const plan2 = proto.officerEntryPlan(600);
  assert.equal(plan2.minutesPerRing, 1);
  const plan3 = proto.officerEntryPlan(400);
  assert.equal(plan3.allowed, false);
  assert.equal(plan3.minutesPerRing, 0);
});

// ---------- 8º artigo: evasão nas primeiras 12 h do 7º dia ----------
test('poj 8º: evitar combates mais de 3 vezes → desclassificado e julgado', () => {
  const proto = make({ total: 10, trigger: 5 });
  enlist(proto, 10, 'Tenente');
  const [fujao, heroi] = ['p1', 'p2'];
  openWar(proto);
  marchTo(proto, [fujao, heroi], 3, 7, 0.2); // Arukheea, dia 7, primeiras 12 h
  for (let i = 0; i < 3; i++) {
    const inc = proto.summonIncursion();
    proto.attendIncursion(inc.id, heroi);
    proto.closeIncursion(inc.id); // fujão convocado e ausente → evasão
  }
  let snap = proto.snapshot();
  assert.equal(snap.players.find((p) => p.id === fujao).evasions, 3, '3 evasões ainda toleradas');
  const inc4 = proto.summonIncursion();
  proto.attendIncursion(inc4.id, heroi);
  proto.closeIncursion(inc4.id);
  snap = proto.snapshot();
  const julgado = snap.players.find((p) => p.id === fujao);
  assert.equal(julgado.status, 'corte_marcial', '4ª evasão excede o limite de 3');
  assert.ok(proto.events.some((e) => e.type === 'corte_marcial' && e.motivo === 'evasao'));
  // heroi não é molestado
  assert.equal(snap.players.find((p) => p.id === heroi).status, 'ativo');
});

// ---------- 10º artigo: última hora, convocação obrigatória ----------
test('poj 10º: na última hora a desobediência desclassifica na hora', () => {
  const proto = make({ total: 10, trigger: 5 });
  enlist(proto, 10);
  const [obediente, desertor] = ['p1', 'p2'];
  openWar(proto);
  marchTo(proto, [obediente, desertor], 3, 7, 0.97); // dia 7, ainda fora da última hora
  // avança só 30 min canônicos (0.01 do dia) para entrar na última hora
  proto.advance(DAY * 0.011);
  assert.ok(proto.snapshot().windows.regra10_horaFinal, 'janela do 10º artigo ativa');
  const inc = proto.summonIncursion();
  proto.attendIncursion(inc.id, obediente);
  proto.closeIncursion(inc.id);
  const snap = proto.snapshot();
  assert.equal(snap.players.find((p) => p.id === desertor).status, 'corte_marcial');
  assert.ok(proto.events.some((e) => e.type === 'corte_marcial' && e.motivo === 'desobediencia_final'));
});

// ---------- 11º artigo: cadeia de desempate ----------
test('poj 11º: patente decide quando é diferente', () => {
  const proto = make({ total: 10, trigger: 5 });
  enlist(proto, 10);
  openWar(proto);
  proto.reportCareer('p1', { kills: 0, xp: 0, patente: 'General' });
  proto.reportCareer('p2', { kills: 0, xp: 0, patente: 'Soldado' });
  const rank = proto.ranking();
  assert.equal(rank[0].playerId, 'p1');
  assert.equal(pesoPatente('General'), 9);
  assert.deepEqual(TIEBREAK_CRITERIA, ['patente', 'incursoes', 'kills', 'xp', 'marechal']);
});

test('poj 11º: incursões, kills e XP na ordem canônica', () => {
  const proto = make({ total: 10, trigger: 5 });
  enlist(proto, 10, 'Capitão');
  openWar(proto);
  proto.reportCareer('p1', { kills: 5, xp: 100 });
  proto.reportCareer('p2', { kills: 8, xp: 100 });
  proto.reportCareer('p3', { kills: 8, xp: 300 });
  const rank = proto.ranking();
  assert.equal(rank[0].playerId, 'p3', 'kills empate → XP decide');
  assert.equal(rank[1].playerId, 'p2');
  assert.equal(rank[2].playerId, 'p1');
});

test('poj 11º: empate total → Decisão do Marechal (determinística por seed)', () => {
  const proto = make({ total: 10, trigger: 5, marshalSeed: 'sede-única' });
  const ids = enlist(proto, 10, 'General');
  openWar(proto);
  marchTo(proto, ids, 3, 7, 1); // termina a guerra com os 2 vivos
  assert.equal(proto.phase, FASES.JULGAMENTO);
  const r1 = proto.resolveChampion();
  assert.equal(r1.criterion, 'marechal');
  assert.ok(r1.marechalCriterion, 'duelo|combate|missao');
  const winner = r1.championId;
  // mesma seed → mesmo campeão (determinismo do regramento)
  const proto2 = make({ total: 10, trigger: 5, marshalSeed: 'sede-única' });
  const ids2 = enlist(proto2, 10, 'General');
  openWar(proto2);
  marchTo(proto2, ids2, 3, 7, 1);
  const r2 = proto2.resolveChampion();
  assert.equal(r2.championId, winner);
  assert.equal(proto2.phase, FASES.ENCERRADO);
  assert.ok(proto2.events.some((e) => e.type === 'campeao'));
});

test('poj 11º: um único sobrevivente é campeão direto', () => {
  const proto = make({ total: 10, trigger: 5 });
  enlist(proto, 10);
  const a = 'p1';
  openWar(proto);
  proto.eliminate('p2', 'kia');
  marchTo(proto, [a], 3, 7, 1); // termina a guerra; os demais são julgados por covardia
  const r = proto.resolveChampion();
  assert.equal(r.championId, a);
  assert.equal(r.criterion, 'unico_sobrevivente');
  assert.equal(proto.phase, FASES.ENCERRADO);
});

// ---------- guerra completa comprimida (integração dos artigos) ----------
test('poj integração: guerra de 4 mundos com baixas, covardia e campeão', () => {
  const proto = make({ total: 3, trigger: 2 });
  enlist(proto, 3);
  openWar(proto); // começa a guerra
  assert.equal(proto.snapshot().world, 'Barburhen');
  // cada mundo: incursão com p1 e p2; p1 morre em Ckesalth; p3 abandona (covarde)
  for (let w = 0; w < 4; w++) {
    const inc = proto.summonIncursion();
    if (proto.snapshot().players.find((p) => p.id === 'p1').alive) {
      proto.attendIncursion(inc.id, 'p1', { died: w === 2 }); // morre em Ckesalth
    }
    proto.attendIncursion(inc.id, 'p2');
    proto.closeIncursion(inc.id);
    const fimDoMundo = POJ_RULES.CLOSURE_COUNTDOWN_SECONDS + (w + 1) * POJ_RULES.WORLD_DAYS * DAY;
    proto.advance(Math.max(0, fimDoMundo - proto.clock)); // fecha os 7 dias do mundo
  }
  const snap = proto.snapshot();
  assert.equal(snap.players.find((p) => p.id === 'p1').status, 'eliminado');
  assert.equal(snap.players.find((p) => p.id === 'p3').status, 'corte_marcial', 'zero incursões = covardia');
  assert.equal(snap.players.find((p) => p.id === 'p2').status, 'ativo');
  const r = proto.resolveChampion();
  assert.equal(r.championId, 'p2');
  assert.equal(proto.phase, FASES.ENCERRADO);
  assert.equal(proto.snapshot().world, null);
});

// ---------- progressão de mundos e dias ----------
test('poj 4º–6º: sequência canônica dos mundos e 7 dias cada', () => {
  assert.deepEqual(POJ_RULES.WORLDS, ['Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']);
  assert.equal(POJ_RULES.WORLD_DAYS, 7);
  const proto = make({ total: 10, trigger: 5 });
  const ids = enlist(proto, 10);
  openWar(proto);
  for (let d = 0; d < 6; d++) {
    const inc = proto.summonIncursion();
    for (const id of ids) proto.attendIncursion(inc.id, id);
    proto.closeIncursion(inc.id);
    proto.advance(DAY);
  }
  assert.equal(proto.snapshot().day, 7);
  const inc7 = proto.summonIncursion();
  for (const id of ids) proto.attendIncursion(inc7.id, id);
  proto.closeIncursion(inc7.id);
  proto.advance(DAY); // fecha Barburhen → Priadus
  const snap = proto.snapshot();
  assert.equal(snap.world, 'Priadus');
  assert.equal(snap.day, 1);
});

// ---------- API guarda ----------
test('poj API: operações inválidas rejeitam com códigos estáveis', () => {
  const proto = make();
  enlist(proto, 2);
  expect(() => proto.attendIncursion('inc-999', 'p1'), 'incursao_invalida');
  expect(() => proto.eliminate('fantasma'), 'jogador_inexistente');
  expect(() => proto.resolveChampion(), 'guerra_em_curso');
  expect(() => proto.advance(-1), 'avanco_invalido');
  expect(() => proto.courtMartial('p1', 'motivo_falso'), 'motivo_invalido');
});

test('poj hierarquia: peso da patente é monotônico', () => {
  for (let i = 1; i < PATENTE_HIERARQUIA.length; i++) {
    assert.ok(pesoPatente(PATENTE_HIERARQUIA[i]) > pesoPatente(PATENTE_HIERARQUIA[i - 1]));
  }
  assert.equal(pesoPatente('desconhecida'), 0);
});
