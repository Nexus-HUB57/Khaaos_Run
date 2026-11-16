// Sonda de perfil — Task 70: linha de base REAL do jogo (sem inventar custos).
// Mede no navegador real: frame-time (rAF), draw calls/triângulos/geometrias/
// texturas/programas (renderer.info), heap JS, cena (meshes/luzes/com sombra)
// e uso de CPU por frame — em 3 regimes: parado, caminhada, sprint.
// Uso: node scripts/e2e_profile_t70.mjs [url] [outdir]
import { chromium } from '/home/z/my-project/Khaaos_Run/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5199/?avatar=rigged-avatar-m-01';
const outdir = process.argv[3] ?? '/tmp/perf-t70';
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

// instrumento: amostrador de frame contínuo (rAF timestamps + renderer.info)
await page.evaluate(() => {
  const g = window.KhaaosReplay3D.game;
  const S = { frames: [], lastT: performance.now() };
  window.__perf = S;
  const tick = (t) => {
    const dt = t - S.lastT; S.lastT = t;
    const info = g.renderer?.info;
    const mem = performance.memory;
    S.frames.push({
      dt: +dt.toFixed(1),
      calls: info?.render?.calls ?? -1,
      tris: info?.render?.triangles ?? -1,
      geo: info?.memory?.geometries ?? -1,
      tex: info?.memory?.textures ?? -1,
      progs: info?.programs?.length ?? -1,
      heap: mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1,
    });
    if (S.frames.length < 12000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // cena: contagem de meshes/luzes (uma vez)
  let meshes = 0, lights = 0, shadowLights = 0;
  g.scene?.traverse?.((o) => {
    if (o.isMesh) meshes++;
    if (o.isLight) { lights++; if (o.castShadow) shadowLights++; }
  });
  S.scene = { meshes, lights, shadowLights };
});

const keys = (add, del) => page.evaluate(([add, del]) => {
  const g = window.KhaaosReplay3D.game;
  for (const k of add) g.keys.add(k);
  for (const k of del) g.keys.delete(k);
}, [add, del]);

const mark = (label) => page.evaluate((l) => { window.__perf.frames.push({ dt: 0, label: l, calls: -1, tris: -1, geo: -1, tex: -1, progs: -1, heap: -1 }); }, label);

console.log('=== REGIME 1: PARADO (8 s) ===');
await mark('idle-start'); await page.waitForTimeout(8000); await mark('idle-end');

console.log('=== REGIME 2: CAMINHADA (8 s) ===');
await keys(['w'], []); await mark('walk-start'); await page.waitForTimeout(8000); await mark('walk-end');

console.log('=== REGIME 3: SPRINT (6 s) ===');
await keys(['shift'], []); await mark('sprint-start'); await page.waitForTimeout(6000); await mark('sprint-end');
await keys([], ['w', 'shift']);

const data = await page.evaluate(() => ({ frames: window.__perf.frames, scene: window.__perf.scene, bundle: [...document.scripts].map((s) => s.src).filter((s) => s.includes('main-'))[0] }));
await page.close(); await browser.close();

// ---- análise em node ----
const seg = (a, b) => {
  const f = data.frames.slice(data.frames.findIndex((x) => x.label === a) + 1, data.frames.findIndex((x) => x.label === b));
  const dts = f.map((x) => x.dt).filter((x) => x > 0 && x < 2000).sort((x, y) => x - y);
  const q = (p) => dts[Math.min(dts.length - 1, Math.floor(p * dts.length))] ?? -1;
  const avg = (k) => f.reduce((s, x) => s + (x[k] > 0 ? x[k] : 0), 0) / Math.max(1, f.filter((x) => x[k] > 0).length);
  return { n: dts.length, med: q(.5), p95: q(.95), fps: dts.length && +(1000 / (dts.reduce((s, x) => s + x, 0) / dts.length)).toFixed(1), calls: Math.round(avg('calls')), tris: Math.round(avg('tris')), heap: Math.round(avg('heap')) };
};
const idle = seg('idle-start', 'idle-end'), walk = seg('walk-start', 'walk-end'), run = seg('sprint-start', 'sprint-end');
const steady = data.frames.filter((x) => x.geo > 0);
const lastGeo = steady.at(-1);
console.log('=== PERFIL (headless swiftshader — métricas relativas) ===');
console.log(`cena: ${data.scene.meshes} meshes, ${data.scene.lights} luzes (${data.scene.shadowLights} com sombra)`);
console.log(`geometrias: ${lastGeo?.geo} | texturas: ${lastGeo?.tex} | programas: ${lastGeo?.progs} | heap: ${steady.at(-1)?.heap} MB`);
for (const [k, v] of [['PARADO', idle], ['CAMINHADA', walk], ['SPRINT', run]]) {
  console.log(`${k}: n=${v.n} fps=${v.fps} frameMed=${v.med}ms p95=${v.p95}ms | calls=${v.calls} tris=${v.tris} heap=${v.heap}MB`);
}
console.log(`bundle: ${data.bundle}`);
console.log(`pageerrors: ${pageErrors.length}`);
writeFileSync(join(outdir, 'perfil.json'), JSON.stringify({ idle, walk, run, scene: data.scene, geo: lastGeo, bundle: data.bundle, errors: pageErrors.length }, null, 2));
console.log('perfil.json salvo em', outdir);
