#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.join(repoRoot, 'Unreal/KhaaosRun');
const profilePath = path.join(projectRoot, 'Config/DefaultDeviceProfiles.ini');
const lines = fs.readFileSync(profilePath, 'utf8').split(/\r?\n/);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}
function section(name) {
  const header = `[${name} DeviceProfile]`;
  const start = lines.indexOf(header);
  if (start < 0) {
    fail(`missing section ${header}`);
    return [];
  }
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end += 1;
  return lines.slice(start + 1, end);
}
function cvarValue(block, cvar) {
  const prefix = `+CVars=${cvar}=`;
  const match = block.find((line) => line.startsWith(prefix));
  if (match) return Number(match.slice(prefix.length).trim());
  for (const line of block) {
    const bucket = line.match(/^\+CVars_[A-Za-z]+=([^=]+)=([0-9.]+)\s*$/);
    if (bucket?.[1] === cvar) return Number(bucket[2]);
  }
  return null;
}
function requireValue(block, label, cvar, expected) {
  const value = cvarValue(block, cvar);
  if (value !== expected) fail(`${label}: expected ${cvar}=${expected}, got ${value}`);
}

const profileExpectations = [
  ['KhaaosAndroidBalanced', 0.8],
  ['KhaaosAndroidLowGPU', 0.65],
  ['KhaaosIOSBalanced', 0.8],
  ['KhaaosIOSLowGPU', 0.65],
];
for (const [name, expectedLodScale] of profileExpectations) {
  const block = section(name);
  requireValue(block, name, 'foliage.LODDistanceScale', expectedLodScale);
  requireValue(block, name, 'sg.FoliageQuality', 1);
  for (const densityCvar of ['foliage.DensityScale', 'grass.DensityScale', 'grass.CullDistanceScale']) {
    if (block.some((line) => line.startsWith(`+CVars=${densityCvar}=`))) {
      fail(`${name}: unexpected global gameplay foliage density/cull override ${densityCvar}`);
    }
  }
}

for (const [platform, bucket, expected] of [
  ['Android', 'Default', 0.9], ['Android', 'Smaller', 0.75], ['Android', 'Smallest', 0.65],
  ['IOS', 'Default', 0.9], ['IOS', 'Smaller', 0.75], ['IOS', 'Smallest', 0.65],
]) {
  const key = `+CVars_${bucket}=foliage.LODDistanceScale=${expected}`;
  if (!section(platform).includes(key)) fail(`${platform} profile missing ${key}`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const projectFiles = walk(path.join(projectRoot, 'Content'));
const nativeAssets = projectFiles.filter((file) => /\.(uasset|umap)$/i.test(file));
const foliageSources = projectFiles.filter((file) => /\.(fbx|obj|gltf|glb)$/i.test(file) && /(foliage|vegetation|leaf|leaves|tree|grass|bush)/i.test(path.basename(file)));

if (nativeAssets.length === 0) {
  console.warn('WARN: no .uasset/.umap files under project Content; asset-level LOD/material checks and cook cannot be validated here.');
}
if (foliageSources.length === 0) {
  console.warn('WARN: no source mesh named/tagged as foliage under project Content; no mesh/material asset could be optimized directly.');
}
if (process.exitCode) process.exit(process.exitCode);
console.log(`PASS: mobile foliage LOD profiles validated; native_assets=${nativeAssets.length}, foliage_source_meshes=${foliageSources.length}`);
