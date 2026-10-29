const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1.5 });
  const errors = [], results = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && /Shader|WebGL|THREE/.test(m.text())) errors.push(m.text()); });
  for (const scenario of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    await page.goto(`http://localhost:5173/?q=medium&look=competitive&scenario=${scenario}#GRAPHICS-2026`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.KhaaosReplay3D?.game?.scene, { timeout: 60000 });
    const result = await page.evaluate(() => {
      const g = window.KhaaosReplay3D.game;
      g.gfx.tier = 'medium'; g.gfx.drs = false; g.applyTierRuntime('medium');
      if (g.visualProfile !== 'competitive' || !g.post?.aa || g.post.ssr || g.post.bloom) throw Error('Plano competitivo incorreto');
      const initial = g.post.composer.renderTarget1.width;
      g.drsScale = .55; g.applyRenderScale();
      const expected = Math.floor(innerWidth * g.renderer.getPixelRatio());
      const actual = Math.floor(g.post.composer.renderTarget1.width);
      if (actual !== expected || actual >= initial) throw Error(`DRS ${actual} != ${expected}`);
      g.post.render(0);
      return { scenario: g.scenario.id, initial, actual, expected, passes: g.post.composer.passes.length, fxaa: !!g.post.aa, ssr: !!g.post.ssr, bloom: !!g.post.bloom };
    });
    results.push(result);
  }
  const lifecycle = await page.evaluate(() => {
    const g = window.KhaaosReplay3D.game, old = g.post;
    let disposed = 0;
    for (const p of old.composer.passes) {
      const fn = p.dispose?.bind(p);
      p.dispose = () => { disposed++; fn?.(); };
    }
    g.rebuildPost(); old.dispose();
    if (disposed !== 4) throw Error(`Descarte não idempotente: ${disposed}`);
    g.visualProfile = 'cinematic'; g.applyTierRuntime('high');
    if (!g.post?.ssr || !g.post.bloom) throw Error('Cinemático high sem SSR/bloom');
    g.post.render(0);
    const ssr = { width: g.post.ssr.width, height: g.post.ssr.height };
    g.visualProfile = 'competitive'; g.applyTierRuntime('low');
    if (g.post !== null) throw Error('Low criou composer');
    g.renderer.render(g.scene, g.camera);
    return { disposed, ssr, lowDirect: true };
  });
  await page.setViewportSize({ width: 800, height: 600 });
  const resized = await page.evaluate(() => {
    const g = window.KhaaosReplay3D.game;
    g.applyTierRuntime('medium');
    const w = g.post.composer.renderTarget1.width;
    if (w !== Math.floor(innerWidth * g.renderer.getPixelRatio())) throw Error('Resize incorreto');
    g.camera.position.set(105, 90, 155); g.camera.lookAt(0, 0, 0); g.post.render(0);
    return { width: w, height: g.post.composer.renderTarget1.height };
  });
  await page.screenshot({ path: '/home/user/runtime-competitive.png' });
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 412, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  mobile.on('pageerror', e => errors.push(String(e)));
  await mobile.goto('http://localhost:5173/?q=medium&scenario=CIGKV#GRAPHICS-MOBILE', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mobile.waitForFunction(() => window.KhaaosReplay3D?.game?.scene, { timeout: 60000 });
  const touch = await mobile.evaluate(() => {
    const g = window.KhaaosReplay3D.game;
    if (g.visualProfile !== 'competitive' || g.basePixelRatio !== 1.25 || g.post?.ssr || g.post?.bloom) throw Error('Touch sem perfil competitivo');
    return { profile: g.visualProfile, basePixelRatio: g.basePixelRatio, coarsePointer: matchMedia('(pointer: coarse)').matches };
  });
  fs.writeFileSync('/home/user/browser-results-new.json', JSON.stringify({ environment: 'Chromium headless / SwiftShader; emulação touch; não mede GPU mobile', results, lifecycle, resized, touch, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
