// Khaaos Run — POJ (Protocolo de Ordem de Jogo): instância única por processo
// + tradução HTTP do regramento. O motor canônico vive em src/game3d/poj.js —
// aqui só orquestramos: identidade do token vira alistamento/incursão, comandos
// do Marechal exigem permissão `poj:command` (admin).
import {
  ProtocoloDeOrdemDeJogo, PojError, PATENTE_HIERARQUIA, FASES,
} from '../src/game3d/poj.js';
import { EconomyError } from './economy.js';

export { PojError, PATENTE_HIERARQUIA, FASES };

// Fase 12 — efeito de cada veredito no KRC REAL da economia (ledger de dupla
// entrada, idempotência por caso — retry do HTTP nunca paga duas vezes).
// Prêmios saem do tesouro de recompensas; multas debitam até o saldo (zero
// saldo → multa presa, sem saldo negativo — ver Economy.fine).
export const KRC_POR_VEREDITO = Object.freeze({
  afastamento: { kind: 'fine', amount: 250 },        // desonrado — multa cheia
  reducao_patente: { kind: 'fine', amount: 100 },    // degradado — multa parcial
  honras_de_guerra: { kind: 'grant', amount: 200 },  // honrado — prêmio memorial
  absolvicao: { kind: 'grant', amount: 100 },        // absolvido — reparação
});

// Idempotência da ponte partida→POJ é POR SERVÍÇO (instância do protocolo).
const REPORTED_MATCH_LIMIT = 2000;

// Constantes comprimíveis por env para staging/smoke (produção usa os canônicos
// 1.000.000/500.000 e dias de 24 h).
export function createPojService(overrides = {}) {
  // Fase 12 — `economy` é a ponte para o KRC real dos vereditos (o resto dos
  // overrides vai ao motor canônico; compatível com todos os usos anteriores).
  const { economy = null, ...protoOverrides } = overrides;
  const proto = new ProtocoloDeOrdemDeJogo({
    daySeconds: Number(process.env.KR_POJ_DAY_SECONDS) || 24 * 3600,
    enlistmentTotal: Number(process.env.KR_POJ_ENLISTMENT_TOTAL) || undefined,
    cigkvTrigger: Number(process.env.KR_POJ_CIGKV_TRIGGER) || undefined,
    marshalSeed: process.env.KR_POJ_MARSHAL_SEED || 'Marechal-Khaaos',
    ...protoOverrides,
  });
  // Fase 12 — notifier: entregador de eventos ao vivo do POJ (court_verdict).
  // Registrado pelo server.js; recebe (playerId, evento) e roteia para os WS.
  let notifier = null;
  const reportedMatches = new Map();
  // Fase 12 — aplica o efeito KRC do veredito no ledger REAL. Erro de economia
  // é CONTIDO: o veredito (registro militar) já é válido; o krc devolve o código
  // para o console/ata. Idempotência: court:<caseId>:<veredito> — retry do HTTP
  // e replay do POST nunca pagam ou multam duas vezes.
  const courtKrcEffect = async (caso) => {
    const rule = KRC_POR_VEREDITO[caso.veredito];
    if (!economy || !rule) return { kind: 'none', amount: 0, delta: 0, applied: false };
    const idempotencyKey = `court:${caso.id}:${caso.veredito}`;
    try {
      if (rule.kind === 'grant') {
        await economy.grant({
          userId: caso.playerId, amount: rule.amount,
          reason: `court_marcial:${caso.veredito}`, idempotencyKey, by: 'corte_marcial',
        });
        const balance = await economy.balance(caso.playerId);
        return {
          kind: rule.kind, amount: rule.amount, applied: true,
          delta: rule.amount, balance: balance?.amount ?? 0,
        };
      }
      const fine = await economy.fine({
        userId: caso.playerId, amount: rule.amount,
        reason: `court_marcial:${caso.veredito}`, idempotencyKey, by: 'corte_marcial',
      });
      if (!fine.applied) {
        return { ...rule, delta: 0, applied: false, skipped: 'zero_balance' };
      }
      const balance = await economy.balance(caso.playerId);
      // multa parcial: delta é o que FOI debitado (min(saldo, multa)), não a regra cheia
      return {
        kind: rule.kind, amount: rule.amount, applied: true,
        delta: -fine.applied, balance: balance?.amount ?? 0,
      };
    } catch (error) {
      return {
        kind: rule.kind, amount: rule.amount, delta: 0, applied: false,
        error: error instanceof EconomyError ? error.code : String(error?.message || error),
      };
    }
  };
  const trimReportedMatches = () => {
    while (reportedMatches.size > REPORTED_MATCH_LIMIT) {
      reportedMatches.delete(reportedMatches.keys().next().value);
    }
  };
  return {
    proto,
    // GET /poj/state — estado público do protocolo (leitura aberta)
    state() {
      return proto.snapshot();
    },
    // POST /poj/register — alistamento com identidade do token (patente opcional).
    // Fase 11 — o Marechal (admin) pode alistar um playerId de terceiros via
    // console (corpo de guerra do protocolo); jogador comum alista só a si.
    register(actor, body = {}) {
      const patente = PATENTE_HIERARQUIA.includes(body.patente) ? body.patente : 'Recruta';
      const target = actor.role === 'admin' && body.playerId ? String(body.playerId) : actor.sub;
      return proto.register(target, {
        name: body.name || (target === actor.sub ? (actor.username || actor.sub) : String(body.playerId)),
        patente,
        xp: Number(body.xp) || 0,
        kills: Number(body.kills) || 0,
      });
    },
    // POST /poj/summon — convoca uma incursão (Marechal)
    summon() {
      return proto.summonIncursion();
    },
    // POST /poj/attend — presença na incursão; jogador só atende por si
    // (admin pode reportar por outro id — extrator de resultados).
    attend(actor, body = {}) {
      const playerId = actor.role === 'admin' && body.playerId ? String(body.playerId) : actor.sub;
      return proto.attendIncursion(String(body.incursionId), playerId, { died: !!body.died });
    },
    // POST /poj/close — encerra a incursão e aplica os artigos 8º/10º
    close(body = {}) {
      return proto.closeIncursion(String(body.incursionId));
    },
    // POST /poj/eliminate — baixa direta (1 vida, sem reingresso)
    eliminate(actor, body = {}) {
      const playerId = actor.role === 'admin' && body.playerId ? String(body.playerId) : actor.sub;
      return proto.eliminate(playerId, body.cause ? String(body.cause) : 'kia');
    },
    // POST /poj/advance — adianta o relógio do protocolo (Marechal/staging)
    advance(body = {}) {
      return proto.advance(Number(body.seconds) || 0);
    },
    // POST /poj/champion — fecha o julgamento do 11º artigo
    champion() {
      return proto.resolveChampion();
    },
    // POST /poj/court-martial — julgamento explícito (Marechal)
    courtMartial(body = {}) {
      return proto.courtMartial(String(body.playerId), body.motivo);
    },
    // ---------- Fase 11 — Corte Marcial jogável (console do Marechal) ----------
    // GET /poj/court-martial — banco da Corte: casos pendentes + histórico.
    // Fase 13 — courtCases(status, mineSub): com mineSub, o docket devolve
    // APENAS os casos daquele jogador (replay da ata na UI do eliminado).
    // Contagens (pendentes/julgados) também escopadas — sem leak de agregados.
    courtCases(status = null, mineSub = null) {
      const docket = proto.courtDocket(status);
      if (mineSub == null) return docket;
      const mine = String(mineSub);
      const cases = docket.cases.filter((c) => String(c.playerId) === mine);
      return {
        mine: true,
        pendentes: cases.filter((c) => c.status === 'pendente').length,
        julgados: cases.filter((c) => c.status === 'julgado').length,
        cases,
      };
    },
    // POST /poj/court-martial/verdict — veredito do Marechal sobre um caso.
    // Efeitos no registro (patente/XP) + Fase 12: efeito no KRC REAL da economia
    // (prêmio/multa idempotentes por caso) + evento court_verdict ao vivo para
    // o militar julgado. A vida única NUNCA é restaurada.
    async courtVerdict(actor, body = {}) {
      const result = proto.courtVerdict(String(body.caseId), String(body.veredito || body.verdict || ''), {
        judge: actor?.username || 'Marechal-Khaaos',
        note: body.nota ?? body.note ?? null,
      });
      const caso = result.caso;
      const krc = await courtKrcEffect(caso);
      caso.krc = krc; // ata/histórico do console mostram o efeito econômico
      try {
        notifier?.(caso.playerId, {
          type: 'court_verdict', caseId: caso.id, veredito: caso.veredito,
          registro: caso.registro ?? null, patente: caso.patenteFinal ?? null,
          xp: caso.xpVeredito ?? 0, juiz: caso.juiz,
          krcDelta: krc?.delta ?? 0, krcApplied: !!krc?.applied, krcBalance: krc?.balance ?? null,
        });
      } catch { /* notifier é best-effort — veredito nunca falha por entrega */ }
      return { ok: true, caso, krc };
    },
    // Fase 12 — registra o entregador de eventos ao vivo (server.js roteia
    // por sala/WS; sem entregador o veredito segue válido, só não toca o Ring).
    setNotifier(fn) { notifier = typeof fn === 'function' ? fn : null; },
    // Plano de entrada dos Oficiais (leve — sem snapshot completo)
    officerPlan() {
      return proto.officerEntryPlan();
    },
    // ---------- Fase 10 — ponte partida 3D → POJ ----------
    // O fim de cada incursão REAL (MatchRoom3D) alimenta o protocolo: presença
    // (attend) para sobreviventes, eliminação (died:true consome a ÚNICA vida)
    // para os caídos e métricas de carreira (kills/XP). Idempotente por matchId
    // — repetição do callback devolve o resumo em cache com replay:true.
    // Regras da ponte:
    //   - só reporta em GUERRA (alistamento/julgamento/encerrado → sem efeito);
    //   - cada partida espelha UMA incursão própria (summon + attend + close);
    //   - close com evaluateAbsentees:false — quem não esteve nesta sala não é
    //     evasor (os artigos 8º/10º avaliam ausência apenas nas incursões
    //     canônicas convocadas pelo Marechal);
    //   - jogador sem userId resolvido ou não inscrito é SKIPPED — nunca
    //     inventamos alistamento (o alistamento fechou no 3º artigo).
    reportMatchResult({ matchId, results = [] } = {}) {
      if (!matchId) throw new PojError('partida_invalida', 'matchId obrigatório');
      if (reportedMatches.has(matchId)) return { ...reportedMatches.get(matchId), replay: true };
      if (proto.phase !== FASES.GUERRA) {
        const summary = { matchId, reported: false, reason: 'fora_de_guerra', attended: 0, eliminated: 0, skipped: 0, failures: [] };
        reportedMatches.set(matchId, summary);
        trimReportedMatches();
        return summary;
      }
      const inc = proto.summonIncursion();
      const summary = { matchId, reported: true, incursionId: inc.id, attended: 0, eliminated: 0, skipped: 0, failures: [] };
      for (const r of Array.isArray(results) ? results : []) {
        const userId = r.userId ? String(r.userId) : null;
        if (!userId) { summary.skipped++; continue; }
        try {
          if (!proto.players.has(userId)) { summary.skipped++; continue; } // não alistado
          proto.attendIncursion(inc.id, userId, { died: !r.survived });
          proto.reportCareer(userId, { kills: r.kills, xp: r.xp });
          summary.attended++;
          if (!r.survived) summary.eliminated++;
        } catch (error) {
          summary.failures.push({ userId, code: error instanceof PojError ? error.code : 'poj_error' });
        }
      }
      proto.closeIncursion(inc.id, { evaluateAbsentees: false });
      reportedMatches.set(matchId, summary);
      trimReportedMatches();
      return summary;
    },
  };
}
