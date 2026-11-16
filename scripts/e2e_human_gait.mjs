// Sonda E2E — Task 68: camada humana de locomoção visível no jogo real.
// Vista LATERAL congelada do jogador: coletor in-page (setInterval) amostra
//   hipsYaw/spineYaw (contra-rotação), spinePitch (postura), hipsY (elevação)
// das matrixWorld; node lê em blocos curtos (Promise longa vira GC no PW).
// Uso: node scripts/e2e_human_gait.mjs [url] [outdir]
import { chromium } from '/home/z/my-project/Khaaos_Run/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5199/?avatar=rigged-avatar-m-01';
const outdir = process.argv[3] ?? '/tmp/gait-e2e';
mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

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

// câmera lateral congelada + coletor in-page instalado uma vez
await page.evaluate(() => {
  const g = window.KhaaosReplay3D.game;
  g.updateCamera = () => {};            // sonda visual: câmera manual
  window.__gait = { samples: [] };
  const eulerFromMat = (m) => {         // Euler YXZ de matrixWorld (blocos 3×3)
    const m31 = m[8];
    const y = Math.asin(Math.max(-1, Math.min(1, m31)));
    return y;
  };
  g.__gaitTimer = setInterval(() => {
    const p = g.sim.player;
    const H = g.humanoidPlayer;
    if (!H?.bones?.hips) return;
    const hm = H.bones.hips.matrixWorld.elements;
    const sm = H.bones.spine1.matrixWorld.elements;
    const hq = H.bones.hips.quaternion, sq = H.bones.spine1.quaternion;
    window.__gait.samples.push({
      ph: +((g._gait?.phase ?? 0) % (2 * Math.PI)).toFixed(2),
      moving: !!p.moving, sprinting: !!p.sprinting,
      wWalk: +(H.w?.walk ?? 0).toFixed(3), wRun: +(H.w?.run ?? 0).toFixed(3),
      hqx: +hq.x.toFixed(4), hqy: +hq.y.toFixed(4), hqz: +hq.z.toFixed(4), hqw: +hq.w.toFixed(4),
      sqx: +sq.x.toFixed(4), sqy: +sq.y.toFixed(4),
      hipsPosY: +(H.bones.hips.position.y ?? 0).toFixed(4),
      hipsYaw: +eulerFromMat(hm).toFixed(4),
      spineYaw: +eulerFromMat(sm).toFixed(4),
      spinePitch: +Math.atan2(-sm[9], sm[10]).toFixed(4),
      hipsY: +hm[13].toFixed(3),
    });
    const pp = g.sim.player;
    g.camera.position.set(pp.x + 2.9, pp.y + 1.35, pp.z + .3);
    g.camera.lookAt(pp.x, pp.y + 1.0, pp.z);
  }, 130);
});

const read = () => page.evaluate(() => {
  const out = window.__gait.samples.splice(0, window.__gait.samples.length);
  return out;
});
const keys = (add, del) => page.evaluate(([add, del]) => {
  const g = window.KhaaosReplay3D.game;
  for (const k of add) g.keys.add(k);
  for (const k of del) g.keys.delete(k);
}, [add, del]);

console.log('=== BASELINE PARADO (3 s) ===');
await page.waitForTimeout(3000);
const idle = await read();
console.log('amostras:', idle.length);

console.log('=== CAMINHADA (5 s, vista lateral) ===');
await keys(['w'], []);
await page.waitForTimeout(5000);
const walk = await read();
await page.screenshot({ path: join(outdir, '10-walk-side.png') });

console.log('=== SPRINT (4 s) ===');
await keys(['shift'], []);
await page.waitForTimeout(4000);
const run = await read();
await page.screenshot({ path: join(outdir, '11-run-side.png') });
await keys([], ['w', 'shift']);

await page.evaluate(() => clearInterval(window.KhaaosReplay3D.game.__gaitTimer));
await page.close(); await browser.close();

// ---- análise em node ----
const p2p = (arr, k) => { const v = arr.map((s) => s[k]); return Math.max(...v) - Math.min(...v); };
const walkMv = walk.filter((s) => s.moving);
const runMv = run.filter((s) => s.sprinting);
console.log('=== RAW (últimas 4 da caminhada) ===');
for (const s of walkMv.slice(-4)) console.log(JSON.stringify(s));
console.log('=== RAW (últimas 2 do sprint) ===');
for (const s of runMv.slice(-2)) console.log(JSON.stringify(s));
console.log('=== MÉTRICAS ===');
console.log(`caminhada: amostras ${walkMv.length} | hipsYaw p2p ${p2p(walkMv, 'hipsYaw').toFixed(3)} rad | spineYaw p2p ${p2p(walkMv, 'spineYaw').toFixed(3)} | hipsY p2p ${p2p(walkMv, 'hipsY').toFixed(3)} m`);
const qP2p = (arr, k) => Math.max(...arr.map((s) => s[k])) - Math.min(...arr.map((s) => s[k]));
console.log(`LOCAL quats caminhada: hqy p2p ${qP2p(walkMv, 'hqy').toFixed(4)} | hqz p2p ${qP2p(walkMv, 'hqz').toFixed(4)} | sqy p2p ${qP2p(walkMv, 'sqy').toFixed(4)} | hipsPosY p2p ${qP2p(walkMv, 'hipsPosY').toFixed(4)} m | wWalk máx ${Math.max(...walkMv.map((s) => s.wWalk)).toFixed(2)}`);
const pairs = walkMv.filter((s) => Math.abs(s.hipsYaw) > .008 && Math.abs(s.spineYaw) > .008);
const opp = pairs.filter((s) => s.hipsYaw * s.spineYaw < 0).length;
console.log(`contra-rotação: ${opp}/${pairs.length} amostras com sinais opostos (pelve↔ombros)`);
const mp = (arr, k) => arr.length ? arr.reduce((a, s) => a + s[k], 0) / arr.length : 0;
console.log(`postura: spinePitch médio andando ${mp(walkMv, 'spinePitch').toFixed(3)} → sprint ${mp(runMv, 'spinePitch').toFixed(3)}`);
console.log(`idle: hipsYaw p2p ${p2p(idle.filter((s) => !s.moving), 'hipsYaw').toFixed(4)} rad (deve ser ~0)`);
console.log(`sprint: amostras ${runMv.length} | hipsYaw p2p ${p2p(runMv, 'hipsYaw').toFixed(3)} | hipsY p2p ${p2p(runMv, 'hipsY').toFixed(3)}`);
