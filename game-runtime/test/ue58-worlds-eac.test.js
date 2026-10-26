// Khaaos Run — Testes da pipeline de mundos UE5.8 (Editor-Python) e da camada
// de build do EAC (KhaaosEAC com SDK condicional).
//
// Engine-less por design: valida contratos de estrutura (scripts, config,
// Build.cs, uproject, preflight) que não precisam do Editor/SDK — igual ao
// teste do preflight original.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject } from '../../scripts/build/ue58_preflight.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UE_PROJECT = path.join(REPO_ROOT, 'Unreal', 'KhaaosRun');

test('ue58 worlds: preflight segue verde com KhaaosEAC e pipeline de mundos — só warnings', () => {
  const result = validateProject(UE_PROJECT);
  assert.equal(result.ok, true, `erros: ${JSON.stringify(result.findings.filter((f) => f.severity === 'error'), null, 2)}`);
  assert.ok(result.summary.modules.includes('KhaaosEAC'), 'módulo KhaaosEAC registrado no .uproject');
  // Sem binários EAC nem .umap gerados: modo honesto — warnings, nunca erros.
  assert.ok(result.findings.every((finding) => finding.severity === 'warning'));
  assert.ok(result.findings.some((f) => f.code === 'UE1031'), '.umap pendente sinalizado (mundo não gerado ainda)');
  assert.ok(result.findings.some((f) => f.code === 'UE1040'), 'stub do EAC sinalizado (binários são ação humana)');
  // Pipeline presente → sem UE1042/UE1043 no projeto real.
  assert.ok(result.findings.every((f) => !['UE1042', 'UE1043'].includes(f.code)), 'pipeline de mundos provisionada');
});

test('ue58 worlds: config aponta GameDefaultMap/ServerDefaultMap para os mapas gerados', () => {
  const ini = fs.readFileSync(path.join(UE_PROJECT, 'Config', 'DefaultEngine.ini'), 'utf8');
  assert.match(ini, /\[\/Script\/EngineSettings\.GameMapsSettings\]/);
  assert.match(ini, /GameDefaultMap=\/Game\/Maps\/Menu_Khaaos\.Menu_Khaaos/);
  assert.match(ini, /ServerDefaultMap=\/Game\/Maps\/CIGKV_BR\.CIGKV_BR/);
});

test('ue58 worlds: generate_worlds.py cumpre o contrato (funções, marcador JSON, layout determinístico)', () => {
  const script = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'build', 'generate_worlds.py'), 'utf8');
  for (const fn of ['create_materials', 'build_menu_map', 'build_br_map', 'create_niagara', 'main']) {
    assert.ok(script.includes(`def ${fn}(`), `função ${fn} presente`);
  }
  assert.ok(script.includes('KHR_WORLDGEN_RESULT_JSON:'), 'marcador do contrato de saída');
  assert.ok(script.includes('Game/Maps/Menu_Khaaos') && script.includes('Game/Maps/CIGKV_BR'), 'mapas do ini e do script em sintonia');
  assert.ok(script.includes('NIAGARA_PLACEHOLDERS'), 'placeholders Niagara declarados');
  assert.ok(script.includes('unreal.NiagaraSystemFactoryNew'), 'criação de Niagara por factory');
  // Runner com modo engine-less e extração do JSON.
  const runner = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'build', 'build_worlds.sh'), 'utf8');
  assert.ok(runner.includes('--check'), 'modo --check');
  assert.ok(runner.includes('-run=pythonscript'), 'commandlet pythonscript');
  assert.ok(runner.includes('editor_unavailable'), 'sem editor → status honesto, não falha');
});

test('ue58 worlds/eac: módulo KhaaosEAC compila em stub e nunca quebra o build', () => {
  const buildCs = fs.readFileSync(path.join(UE_PROJECT, 'Source', 'KhaaosEAC', 'KhaaosEAC.Build.cs'), 'utf8');
  assert.ok(buildCs.includes('KHAAOS_EAC_SDK_DIR'), 'detecção via env');
  assert.ok(buildCs.includes('KHAAOS_EAC_SDK=0'), 'stub define');
  assert.ok(buildCs.includes('KHAAOS_EAC_SDK=1'), 'define com SDK presente');
  assert.ok(buildCs.includes('sdkdefines.h'), 'sonda canônica do SDK');
  const header = fs.readFileSync(path.join(UE_PROJECT, 'Source', 'KhaaosEAC', 'KhaaosEAC.h'), 'utf8');
  assert.ok(header.includes('IsSDKAvailable') && header.includes('SdkStatus'), 'facade de status');
  const uproject = JSON.parse(fs.readFileSync(path.join(UE_PROJECT, 'KhaaosRun.uproject'), 'utf8'));
  const eac = uproject.Modules.find((module) => module.Name === 'KhaaosEAC');
  assert.equal(eac.Type, 'Runtime');
  // KhaaosRun declara dependência — uso futuro na integração de jogo.
  const runBuildCs = fs.readFileSync(path.join(UE_PROJECT, 'Source', 'KhaaosRun', 'KhaaosRun.Build.cs'), 'utf8');
  assert.ok(runBuildCs.includes('"KhaaosEAC"'), 'KhaaosRun depende do módulo EAC');
});

test('ue58 worlds/eac: contrato enforced — KhaaosEAC sem detecção condicional é erro fatal (UE1041)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-eac-'));
  try {
    const brokenRoot = path.join(dir, 'broken');
    const moduleDir = path.join(brokenRoot, 'Source', 'KhaaosEAC');
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(brokenRoot, 'KhaaosRun.uproject'), JSON.stringify({
      EngineAssociation: '5.8',
      Modules: [{ Name: 'KhaaosEAC', Type: 'Runtime', LoadingPhase: 'Default' }],
    }));
    // Build.cs SEM detecção condicional — quebra o contrato de degradação.
    fs.writeFileSync(path.join(moduleDir, 'KhaaosEAC.Build.cs'), 'public class KhaaosEAC : ModuleRules { public KhaaosEAC(ReadOnlyTargetRules Target) : base(Target) { } }');
    const result = validateProject(brokenRoot);
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'UE1041'), `findings: ${JSON.stringify(result.findings)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
