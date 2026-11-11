#!/usr/bin/env node
// Khaaos Run — replay fixo + soak gráfico UE5.8.
//
// O sandbox pode validar o contrato com --dry-run. A execução real exige um
// runner self-hosted com UE5.8, GPU e UE5_REPLAY_COMMAND configurado.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_REPLAY = path.join(ROOT, 'scripts/performance/ue58-fixed-replay.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function hasFlag(name) { return process.argv.includes(`--${name}`); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function metricSummary(values) {
  if (!values.length) return { samples: 0, p50Ms: null, p95Ms: null, maxMs: null };
  return {
    samples: values.length,
    p50Ms: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}
function numeric(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function splitCsv(line) {
  const out = []; let cell = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') { quoted = !quoted; continue; }
    if (c === ',' && !quoted) { out.push(cell.trim()); cell = ''; } else cell += c;
  }
  out.push(cell.trim());
  return out;
}
function findMetric(headers, patterns) {
  return headers.findIndex((h) => patterns.some((pattern) => pattern.test(h.replace(/[^a-z0-9 ]/gi, ' ').toLowerCase())));
}
function parseCsvMetrics(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const headers = splitCsv(lines[0]);
  const indexes = {
    gameThread: findMetric(headers, [/game\s*thread/, /game\s*ms/, /gamethread/]),
    renderThread: findMetric(headers, [/render\s*thread/, /render\s*ms/, /renderthread/]),
    gpu: findMetric(headers, [/gpu\s*frame/, /gpu\s*ms/, /^gpu$/]),
    lumenGpu: findMetric(headers, [/lumen\s*gpu/, /lumen\s*ms/]),
    naniteFallback: findMetric(headers, [/nanite\s*fallback/, /fallback\s*percent/]),
  };
  const values = { gameThread: [], renderThread: [], gpu: [], lumenGpu: [], naniteFallback: [] };
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    for (const key of Object.keys(indexes)) {
      const value = indexes[key] >= 0 ? numeric(cells[indexes[key]]) : null;
      if (value != null) values[key].push(value);
    }
  }
  return { file, values, metrics: Object.fromEntries(Object.entries(values).map(([key, list]) => [key, metricSummary(list)])) };
}
function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(full)); else result.push(full);
  }
  return result;
}
function collectMetrics(outputDir) {
  const csv = listFiles(outputDir).filter((file) => file.toLowerCase().endsWith('.csv'));
  const parsed = csv.map(parseCsvMetrics).filter(Boolean);
  const aggregate = {};
  for (const key of ['gameThread', 'renderThread', 'gpu', 'lumenGpu', 'naniteFallback']) {
    const values = parsed.flatMap((entry) => entry.values[key]);
    aggregate[key] = metricSummary(values);
  }
  return { files: parsed.map(({ file, metrics }) => ({ file, metrics })), aggregate };
}
function simulateMetrics(outputDir) {
  const rows = ['Frame,Game Thread,Render Thread,GPU'];
  for (let i = 1; i <= 20; i += 1) {
    const game = i <= 18 ? 5.8 : i === 19 ? 7.1 : 7.8;
    const render = i <= 18 ? 6.4 : i === 19 ? 7.6 : 8.0;
    const gpu = i <= 18 ? 10.2 : i === 19 ? 12.8 : 14.4;
    rows.push(`${i},${game},${render},${gpu}`);
  }
  fs.writeFileSync(path.join(outputDir, 'simulated-stat-unit.csv'), `${rows.join('\n')}\n`);
}
function evaluateAcceptance(replay, metrics) {
  const acceptance = replay.acceptance ?? {};
  const aggregate = metrics.aggregate;
  const measured = {
    gameThreadP95Ms: aggregate.gameThread.p95Ms,
    renderThreadP95Ms: aggregate.renderThread.p95Ms,
    gpuP95Ms: aggregate.gpu.p95Ms,
    lumenGpuP95Ms: aggregate.lumenGpu.p95Ms,
    naniteFallbackP95Percent: aggregate.naniteFallback.p95Ms,
  };
  const gates = {
    gameThread: measured.gameThreadP95Ms != null && measured.gameThreadP95Ms <= acceptance.gameThreadP95Ms,
    renderThread: measured.renderThreadP95Ms != null && measured.renderThreadP95Ms <= acceptance.renderThreadP95Ms,
    gpu: measured.gpuP95Ms != null && measured.gpuP95Ms <= acceptance.gpuP95Ms,
    lumenConfiguration: replay.features?.lumen === true && replay.capture?.gpuVisualizer === true,
    naniteConfiguration: replay.features?.nanite === true && replay.capture?.statUnitGraph === true,
    lumenGpu: measured.lumenGpuP95Ms == null ? null : measured.lumenGpuP95Ms <= acceptance.lumen.maxGpuP95Ms,
    naniteFallback: measured.naniteFallbackP95Percent == null ? null : measured.naniteFallbackP95Percent <= acceptance.nanite.maxFallbackPercent,
  };
  return {
    measured,
    limits: {
      gameThreadP95Ms: acceptance.gameThreadP95Ms ?? null,
      renderThreadP95Ms: acceptance.renderThreadP95Ms ?? null,
      gpuP95Ms: acceptance.gpuP95Ms ?? null,
      lumenGpuP95Ms: acceptance.lumen?.maxGpuP95Ms ?? null,
      naniteFallbackPercent: acceptance.nanite?.maxFallbackPercent ?? null,
    },
    gates,
    configurationPass: gates.lumenConfiguration && gates.naniteConfiguration,
    realRunnerPass: Object.values(gates).every((value) => value !== null && value === true),
    note: 'Lumen e Nanite exigem captura real do runner UE5.8; configuração do manifesto não é evidência de GPU nem de fallback Nanite.',
  };
}
function engineAvailable() {
  const root = process.env.UE5_ROOT;
  const candidates = [root && path.join(root, 'Engine/Binaries/Linux/UnrealEditor-Cmd'), 'UnrealEditor-Cmd'];
  return candidates.find((candidate) => candidate && (candidate.includes('/') ? fs.existsSync(candidate) : spawnSync('bash', ['-lc', `command -v ${candidate}`], { encoding: 'utf8' }).status === 0)) ?? null;
}
function run() {
  const replayPath = path.resolve(ROOT, arg('replay', process.env.UE5_REPLAY_SPEC || DEFAULT_REPLAY));
  const replay = readJson(replayPath);
  const outputDir = path.resolve(ROOT, arg('output-dir', process.env.UE5_REPLAY_OUTPUT || 'artifacts/performance/ue58-fixed-replay'));
  fs.mkdirSync(outputDir, { recursive: true });
  const manifest = {
    schema: 'khaaos.ue58.fixed-replay.run/v1',
    generatedAt: new Date().toISOString(),
    replayPath,
    replay,
    outputDir,
    engine: engineAvailable(),
    commandConfigured: Boolean(process.env.UE5_REPLAY_COMMAND),
    dryRun: hasFlag('dry-run'),
  };
  fs.writeFileSync(path.join(outputDir, 'replay-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (hasFlag('simulate-metrics')) simulateMetrics(outputDir);
  if (hasFlag('dry-run') || !process.env.UE5_REPLAY_COMMAND) {
    const simulated = hasFlag('simulate-metrics');
    const metrics = simulated ? collectMetrics(outputDir) : null;
    manifest.status = simulated ? 'dry_run_simulated' : manifest.engine ? 'not_configured' : 'skipped_no_engine';
    manifest.message = manifest.engine
      ? 'UE5.8 detectado, mas UE5_REPLAY_COMMAND não foi configurado.'
      : 'UE5.8/GPU não detectados; contrato do replay validado sem executar engine.';
    if (simulated) manifest.acceptance = evaluateAcceptance(replay, metrics);
    if (simulated) manifest.metrics = metrics;
    fs.writeFileSync(path.join(outputDir, 'replay-result.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  const command = process.env.UE5_REPLAY_COMMAND;
  const timeoutMs = (Number(replay.durationSeconds) + 120) * 1000;
  const result = spawnSync('bash', ['-lc', command], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      KHAAOS_REPLAY_SPEC: replayPath,
      KHAAOS_REPLAY_OUTPUT: outputDir,
      KHAAOS_REPLAY_DURATION_SECONDS: String(replay.durationSeconds),
      KHAAOS_REPLAY_SEED: replay.seed,
      KHAAOS_REPLAY_WORLDS: replay.worlds.join(','),
    },
  });
  fs.writeFileSync(path.join(outputDir, 'ue5-replay.stdout.log'), result.stdout ?? '');
  fs.writeFileSync(path.join(outputDir, 'ue5-replay.stderr.log'), result.stderr ?? '');
  const metrics = collectMetrics(outputDir);
  const final = {
    ...manifest,
    status: result.error ? 'failed' : result.status === 0 ? 'passed' : 'failed',
    returnCode: result.status,
    error: result.error?.message ?? null,
    metrics,
    acceptance: evaluateAcceptance(replay, metrics),
    command: command.replace(/(--token|TOKEN|PASSWORD)=\S+/gi, '$1=<redacted>'),
  };
  fs.writeFileSync(path.join(outputDir, 'replay-result.json'), `${JSON.stringify(final, null, 2)}\n`);
  console.log(JSON.stringify(final, null, 2));
  if (final.status !== 'passed') process.exitCode = 1;
}
run();
