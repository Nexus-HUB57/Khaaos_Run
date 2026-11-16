import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const THREE = require('three');
const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: node --expose-gc bench-zu-render.mjs <trainRide3d.js>');
const { TrainRide } = await import(pathToFileURL(modulePath));

const route = { x0: -120, z0: 48, x1: 30, z1: 118 };
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
const ride = new TrainRide({ scene, route });
const warmup = 20_000;
const iterations = 250_000;

for (let i = 0; i < warmup; i++) {
  ride.done = false;
  ride.elapsedMs = i % 16_900;
  ride.update(1 / 60);
  ride.cameraPose(camera);
}
if (global.gc) global.gc();

const started = performance.now();
for (let i = 0; i < iterations; i++) {
  ride.done = false;
  ride.elapsedMs = i % 16_900;
  ride.update(1 / 60);
  ride.cameraPose(camera);
}
const elapsedMs = performance.now() - started;
const frameMs = elapsedMs / iterations;
console.log(JSON.stringify({
  modulePath,
  iterations,
  elapsedMs,
  frameMs,
  equivalentFps: 1000 / frameMs,
}));
ride.dispose();
