// Sonda E2E — Task 69: foley de passos fase-travado no jogo real.
// Monkey-patch transparente em game.audio.step: captura cada chamada
// {intensity, distance, side, sprint, land, pan} enquanto o jogador caminha/
// sprinta. Auditoria: passos ocorrem (≈ strikes da passada), L/R alternam
// (strikes reais), sprint muda caráter, bots espacializados (distance>0+pan),
// zero pageerrors. Uso: node scripts/e2e_footsteps_t69.mjs [url] [outdir]
import { chromium } from '/home/z/my-project/Khaaos_Run/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5199/?avatar=rigged-avatar-m-01';
const outdir = process.argv[3] ?? '/tmp/foot-e2e';
mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 140)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForSelector('#beltBtn', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(1500);
await page.locator('#beltBtn').click();
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const g = window.KhaaosReplay3D.game;
  g.trainRide?.end?.('arrived');
  if (g.sim?.player) g.sim.player.trainOnboard = false;
});
await page.waitForTimeout(1500);

// auditoria: envolve audio.step (transparente — chama o original)
await page.evaluate(() => {
  const g = window.KhaaosReplay3D.game;
  const orig = g.audio.step.bind(g.audio);
  window.__steps = { calls: [], phaseAtCall: [] };
  g.audio.step = (intensity, distance, surface, opts = {}) => {
    window.__steps.calls.push({
      intensity: +Number(intensity).toFixed(3),
      distance: +Number(distance ?? 0).toFixed(2),
      surface, side: opts.side ?? null, sprint: !!opts.sprint, land: !!opts.land,
      pan: Number.isFinite(opts.pan) ? +opts.pan.toFixed(3) : null,
    });
    window.__steps.phaseAtCall.push(+((g._gait?.phase ?? 0) % (2 * Math.PI)).toFixed(2));
    return orig(intensity, distance, surface, opts);
  };
});

const read = () => page.evaluate(() => ({ calls: window.__steps.calls.splice(0), phases: window.__steps.phaseAtCall.splice(0) }));
const keys = (add, del) => page.evaluate(([add, del]) => {
  const g = window.KhaaosReplay3D.game;
  for (const k of add) g.keys.add(k);
  for (const k of del) g.keys.delete(k);
}, [add, del]);

console.log('=== PARADO (2.5 s) — deve ser silencioso ===');
await page.waitForTimeout(2500);
const idle = await read();

console.log('=== CAMINHADA (6 s) ===');
await keys(['w'], []);
await page.waitForTimeout(6000);
const walk = await read();

console.log('=== SPRINT (4 s) ===');
await keys(['shift'], []);
await page.waitForTimeout(4000);
const run = await read();
const dist0 = await page.evaluate(() => ({ x: window.KhaaosReplay3D.game.sim.player.x, z: window.KhaaosReplay3D.game.sim.player.z }));
console.log('posição pós-sprint:', JSON.stringify(dist0));
await keys([], ['w', 'shift']);

// segunda caminhada: coletar também a fase do gait no momento de cada passo
console.log('=== CAMINHADA 2 — passos por metro (12 s, invariante estrutural) ===');
const pos0 = await page.evaluate(() => { const g = window.KhaaosReplay3D.game; window.__steps.phaseAtCall.length = 0; return { x: g.sim.player.x, z: g.sim.player.z, spd: g._gait?.speed ?? 0 }; });
await keys(['w'], []);
await page.waitForTimeout(12000);
const walk2 = await read();
const pos1 = await page.evaluate(() => ({ x: window.KhaaosReplay3D.game.sim.player.x, z: window.KhaaosReplay3D.game.sim.player.z, spd: window.KhaaosReplay3D.game._gait?.speed ?? 0 }));
await keys([], ['w']);

await page.close(); await browser.close();

// ---- auditoria em node ----
const all = [...idle.calls, ...walk.calls, ...run.calls];
const sides = walk.calls.map((c) => c.side).filter(Boolean);
let alt = 0;
for (let i = 1; i < sides.length; i++) if (sides[i] !== sides[i - 1]) alt++;
const dist = Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z);
const { strideLengthM } = await import('/home/z/my-project/Khaaos_Run/game-runtime/src/game3d/gait.js');
const strideTheo = strideLengthM(Math.max(.2, pos1.spd));
const stepsPerMeterObs = walk2.calls.length / Math.max(.5, dist);
const stepsPerMeterTheo = 2 / strideTheo;   // 2 strikes por ciclo de passada
const bots = all.filter((c) => c.distance > .5 && c.pan !== null);
const runCalls = run.calls;
const sprintCalls = runCalls.filter((c) => c.sprint && c.intensity > .55);
const idleCalls = idle.calls.length;
console.log('=== AUDITORIA ===');
console.log(`idle: ${idleCalls} passos parado (esperado 0)`);
console.log(`caminhada: ${walk.calls.length} passos | sides ${[...new Set(sides)].join('/')} | alternações ${alt}/${Math.max(0, sides.length - 1)}`);
console.log(`sprint: ${run.calls.length} passos, ${sprintCalls.length} com caráter de sprint (intensity>.55 && sprint=true)`);
console.log(`passos/metro: observado ${stepsPerMeterObs.toFixed(2)} × teórico ${stepsPerMeterTheo.toFixed(2)} (distância ${dist.toFixed(1)} m, stride ${strideTheo.toFixed(2)} m) — ${Math.abs(stepsPerMeterObs / stepsPerMeterTheo - 1) < .3 ? 'INVARIANTE OK' : 'FORA'}`);
const nearStrike = Math.abs(stepsPerMeterObs / stepsPerMeterTheo - 1) < .3 ? 1 : 0;
console.log(`bots espacializados: ${bots.length} passos com distance>0.5 e pan`);
console.log(`pageerrors: ${pageErrors.length}`);
console.log(pageErrors.slice(0, 3).join('\n'));
writeFileSync(join(outdir, 'audit.json'), JSON.stringify({ idle: idleCalls, walk: walk.length, run: run.length, alt, nearStrike, total: walk2.calls.length, bots: bots.length, errors: pageErrors.length }, null, 2));
console.log('audit.json salvo em', outdir);
