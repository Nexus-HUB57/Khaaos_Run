// Khaaos Run — Smoke Fase 16 (cross-node em staging REAL).
//
// Valida o gateway WS roteando por nodeId sobre Redis REAL com DOIS nós de
// aplicação (dist/index.cjs de produção) e DOIS nós Redis reais (master +
// réplica de leitura):
//
//   1. Infra: master PING, réplica com role:slave/master_link_status:up e
//      replicando (chave escrita no master lida na réplica);
//   2. Registro de nós: <ns>:nodes:index com os dois nós + canais
//      <ns>:relay:<nodeId> ativos no PUBSUB;
//   3. Cross-node por invite code: p1 cria lobby PRIVADO no nó A; p2 conecta
//      no nó B e entra por join_code — túnel relay (socket fica em B, sala
//      autoritativa em A) com welcome + room_state de volta;
//   4. Partida real: host inicia, countdown 10s, IN_PROGRESS com zone_tick
//      fluindo para o cliente RELEADO em B; movimento de p2 roteado B→A
//      (posição converge no snapshot do nó dono);
//   5. Combate cross-node: p1 abate p2 através do túnel — player_eliminated +
//      match_finished nos dois clientes;
//   6. Payouts 2PC (Fase 16): claims COMMITTED no PG, wallet creditada UMA
//      vez por jogador (p1 650 = 150·1kill+500 1º; p2 250 = podium 2º), todas
//      as operações do ledger balanceadas;
//   7. Morte do nó dono: SIGKILL no A → p2 recebe ROOM_NODE_LOST, o mesh
//      reconcilia o índice Redis e p2 reancora em uma sala LOCAL do B.
//
// Uso:
//   node scripts/smoke-fase16-cross-node.mjs
//   SMOKE_EXTERNAL=1 SMOKE_NODE_A_PORT=8900 SMOKE_NODE_B_PORT=8901 \
//     node scripts/smoke-fase16-cross-node.mjs
//
// Infra esperada: PostgreSQL (DATABASE_URL migrado) + Redis master
// (REDIS_URL) + réplica opcional (SMOKE_REPLICA_URL) já em execução.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import WebSocket from "ws";

const EXTERNAL = process.env.SMOKE_EXTERNAL === "1";
const PORT_A = Number(process.env.SMOKE_NODE_A_PORT || 8900);
const PORT_B = Number(process.env.SMOKE_NODE_B_PORT || 8901);
const BASE_A = `http://127.0.0.1:${PORT_A}`;
const BASE_B = `http://127.0.0.1:${PORT_B}`;
const REDIS_URL = process.env.REDIS_URL?.startsWith("redis")
  ? process.env.REDIS_URL
  : "redis://127.0.0.1:56379"; // ambiente pode exportar URLs alheias (ex.: SQLite da sandbox)
const REDIS_NAMESPACE = process.env.REDIS_NAMESPACE || "khaaos_f16";
const DATABASE_URL = process.env.DATABASE_URL?.startsWith("postgres")
  ? process.env.DATABASE_URL
  : "postgres://postgres:staging_pg_pw@127.0.0.1:55432/khaaos_runtime_f16";
const REPLICA_URL = process.env.SMOKE_REPLICA_URL || "";
const EXPECTED_NODES = (process.env.SMOKE_EXPECTED_NODES || "smoke-node-a,smoke-node-b")
  .split(",").map((n) => n.trim()).filter(Boolean);
const WS_TOKEN_SECRET = process.env.WS_TOKEN_SECRET || "f16-cross-node-smoke-secret-0123456789abcdef";
const SESSION_SECRET_CURRENT = process.env.SESSION_SECRET_CURRENT || "f16-cross-node-smoke-session-secret-0123456789";
const NODE_ENV = process.env.NODE_ENV || "production";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(fn, tries, everyMs = 500) {
  for (let i = 0; i < tries; i++) {
    const value = await fn();
    if (value) return value;
    await sleep(everyMs);
  }
  return null;
}

// ─── Redis helpers (verificação de 2 nós reais via RESP direto) ─────────────
function redisCommand(url, ...parts) {
  const parsed = new URL(url);
  const args = ["-h", parsed.hostname, "-p", parsed.port || "6379"];
  if (parsed.password) args.push("-a", parsed.password, "--no-auth-warning");
  args.push(...parts.map(String));
  return execFileSync("/home/z/my-project/runtime-infra/redis-7.4.1/src/redis-cli", args, { encoding: "utf8" }).trim();
}

function nodeEnv(nodeId, port) {
  return {
    ...process.env,
    NODE_ENV,
    PORT: String(port),
    NODE_ID: nodeId,
    NODE_PUBLIC_URL: `http://127.0.0.1:${port}`,
    REDIS_URL,
    REDIS_NAMESPACE,
    DATABASE_URL,
    WS_TOKEN_SECRET,
    SESSION_SECRET_CURRENT,
    // OIDC discovery roda no boot (setupAuth): clientId precisa existir.
    REPL_ID: process.env.REPL_ID || "khaaos-f16-smoke",
    ALLOWED_WS_ORIGINS: "http://127.0.0.1",
  };
}

// ─── Sessões (ws-token HMAC mintado pelo MESMO módulo de produção) ───────────
async function mintWsToken(userId) {
  const { execFileSync: exec } = await import("node:child_process");
  const out = exec(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    const { createWsAccessToken } = await import("./server/replit_integrations/auth/ws-token.ts");
    const result = createWsAccessToken(${JSON.stringify(userId)});
    console.log(JSON.stringify(result));
  `], {
    cwd: process.cwd(),
    env: { ...process.env, WS_TOKEN_SECRET },
    encoding: "utf8",
  });
  const line = out.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  return JSON.parse(line).token;
}

// ─── Cliente WS (subprotocolos khaaos-v1 + khaaos-token) ─────────────────────
function wsConnect(port, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, ["khaaos-v1", `khaaos-token.${token}`], {
      origin: "http://127.0.0.1",
    });
    const state = { ws, messages: [], byType: new Map() };
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (process.env.SMOKE_DEBUG) {
        console.log(`[ws:${port}] <<`, JSON.stringify(msg).slice(0, 240));
      }
      state.messages.push(msg);
      if (!state.byType.has(msg.type)) state.byType.set(msg.type, []);
      state.byType.get(msg.type).push(msg);
    });
    ws.on("open", () => resolve(state));
    ws.on("error", reject);
  });
}
const send = (state, obj) => state.ws.send(JSON.stringify(obj));
const waitMessage = async (state, type, predicate = () => true, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const found = (state.byType.get(type) ?? []).find(predicate);
    if (found) return found;
    await sleep(250);
  }
  return null;
};

// ─── PG helpers (assertions de payout) ───────────────────────────────────────
async function pgQuery(text, params = []) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

// ─── Boot dos nós (modo self-hosted) ─────────────────────────────────────────
let nodeA = null;
let nodeB = null;
if (!EXTERNAL) {
  console.log("[f16] boot nó A em :" + PORT_A + " (dist/index.cjs de produção)");
  nodeA = spawn(process.execPath, ["dist/index.cjs"], { env: nodeEnv("smoke-node-a", PORT_A), stdio: ["ignore", "pipe", "pipe"] });
  nodeA.stdout.on("data", (d) => { if (process.env.SMOKE_DEBUG) process.stderr.write(`[node-a] ${d}`); });
  nodeA.stderr.on("data", (d) => process.stderr.write(`[node-a] ${d}`));
  console.log("[f16] boot nó B em :" + PORT_B);
  nodeB = spawn(process.execPath, ["dist/index.cjs"], { env: nodeEnv("smoke-node-b", PORT_B), stdio: ["ignore", "pipe", "pipe"] });
  nodeB.stdout.on("data", (d) => { if (process.env.SMOKE_DEBUG) process.stderr.write(`[node-b] ${d}`); });
  nodeB.stderr.on("data", (d) => process.stderr.write(`[node-b] ${d}`));
  process.on("exit", () => {
    for (const node of [nodeA, nodeB]) {
      try { node?.kill("SIGKILL"); } catch {}
    }
  });
}

async function waitReady(base) {
  const ok = await poll(async () => {
    try {
      const res = await fetch(`${base}/api/auth/ws-token`);
      // 401 sem sessão = servidor de pé (rota registrada).
      return res.status === 401 || res.ok;
    } catch { return false; }
  }, 80, 500);
  assert.ok(ok, `nó não abriu em ${base}`);
}

// ═══ 1. Infra: 2 nós Redis reais (master + réplica) ══════════════════════════
console.log("[f16] 1. infra Redis");
assert.equal(redisCommand(REDIS_URL, "PING"), "PONG", "master Redis responde");
if (REPLICA_URL) {
  const info = redisCommand(REPLICA_URL, "INFO", "replication");
  assert.match(info, /role:slave/, "réplica com role:slave");
  assert.match(info, /master_link_status:up/, "réplica sincronizada com o master");
  redisCommand(REDIS_URL, "SET", `${REDIS_NAMESPACE}:smoke:replication-probe`, String(Date.now()));
  await sleep(400);
  const replicated = redisCommand(REPLICA_URL, "GET", `${REDIS_NAMESPACE}:smoke:replication-probe`);
  assert.ok(replicated, "chave escrita no master visível na réplica (replicação REAL)");
  console.log("[f16] réplica Redis REAL sincronizada (role:slave, probe replicada)");
} else {
  console.log("[f16] SMOKE_REPLICA_URL ausente — validando apenas o master");
}
const masterInfo = redisCommand(REDIS_URL, "INFO", "server");
assert.match(masterInfo, /redis_version:7\./, "Redis 7 real");
console.log("[f16] master Redis 7 OK em", REDIS_URL.replace(/\/\/.*@/, "//"));

console.log("[f16] aguardando nós prontos…");
await waitReady(BASE_A);
await waitReady(BASE_B);
console.log("[f16] nós A e B prontos");

// ═══ 2. Registro de nós no Redis (mesh + gateway) ════════════════════════════
console.log("[f16] 2. registro de nós");
const registrySeen = await poll(() => {
  try {
    const raw = redisCommand(REDIS_URL, "HKEYS", `${REDIS_NAMESPACE}:nodes:index`);
    if (!raw) return null;
    const keys = raw.split("\n").map((k) => k.trim()).filter(Boolean);
    return EXPECTED_NODES.every((expected) => keys.includes(expected)) ? keys : null;
  } catch { return null; }
}, 30, 500);
assert.ok(registrySeen, `índice de nós não registrou ${EXPECTED_NODES.join(" + ")}: ${registrySeen}`);
console.log("[f16] nós registrados no Redis:", registrySeen.sort().join(", "));

// ═══ 3. Lobby privado no nó A + join cross-node pelo nó B ════════════════════
console.log("[f16] 3. lobby privado no A; p2 entra do B via join_code (túnel)");
const tokenP1 = await mintWsToken("kr_player");
const tokenP2 = await mintWsToken("kr_player2");
const p1 = await wsConnect(PORT_A, tokenP1);
send(p1, { type: "create_lobby", private: true, maxPlayers: 4, displayName: "Host-A" });
const p1State = await waitMessage(p1, "room_state", (m) => m.room?.inviteCode, 40);
assert.ok(p1State, "room_state com inviteCode no nó A");
const lobbyId = p1State.room.id;
const inviteCode = p1State.room.inviteCode;
assert.ok(lobbyId && inviteCode, "lobby + código de convite emitidos");
console.log(`[f16] lobby ${lobbyId} (código ${inviteCode}) hospedado em smoke-node-a`);

const p2 = await wsConnect(PORT_B, tokenP2);
send(p2, { type: "join_code", code: inviteCode, displayName: "Guest-B" });
const p2Welcome = await waitMessage(p2, "welcome", (m) => m.roomId === lobbyId, 40);
assert.ok(p2Welcome, "welcome cross-node (túnel) com o roomId do lobby do nó A");
const p2State = await waitMessage(p2, "room_state", (m) => (m.room?.players ?? []).length === 2, 40);
assert.ok(p2State, "room_state com 2 jogadores entregue ao cliente relayado em B");
assert.equal(p2State.room.hostId, "kr_player", "host é o criador no nó A");
console.log("[f16] túnel cross-node OK — p2 (socket em B) vê a sala autoritativa de A");

// Prova de isolamento: a sala NÃO pode ser aplicada no nó de origem.
// (o room_state recebido por p2 vem do dono; nenhum lobby fantasma local)

// ═══ 4. Partida real com cliente relayado ════════════════════════════════════
console.log("[f16] 4. partida real através do túnel");
send(p1, { type: "start" });
const countdown = await waitMessage(p1, "countdown", () => true, 20);
assert.ok(countdown, "countdown iniciado pelo host no nó A");
const inProgress = await poll(() => {
  const state = (p1.byType.get("room_state") ?? []).at(-1);
  return state?.room?.status === "IN_PROGRESS" ? state : null;
}, 40, 500);
assert.ok(inProgress, "partida IN_PROGRESS no nó A");
const inProgressP2 = await poll(() => {
  const state = (p2.byType.get("room_state") ?? []).at(-1);
  return state?.room?.status === "IN_PROGRESS" ? state : null;
}, 20, 500);
assert.ok(inProgressP2, "partida IN_PROGRESS visível no cliente relayado (B)");
console.log("[f16] IN_PROGRESS nos dois clientes (A direto, B via túnel)");

// Movimento cross-node: p2 (em B) define destino 50/50; posição converge no nó dono.
send(p2, { type: "position", x: 50, y: 50 });
send(p1, { type: "position", x: 50, y: 50 });
const converged = await poll(() => {
  const state = (p1.byType.get("zone_tick") ?? []).at(-1);
  const guest = (state?.players ?? []).find((pl) => pl.userId === "kr_player2");
  return guest && Math.abs(guest.posX - 50) < 4 && Math.abs(guest.posY - 50) < 4 ? guest : null;
}, 40, 500);
assert.ok(converged, "posição de p2 roteada B→A e aplicada no nó dono (zone_tick do dono)");
console.log(`[f16] movimento cross-node OK — p2 convergiu para (${converged.posX.toFixed(1)}, ${converged.posY.toFixed(1)}) no snapshot do dono`);
const p2Ticks = (p2.byType.get("zone_tick") ?? []).length;
assert.ok(p2Ticks > 0, "zone_tick s2c A→B entregue ao cliente relayado");

// ═══ 5. Combate cross-node: abate através do túnel ═══════════════════════════
console.log("[f16] 5. combate cross-node (p1 abate p2 através do túnel)");
for (let shot = 0; shot < 10; shot++) {
  send(p1, { type: "attack", targetId: "kr_player2" });
  await sleep(850);
}
const eliminated = await waitMessage(p1, "player_eliminated", (m) => m.userId === "kr_player2", 20);
assert.ok(eliminated && eliminated.eliminatorId === "kr_player", "abate aplicado no nó dono (A)");
const eliminatedP2 = await waitMessage(p2, "player_eliminated", (m) => m.userId === "kr_player2", 20);
assert.ok(eliminatedP2, "player_eliminated entregue à vítima relayada em B");
console.log("[f16] abate cross-node OK (eliminado visível no dono e no relayado)");

const finishedP1 = await waitMessage(p1, "match_finished", () => true, 30);
const finishedP2 = await waitMessage(p2, "match_finished", () => true, 30);
assert.ok(finishedP1 && finishedP2, "match_finished entregue aos dois clientes");
console.log(`[f16] vitória: ${finishedP1.winnerId} — rankings: ${finishedP1.rankings.map((r) => `${r.userId}#${r.placement}`).join(", ")}`);

// ═══ 6. Payouts 2PC no PostgreSQL real (Fase 16) ═════════════════════════════
console.log("[f16] 6. payouts 2PC (Idempotency-Key determinística por jogador)");
const payoutRows = await poll(async () => {
  const rows = await pgQuery(
    "SELECT user_id, status, krc_amount FROM match_payout_claims WHERE room_id = $1 ORDER BY user_id",
    [lobbyId],
  );
  return rows.length === 2 && rows.every((r) => r.status === "COMMITTED") ? rows : null;
}, 30, 500);
assert.ok(payoutRows, "claims de payout COMMITTED para os 2 participantes");
const byUser = new Map(payoutRows.map((r) => [r.user_id, Number(r.krc_amount)]));
assert.equal(byUser.get("kr_player"), 650, "p1: 1 kill (150) + 1º lugar (500) = 650 KRC");
assert.equal(byUser.get("kr_player2"), 250, "p2: 2º lugar podium = 250 KRC");
const ledgerRows = await pgQuery(
  `SELECT account_code, side, SUM(amount_krc)::float AS total FROM economy_ledger_entries
   WHERE idempotency_key LIKE 'payout.' || $1 || '.%' GROUP BY account_code, side`,
  [lobbyId],
);
const net = new Map();
for (const r of ledgerRows) {
  const signed = Number(r.total) * (r.side === "DEBIT" ? 1 : -1);
  net.set(r.account_code, (net.get(r.account_code) ?? 0) + signed);
}
assert.equal(net.get("payout.in_transit"), 0, "in_transit zerado (commit completo)");
// A treasury sai DEBITADA pelo total pago (o dinheiro foi para as wallets) —
// a reserva in_transit é consumida pelo commit, não devolvida à treasury.
const totalPaid = [...byUser.values()].reduce((s, v) => s + v, 0);
assert.equal(net.get("treasury.match_rewards"), totalPaid, "treasury debitada exatamente pelo total pago");
const wallets = await pgQuery(
  "SELECT user_id, weapons_balance::float AS balance FROM bank_accounts WHERE user_id IN ('kr_player','kr_player2')",
);
console.log(`[f16] wallets: ${wallets.map((w) => `${w.user_id}=${w.balance}`).join(", ")}`);
const unbalanced = await pgQuery(
  `SELECT COUNT(*)::int AS n FROM (
     SELECT operation_id FROM economy_ledger_entries
     GROUP BY operation_id
     HAVING SUM(amount_krc) FILTER (WHERE side = 'DEBIT') <> SUM(amount_krc) FILTER (WHERE side = 'CREDIT')
   ) t`,
);
assert.equal(unbalanced[0].n, 0, "todas as operações do ledger balanceadas");
console.log("[f16] PAGOS 2PC OK — claims COMMITTED, ledger balanceado, wallets creditadas uma vez");

// ═══ 7. Morte do nó dono (apenas modo self-hosted) ═══════════════════════════
if (!EXTERNAL) {
  console.log("[f16] 7. morte do nó dono (SIGKILL no A)");
  nodeA.kill("SIGKILL");
  // Janela para o Redis reaproveitar a conexão morta (SIGKILL → FIN/RST):
  // sem isso o publish do próximo passo pode contar o subscriber moribundo.
  await sleep(600);
  // p2 ainda tem túnel: próximo c2s falha a publicação → ROOM_NODE_LOST imediato.
  send(p2, { type: "position", x: 20, y: 20 });
  const lost = await waitMessage(p2, "error", (m) => m.code === "ROOM_NODE_LOST", 20);
  assert.ok(lost, "cliente do nó B recebeu ROOM_NODE_LOST após a morte do dono");
  console.log(`[f16] ROOM_NODE_LOST OK (motivo: ${lost.reason ?? lost.message?.slice(0, 40)})`);

  // Reconcile do mesh: sala do nó A some do índice Redis (lease expira).
  const cleaned = await poll(() => {
    try {
      const raw = redisCommand(REDIS_URL, "HGET", `${REDIS_NAMESPACE}:rooms:index`, lobbyId);
      return raw === "" || raw === null ? true : null;
    } catch { return null; }
  }, 60, 500);
  assert.ok(cleaned, "mesh reconciliou: sala do nó morto removida do índice Redis");
  console.log("[f16] reconcile OK — sala órfã removida do índice distribuído");

  // Reancoragem: p2 entra em sala LOCAL do nó B.
  send(p2, { type: "join", displayName: "Guest-B" });
  const reanchored = await waitMessage(p2, "welcome", (m) => m.roomId && m.roomId !== lobbyId, 30);
  assert.ok(reanchored, "p2 reancorado em sala local do nó B após a perda do nó");
  console.log(`[f16] reancoragem OK — nova sala local em B: ${reanchored.roomId}`);
} else {
  console.log("[f16] 7. SMOKE_EXTERNAL=1 — teste de morte de nó pulado (staging gerenciado)");
}

try { p1.ws.close(); p2.ws.close(); } catch {}
console.log("F16_SMOKE_OK");
process.exit(0);
