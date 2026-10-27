#!/usr/bin/env node
// ─── EAC Dedicated Server Smoke (Fase 0.3 — auditoria) ───────────────────────
//
// Exige a linha canônica "EAC Status: Active" no log de um servidor dedicado
// REAL. A linha "EAC Status: Running (stub …)" indica SDK ausente e NUNCA
// passa no modo estrito (padrão). Contrato espelha setup_eac_sdk.sh:
//   - padrão (estrito): exit 0 só com Active;
//   - --allow-missing-input: sem binário/log o smoke marca SKIPPED e exit 0
//     (CI de PR sem SDK — o go-live usa o modo estrito);
//   - stub detectado: exit 4 sempre (estado contraditório é erro).
//
// Uso:
//   node scripts/build/eac_dedicated_smoke.mjs --selftest
//   node scripts/build/eac_dedicated_smoke.mjs --log <arquivo.log>
//   node scripts/build/eac_dedicated_smoke.mjs --binary <KhaaosRunServer> \
//        [--args "Mapa?listen -port=7788"] [--timeout-ms 180000]
//   ... --allow-missing-input (CI sem SDK/binário: SKIPPED em vez de erro)
//
// Env: EAC_SMOKE_LOG / EAC_SMOKE_BINARY / EAC_SMOKE_ARGS / EAC_SMOKE_TIMEOUT_MS
// Saída legível por CI: "EAC_SMOKE=ACTIVE" | "EAC_SMOKE=STUB" | "EAC_SMOKE=SKIPPED".

import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import readline from "node:readline";

const LINE_ACTIVE = "EAC Status: Active";
const LINE_STUB = "EAC Status: Running (stub";

function parseArgs(argv) {
  const options = {
    selftest: false,
    log: process.env.EAC_SMOKE_LOG || null,
    binary: process.env.EAC_SMOKE_BINARY || null,
    args: process.env.EAC_SMOKE_ARGS || "",
    timeoutMs: Number(process.env.EAC_SMOKE_TIMEOUT_MS || 180_000),
    allowMissingInput: false,
    reason: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--selftest") options.selftest = true;
    else if (arg === "--log") options.log = argv[++i] ?? null;
    else if (arg === "--binary") options.binary = argv[++i] ?? null;
    else if (arg === "--args") options.args = argv[++i] ?? "";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i] ?? options.timeoutMs);
    else if (arg === "--allow-missing-input") options.allowMissingInput = true;
    else if (arg === "--reason") options.reason = argv[++i] ?? "";
    else {
      console.error(`Argumento desconhecido: ${arg}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000) options.timeoutMs = 180_000;
  return options;
}

/** Varre um arquivo de log procurando a linha canônica do EAC.
 *  Retorna "active" | "stub" | "absent". */
export async function scanLogForEacStatus(logPath, { signal } = {}) {
  const stream = createReadStream(logPath, { encoding: "utf8" });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let status = "absent";
  try {
    for await (const line of reader) {
      if (signal?.aborted) break;
      if (line.includes(LINE_ACTIVE)) {
        status = "active";
        break; // Active é o melhor resultado possível — pare cedo
      }
      if (line.includes(LINE_STUB) && status === "absent") {
        status = "stub"; // continua lendo: Active pode vir depois do stub inicial
      }
    }
  } finally {
    reader.close();
    stream.close();
  }
  return status;
}

/** Roda o binário do servidor dedicado e observa stdout + log até Active. */
async function runServerAndWatch(options) {
  const binary = resolve(options.binary);
  if (!existsSync(binary)) {
    console.error(`ERRO: binário do servidor não encontrado: ${binary}`);
    process.exit(3);
  }
  const extraArgs = options.args.split(" ").filter(Boolean);
  const args = [...extraArgs];
  if (!args.some((a) => a.includes("nullrhi"))) args.push("-nullrhi");
  if (!args.some((a) => a.includes("unattended"))) args.push("-unattended");
  if (!args.some((a) => a.includes("nosplash"))) args.push("-nosplash");
  if (!args.some((a) => a.includes("-log"))) args.push("-log");

  console.log(`[eac-smoke] iniciando ${binary} ${args.join(" ")}`);
  const controller = new AbortController();
  const child = spawn(binary, args, {
    cwd: join(binary, "..", ".."), // Binaries/Linux → raiz do projeto (Saved/Logs)
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const killTree = (signal = "SIGTERM") => {
    try {
      if (child.pid) process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // já morreu
      }
    }
  };
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const onAbort = () => killTree("SIGTERM");
  controller.signal.addEventListener("abort", onAbort, { once: true });

  const logDir = mkdtempSync(join(tmpdir(), "eac-smoke-"));
  const capturedLog = join(logDir, "stdout.log");
  writeFileSync(capturedLog, "");
  const stdoutWrite = (chunk) => writeFileSync(capturedLog, chunk, { flag: "a" });
  child.stdout.on("data", stdoutWrite);
  child.stderr.on("data", stdoutWrite);

  let status = "absent";
  try {
    const deadline = Date.now() + options.timeoutMs;
    while (Date.now() < deadline && !controller.signal.aborted) {
      status = await scanLogForEacStatus(capturedLog, { signal: controller.signal });
      if (status === "active") break;
      await new Promise((r) => setTimeout(r, 1_000));
      if (child.exitCode !== null && child.exitCode !== 0 && status !== "active") {
        // morreu antes do Active: última varredura e falha
        status = await scanLogForEacStatus(capturedLog);
        break;
      }
    }
  } finally {
    clearTimeout(timer);
    killTree("SIGTERM");
    await new Promise((r) => setTimeout(r, 2_000));
    killTree("SIGKILL");
    controller.signal.removeEventListener("abort", onAbort);
  }

  const eacLines = readFileSync(capturedLog, "utf8")
    .split("\n")
    .filter((line) => line.includes("EAC Status"))
    .slice(-5);
  rmSync(logDir, { recursive: true, force: true });
  return { status, eacLines };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selftest) {
    const { runSelftest } = await import("./eac_dedicated_smoke_selftest.mjs");
    process.exit(runSelftest() ? 0 : 1);
  }

  if (!options.log && !options.binary) {
    if (options.allowMissingInput) {
      console.log("EAC_SMOKE=SKIPPED (sem --log/--binary nem EAC_SMOKE_LOG/EAC_SMOKE_BINARY)");
      if (options.reason) console.log(`[eac-smoke] motivo: ${options.reason}`);
      process.exit(0);
    }
    console.error("ERRO: informe --log <arquivo> ou --binary <servidor> (ou env EAC_SMOKE_*)");
    process.exit(3);
  }

  const result = options.log
    ? { status: await scanLogForEacStatus(options.log), eacLines: [] }
    : await runServerAndWatch(options);

  if (result.eacLines.length) {
    for (const line of result.eacLines) console.log(`[eac-smoke] ${line.trim()}`);
  }

  if (result.status === "active") {
    console.log("EAC_SMOKE=ACTIVE");
    process.exit(0);
  }
  if (result.status === "stub") {
    console.error("EAC_SMOKE=STUB — SDK real do EAC AUSENTE: o servidor logou 'Running (stub)'.");
    console.error("Go-live: bash scripts/build/setup_eac_sdk.sh --require + KHAAOS_EAC_SDK_DIR e rode este smoke novamente.");
    process.exit(4);
  }
  console.error(`EAC_SMOKE=ABSENT — linha 'EAC Status: Active' não apareceu no log (timeout ou falha de inicialização do EAC).`);
  process.exit(5);
}

// main() só roda quando este arquivo é o entrypoint (selftest importa a
// função pura sem disparar o smoke).
import { pathToFileURL } from "node:url";
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error("[eac-smoke] falha inesperada:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
