// Khaaos Run — POJ (Protocolo de Ordem de Jogo): instância única por processo
// + tradução HTTP do regramento. O motor canônico vive em src/game3d/poj.js —
// aqui só orquestramos: identidade do token vira alistamento/incursão, comandos
// do Marechal exigem permissão `poj:command` (admin).
import { ProtocoloDeOrdemDeJogo, PojError, PATENTE_HIERARQUIA } from '../src/game3d/poj.js';

export { PojError, PATENTE_HIERARQUIA };

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
  };
}
