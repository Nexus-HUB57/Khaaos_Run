import test from 'node:test';
import assert from 'node:assert/strict';
import { postBufferSize, syncPostResolution, disposePostResources } from '../src/game3d/renderpipeline3d.js';
import { resolveVisualProfile, renderPixelRatio, visualPostPlan } from '../src/game3d/visualprofile3d.js';

test('buffers: DPR nativo, DRS fracionário e SSR proporcional', () => {
  const a = postBufferSize(1280, 720, 1.5);
  assert.equal(a.physicalWidth, 1920);
  assert.equal(a.ssrWidth, 1382);
  const b = postBufferSize(1280, 720, .825);
  assert.equal(b.physicalWidth, 1056);
  assert.ok(b.ssrWidth < a.ssrWidth);
  assert.deepEqual(postBufferSize(0, NaN, Infinity), {
    width: 1, height: 1, pixelRatio: 1, physicalWidth: 1, physicalHeight: 1, ssrWidth: 1, ssrHeight: 1,
  });
});
test('DRS sincroniza composer, SSR e inverso da resolução FXAA', () => {
  let ratio = 1.75;
  const calls = [];
  const composer = { getPixelRatio: () => ratio,
    setPixelRatio: (v) => { ratio = v; calls.push(['ratio', v]); },
    setSize: (w, h) => calls.push(['size', w, h]) };
  const ssr = { setSize: (w, h) => calls.push(['ssr', w, h]) };
  const aa = { uniforms: { resolution: { value: { set: (x, y) => calls.push(['aa', x, y]) } } } };
  const state = syncPostResolution({ renderer: { getPixelRatio: () => .75 }, composer, ssr, aa }, 800, 600);
  assert.deepEqual(calls, [['ratio', .75], ['size', 800, 600], ['ssr', 432, 324], ['aa', 1/600, 1/450]]);
  assert.equal(state.physicalWidth, 600);
});
test('resolução não realoca DPR se inalterado; passes opcionais', () => {
  let allocations = 0;
  const pipeline = { renderer: { getPixelRatio: () => 1 }, composer: {
    setPixelRatio: () => { allocations++; }, setSize() {},
  } };
  syncPostResolution(pipeline, 640, 360);
  syncPostResolution(pipeline, 800, 600);
  assert.equal(allocations, 1);
});
test('descarte libera cada passe e composer mesmo com erro intermediário', () => {
  const calls = [];
  const p = { dispose: () => calls.push('pass') };
  disposePostResources({ dispose: () => calls.push('composer') }, [p, p, { dispose() { throw Error('driver'); } }]);
  assert.deepEqual(calls, ['pass', 'composer']);
});
test('resize idêntico não realoca buffers; DPR novo sincroniza passes', () => {
  let ratio = 1, allocations = 0, updates = 0;
  const pipeline = { renderer: { getPixelRatio: () => ratio }, composer: {
    setPixelRatio() { allocations++; }, setSize() { allocations++; }
  }, ssr: { setSize() { updates++; } } };
  syncPostResolution(pipeline, 800, 600);
  const before = allocations;
  syncPostResolution(pipeline, 800, 600);
  assert.equal(allocations, before);
  ratio = .75;
  syncPostResolution(pipeline, 800, 600);
  assert.equal(allocations, before + 1);
  assert.equal(updates, 2);
});
test('perfil touch, override e entrada desconhecida têm fallback previsível', () => {
  assert.equal(resolveVisualProfile({ isTouch: true }), 'competitive');
  assert.equal(resolveVisualProfile(), 'cinematic');
  assert.equal(resolveVisualProfile({ query: ' CINEMATIC ', isTouch: true }), 'cinematic');
  assert.equal(resolveVisualProfile({ query: 'inválido', isTouch: true }), 'competitive');
});
test('perfil competitivo limita DPR sem mudar tiers nem aceitar NaN', () => {
  assert.equal(renderPixelRatio('high', 3, 'competitive'), 1.25);
  assert.equal(renderPixelRatio('low', 3, 'competitive'), 1.2);
  assert.equal(renderPixelRatio('high', 3, 'cinematic'), 1.75);
  assert.equal(renderPixelRatio('high', NaN, 'competitive'), 1);
  assert.equal(renderPixelRatio('high', .8, 'competitive'), .8);
});
test('competitivo não cria SSR/bloom/grão/vinheta; low mantém render direto', () => {
  for (const tier of ['medium', 'high']) {
    const p = visualPostPlan(tier, 'competitive');
    assert.equal(p.ssr, false);
    assert.equal(p.bloomStrength, 0);
    assert.equal(p.grain, 0);
    assert.equal(p.vignette, 0);
    assert.equal(p.tint, 0);
  }
  assert.equal(visualPostPlan('low', 'competitive'), null);
  assert.equal(visualPostPlan('high').ssr, true);
  assert.equal(visualPostPlan('medium').ssr, false);
});
