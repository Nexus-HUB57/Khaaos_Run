#!/usr/bin/env node
// Khaaos Run — M3: load generator configurável contra o servidor autoritativo.
//
// Substitui o smoke local por perfis reproduzíveis (docs/ROADMAP.md M3):
//   node scripts/loadgen.mjs --profile smoke12
//   node scripts/loadgen.mjs --profile ring50 --duration 15000 --url ws://127.0.0.1:8787
//   node scripts/loadgen.mjs --list
//
// Cada perfil especifica jogadores simultâneos, taxa de entrada (spawn), cadência
// de inputs e duração. O generator mede por conexão: RTT (ping/pong), intervalo
// entre snapshots (jitter do servidor), erros/desconexões e RSS do processo do
// generator. O relatório sai em JSON (--json out.json) e texto humano com
// p50/p95/p99 — mesma métrica, dois formatos.
//
// Perfis são determinísticos: mesma seed → mesma cadência de spawn/inputs.
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ─── Perfis reproduzíveis ────────────────────────────────────────────────────
export const PROFILES = {
  smoke12: { players: 12, spawnMs: 150, inputHz: 10, durationMs: 8_000, description: 'CI: 12 jogadores, entrada gradual, 10Hz' },
  ring50: { players: 50, spawnMs: 120, inputHz: 20, durationMs: 15_000, description: 'ring cheio: 50 jogadores, 20Hz' },
  spike200: { players: 200, spawnMs: 25, inputHz: 20, durationMs: 20_000, description: 'pico: 200 jogadores de uma vez (burst)' },
};

// ─── Estatística de percentil (nearest-rank) ─────────────────────────────────
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? null,
  };
}

// SeededRng local (mesma técnica do jogo) p/ cadência reproduzível.
function makeRng(seed) {
  let h = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0x100000000;
  };
}

// ─── Um jogador virtual: WS + inputs + amostragem de RTT/jitter ─────────────
async function virtualPlayer({ url, token, mode = '3d', inputHz, durationMs, rng, samples, errors }) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${url}/ws?token=${token}&mode=${mode}`);
    const stopAt = Date.now() + durationMs;
    let closed = false;
    let seq = 1; // seq MONOTÔNICA por jogador (anti-cheat rejeita regressão)
    let yaw = 0; // parte do yaw neutro do servidor (delta inicial <= limite do anti-cheat)
    let pitch = 0;
    let lastSnapshotAt = null;
    const sendInput = () => {
      if (closed || Date.now() > stopAt) return;
      // Movimento dentro do círculo unitário e giro incremental — o anti-cheat
      // valida |v|<=1.01 e yaw rate <= 14 rad/s; o generator joga LIMPO.
      const angle = rng() * Math.PI * 2;
      const mag = Math.sqrt(rng()) * 0.9;
      yaw += (rng() - 0.5) * 0.5; // ±0.25 rad por input — limite do servidor é 0.7 rad (14 rad/s @ 20Hz)
      pitch = Math.max(-1.3, Math.min(1.3, pitch + (rng() - 0.5) * 0.2));
      try {
        ws.send(JSON.stringify({
          type: 'input',
          input: {
            seq: seq++,
            dx: Math.cos(angle) * mag, dy: Math.sin(angle) * mag,
            yaw, pitch,
            fire: rng() < 0.05, ads: false, sprint: rng() < 0.2,
            jump: false, interact: false, reload: rng() < 0.02, slot: 0,
          },
        }));
      } catch { /* socket morrendo: contabiliza no close */ }
    };
    const inputTimer = setInterval(sendInput, Math.max(15, Math.round(1000 / inputHz)));
    const pingTimer = setInterval(() => {
      if (closed) return;
      try { ws.send(JSON.stringify({ type: 'ping', t: performance.now(), te: Date.now() })); } catch { /* idem */ }
    }, 1000);

    const finish = (outcome) => {
      if (closed) return;
      closed = true;
      clearInterval(inputTimer);
      clearInterval(pingTimer);
      try { ws.close(); } catch { /* já fechado */ }
      resolve(outcome);
    };

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'pong') {
        const rtt = performance.now() - msg.t;
        if (Number.isFinite(rtt)) samples.rtt.push(rtt);
      } else if (msg.type === 'snapshot') {
        const now = performance.now();
        if (lastSnapshotAt !== null) samples.snapshotGap.push(now - lastSnapshotAt);
        lastSnapshotAt = now;
        samples.snapshots++;
      } else if (msg.type === 'rejected' || msg.type === 'banned' || msg.type === 'rate_limited') {
        errors.push({ kind: msg.type });
      }
    });
    ws.on('error', () => { errors.push({ kind: 'ws_error' }); finish('error'); });
    ws.on('close', () => finish(Date.now() >= stopAt ? 'done' : 'dropped_early'));
    // Fim da janela do jogador virtual: fecha e o handler de close classifica.
    setTimeout(() => { try { ws.close(); } catch { /* já fechado */ } }, Math.max(0, durationMs)).unref?.();
    // Safety: encerra no prazo mesmo sem close limpo.
    setTimeout(() => finish('deadline'), durationMs + 5_000).unref?.();
  });
}

// ─── Execução de um perfil ───────────────────────────────────────────────────
export async function runProfile({ profileName, url, durationMs, users, seed = 'loadgen' }) {
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`perfil desconhecido: ${profileName} (--list para ver)`);
  const duration = durationMs ?? profile.durationMs;
  const rng = makeRng(`${seed}:${profileName}`);
  const samples = { rtt: [], snapshotGap: [], snapshots: 0 };
  const errors = [];
  const rssStart = process.memoryUsage().rss;

  // Pool de tokens: o rate limit é POR IDENTIDADE (90/s no 3D) — os jogadores
  // virtuais se distribuem pelo pool para não se autolimitarem.
  const tokens = [];
  for (const [u, p] of users) {
    const token = await loginToken(url, [[u, p]]);
    if (token) tokens.push(token);
  }
  if (!tokens.length) throw new Error('loadgen: nenhuma credencial válida (KR_DEV_AUTH=1 + kr_player/kr123, ou KR_USERS_JSON)');
  const startedAt = Date.now();
  const spawning = Array.from({ length: profile.players }, (_, i) =>
    delay(i * profile.spawnMs).then(() => virtualPlayer({
      url, token: tokens[i % tokens.length], inputHz: profile.inputHz,
      durationMs: duration - i * profile.spawnMs,
      rng, samples, errors,
    })));
  const outcomes = await Promise.all(spawning);
  const elapsed = Date.now() - startedAt;
  const rssEnd = process.memoryUsage().rss;

  const done = outcomes.filter((o) => o === 'done').length;
  const report = {
    profile: profileName, description: profile.description,
    url, durationMs: elapsed, players: profile.players,
    connectedDone: done, droppedEarly: outcomes.filter((o) => o === 'dropped_early').length,
    errors: errors.length, errorKinds: Object.fromEntries([...new Set(errors.map((e) => e.kind))].map((k) => [k, errors.filter((e) => e.kind === k).length])),
    snapshots: samples.snapshots,
    rtt: summarize(samples.rtt),
    snapshotGap: summarize(samples.snapshotGap),
    generatorRssMB: { start: +(rssStart / 1048576).toFixed(1), end: +(rssEnd / 1048576).toFixed(1) },
    seed,
  };
  return report;
}

// Login direto via fetch (o loadgen roda em Node — sem localStorage).
async function loginToken(url, users) {
  const httpUrl = url.replace(/^ws/, 'http');
  for (const [username, password] of users) {
    try {
      const res = await fetch(`${httpUrl}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) { const data = await res.json(); if (data.token) return data.token; }
    } catch { /* tenta o próximo */ }
  }
  return null;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const arg = (name, fallback = null) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  if (args.includes('--list')) {
    for (const [name, p] of Object.entries(PROFILES)) console.log(`${name.padEnd(10)} ${String(p.players).padStart(4)} jogadores — ${p.description}`);
    process.exit(0);
  }
  const profileName = arg('profile', 'smoke12');
  const url = arg('url', `ws://127.0.0.1:${process.env.PORT || 8787}`);
  const durationMs = arg('duration') ? Number(arg('duration')) : null;
  const seed = arg('seed', 'loadgen');
  const out = arg('json');
  // Pool de credenciais: padrão dev (kr_player/kr_admin) ou prefixo escalável
  // (kr_bot001..kr_bot0NN criados via scripts/make-loadgen-users.mjs).
  let users = [['kr_player', 'kr123'], ['kr_admin', 'kr123']];
  const userPrefix = arg('user-prefix');
  const userCount = Number(arg('user-count') || 0);
  if (userPrefix && userCount > 0) {
    users = Array.from({ length: userCount }, (_, i) => [`${userPrefix}${String(i + 1).padStart(3, '0')}`, 'kr123']);
  }
  try {
    const report = await runProfile({ profileName, url, durationMs, users, seed });
    const fmt = (s, unit) => s.n === 0 ? '—' : `p50 ${s.p50?.toFixed(1)}${unit} · p95 ${s.p95?.toFixed(1)}${unit} · p99 ${s.p99?.toFixed(1)}${unit} · max ${s.max?.toFixed(1)}${unit} (n=${s.n})`;
    console.log(`\n=== LOADGEN ${report.profile} — ${report.description} ===`);
    console.log(`alvo ${url} · ${report.players} jogadores · ${report.durationMs}ms`);
    console.log(`conexões ok ${report.connectedDone}/${report.players} · caídas ${report.droppedEarly} · erros ${report.errors} ${JSON.stringify(report.errorKinds)}`);
    console.log(`snapshots recebidos: ${report.snapshots}`);
    console.log(`RTT:          ${fmt(report.rtt, 'ms')}`);
    console.log(`snapshotGap:  ${fmt(report.snapshotGap, 'ms')}`);
    console.log(`RSS generator: ${report.generatorRssMB.start} → ${report.generatorRssMB.end} MB`);
    if (out) { fs.writeFileSync(out, JSON.stringify(report, null, 2)); console.log(`relatório JSON: ${out}`); }
    // Critério SLO (docs/M3_DISTRIBUTED_SRE.md): p95 de RTT < 150ms e erro < 1%.
    const ok = report.rtt.p95 !== null && report.rtt.p95 < 150 && report.errors / Math.max(1, report.players) < 0.01;
    console.log(ok ? 'SLO_OK (p95 RTT < 150ms, erros < 1%)' : 'SLO_VIOLATED');
    process.exit(ok ? 0 : 2);
  } catch (error) {
    console.error(`loadgen falhou: ${error.message}`);
    process.exit(1);
  }
}
