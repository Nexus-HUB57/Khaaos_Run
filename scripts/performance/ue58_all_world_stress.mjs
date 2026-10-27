#!/usr/bin/env node
// Khaaos Run — stress integrado dos cinco mundos.
//
// O modo padrão exercita a simulação compartilhada em paralelo lógico (todos
// os mundos avançam a cada tick) e mede o custo de cada frame. Isso é um
// proxy determinístico quando o UE5.8 não está instalado. O modo UE real é
// delegado a UE5_WORLD_STRESS_COMMAND, pois o comando de AutomationTest e o
// mapa cookado pertencem ao ambiente licenciado do runner.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KhaaosSim3D, DEFAULT_INPUT } from '../../game-runtime/src/game3d/sim3d.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORLDS = ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'];
const TARGET_TICK_MS = 1000 / 30;
const TARGET_RENDER_FPS = 60;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
function hasFlag(name) { return process.argv.includes(`--${name}`); }
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}
function engineTools() {
  const root = process.env.UE5_ROOT;
  const candidates = [];
  if (root) candidates.push(path.join(root, 'Engine', 'Binaries', 'Linux', 'UnrealEditor-Cmd'));
  for (const name of ['UnrealEditor-Cmd', 'UnrealEditor']) {
    const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) candidates.push(result.stdout.trim());
  }
  return { root: root ?? null, editor: candidates.find((candidate) => fs.existsSync(candidate)) ?? null };
}
function runRealEngine(reportPath) {
  const tools = engineTools();
  const command = process.env.UE5_WORLD_STRESS_COMMAND;
  if (!command) {
    return {
      status: tools.editor ? 'not_configured' : 'skipped_no_engine',
      engine: tools.editor ? tools.editor : null,
      message: tools.editor
        ? 'UE5.8 detectado, mas UE5_WORLD_STRESS_COMMAND não foi configurado para o automation test cookado.'
        : 'UnrealEditor-Cmd/UE5_ROOT ausente neste ambiente; o resultado usa o proxy determinístico da simulação.',
    };
  }
  const result = spawnSync('bash', ['-lc', command], { cwd: ROOT, encoding: 'utf8', timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    engine: tools.editor,
    command,
    returncode: result.status,
    stdoutTail: (result.stdout ?? '').slice(-4000),
    stderrTail: (result.stderr ?? '').slice(-4000),
    reportPath,
  };
}
function runProxy({ durationSeconds, playersPerWorld, seed }) {
  const sims = WORLDS.map((scenarioId, index) => ({
    scenarioId,
    sim: new KhaaosSim3D({
      seed: `${seed}-${scenarioId}-${index}`,
      botCount: Math.max(0, playersPerWorld - 1),
      airdrop: false,
      scenarioId,
      spectate: true,
    }),
    samples: [],
  }));
  for (const entry of sims) entry.sim.start('belt');
  const steps = Math.ceil(durationSeconds * 30);
  const input = { ...DEFAULT_INPUT, seq: 1 };
  const started = performance.now();
  for (let tick = 0; tick < steps; tick += 1) {
    input.seq = tick + 1;
    for (const entry of sims) {
      const tickStarted = performance.now();
      entry.sim.step(input, 1 / 30);
      entry.samples.push(performance.now() - tickStarted);
    }
  }
  const elapsedMs = performance.now() - started;
  const worlds = sims.map(({ scenarioId, sim, samples }) => {
    const p50 = percentile(samples, 0.50);
    const p95 = percentile(samples, 0.95);
    const p99 = percentile(samples, 0.99);
    return {
      world: scenarioId,
      players: playersPerWorld,
      simulatedSeconds: durationSeconds,
      ticks: samples.length,
      wallMs: Number(samples.reduce((sum, value) => sum + value, 0).toFixed(3)),
      frameMs: { p50: Number(p50.toFixed(3)), p95: Number(p95.toFixed(3)), p99: Number(p99.toFixed(3)), max: Number(Math.max(...samples).toFixed(3)) },
      proxyServerFps: Number((1000 / Math.max(p95, 0.001)).toFixed(2)),
      targetServerFps: 30,
      targetFrameMs: Number(TARGET_TICK_MS.toFixed(3)),
      budgetPass: p95 <= TARGET_TICK_MS,
      renderFps: null,
      renderFpsStatus: 'not_measured_without_ue5',
      events: sim.events.length,
    };
  });
  const allSamples = worlds.flatMap((world) => [world.frameMs.p95]);
  return {
    mode: 'deterministic_runtime_proxy',
    durationSeconds,
    playersPerWorld,
    totalPlayers: playersPerWorld * WORLDS.length,
    worldCount: WORLDS.length,
    totalWallMs: Number(elapsedMs.toFixed(3)),
    aggregateProxyFps: Number((1000 / Math.max(percentile(allSamples, 0.95), 0.001)).toFixed(2)),
    worlds,
    pass: worlds.every((world) => world.budgetPass),
    note: 'Proxy da simulação autoritativa; não representa FPS de renderização UE5.8.',
  };
}
function markdown(report) {
  const rows = report.proxy.worlds.map((world) => `| ${world.world} | ${world.players} | ${world.frameMs.p50} | ${world.frameMs.p95} | ${world.frameMs.p99} | ${world.proxyServerFps} | ${world.budgetPass ? 'PASS' : 'FAIL'} |`).join('\n');
  const engine = report.engine.status === 'passed' ? 'PASS' : report.engine.status.toUpperCase();
  return `# Khaaos Run — Stress integrado UE5.8 e relatório FPS\n\n` +
    `**Gerado:** ${report.generatedAt}\n\n` +
    `## Resultado executivo\n\n` +
    `- Mundos simultâneos: **${WORLDS.join(', ')}**\n` +
    `- Carga do proxy: **${report.proxy.totalPlayers} operadores** (${report.proxy.playersPerWorld} por mundo)\n` +
    `- Proxy da simulação: **${report.proxy.aggregateProxyFps} FPS server-equivalentes no p95 agregado**\n` +
    `- Gate de frame time de simulação: **${report.proxy.pass ? 'PASS' : 'FAIL'}** (p95 ≤ ${TARGET_TICK_MS.toFixed(2)} ms)\n` +
    `- Renderização UE5.8: **${engine}** — ${report.engine.message ?? 'comando real executado; consultar saída capturada'}\n\n` +
    `> Limitação importante: o sandbox não possui Unreal Engine 5.8 licenciado. Portanto, os números de renderização são marcados como não medidos; o relatório não converte o proxy em uma alegação de FPS gráfico real.\n\n` +
    `## Frame time por mundo\n\n` +
    `| Mundo | Jogadores | p50 ms | p95 ms | p99 ms | FPS server-equivalente | Gate |\n|---|---:|---:|---:|---:|---:|---|\n${rows}\n\n` +
    `## Gate visual live action / primeira pessoa\n\n` +
    `| Métrica | Alvo | Estado atual | Ação UE5.8 |\n|---|---:|---|---|\n` +
    `| FPS de renderização | ≥ ${TARGET_RENDER_FPS} | Não medido | Executar AutomationTest com captura Stat Unit/CSV em runner UE5.8 |\n` +
    `| Frame time de render | ≤ 16,67 ms | Não medido | Validar Lumen, Nanite, VSM e TAAU no hardware alvo |\n` +
    `| Server tick | ≥ 30 Hz | Proxy medido | Manter NetServerMaxTickRate=60 e observar p95 |\n` +
    `| LOD fora do frustum | Ativo | Implementado | Confirmar ganho com Unreal Insights |\n` +
    `| PBR/Lumen | Sem shader hitch crítico | Não medido | Fazer warm-up de PSO e shader pipeline cache |\n\n` +
    `## Recomendações de otimização\n\n` +
    `1. Capturar **Unreal Insights + Stat UnitGraph + GPU Visualizer** em cada um dos cinco mapas com 60 operadores e replay fixo.\n` +
    `2. Manter personagens próximos em LOD full, migrar para proxy/silhueta por distância e aplicar o gate de frustum antes de aumentar densidade de props.\n` +
    `3. Tratar Lumen e Virtual Shadow Maps como perfis escaláveis: High para referência, Medium para o alvo de 60 FPS e Low para fallback.\n` +
    `4. Fazer soak test de 10 minutos por mundo e um teste simultâneo dos cinco mundos; bloquear release se p95 de frame time exceder 16,67 ms no cliente ou 33,33 ms no servidor.\n`;
}
function main() {
  const durationSeconds = Number(arg('duration-seconds', '30'));
  const playersPerWorld = Number(arg('players-per-world', '60'));
  const output = path.resolve(ROOT, arg('output', 'artifacts/performance/ue58-all-worlds-stress.json'));
  const markdownPath = path.resolve(ROOT, arg('markdown', 'docs/performance/UE58_LIVE_ACTION_FPS_REPORT.md'));
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(playersPerWorld) || playersPerWorld < 1) throw new Error('duration-seconds e players-per-world devem ser positivos');
  const proxy = runProxy({ durationSeconds, playersPerWorld, seed: arg('seed', 'UE58-FIVE-WORLDS') });
  const report = { schema: 'khaaos.ue58.all-world-stress/v1', generatedAt: new Date().toISOString(), worlds: WORLDS, engine: hasFlag('run-engine') ? runRealEngine(output) : { status: 'not_requested', message: 'Use --run-engine em runner UE5.8 para acionar UE5_WORLD_STRESS_COMMAND.' }, proxy };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(markdownPath, markdown(report));
  console.log(JSON.stringify(report, null, 2));
  if (!proxy.pass || report.engine.status === 'failed') process.exitCode = 1;
}
main();
