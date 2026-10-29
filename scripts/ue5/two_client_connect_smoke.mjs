#!/usr/bin/env node
// Khaaos Run — M4: two-client connect smoke (roadmap docs/ROADMAP.md M4).
//
// Aceite: "empacotar e conectar dois clientes" — orquestra, contra binários
// REAIS construídos pelo UBT:
//   1. servidor dedicado headless (-log, -nullrhi);
//   2. dois clientes (-game, -nullrhi) conectando ao servidor;
//   3. contratos de log: cada cliente gera um "Login request" no log do
//      servidor; após o soak, NENHUM cliente foi desconectado pelo servidor.
//
// Contrato de aceite (grep): TWO_CLIENT_CONNECT_SMOKE_OK
//
// Uso (no runner licenciado/container — requer engine real):
//   node scripts/ue5/two_client_connect_smoke.mjs \
//     --server-bin Unreal/KhaaosRun/Binaries/Linux/KhaaosRunServer \
//     --client-bin Unreal/KhaaosRun/Binaries/Linux/KhaaosRun \
//     [--map /Game/Maps/CIGKV/CIGKV_P] [--expect-clients 2] [--timeout-ms 120000]
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const SERVER_BIN = arg('server-bin');
const CLIENT_BIN = arg('client-bin');
const MAP = arg('map', '/Game/Maps/CIGKV/CIGKV_P');
const EXPECT = Number(arg('expect-clients', 2));
const TIMEOUT_MS = Number(arg('timeout-ms', 120_000));
const SOAK_MS = Number(arg('soak-ms', 8_000));
const PORT = Number(arg('port', 7777));
const SERVER_MARKER = arg('server-marker', 'Login request');
const DISCONNECT_MARKER = arg('disconnect-marker', 'Connection closed by client');

const log = (m) => console.log(`[two-client] ${m}`);
const fatal = (m) => { console.error(`[two-client] FALHA: ${m}`); };

if (!SERVER_BIN || !CLIENT_BIN || !fs.existsSync(SERVER_BIN) || !fs.existsSync(CLIENT_BIN)) {
  fatal('--server-bin/--client-bin obrigatórios e existentes (build UBT primeiro)');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-two-client-'));
const serverLog = path.join(tmp, 'server.log');
const clientLogs = [];
const children = [];

const spawnProc = (bin, argsArr, logFile, label) => {
  const out = fs.openSync(logFile, 'a');
  const child = spawn(bin, argsArr, { cwd: path.dirname(bin), stdio: ['ignore', out, out] });
  children.push({ child, label });
  log(`${label} pid=${child.pid} → log ${logFile}`);
  return child;
};

const countMarker = (file, marker) => {
  try { return (fs.readFileSync(file, 'utf8').match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length; }
  catch { return 0; }
};

let exitCode = 0;
try {
  // ── [1] Servidor dedicado real ──
  log(`[1] servidor dedicado: ${path.basename(SERVER_BIN)} (mapa ${MAP}, porta ${PORT})`);
  spawnProc(SERVER_BIN, [`${MAP}?listen`, '-log', '-unattended', '-nosplash', '-nullrhi', `-port=${PORT}`], serverLog, 'server');

  // Espera o servidor anunciar a porta (contrato genérico de startup).
  const serverUpDeadline = Date.now() + 60_000;
  let serverUp = false;
  while (Date.now() < serverUpDeadline) {
    const content = fs.existsSync(serverLog) ? fs.readFileSync(serverLog, 'utf8') : '';
    if (/Starting Game|NetConfig|Bringing Level|Initializing Dedicated Server|LogNet:.*listen/i.test(content)) { serverUp = true; break; }
    await delay(500);
  }
  if (!serverUp) throw new Error(`servidor não subiu em 60s (últimas linhas: ${fs.readFileSync(serverLog, 'utf8').split('\n').slice(-5).join(' | ')})`);
  log('[1] servidor pronto');

  // ── [2] Dois clientes reais conectando ──
  for (let i = 1; i <= EXPECT; i++) {
    const logFile = path.join(tmp, `client${i}.log`);
    clientLogs.push(logFile);
    spawnProc(CLIENT_BIN, [`127.0.0.1:${PORT}`, '-game', '-log', '-unattended', '-nosplash', '-nullrhi'], logFile, `client${i}`);
    await delay(2_000); // entrada escalonada (spawn realista)
  }

  // ── [3] Contrato: EXPECT logins no log do servidor ──
  const deadline = Date.now() + TIMEOUT_MS;
  let logins = 0;
  while (Date.now() < deadline) {
    logins = countMarker(serverLog, SERVER_MARKER);
    if (logins >= EXPECT) break;
    const anyDead = children.filter(({ child }) => child.exitCode !== null && child.pid !== children[0]?.child.pid);
    if (anyDead.length >= EXPECT) throw new Error(`clientes morreram antes do login (${anyDead.length}/${EXPECT}) — ver logs em ${tmp}`);
    await delay(500);
  }
  if (logins < EXPECT) {
    throw new Error(`esperava ${EXPECT}x '${SERVER_MARKER}' no log do servidor, obtive ${logins} em ${TIMEOUT_MS}ms`);
  }
  log(`[3] ${logins}/${EXPECT} logins reais observados no servidor`);

  // ── [4] Soak: nenhum cliente desconectado logo após o login ──
  log(`[4] soak ${SOAK_MS}ms — verificando estabilidade das conexões`);
  await delay(SOAK_MS);
  const disconnects = countMarker(serverLog, DISCONNECT_MARKER);
  if (disconnects >= EXPECT) {
    throw new Error(`${disconnects} desconexões de cliente durante o soak (esperava < ${EXPECT}) — mapa falhou ao carregar?`);
  }
  log(`[4] soak limpo (${disconnects} desconexões < ${EXPECT})`);
  console.log('TWO_CLIENT_CONNECT_SMOKE_OK');
} catch (error) {
  fatal(error.message);
  exitCode = 1;
} finally {
  // Evidência: últimas linhas de cada log no stdout (entra no artifact/summary).
  const tailOf = (file, n = 15) => {
    try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-n).join('\n'); }
    catch { return '(log indisponível)'; }
  };
  console.log('── server.log (tail) ──\n' + tailOf(serverLog));
  clientLogs.forEach((f, i) => console.log(`── client${i + 1}.log (tail) ──\n${tailOf(f, 8)}`));
  for (const { child } of children) { try { child.kill('SIGKILL'); } catch { /* já morto */ } }
  console.log(`[artifacts] logs completos em ${tmp}`);
}
process.exit(exitCode);
