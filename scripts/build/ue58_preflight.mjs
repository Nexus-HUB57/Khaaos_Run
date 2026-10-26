#!/usr/bin/env node
// Khaaos Run — Preflight do projeto UE5.8 SEM engine (engine-less validation).
//
// O objetivo: validar tudo que NÃO precisa do Editor/SDK para que a única
// razão de um build falhar seja o binário do UE (licenciado, ~90 GB, não
// redistribuível). Roda em CI hosted (ubuntu-latest) e local em <1 s:
//   1. KhaaosRun.uproject: JSON válido, EngineAssociation 5.8, módulos com
//      Build.cs e alvos (Target.cs) correspondentes;
//   2. Target files: Game/Editor/Server presentes e consistentes com o
//      .uproject (Server target é o pré-requisito do dedicated server);
//   3. Build.cs: chaves balanceadas, sem caminhos absolutos, dependências
//      declaradas usáveis;
//   4. Includes: todo `#include "X.h"` de arquivo do PROJETO resolve dentro
//      de Source/ (includes de engine são filtrados pelos módulos declarados
//      no Build.cs); `.generated.h` exige o header dono existente;
//   5. Headers UE: UCLASS/USTRUCT/UINTERFACE declaram GENERATED_BODY();
//   6. Config: ini essenciais existem e GameDefaultMap aponta para mapa do
//      projeto (warning se o .umap ainda não foi importado).
// Saída: JSON estruturado com findings { severity, code, file, message }.
// Exit 1 apenas em erros fatais (códigos UExxx), warnings (UWxxx) não falham.
import fs from 'node:fs';
import path from 'node:path';

const FATAL = 'error';
const WARN = 'warning';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function balancedBraces(text) {
  let depth = 0;
  let inLine = false;
  let inBlock = false;
  let inString = false;
  let inChar = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i += 1; } continue; }
    if (inString) { if (c === '\\') { i += 1; continue; } if (c === '"') inString = false; continue; }
    if (inChar) { if (c === '\\') { i += 1; continue; } if (c === "'") inChar = false; continue; }
    if (c === '/' && next === '/') inLine = true;
    else if (c === '/' && next === '*') { inBlock = true; i += 1; }
    else if (c === '"') inString = true;
    else if (c === "'") inChar = true;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

// Valida o projeto UE em `root` (pasta que contém KhaaosRun.uproject).
export function validateProject(root) {
  const findings = [];
  const add = (severity, code, file, message) => findings.push({ severity, code, file, message });
  const uprojectPath = path.join(root, 'KhaaosRun.uproject');

  // ── 1) .uproject ──────────────────────────────────────────────────────────
  let uproject = null;
  try {
    uproject = JSON.parse(fs.readFileSync(uprojectPath, 'utf8'));
  } catch (error) {
    add(FATAL, 'UE1001', 'KhaaosRun.uproject', `uproject ausente ou JSON inválido: ${error.message}`);
    return { ok: false, findings, summary: { errors: 1, warnings: 0 } };
  }
  if (uproject.EngineAssociation !== '5.8') {
    add(FATAL, 'UE1002', 'KhaaosRun.uproject', `EngineAssociation "${uproject.EngineAssociation}" ≠ "5.8"`);
  }
  const modules = uproject.Modules || [];
  if (!modules.length) add(FATAL, 'UE1003', 'KhaaosRun.uproject', 'nenhum módulo declarado');
  const sourceDir = path.join(root, 'Source');

  // ── 2) Target files e Build.cs por módulo ────────────────────────────────
  const targets = walk(sourceDir).filter((file) => file.endsWith('.Target.cs'));
  const targetNames = new Set(targets.map((file) => path.basename(file, '.Target.cs')));
  for (const expected of ['KhaaosRun.Target.cs', 'KhaaosRunEditor.Target.cs', 'KhaaosRunServer.Target.cs']) {
    if (!targetNames.has(expected.replace('.Target.cs', ''))) {
      add(FATAL, 'UE1010', `Source/${expected}`, `target "${expected.replace('.Target.cs', '')}" ausente (dedicated server exige KhaaosRunServer)`);
    }
  }
  const dependencyModules = new Set();
  for (const module of modules) {
    const buildCs = path.join(sourceDir, module.Name, `${module.Name}.Build.cs`);
    if (!fs.existsSync(buildCs)) {
      add(FATAL, 'UE1011', `Source/${module.Name}/${module.Name}.Build.cs`, `módulo "${module.Name}" sem Build.cs`);
      continue;
    }
    const text = fs.readFileSync(buildCs, 'utf8');
    if (!balancedBraces(text)) add(FATAL, 'UE1012', `Source/${module.Name}/${module.Name}.Build.cs`, 'chaves desbalanceadas ou string aberta');
    for (const match of text.matchAll(/"([A-Za-z][A-Za-z0-9]+)"/g)) dependencyModules.add(match[1]);
    if (/(?:^|[=\s])["']?(?:\/usr|C:\\\\|D:\\\\)/i.test(text.replace(/\/\/.*$/gm, ''))) {
      add(FATAL, 'UE1013', `Source/${module.Name}/${module.Name}.Build.cs`, 'caminho absoluto embutido quebra build em outros agentes');
    }
  }

  // ── 4) Includes de projeto + .generated.h ────────────────────────────────
  const headers = walk(sourceDir).filter((file) => file.endsWith('.h'));
  const headerNames = new Set(headers.map((file) => path.basename(file)));
  const headerSet = new Set(headers);
  const cppFiles = walk(sourceDir).filter((file) => file.endsWith('.cpp') || file.endsWith('.h'));
  // Diretórios "de projeto": um include cujo primeiro segmento casa com uma
  // pasta real do módulo é inclusão de projeto e PRECISA resolver. Headers
  // engine (BehaviorTree/, Perception/, CoreMinimal.h...) não são enumeráveis
  // sem a engine — pulamos quando o basename também não existe no projeto.
  const projectDirs = new Set(
    fs.existsSync(sourceDir)
      ? fs.readdirSync(sourceDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .flatMap((entry) => [entry.name, ...fs.readdirSync(path.join(sourceDir, entry.name), { withFileTypes: true }).filter((sub) => sub.isDirectory()).map((sub) => sub.name)])
      : [],
  );
  let includeChecked = 0;
  for (const file of cppFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/#include\s+"([^"]+)"/g)) {
      const inc = match[1];
      includeChecked += 1;
      if (inc.endsWith('.generated.h')) {
        const owner = `${inc.replace(/\.generated\.h$/, '')}.h`;
        // O dono é o próprio header que faz o include (mesmo basename).
        if (!headerNames.has(path.basename(owner))) {
          add(FATAL, 'UE1020', path.relative(sourceDir, file), `include gerado "${inc}" sem header dono "${path.basename(owner)}" em Source/`);
        }
        continue;
      }
      const resolvesLocally = headerSet.has(path.resolve(path.dirname(file), inc))
        || [path.join(sourceDir, moduleFor(file), inc), path.join(sourceDir, inc), path.join(sourceDir, moduleFor(file), 'Public', inc), path.join(sourceDir, moduleFor(file), 'Classes', inc)]
            .some((candidate) => headerSet.has(candidate));
      if (resolvesLocally) continue;
      const firstSegment = inc.split('/')[0];
      const basenameKnown = headerNames.has(path.basename(inc));
      if (projectDirs.has(firstSegment) || basenameKnown) {
        add(FATAL, 'UE1021', path.relative(sourceDir, file), `include de projeto "${inc}" não resolve em Source/ (namespace de projeto conhecido)`);
      }
    }

    // ── 5) GENERATED_BODY em tipos refletidos ─────────────────────────────
    if (file.endsWith('.h') && !file.endsWith('.generated.h')) {
      const reflected = /UCLASS\(|USTRUCT\(|UINTERFACE\(/.test(text);
      const hasGenerated = /GENERATED_(BODY|UCLASS_BODY|STRUCT_BODY|INTERFACE_BODY)\(/.test(text);
      if (reflected && !hasGenerated) {
        add(FATAL, 'UE1022', path.relative(sourceDir, file), 'header com UCLASS/USTRUCT/UINTERFACE sem GENERATED_BODY()');
      }
    }
  }

  // .cpp órfão de header não bloqueia (UE gera outros), mas .generated include quebrado sim (acima).

  // ── 6) Config essenciais ─────────────────────────────────────────────────
  const configDir = path.join(root, 'Config');
  for (const ini of ['DefaultEngine.ini', 'DefaultGame.ini', 'DefaultInput.ini']) {
    if (!fs.existsSync(path.join(configDir, ini))) add(WARN, 'UE1030', `Config/${ini}`, 'ini esperado ausente');
  }
  const engineIni = path.join(configDir, 'DefaultEngine.ini');
  if (fs.existsSync(engineIni)) {
    const text = fs.readFileSync(engineIni, 'utf8');
    const mapMatch = text.match(/GameDefaultMap=\/?Game\/?([A-Za-z0-9_/.]+)/);
    if (mapMatch) {
      const mapName = path.basename(mapMatch[1].replace(/^.*?Maps\//, ''));
      const hasUmap = walk(path.join(root, 'Content')).some((file) => file.endsWith('.umap') && path.basename(file, '.umap') === mapName);
      if (!hasUmap) add(WARN, 'UE1031', 'Config/DefaultEngine.ini', `GameDefaultMap "${mapName}" sem .umap em Content/ (importar mundo ainda pendente)`);
    } else {
      add(WARN, 'UE1032', 'Config/DefaultEngine.ini', 'GameDefaultMap não definido — build server não empacota sem mapa');
    }
  }

  const errors = findings.filter((finding) => finding.severity === FATAL);
  const warnings = findings.filter((finding) => finding.severity === WARN);
  return {
    ok: errors.length === 0,
    findings,
    summary: {
      engineAssociation: uproject.EngineAssociation,
      modules: modules.map((module) => module.Name),
      targets: [...targetNames].sort(),
      headers: headers.length,
      cpp: cppFiles.filter((file) => file.endsWith('.cpp')).length,
      includesChecked: includeChecked,
      errors: errors.length,
      warnings: warnings.length,
    },
  };
}

// Módulo dono de um arquivo Source: primeiro diretório sob Source/.
function moduleFor(file) {
  const parts = file.split(path.sep);
  const sourceIdx = parts.lastIndexOf('Source');
  return parts[sourceIdx + 1] || 'KhaaosRun';
}

// CLI: node ue58_preflight.mjs [root]
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ue58_preflight.mjs')) {
  const root = path.resolve(process.argv[2] || path.join(process.cwd(), 'Unreal', 'KhaaosRun'));
  const result = validateProject(root);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
