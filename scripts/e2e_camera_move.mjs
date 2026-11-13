// Sonda E2E — câmera × movimento do avatar:
// injeta WASD real via game.input e mede por amostragem:
//   dist(câmera→olho), sprinting, gait.speed, pos do corpo (mundo) vs sim,
//   rotação do pivô (lean), e deslize dos pés (delta tornozelo vs delta corpo).
// Uso: node scripts/e2e_camera_move.mjs [url] [outdir]
import { chromium } from '/home/z/my-project/Khaaos_Run/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5199/?avatar=rigged-avatar-m-01';
const outdir = process.argv[3] ?? '/tmp/cam-e2e';
mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);
await page.locator('#beltBtn').click();
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const g = window.KhaaosReplay3D.game;
  g.trainRide?.end?.('arrived');
  if (g.sim?.player) g.sim.player.trainOnboard = false;
});
await page.waitForTimeout(2000);

const sample = () => page.evaluate(() => {
  const g = window.KhaaosReplay3D.game;
  const p = g.sim.player;
  const cam = g.camera;
  const root = g.humanoidPlayer?.root;
  const w = root ? root.matrixWorld.elements : null;
  const wp = w ? { x: w[12], y: w[13], z: w[14] } : null;
  const fm = g.humanoidPlayer?.bones?.leftfoot?.matrixWorld?.elements ?? null;
  const foot = fm ? { x: fm[12], y: fm[13], z: fm[14] } : null;
  const eye = { x: p.x, y: p.y + 1.62, z: p.z };
  const dx = cam.position.x - eye.x, dy = cam.position.y - eye.y, dz = cam.position.z - eye.z;
  return {
    sim: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2) },
    moving: !!p.moving, sprinting: !!p.sprinting, speed: +(p.speed ?? 0).toFixed(2),
    gaitSpeed: +(g._gait?.speed ?? 0).toFixed(2), phase: +(g._gait?.phase ?? 0).toFixed(2),
    cam: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) },
    distCamEye: +Math.hypot(dx, dy, dz).toFixed(2),
    body: wp ? { x: +wp.x.toFixed(2), y: +wp.y.toFixed(2), z: +wp.z.toFixed(2) } : null,
    bodyRootRot: root ? { x: +root.rotation.x.toFixed(3), y: +root.rotation.y.toFixed(3), z: +root.rotation.z.toFixed(3) } : null,
    footL: foot ? { x: +foot.x.toFixed(2), y: +foot.y.toFixed(2), z: +foot.z.toFixed(2) } : null,
    viewMode: g.viewMode, curDist: +(g.camRig?.curDist ?? 0).toFixed(2),
  };
});

console.log('=== BASELINE (parado) ===');
const base = await sample();
console.log(JSON.stringify(base));

// fase 1: andar para FRENTE (dy=-1) — medição contínua
console.log('=== MOVENDO PARA FRENTE (dy=-1, 3 s) ===');
await page.evaluate(() => { const g = window.KhaaosReplay3D.game; g.keys.add('w'); });
const walkSamples = [];
for (let i = 0; i < 7; i++) {
  await page.waitForTimeout(450);
  const s = await sample();
  walkSamples.push(s);
  console.log(`t+${((i + 1) * 0.45).toFixed(2)}s`, JSON.stringify(s));
}
await page.screenshot({ path: join(outdir, '10-walking.png') });

// fase 2: soltar e parar
await page.evaluate(() => { const g = window.KhaaosReplay3D.game; g.keys.delete('w'); });
await page.waitForTimeout(800);
console.log('=== PAROU ===', JSON.stringify(await sample()));

// fase 3: sprint (Shift+W)
console.log('=== SPRINT (dy=-1, sprint=true, 2 s) ===');
await page.evaluate(() => { const g = window.KhaaosReplay3D.game; g.keys.add('w'); g.keys.add('shift'); });
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(450);
  console.log(`t+${((i + 1) * 0.45).toFixed(2)}s`, JSON.stringify(await sample()));
}
await page.screenshot({ path: join(outdir, '11-sprint.png') });
await page.evaluate(() => { const g = window.KhaaosReplay3D.game; g.keys.delete('w'); g.keys.delete('shift'); });

// métricas derivadas
const w0 = walkSamples[0], wN = walkSamples[walkSamples.length - 1];
if (w0?.body && wN?.body && w0?.sim && wN?.sim) {
  const bodyDelta = Math.hypot(wN.body.x - w0.body.x, wN.body.z - w0.body.z);
  const simDelta = Math.hypot(wN.sim.x - w0.sim.x, wN.sim.z - w0.sim.z);
  const footDelta = w0.footL && wN.footL ? Math.hypot(wN.footL.x - w0.footL.x, wN.footL.z - w0.footL.z) : null;
  console.log('=== MÉTRICAS ===');
  console.log(`deslocamento sim: ${simDelta.toFixed(2)} m | corpo: ${bodyDelta.toFixed(2)} m | erro corpo↔sim: ${Math.abs(bodyDelta - simDelta).toFixed(2)} m`);
  if (footDelta !== null) console.log(`tornozelo L moveu: ${footDelta.toFixed(2)} m (corpo ${bodyDelta.toFixed(2)} m → deslize pés: ${(bodyDelta > .3 ? (1 - footDelta / bodyDelta) * 100 : 0).toFixed(0)}%)`);
  console.log(`dist câmera: base ${base.distCamEye} → andando ${wN.distCamEye} | curDist ${base.curDist} → ${wN.curDist}`);
}

await browser.close();
console.log('OK — evidências em', outdir);
