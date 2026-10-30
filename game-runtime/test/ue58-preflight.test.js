import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject } from '../../scripts/build/ue58_preflight.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UE_PROJECT = path.join(REPO_ROOT, 'Unreal', 'KhaaosRun');

test('ue58 preflight: projeto real valida sem engine — associação 5.8, 3 targets, includes resolvem', () => {
  const result = validateProject(UE_PROJECT);
  assert.equal(result.ok, true, `erros de preflight: ${JSON.stringify(result.findings.filter((f) => f.severity === 'error'), null, 2)}`);
  assert.equal(result.summary.engineAssociation, '5.8');
  assert.deepEqual(result.summary.targets.sort(), ['KhaaosRun', 'KhaaosRunEditor', 'KhaaosRunServer']);
  assert.ok(result.summary.headers > 100, `headers analisados: ${result.summary.headers}`);
  assert.ok(result.summary.includesChecked > 1000, `includes verificados: ${result.summary.includesChecked}`);
  // Mundo ainda não importado: warnings de mapa/ini são o estado honesto do projeto.
  assert.ok(result.findings.every((finding) => finding.severity === 'warning'));
});

test('ue58 preflight: flags estrutura quebrada — uproject inválido e include órfão', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-ue58-'));
  try {
    // Caso 1: uproject sem associação 5.8 → erro fatal.
    const brokenRoot = path.join(dir, 'broken');
    fs.mkdirSync(path.join(brokenRoot, 'Source'), { recursive: true });
    fs.writeFileSync(path.join(brokenRoot, 'KhaaosRun.uproject'), JSON.stringify({ EngineAssociation: '5.3', Modules: [] }));
    const broken = validateProject(brokenRoot);
    assert.equal(broken.ok, false);
    assert.ok(broken.findings.some((finding) => finding.code === 'UE1002'));

    // Caso 2: include de projeto com typo em namespace conhecido → UE1021;
    // include engine ("Engine/Engine.h") não deve virar falso positivo.
    const typoRoot = path.join(dir, 'typo');
    const moduleDir = path.join(typoRoot, 'Source', 'KhaaosRun');
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(typoRoot, 'KhaaosRun.uproject'), JSON.stringify({
      EngineAssociation: '5.8',
      Modules: [{ Name: 'KhaaosRun', Type: 'Runtime', LoadingPhase: 'Default' }],
    }));
    fs.writeFileSync(path.join(moduleDir, 'KhaaosRun.Build.cs'), 'public class KhaaosRun : ModuleRules { }');
    fs.writeFileSync(path.join(moduleDir, 'KhaaosRun.h'), '#pragma once\n#include "Game/Fooo.h" // typo\n#include "Engine/Engine.h"\n');
    fs.writeFileSync(path.join(typoRoot, 'Source', 'KhaaosRun.Target.cs'), 'public class KhaaosRunTarget : TargetRules { }');
    fs.mkdirSync(path.join(moduleDir, 'Game'), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'Game', 'Real.h'), '#pragma once\n');
    const typo = validateProject(typoRoot);
    assert.ok(typo.findings.some((finding) => finding.code === 'UE1021' && finding.message.includes('Game/Fooo.h')), JSON.stringify(typo.findings));
    assert.ok(!typo.findings.some((finding) => finding.message.includes('Engine/Engine.h')), 'include engine não é falso positivo');

    // Caso 3: include gerado sem header dono → UE1020 (dono é o basename do
    // include gerado; "Ghost.generated.h" exige "Ghost.h" existente).
    fs.writeFileSync(path.join(moduleDir, 'Other.h'), '#pragma once\n#include "Ghost.generated.h"\n');
    const orphan = validateProject(typoRoot);
    assert.ok(orphan.findings.some((finding) => finding.code === 'UE1020' && finding.message.includes('Ghost.h')), JSON.stringify(orphan.findings));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
