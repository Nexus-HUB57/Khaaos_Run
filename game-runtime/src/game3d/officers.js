// Khaaos Run — Oficiais de Classe Especial (7º/9º artigos do POJ).
//
// Os 3 Oficiais de Classe Especial são entidades de ELITE que podem entrar no
// Ring/Batalha quando o regramento autoriza (dia 7 de Arukheea). Este módulo é
// PURO e determinístico: nenhuma dependência de rede/cena — a sala autoritativa
// (server/room3d.js) e a sim offline consomem as mesmas tabelas, preservando a
// filosofia "simulação headless → renderizador burro".
//
// Contrato com o POJ: a sala recebe officerPlanFn() → { allowed, minutesPerRing,
// article } (plano do ProtocoloDeOrdemDeJogo.officerEntryPlan). Se allowed, os
// oficiais são implantados no início da partida e se RETIRAM ao fim de
// minutesPerRing minutos — "podem entrar por no mínimo 3 minutos por Ring" vira
// duração exata autoritativa (nunca menos que o mínimo canônico).

export const SPECIAL_CLASS_OFFICERS = Object.freeze([
  {
    id: 'OCE_01',
    name: 'OCE-VALKON',
    operativeId: 'OP_MALE_VANGUARD',   // identidade visual sincronizada (Fase 8)
    weapon: 'm4',
    armor: 60,
    speed: 5.35,
    callsign: 'Oficial de Classe Especial I',
  },
  {
    id: 'OCE_02',
    name: 'OCE-MORRAK',
    operativeId: 'OP_FEMALE_HEAVY_AFRICAN',
    weapon: 'mp5',
    armor: 70,
    speed: 5.05,
    callsign: 'Oficial de Classe Especial II',
  },
  {
    id: 'OCE_03',
    name: 'OCE-SYLVEX',
    operativeId: 'OP_FEMALE_SNIPER',
    weapon: 'm4',
    armor: 50,
    speed: 5.5,
    callsign: 'Oficial de Classe Especial III',
  },
]);

// Combate de elite: os oficiais são referência tática — reação mais curta,
// rajadas disciplinadas e erro humano reduzido. O DANO segue a mesma curva de
// decaimento por distância dos bots (botDamageScale × dmgMult da tabela) para
// não criar letalidade injusta; a elite vem de precisão e disciplina, não de
// números inflados.
export const OFFICER_COMBAT = Object.freeze({
  aimErrMult: 0.55,       // erro humano ×0.55 (mira de oficial)
  reactionMult: 0.55,     // reação 0.21–0.44 s
  burstMin: 3,
  burstMax: 6,
  burstCooldownMult: 0.7, // pausa entre rajadas ×0.7
  dmgMult: 0.9,           // dano ×0.9 (elite, mas não desproporcional)
  reloadChance: 0.15,
});

// Ajusta os parâmetros de engajamento do bot-base para o padrão OFICIAL.
// Recebe { aimErrBase, aimErrMax, reactionMin, reactionMax, burstMin, burstMax,
// burstCooldownMin, burstCooldownMax } (valores de BOT_COMBAT) e devolve os
// valores efetivos — PURA, testável, sem tocar a tabela canônica.
export function officerCombatParams(base = {}) {
  const c = OFFICER_COMBAT;
  return {
    aimErrBase: (base.aimErrBase ?? 0.5) * c.aimErrMult,
    aimErrMax: (base.aimErrMax ?? 1.35) * c.aimErrMult,
    aimErrPerM: base.aimErrPerM ?? 0.014,
    reactionMin: (base.reactionMin ?? 0.38) * c.reactionMult,
    reactionMax: (base.reactionMax ?? 0.8) * c.reactionMult,
    burstMin: c.burstMin,
    burstMax: c.burstMax,
    burstCooldownMin: (base.burstCooldownMin ?? 1.25) * c.burstCooldownMult,
    burstCooldownMax: (base.burstCooldownMax ?? 2.7) * c.burstCooldownMult,
    reloadChance: c.reloadChance,
    dmgMult: c.dmgMult,
  };
}

// Plano de implantação da sala: traduz o plano canônico do POJ ({ allowed,
// minutesPerRing, article }) em uma lista determinística de oficiais. zeroOficiais
// (allowed=false) devolve [] — nenhum estado é criado.
export function officerDeployment(plan, { count = null } = {}) {
  if (!plan?.allowed) return [];
  const n = Math.max(0, Math.min(count ?? plan.officers ?? 3, 3));
  const minutes = Math.max(0, Number(plan.minutesPerRing) || 0);
  if (minutes <= 0) return [];
  return SPECIAL_CLASS_OFFICERS.slice(0, n).map((o, i) => ({
    ...o,
    slot: i,
    minutesPerRing: minutes,
    article: plan.article ?? null,
    // duração autoritativa em segundos da sala (≥ mínimo canônico do artigo)
    deploySeconds: minutes * 60,
  }));
}

// Retirada: os oficiais NUNCA morrem para o relógio — eles "se retiram" ao fim
// da duração autorizada (evento officers_departed; sem crédito de kill para
// ninguém). PURA: recebe o elapsed e devolve a decisão.
export function shouldWithdraw(elapsedSeconds, deploySeconds) {
  return Number.isFinite(elapsedSeconds) && Number.isFinite(deploySeconds)
    && deploySeconds > 0 && elapsedSeconds >= deploySeconds;
}

// Descrição curta para o feed/HUD (mesmo texto offline e online).
export function officerDeployFeed(deployment) {
  if (!deployment.length) return null;
  const minutes = deployment[0].minutesPerRing;
  const article = deployment[0].article ?? '';
  return `${deployment.length} OFICIAIS DE CLASSE ESPECIAL entraram no Ring — ${article} — no mínimo ${minutes} min de operação`;
}
