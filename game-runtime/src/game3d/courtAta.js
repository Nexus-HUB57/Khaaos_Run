// Khaaos Run — Fase 13 — Replay da ATA da Corte Marcial na UI do jogador eliminado
// Módulo puro (sem DOM): transforma um caso do banco da Corte (docket) numa
// sequência de passos narrados para reprodução encenada (staged replay) no HUD.
// Consumido por hud3d.js; testado em test/court-ata.test.js.

// Rótulos canônicos espelham src/game3d/poj.js (fonte única: o próprio POJ).
// Lookup via Object.entries().find() — evita indexação por colchetes com
// inicial "m" (fragilidade conhecida do transporte de payload deste ambiente).
const ROTULO_MOTIVO = Object.freeze({
  evasao: 'Evasão (8º artigo)',
  covardia_mundial: 'Covardia mundial (preceito anti-covardia)',
  desobediencia_final: 'Desobediência na hora final (10º artigo)',
});
const ROTULO_VEREDITO = Object.freeze({
  afastamento: 'AFASTAMENTO DESONROSO',
  reducao_patente: 'REDUÇÃO DE PATENTE',
  honras_de_guerra: 'HONRAS DE GUERRA',
  absolvicao: 'ABSOLVIÇÃO',
});
const ROTULO_REGISTRO = Object.freeze({
  desonrado: 'DESONRADO',
  degradado: 'DEGRADADO',
  honrado: 'HONRADO',
  absolvido: 'ABSOLVIDO',
});

const lookup = (table, key, fallback = null) =>
  Object.entries(table).find(([k]) => k === key)?.[1] ?? fallback;

export const rotuloMotivo = (motivo) => lookup(ROTULO_MOTIVO, motivo, motivo ?? '—');
export const rotuloVeredito = (veredito) => lookup(ROTULO_VEREDITO, veredito, String(veredito ?? '—').toUpperCase());
export const rotuloRegistro = (registro) => lookup(ROTULO_REGISTRO, registro, registro ?? null);

const fmtClock = (caso) => {
  const mundo = caso.world ? `mundo ${caso.world}` : 'mundo —';
  const dia = caso.day ? ` · dia ${caso.day}/7` : '';
  const tick = caso.clock != null ? ` · relógio ${caso.clock}` : '';
  return `${mundo}${dia}${tick}`;
};

// Efeito econômico (KRC) — aceita o objeto canônico do caso (`caso.krc`,
// gravado no veredito pelo server/poj.js) OU o evento court_verdict ao vivo
// (`krcDelta/krcApplied/krcBalance`), que é a fonte quando a ata vem do feed.
export const rotuloKrc = (krc, extra = {}) => {
  const delta = krc?.delta ?? extra.krcDelta ?? null;
  const balance = krc?.balance ?? extra.krcBalance ?? null;
  const applied = krc ? !!krc.applied : !!extra.krcApplied;
  if (krc?.error) return `movimentação recusada pelo QG (${krc.error}) — sem efeito em KRC`;
  if (!applied || delta == null || delta === 0) {
    if (krc?.skipped === 'zero_balance') return 'multa integralmente presa ao saldo zero — sem efeito em KRC';
    return 'sem efeito em KRC';
  }
  const sinal = delta > 0 ? '+' : '';
  return `${sinal}${delta} KRC${balance != null ? ` · saldo ${balance}` : ''}`;
};

// Passos da ata, na ordem canônica do processo militar:
// abertura → evidência → veredito → registro → efeito econômico → encerramento.
// Cada passo: { tag, lines[], cls } — cls: null | 'good' | 'bad' | 'warn' | 'pending'.
export function buildAtaSteps(caso, extra = {}) {
  if (!caso || typeof caso !== 'object') return [];
  const julgado = caso.status === 'julgado';
  const steps = [];

  steps.push({
    tag: 'I · ABERTURA DO CASO',
    lines: [
      `Caso ${caso.id ?? '—'} aberto contra ${caso.name ?? 'operativo'} (${caso.patente ?? '—'}).`,
      `Motivo: ${rotuloMotivo(caso.motivo)}.`,
      `Registro de tempo: ${fmtClock(caso)}.`,
      'Sentença processual: desclassificado e a julgamento — vida única consumida.',
    ],
    cls: 'bad',
  });

  const ev = caso.evidencia ?? {};
  steps.push({
    tag: 'II · EVIDÊNCIA APRESENTADA PELA PROMOTORIA',
    lines: [
      `Evasões de incursão: ${ev.evasoes ?? 0}.`,
      `Incursões comparecidas: ${ev.incursoes ?? 0} · Abates no Ring: ${ev.kills ?? 0}.`,
      `XP de carreira: ${ev.xp ?? 0} · Patente à época: ${ev.patente ?? caso.patente ?? '—'}.`,
    ],
  });

  if (julgado) {
    steps.push({
      tag: 'III · VEREDITO DO TRIBUNAL',
      lines: [
        `Veredito: ${rotuloVeredito(caso.veredito)}.`,
        `Juiz: ${caso.juiz ?? 'Marechal-Khaaos'}.`,
        ...(caso.nota ? [`Nota do juiz: “${caso.nota}”.`] : []),
      ],
      cls: 'warn',
    });
    steps.push({
      tag: 'IV · REGISTRO MILITAR',
      lines: [
        `Registro: ${rotuloRegistro(caso.registro) ?? '—'}.`,
        ...(caso.xpVeredito ? [`Consequência de carreira: ${caso.xpVeredito > 0 ? '+' : ''}${caso.xpVeredito} XP.`] : []),
        ...(caso.patenteFinal ? [`Patente fixada no registro: ${caso.patenteFinal}.`] : []),
      ],
      cls: caso.registro === 'honrado' || caso.registro === 'absolvido' ? 'good' : 'bad',
    });
    steps.push({
      tag: 'V · EFEITO NO TESOURO (KRC)',
      lines: [rotuloKrc(caso.krc, extra)],
      cls: ((caso.krc?.delta ?? extra.krcDelta) ?? 0) > 0 ? 'good' : 'warn',
    });
  } else {
    steps.push({
      tag: 'III · VEREDITO DO TRIBUNAL',
      lines: ['Caso AGUARDANDO JULGAMENTO — o Marechal delibera no console da Corte.'],
      cls: 'pending',
    });
    steps.push({
      tag: 'IV · REGISTRO MILITAR',
      lines: ['Registro ainda não definido — a ata será complementada após o veredito.'],
      cls: 'pending',
    });
  }

  steps.push({
    tag: julgado ? 'VI · ENCERRAMENTO DA ATA' : 'V · ENCERRAMENTO PROVISÓRIO',
    lines: [
      julgado
        ? 'Ata encerrada e arquivada no QG-War\u2019I — disponível ao militar e ao Marechal.'
        : 'Ata aberta em cartório — retorna ao militar após o veredito.',
      'Preceito da vida única: nenhum veredito reingressa o caído no Ring.',
    ],
  });

  return steps;
}

// Cronometragem do replay (ms por passo) — encenado, com skip por clique.
export const ATA_STEP_MS = 620;
