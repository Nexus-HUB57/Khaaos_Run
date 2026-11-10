// Khaaos Run — Fase 9 (fix) — painel POJ do modal ZU: ponte DOM compartilhada.
//
// O regramento canônico vive no poj.js (motor puro e determinístico); o
// backend autoritativo expõe /poj/state no MESMO origin do jogo. Até aqui o
// preenchimento dos chips (FASE · INSCRITOS · CIGKV · MUNDO · DIA ·
// SOBREVIVENTES · PATENTE) só acontecia no bootstrap do modo online — no modo
// local (porta de entrada padrão do preview) o painel ficava eternamente em
// "—" mesmo com o dado disponível. Este módulo carrega a lógica uma única vez
// e serve os dois modos.
//
// Segurança de hospedagem: em builds estáticos (sem backend) o fetch falha ou
// responde fora de 2xx e o painel permanece neutro — o jogo NUNCA quebra por
// causa do painel. Chip PATENTE segue a regra da Fase 10: sem sessão
// (kr_token) o /profile responde 401 e o chip fica neutro.

const FASES = Object.freeze({
  alistamento: 'ALISTAMENTO',
  contagem_regressiva: 'CONTAGEM 24H',
  guerra: 'GUERRA',
  julgamento: 'JULGAMENTO',
  encerrado: 'ENCERRADO',
});

const setChip = (id, text, cls = '') => {
  const node = document.querySelector('#' + id);
  if (!node) return;
  node.textContent = text;
  node.className = cls;
};

// Estado do Protocolo de Ordem de Jogo → chips do modal ZU (Fase 9).
export async function refreshPojStrip() {
  const strip = document.querySelector('#pojStrip');
  if (!strip) return;
  try {
    const res = await fetch('/poj/state', { cache: 'no-store' });
    if (!res.ok) return;
    const s = await res.json();
    setChip('pojFase', FASES[s.phase] ?? String(s.phase ?? '—').toUpperCase(), s.phase === 'guerra' ? 'poj-live' : s.phase === 'contagem_regressiva' ? 'poj-warn' : '');
    setChip('pojInscritos', (s.registrations ?? 0).toLocaleString('pt-BR'));
    setChip('pojCigkv', s.cigkvOpen ? 'ABERTO' : (s.phase === 'alistamento' ? 'FECHADO' : 'ENCERRADO'), s.cigkvOpen ? 'poj-live' : '');
    setChip('pojMundo', s.world ?? '—');
    setChip('pojDia', s.day ? `${s.day}/7` : '—');
    setChip('pojVivos', (s.phase === 'guerra' || s.phase === 'julgamento') ? String(s.survivorsCount ?? 0) : '—', s.phase === 'guerra' ? 'poj-live' : '');
  } catch { /* servidor sem /poj — painel permanece neutro */ }
}

// Fase 10 — chip PATENTE: progressão KRC do perfil autenticado (1º critério
// de desempate do 11º artigo). Sem sessão → chip neutro.
export async function refreshPatenteChip() {
  const node = document.querySelector('#pojPatente');
  if (!node) return;
  try {
    const token = localStorage.getItem('kr_token');
    const res = await fetch('/profile', {
      cache: 'no-store',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) { node.textContent = '—'; return; }
    const p = await res.json();
    const pct = Math.round((p.progress ?? 0) * 100);
    node.textContent = p.nextPatente
      ? `${p.patente} · ${pct}% p/ ${p.nextPatente}`
      : `${p.patente} · TOPO`;
  } catch { node.textContent = '—'; }
}
