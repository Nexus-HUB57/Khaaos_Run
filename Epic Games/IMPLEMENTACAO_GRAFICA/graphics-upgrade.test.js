import test from 'node:test';
import assert from 'node:assert/strict';
import { postBufferSize, syncPostResolution, disposePostResources } from '../src/game3d/renderpipeline3d.js';
import { terrainTint, terrainHeightAt } from '../src/game3d/terrain3d.js';

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
test('macrovariação: cinco mundos, determinismo e componentes limitados', () => {
  for (const id of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const samples = [];
    for (let x = -180; x <= 180; x += 20) {
      const c = terrainTint(0, x, 17, id);
      assert.deepEqual(c, terrainTint(0, x, 17, id));
      assert.ok(c.every(v => Number.isFinite(v) && v >= 0 && v <= 1.15));
      assert.equal(terrainHeightAt(x, 17, id), 0);
      samples.push(c[0]);
    }
    assert.ok(Math.max(...samples) - Math.min(...samples) > .04);
  }
});
