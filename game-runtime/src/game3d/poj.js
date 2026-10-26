// Khaaos Run — Protocolo de Ordem de Jogo (POJ) — motor puro e determinístico.
//
// O regramento canônico da Guerra do Khaaos em 11 artigos + o preceito
// fundamental: o jogador tem UMA chance — sobreviveu, prossegue; morreu,
// eliminado, sem reingresso (Game Over). O motor modela o ciclo completo:
//
//   1º  Abertura da Inscrição / Alistamento
//   2º  50% das inscrições (500.000) abrem o CIGKV
//   3º  1.000.000ª inscrição encerra o alistamento; em 24 h iniciam os
//       Rings/Batalha da Guerra do Khaaos e o CIGKV fecha
//   4º  7 dias de Barburhen
//   5º  Sobreviventes seguem para 7 dias de Priadus
//   5ºb Sobreviventes seguem para 7 dias de Ckesalth
//   6º  Sobreviventes seguem para 7 dias de Arukheea
//   7º  Dia 7 de Arukheea com > 100.000 sobreviventes (10%): os 3 Oficiais de
//       Classe Especial podem entrar por no mínimo 3 minutos por Ring
//   8º  Dia 7 de Arukheea, primeiras 12 h: quem evitar combates > 3 vezes é
//       desclassificado e enviado à Corte Marcial
//   9º  Dia 7 de Arukheea, últimas 6 h: Oficiais convocados por faixa de
//       sobreviventes (>1000 → 5 min; 750–1000 → 3 min; 500–750 → 1 min;
//       <500 → não entram)
//   10º Última hora da Guerra: participação obrigatória — desobediência é
//       desclassificação automática com julgamento pela Corte Marcial
//   11º Mais de 1 sobrevivente no fim: desempate por Patente → Incursões →
//       Kills → XP Acumulado → Decisão do Marechal (critério aleatório)
//
// Determinismo: nenhuma dependência externa, tempo avançado explicitamente por
// advance(seconds); a Decisão do Marechal usa SeededRng(marshalSeed).
import { SeededRng } from '../shared/rng.js';

// Hierarquia canônica (do menor ao maior) — base do 1º critério de desempate.
export const PATENTE_HIERARQUIA = Object.freeze([
  'Recruta', 'Soldado', 'Cabo', 'Sargento', 'Sargento-Mor',
  'Tenente', 'Capitão', 'Major', 'Coronel', 'General',
]);
export const pesoPatente = (nome) => {
  const i = PATENTE_HIERARQUIA.indexOf(String(nome ?? '').trim());
  return i < 0 ? 0 : i; // patente desconhecida pesa como Recruta (nunca negativa)
};

export const POJ_RULES = Object.freeze({
  ENLISTMENT_TOTAL: 1_000_000,        // 3º — alistamento encerra na 1.000.000ª inscrição
  CIGKV_TRIGGER: 500_000,             // 2º — 50% abre o CIGKV
  CLOSURE_COUNTDOWN_SECONDS: 24 * 3600, // 3º — 24 h do fechamento ao 1º Ring
  WORLDS: Object.freeze(['Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']),
  WORLD_DAYS: 7,                      // 4º–6º — 7 dias de Rings por mundo
  OFFICERS: 3,                        // 7º/9º — 3 Oficiais de Classe Especial
  RULE7_MIN_SURVIVORS: 100_000,       // 7º — 10% do total de inscrição
  RULE7_MIN_MINUTES: 3,               // 7º — "por pelo menos 3 minutos por Ring"
  RULE8_MAX_EVASIONS: 3,              // 8º — "evitando participar por mais de 3 vezes"
  RULE9_TIERS: Object.freeze([        // 9º — faixas das últimas 6 h (limite superior exclusivo)
    Object.freeze({ maxSurvivors: Infinity, minutes: 5 }),  // > 1000
    Object.freeze({ maxSurvivors: 1000, minutes: 3 }),      // 750 < n ≤ 1000
    Object.freeze({ maxSurvivors: 750, minutes: 1 }),       // 500 < n ≤ 750
    Object.freeze({ maxSurvivors: 500, minutes: 0 }),       // n ≤ 500 — não entram
  ]),
});

export const FASES = Object.freeze({
  ALISTAMENTO: 'alistamento',
  CONTAGEM: 'contagem_regressiva', // 24 h do 3º artigo
  GUERRA: 'guerra',                // mundos em curso
  JULGAMENTO: 'julgamento',        // desempate do 11º artigo
  ENCERRADO: 'encerrado',
});

export const MOTIVOS_CORTE_MARCIAL = Object.freeze({
  EVASAO: 'evasao',                     // 8º — evitou combates > 3 vezes
  COVARDIA: 'covardia_mundial',         // preceito — nenhum incursão no mundo
  DESOBEDIENCIA_FINAL: 'desobediencia_final', // 10º — não atendeu ao chamado da hora final
});

// Vereditos jogáveis da Corte Marcial (console do Marechal). A vida única é
// SAGRADA — nenhum veredito reingressa o caído no Ring; o julgamento define o
// REGISTRO oficial e as consequências de carreira (11º artigo lê patente/xp).
export const VEREDITOS_CORTE_MARCIAL = Object.freeze({
  AFASTAMENTO: 'afastamento',        // desligamento desonroso — patente reduzida a Recruta no registro
  REDUCAO_PATENTE: 'reducao_patente', // degradação de um degrau na hierarquia (registro)
  HONRAS_DE_GUERRA: 'honras_de_guerra', // queda em serviço honrosa — +200 XP memorial no registro
  ABSOLVICAO: 'absolvicao',          // absolvido das acusações — registro limpo, +100 XP de reparação
});
const EFEITO_VEREDITO = Object.freeze({
  afastamento: { patentePara: 'Recruta', xp: 0, registro: 'desonrado' },
  reducao_patente: { patentePara: null, xp: 0, registro: 'degradado' }, // patentePara resolvido em runtime (um degrau abaixo)
  honras_de_guerra: { patentePara: null, xp: 200, registro: 'honrado' },
  absolvicao: { patentePara: null, xp: 100, registro: 'absolvido' },
});
const ROTULO_MOTIVO = Object.freeze({
  evasao: 'Evasão (8º artigo)',
  covardia_mundial: 'Covardia mundial (preceito anti-covardia)',
  desobediencia_final: 'Desobediência na hora final (10º artigo)',
});

export class PojError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'PojError';
    this.code = code;
  }
}

// 9º artigo — minutos dos Oficiais por Ring nas últimas 6 h (faixas canônicas):
//   > 1000 → 5 min (50% do Ring) · 750 < n ≤ 1000 → 3 min (30%) ·
//   500 ≤ n ≤ 750 → 1 min (10%) · n < 500 → não entram
export function rule9Minutes(survivors) {
  const n = Number(survivors) || 0;
  if (n > 1000) return 5;
  if (n > 750) return 3;
  if (n >= 500) return 1;
  return 0;
}

// Critérios do 11º artigo, em ordem canônica de aplicação.
export const TIEBREAK_CRITERIA = Object.freeze(['patente', 'incursoes', 'kills', 'xp', 'marechal']);

const clampDay = (n, a, b) => Math.max(a, Math.min(b, n));

export class ProtocoloDeOrdemDeJogo {
  constructor({ daySeconds = 24 * 3600, marshalSeed = 'Marechal-Khaaos', now = 0, enlistmentTotal = POJ_RULES.ENLISTMENT_TOTAL, cigkvTrigger = POJ_RULES.CIGKV_TRIGGER } = {}) {
    this.daySeconds = Math.max(1, daySeconds);
    // Constantes comprimíveis para simulações/testes (defaults canônicos: 1M/500k)
    this.enlistmentTotal = Math.max(1, Math.floor(enlistmentTotal));
    this.cigkvTrigger = clampDay(Math.floor(cigkvTrigger) || 1, 1, this.enlistmentTotal);
    this.marshalSeed = String(marshalSeed);
    this.clock = now;              // relógio do protocolo (s)
    this.phase = FASES.ALISTAMENTO;
    this.registrations = 0;
    this.cigkvOpen = false;        // 2º artigo
    this.countdown = null;         // s restantes do 3º artigo (guerra começa em 0)
    this.worldIndex = -1;          // índice em POJ_RULES.WORLDS
    this.day = 0;                  // 1..7 dentro do mundo
    this.dayElapsed = 0;           // s dentro do dia atual
    this.warElapsed = 0;           // s dentro do mundo atual
    this.players = new Map();      // id → { id, name, patente, xp, kills, alive, eliminatedBy, status, incursoesTotal, worldIncursions:Set-like, evasions, marshalTie }
    this.incursions = new Map();   // id → { id, world, day, summoned:[], attended:Set, closed, open }
    this.nextIncursionId = 1;
    this.courtCases = new Map();   // Corte Marcial: id → caso { playerId, motivo, evidência, status, veredito }
    this.nextCaseId = 1;
    this.events = [];              // ata do protocolo [{ at, type, ... }]
    this.champion = null;
    this.marechalDecision = null;  // { criterion, dice, tiedIds }
    this.#log('protocolo_iniciado', { daySeconds: this.daySeconds });
  }

  // ---------- ajuda ----------
  #log(type, fields = {}) {
    this.events.push({ at: this.clock, type, ...fields });
    if (this.events.length >= 8192) this.events.splice(0, 4096); // ata com teto (trim em blocos)
  }
  #player(id) {
    const p = this.players.get(id);
    if (!p) throw new PojError('jogador_inexistente', `jogador ${id} não inscrito`);
    return p;
  }
  get survivorIds() {
    return [...this.players.values()].filter((p) => p.alive && p.status === 'ativo').map((p) => p.id);
  }
  get survivorsCount() { return this.survivorIds.length; }
  #currentWorld() { return POJ_RULES.WORLDS[this.worldIndex] ?? null; }
  #isLastWorld() { return this.worldIndex === POJ_RULES.WORLDS.length - 1; }
  #isDay7() { return this.phase === FASES.GUERRA && this.day === POJ_RULES.WORLD_DAYS; }
  // 8º — primeiras 12 h do 7º dia (metade do dia canônico)
  #inRule8Window() { return this.#isDay7() && this.#currentWorld() === 'Arukheea' && this.dayElapsed < this.daySeconds / 2; }
  // 9º — últimas 6 h do 7º dia (quarto final do dia canônico)
  #inRule9Window() { return this.#isDay7() && this.#currentWorld() === 'Arukheea' && this.dayElapsed >= this.daySeconds * 0.75; }
  // 10º — última hora da Guerra do Khaaos (dia 7 do último mundo)
  #inRule10Window() { return this.#isLastWorld() && this.#isDay7() && (this.daySeconds - this.dayElapsed) <= this.daySeconds / 24; }

  // ---------- 1º/2º/3º artigos — alistamento ----------
  register(playerId, { name = null, patente = 'Recruta', xp = 0, kills = 0 } = {}) {
    if (this.players.has(playerId)) throw new PojError('inscricao_duplicada');
    if (this.phase !== FASES.ALISTAMENTO) throw new PojError('alistamento_encerrado');
    const player = {
      id: String(playerId),
      name: name ? String(name) : String(playerId),
      patente: PATENTE_HIERARQUIA.includes(patente) ? patente : 'Recruta',
      xp: Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0,
      kills: Number.isFinite(kills) ? Math.max(0, Math.floor(kills)) : 0,
      alive: true, status: 'ativo', eliminatedBy: null,
      incursoesTotal: 0, worldIncursions: {}, // mundo → nº de incursões atendidas
      evasions: 0,
    };
    this.players.set(player.id, player);
    this.registrations++;
    this.#log('inscricao', { playerId: player.id, patente: player.patente, total: this.registrations });
    // 2º — metade do efetivo abre o CIGKV
    if (!this.cigkvOpen && this.registrations >= this.cigkvTrigger) {
      this.cigkvOpen = true;
      this.#log('cigkv_aberto', { registrations: this.registrations });
    }
    // 3º — 1.000.000ª inscrição encerra o alistamento e arma a contagem de 24 h
    if (this.registrations >= this.enlistmentTotal) {
      this.phase = FASES.CONTAGEM;
      this.countdown = POJ_RULES.CLOSURE_COUNTDOWN_SECONDS;
      this.#log('alistamento_encerrado', { registrations: this.registrations, cigkvFechaEmSegundos: this.countdown });
    }
    return { playerId: player.id, registrations: this.registrations };
  }

  // ---------- relógio do protocolo ----------
  advance(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new PojError('avanco_invalido');
    let remaining = seconds;
    while (remaining > 0) {
      if (this.phase === FASES.CONTAGEM) {
        const step = Math.min(remaining, this.countdown);
        this.clock += step; this.countdown -= step; remaining -= step;
        if (this.countdown <= 0) this.#startWar();
        continue;
      }
      if (this.phase === FASES.GUERRA) {
        const leftInDay = this.daySeconds - this.dayElapsed;
        const step = Math.min(remaining, leftInDay);
        this.clock += step; this.dayElapsed += step; this.warElapsed += step; remaining -= step;
        if (this.dayElapsed >= this.daySeconds) this.#closeDay();
        continue;
      }
      // alistamento/julgamento/encerrado: o relógio corre, nada agenda
      this.clock += remaining;
      break;
    }
    return this.snapshot();
  }

  #startWar() {
    this.countdown = 0;
    this.cigkvOpen = false; // 3º — o CIGKV fecha com o início dos Rings
    this.phase = FASES.GUERRA;
    this.worldIndex = 0; this.day = 1; this.dayElapsed = 0; this.warElapsed = 0;
    this.#log('guerra_iniciada', { mundo: this.#currentWorld(), sobreviventes: this.survivorsCount });
    this.#log('mundo_iniciado', { mundo: this.#currentWorld(), dia: 1 });
    this.#log('dia_iniciado', { mundo: this.#currentWorld(), dia: 1 });
  }

  #closeDay() {
    this.#log('dia_encerrado', { mundo: this.#currentWorld(), dia: this.day });
    if (this.day < POJ_RULES.WORLD_DAYS) {
      this.day++; this.dayElapsed = 0;
      this.#log('dia_iniciado', { mundo: this.#currentWorld(), dia: this.day });
      if (this.#isDay7() && this.#currentWorld() === 'Arukheea') {
        // 7º — avaliação no INÍCIO do 7º dia de Arukheea
        const plan = this.officerEntryPlan();
        if (plan.allowed) this.#log('oficiais_autorizados', { artigo: '7º', minutosPorRing: plan.minutesPerRing, sobreviventes: this.survivorsCount });
      }
      return;
    }
    this.#closeWorld();
  }

  #closeWorld() {
    const world = this.#currentWorld();
    // Preceito anti-covardia: sobrevivente sem NENHUMA incursão no mundo é
    // desclassificado e julgado pela Corte Marcial — o Khaaos Run não é lugar para covarde.
    for (const p of this.players.values()) {
      if (!p.alive || p.status !== 'ativo') continue;
      if ((p.worldIncursions[world] ?? 0) === 0) this.#courtMartial(p.id, MOTIVOS_CORTE_MARCIAL.COVARDIA);
    }
    this.#log('mundo_encerrado', { mundo: world, sobreviventes: this.survivorsCount });
    this.dayElapsed = 0; this.warElapsed = 0;
    if (!this.#isLastWorld()) {
      this.worldIndex++; this.day = 1;
      this.#log('mundo_iniciado', { mundo: this.#currentWorld(), dia: 1 });
      this.#log('dia_iniciado', { mundo: this.#currentWorld(), dia: 1 });
      return;
    }
    // fim de Arukheea: se restar mais de 1 sobrevivente → desempate (11º)
    this.phase = FASES.JULGAMENTO;
    this.#log('guerra_encerrada', { sobreviventes: this.survivorsCount });
    if (this.survivorsCount <= 1) this.#finalize();
  }

  #finalize() {
    const rank = this.ranking();
    this.champion = rank[0]?.playerId ?? null;
    this.phase = FASES.ENCERRADO;
    this.#log('campeao', { playerId: this.champion, criterio: this.marechalDecision ? 'marechal' : (rank[0]?.criterion ?? 'unico_sobrevivente') });
  }

  // ---------- incursões (Rings/Batalhas) ----------
  // Convocação: todo sobrevivente ativo é convocado (participação é o default;
  // ausência tem consequências nos artigos 8º e 10º).
  summonIncursion() {
    if (this.phase !== FASES.GUERRA) throw new PojError('fora_de_guerra');
    const incursion = {
      id: `inc-${this.nextIncursionId++}`,
      world: this.#currentWorld(), day: this.day,
      clock: this.clock, dayElapsed: this.dayElapsed,
      summoned: this.survivorIds, attended: [], closed: false,
    };
    this.incursions.set(incursion.id, incursion);
    this.#log('incursao_convocada', { id: incursion.id, mundo: incursion.world, dia: incursion.day, convocados: incursion.summoned.length });
    return incursion;
  }

  // Presença na incursão. `died: true` consome a ÚNICA vida (sem reingresso).
  attendIncursion(incursionId, playerId, { died = false } = {}) {
    const incursion = this.incursions.get(incursionId);
    if (!incursion || incursion.closed) throw new PojError('incursao_invalida');
    const p = this.#player(playerId);
    if (!p.alive) throw new PojError('sem_reingresso', `${p.name} caiu — o Khaaos Run concede uma única chance`);
    if (p.status !== 'ativo') throw new PojError('jogador_inativo');
    if (!incursion.attended.includes(playerId)) incursion.attended.push(playerId);
    p.incursoesTotal++;
    p.worldIncursions[incursion.world] = (p.worldIncursions[incursion.world] ?? 0) + 1;
    this.#log('incursao_comparecida', { id: incursion.id, playerId: p.id, mundo: incursion.world });
    if (died) this.#eliminate(playerId, 'kia_incursao');
    return { ok: true, died };
  }

  // Encerramento: ausentes sem justificativa respondem pelos artigos 8º e 10º.
  // `evaluateAbsentees: false` é a via da INTEGRAÇÃO com partidas 3D reais
  // (server/poj.js reportMatchResult): a incursão espelha UMA partida, logo a
  // presença é o resultado da sala — quem não entrou nela não é "evasor", só
  // estava em outro Ring/na fila. O canônico (default true) permanece intacto.
  closeIncursion(incursionId, { evaluateAbsentees = true } = {}) {
    const incursion = this.incursions.get(incursionId);
    if (!incursion || incursion.closed) throw new PojError('incursao_invalida');
    incursion.closed = true;
    const ausentes = incursion.summoned.filter((id) => !incursion.attended.includes(id));
    if (evaluateAbsentees) {
      for (const id of ausentes) {
        const p = this.players.get(id);
        if (!p || !p.alive || p.status !== 'ativo') continue;
        if (this.#inRule10Window()) {
          // 10º — na última hora o atendimento é obrigatório: desobediência = Corte Marcial
          this.#courtMartial(id, MOTIVOS_CORTE_MARCIAL.DESOBEDIENCIA_FINAL);
        } else if (this.#inRule8Window()) {
          // 8º — evasão registrada nas primeiras 12 h do 7º dia
          p.evasions++;
          this.#log('evasao_registrada', { playerId: id, evasions: p.evasions });
          if (p.evasions > POJ_RULES.RULE8_MAX_EVASIONS) this.#courtMartial(id, MOTIVOS_CORTE_MARCIAL.EVASAO);
        }
      }
    }
    this.#log('incursao_encerrada', { id: incursion.id, presentes: incursion.attended.length, ausentes: ausentes.length, avaliouAusentes: evaluateAbsentees });
    if (this.survivorsCount <= 1 && this.phase === FASES.GUERRA && this.#isLastWorld() && this.#isDay7()) {
      // 11º — a guerra pode acabar imediatamente após a última incursão
      this.phase = FASES.JULGAMENTO;
      this.#log('guerra_encerrada', { sobreviventes: this.survivorsCount, pelaUltimaIncursao: true });
      this.#finalize();
    }
    return { ausentes };
  }

  // Eliminação direta (queda fora de incursão, anel, tribunal etc.) — 1 vida só.
  eliminate(playerId, cause = 'kia') {
    const p = this.#player(playerId);
    if (!p.alive) throw new PojError('sem_reingresso');
    this.#eliminate(playerId, cause);
    return { ok: true };
  }

  #eliminate(playerId, cause) {
    const p = this.players.get(playerId);
    p.alive = false; p.status = 'eliminado'; p.eliminatedBy = cause;
    this.#log('eliminado', { playerId, causa: cause });
    if (this.survivorsCount <= 1 && this.phase === FASES.GUERRA && this.#isLastWorld() && this.#isDay7()) {
      this.phase = FASES.JULGAMENTO;
      this.#log('guerra_encerrada', { sobreviventes: this.survivorsCount });
      this.#finalize();
    }
  }

  // ---------- Corte Marcial ----------
  // Toda desclassificação gera um CASO pendente com evidência — o Marechal
  // julga no console (vereditos jogáveis). A queda é imediata; o REGISTRO é
  // definido no julgamento (nenhum veredito reingressa o caído — vida única).
  #courtMartial(playerId, motivo) {
    const p = this.players.get(playerId);
    if (!p.alive) return;
    p.alive = false; p.status = 'corte_marcial'; p.eliminatedBy = motivo;
    const caseId = `cm-${this.nextCaseId++}`;
    this.courtCases.set(caseId, {
      id: caseId,
      playerId: p.id, name: p.name, patente: p.patente,
      motivo, motivoRotulo: ROTULO_MOTIVO[motivo] ?? motivo,
      clock: this.clock, world: this.#currentWorld(), day: this.#isDay7() ? this.day : null,
      evidencia: {
        evasoes: p.evasions, incursoes: p.incursoesTotal, kills: p.kills, xp: p.xp,
        patente: p.patente, statusAnterior: 'ativo',
      },
      status: 'pendente', veredito: null, juiz: null, nota: null, julgadoEm: null,
    });
    this.#log('corte_marcial', { playerId, motivo, caso: caseId, sentenca: 'desclassificado_e_a_julgamento' });
    if (this.survivorsCount <= 1 && this.phase === FASES.GUERRA && this.#isLastWorld() && this.#isDay7()) {
      this.phase = FASES.JULGAMENTO;
      this.#log('guerra_encerrada', { sobreviventes: this.survivorsCount });
      this.#finalize();
    }
  }
  courtMartial(playerId, motivo = MOTIVOS_CORTE_MARCIAL.DESOBEDIENCIA_FINAL) {
    if (!Object.values(MOTIVOS_CORTE_MARCIAL).includes(motivo)) throw new PojError('motivo_invalido');
    this.#courtMartial(this.#player(playerId).id, motivo);
    return { ok: true };
  }

  // Processo do banco da Corte Marcial: pendentes (a julgar) e histórico.
  courtDocket(status = null) {
    const cases = [...this.courtCases.values()];
    const filtered = status ? cases.filter((c) => c.status === status) : cases;
    return { pendentes: cases.filter((c) => c.status === 'pendente').length, julgados: cases.filter((c) => c.status === 'julgado').length, cases: filtered };
  }

  // Veredito do Marechal (console): aplica o efeito no REGISTRO do militar e
  // encerra o caso. Vida única preservada — o caído permanece fora do Ring.
  courtVerdict(caseId, veredito, { judge = 'Marechal-Khaaos', note = null } = {}) {
    const caso = this.courtCases.get(String(caseId));
    if (!caso) throw new PojError('caso_invalido', `caso ${caseId} não existe`);
    if (caso.status === 'julgado') throw new PojError('caso_julgado', `caso ${caseId} já julgado`);
    if (!Object.values(VEREDITOS_CORTE_MARCIAL).includes(veredito)) throw new PojError('veredito_invalido', `veredito ${veredito} inválido`);
    const p = this.players.get(caso.playerId);
    const efeito = EFEITO_VEREDITO[veredito];
    if (p) {
      if (veredito === VEREDITOS_CORTE_MARCIAL.REDUCAO_PATENTE) {
        const idx = pesoPatente(p.patente);
        p.patente = PATENTE_HIERARQUIA[Math.max(0, idx - 1)];
      } else if (efeito.patentePara) {
        p.patente = efeito.patentePara;
      }
      p.xp += efeito.xp;
      p.registro = efeito.registro; // desonrado | degradado | honrado | absolvido
    }
    caso.status = 'julgado'; caso.veredito = veredito; caso.juiz = String(judge);
    caso.nota = note ? String(note).slice(0, 280) : null; caso.julgadoEm = this.clock;
    caso.patenteFinal = p?.patente ?? null;
    this.#log('veredito_corte_marcial', { caso: caso.id, playerId: caso.playerId, veredito, registro: efeito.registro, juiz: caso.juiz });
    return { ok: true, caso };
  }

  // ---------- 7º/9º artigos — Oficiais de Classe Especial ----------
  // Limiar do 7º artigo: 10% do total de inscrição. No canônico (1.000.000) é
  // exatamente os 100.000 do regramento; em staging/alistamento comprimido o
  // limiar escala proporcionalmente — a REGRA é a mesma, a escala não.
  get rule7MinSurvivors() {
    return this.enlistmentTotal === POJ_RULES.ENLISTMENT_TOTAL
      ? POJ_RULES.RULE7_MIN_SURVIVORS
      : Math.max(1, Math.ceil(this.enlistmentTotal * (POJ_RULES.RULE7_MIN_SURVIVORS / POJ_RULES.ENLISTMENT_TOTAL)));
  }
  // Plano de entrada dos 3 Oficiais para o Ring/Batalha em curso.
  officerEntryPlan(survivors = this.survivorsCount) {
    if (this.phase !== FASES.GUERRA || !this.#isDay7() || this.#currentWorld() !== 'Arukheea') {
      return { allowed: false, minutesPerRing: 0, article: null, reason: 'fora_do_7o_dia_de_arukheea' };
    }
    if (this.#inRule9Window()) {
      // 9º — faixas das últimas 6 h
      const minutes = rule9Minutes(survivors);
      return {
        allowed: minutes > 0, minutesPerRing: minutes, article: '9º',
        officers: POJ_RULES.OFFICERS, survivors,
        reason: minutes > 0
          ? `últimas 6 h: ${survivors} sobreviventes → Oficiais por até ${minutes} min por Ring`
          : `últimas 6 h: ${survivors} sobreviventes → Oficiais não entram`,
      };
    }
    // 7º — avaliação feita no início do 7º dia: > 10% do efetivo inscritos
    const minSurvivors = this.rule7MinSurvivors;
    const allowed = survivors > minSurvivors;
    return {
      allowed, minutesPerRing: allowed ? POJ_RULES.RULE7_MIN_MINUTES : 0, article: '7º',
      officers: POJ_RULES.OFFICERS, survivors,
      reason: allowed
        ? `início do 7º dia: ${survivors} sobreviventes (> ${minSurvivors}) → mínimo ${POJ_RULES.RULE7_MIN_MINUTES} min por Ring`
        : `início do 7º dia: ${survivors} sobreviventes (≤ ${minSurvivors}) → Oficiais não entram`,
    };
  }

  // ---------- 11º artigo — desempate ----------
  // Ordena sobreviventes por: Patente ↓ → Incursões ↓ → Kills ↓ → XP ↓ → Marechal.
  ranking() {
    const alive = [...this.players.values()].filter((p) => p.alive && p.status === 'ativo');
    const rng = new SeededRng(`${this.marshalSeed}:${[...alive.map((p) => p.id)].sort().join('|')}`);
    const dice = new Map(alive.map((p) => [p.id, rng.next()]));
    const cmp = (a, b) => {
      // 1º Patente
      const pa = pesoPatente(a.patente), pb = pesoPatente(b.patente);
      if (pa !== pb) return pb - pa;
      // 2º Incursões
      if (a.incursoesTotal !== b.incursoesTotal) return b.incursoesTotal - a.incursoesTotal;
      // 3º Kills
      if (a.kills !== b.kills) return b.kills - a.kills;
      // 4º XP acumulado
      if (a.xp !== b.xp) return b.xp - a.xp;
      // 5º Decisão do Marechal (dado determinístico por seed)
      return (dice.get(b.id) ?? 0) - (dice.get(a.id) ?? 0);
    };
    return [...alive].sort(cmp).map((p, i) => ({
      pos: i + 1, playerId: p.id, name: p.name, patente: p.patente,
      incursoes: p.incursoesTotal, kills: p.kills, xp: p.xp,
    }));
  }

  // Critério que DECIDIU a primeira posição (rótulo para a ata do 11º artigo).
  #decidingCriterion(rank) {
    if (rank.length < 2) return 'unico_sobrevivente';
    const [top, runner] = rank;
    if (pesoPatente(top.patente) !== pesoPatente(runner.patente)) return 'patente';
    if (top.incursoes !== runner.incursoes) return 'incursoes';
    if (top.kills !== runner.kills) return 'kills';
    if (top.xp !== runner.xp) return 'xp';
    return 'marechal';
  }

  // Decisão do Marechal explícita (5º critério): sorteia o critério aleatório e
  // o vencedor entre os empatados — determinístico por marshalSeed.
  decideMarechal(tiedIds) {
    if (!Array.isArray(tiedIds) || tiedIds.length === 0) throw new PojError('empate_vazio');
    const rng = new SeededRng(`${this.marshalSeed}:marechal:${[...tiedIds].sort().join('|')}`);
    const criteria = ['duelo', 'combate', 'missao_de_sobrevivencia'];
    const criterion = criteria[Math.floor(rng.next() * criteria.length)];
    const winnerId = tiedIds[Math.floor(rng.next() * tiedIds.length)];
    this.marechalDecision = { criterion, tiedIds: [...tiedIds], winnerId };
    this.#log('decisao_do_marechal', { criterion, tiedIds: tiedIds.length, winnerId });
    return this.marechalDecision;
  }

  resolveChampion() {
    if (this.phase === FASES.ENCERRADO) return { championId: this.champion, criterion: this.marechalDecision ? 'marechal' : 'unico_sobrevivente', ranking: this.ranking() };
    if (this.phase !== FASES.JULGAMENTO) throw new PojError('guerra_em_curso');
    const rank = this.ranking();
    if (rank.length === 0) throw new PojError('sem_sobreviventes');
    const criterion = this.#decidingCriterion(rank);
    if (rank.length === 1) {
      this.champion = rank[0].playerId;
      this.phase = FASES.ENCERRADO;
      this.#log('campeao', { playerId: this.champion, criterio: 'unico_sobrevivente' });
      return { championId: this.champion, criterion: 'unico_sobrevivente', ranking: rank };
    }
    // > 1 sobrevivente: aplica a cadeia do 11º artigo
    const top = rank[0];
    const tied = rank.filter((r) =>
      pesoPatente(r.patente) === pesoPatente(top.patente) &&
      r.incursoes === top.incursoes && r.kills === top.kills && r.xp === top.xp,
    ).map((r) => r.playerId);
    if (tied.length > 1) {
      const decision = this.decideMarechal(tied);
      this.champion = decision.winnerId;
      this.phase = FASES.ENCERRADO;
      this.#log('campeao', { playerId: this.champion, criterio: 'marechal', criterioAleatorio: decision.criterion });
      return { championId: this.champion, criterion: 'marechal', marechalCriterion: decision.criterion, ranking: this.ranking() };
    }
    this.champion = top.playerId;
    this.phase = FASES.ENCERRADO;
    this.#log('campeao', { playerId: this.champion, criterio: criterion });
    return { championId: this.champion, criterion, ranking: this.ranking() };
  }

  // ---------- registro de métricas de carreira ----------
  reportCareer(playerId, { kills = 0, xp = 0, patente = null } = {}) {
    const p = this.#player(playerId);
    if (Number.isFinite(kills)) p.kills += Math.max(0, Math.floor(kills));
    if (Number.isFinite(xp)) p.xp += Math.max(0, Math.floor(xp));
    if (patente && PATENTE_HIERARQUIA.includes(patente) && pesoPatente(patente) > pesoPatente(p.patente)) p.patente = patente;
    return { playerId: p.id, kills: p.kills, xp: p.xp, patente: p.patente };
  }

  // ---------- estado ----------
  snapshot() {
    const world = this.#currentWorld();
    return {
      phase: this.phase,
      clock: this.clock,
      registrations: this.registrations,
      cigkvOpen: this.cigkvOpen,
      countdown: this.countdown,
      world: this.phase === FASES.GUERRA ? world : null,
      worldIndex: this.worldIndex,
      day: this.phase === FASES.GUERRA ? this.day : 0,
      dayElapsed: this.dayElapsed,
      daySeconds: this.daySeconds,
      survivors: this.survivorIds,
      survivorsCount: this.survivorsCount,
      officerPlan: this.officerEntryPlan(),
      windows: {
        regra8_evasao: this.#inRule8Window(),
        regra9_oficiais: this.#inRule9Window(),
        regra10_horaFinal: this.#inRule10Window(),
      },
      champion: this.champion,
      marechalDecision: this.marechalDecision,
      court: this.courtDocket(),
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, patente: p.patente, alive: p.alive, status: p.status,
        incursoes: p.incursoesTotal, evasions: p.evasions, kills: p.kills, xp: p.xp,
        eliminatedBy: p.eliminatedBy, registro: p.registro ?? null,
      })),
      incursionsOpen: [...this.incursions.values()].filter((i) => !i.closed).map((i) => i.id),
      recentEvents: this.events.slice(-32),
    };
  }
}

export const clampPoj = clampDay; // reuso interno/exportação estável
