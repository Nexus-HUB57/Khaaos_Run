// Khaaos Run — POJ (Protocolo de Ordem de Jogo): instância única por processo
// + tradução HTTP do regramento. O motor canônico vive em src/game3d/poj.js —
// aqui só orquestramos: identidade do token vira alistamento/incursão, comandos
// do Marechal exigem permissão `poj:command` (admin).
import {
  ProtocoloDeOrdemDeJogo, PojError, PATENTE_HIERARQUIA, FASES,
} from '../src/game3d/poj.js';

export { PojError, PATENTE_HIERARQUIA, FASES };

// Idempotência da ponte partida→POJ é POR SERVÍÇO (instância do protocolo).
const REPORTED_MATCH_LIMIT = 2000;

// Constantes comprimíveis por env para staging/smoke (produção usa os canônicos
// 1.000.000/500.000 e dias de 24 h).
export function createPojService(overrides = {}) {
  const proto = new ProtocoloDeOrdemDeJogo({
    daySeconds: Number(process.env.KR_POJ_DAY_SECONDS) || 24 * 3600,
    enlistmentTotal: Number(process.env.KR_POJ_ENLISTMENT_TOTAL) || undefined,
    cigkvTrigger: Number(process.env.KR_POJ_CIGKV_TRIGGER) || undefined,
    marshalSeed: process.env.KR_POJ_MARSHAL_SEED || 'Marechal-Khaaos',
    ...overrides,
  });
  const reportedMatches = new Map();
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
    // POST /poj/register — alistamento com identidade do token (patente opcional)
    register(actor, body = {}) {
      const patente = PATENTE_HIERARQUIA.includes(body.patente) ? body.patente : 'Recruta';
      return proto.register(actor.sub, {
        name: actor.username || actor.sub,
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
