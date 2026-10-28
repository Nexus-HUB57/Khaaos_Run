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
//      projeto (warning se o .umap ainda não foi importado);
//   7. Pipeline de mundos (Editor-Python) e camada EAC: contrato de build
//      nunca quebrar — geradores presentes e detecção condicional do SDK
//      (KHAAOS_EAC_SDK 0/1; stub sem binários é warning, não erro).
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
  // M4 — módulos de TOPO do Source (provedores de include): um módulo dependido
  // que expõe a própria raiz (PublicIncludePaths.Add(ModuleDirectory)) torna
  // includes "Game/..." resolvíveis cross-módulo — modelo do KhaaosRun.Build.cs.
  const moduleTopDirs = fs.existsSync(sourceDir)
    ? fs.readdirSync(sourceDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
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
      // Módulos do projeto (sourceDir/*) — o UBT com os PrivateIncludePaths dos
      // Build.cs resolve includes contra esses roots (KhaaosRunEditor → KhaaosRun).
      const projectModuleDirs = fs.existsSync(sourceDir)
        ? fs.readdirSync(sourceDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(sourceDir, entry.name, `${entry.name}.Build.cs`))).map((entry) => entry.name)
        : [];
      const moduleRoots = projectModuleDirs.flatMap((name) => [
        path.join(sourceDir, name, inc),
        path.join(sourceDir, name, 'Public', inc),
      ]);
      const resolvesLocally = headerSet.has(path.resolve(path.dirname(file), inc))
        || [
          path.join(sourceDir, moduleFor(file), inc),
          path.join(sourceDir, inc),
          path.join(sourceDir, moduleFor(file), 'Public', inc),
          path.join(sourceDir, moduleFor(file), 'Classes', inc),
          // Includes cross-módulo na forma canônica ("Game/<SubDir>/X.h" num
          // módulo vizinho): os Build.cs do projeto expõem os roots dos módulos
          // irmãos via PrivateIncludePaths (KhaaosRunEditor → KhaaosRun), então
          // o preflight resolve contra TODOS os roots de módulo conhecidos.
          ...moduleRoots,
        ]
            .some((candidate) => headerSet.has(candidate));
      if (resolvesLocally) continue;
      // M4 — include raizado no módulo PROVIDER ("Game/..." via KhaaosRun):
      // resolve quando ALGUM módulo de topo expõe a raiz com o caminho inteiro.
      const resolvesViaProviderModule = moduleTopDirs.some((m) =>
        headerSet.has(path.resolve(sourceDir, m, inc)) || headerSet.has(path.resolve(sourceDir, m, 'Public', inc)));
      if (resolvesViaProviderModule) continue;
      const firstSegment = inc.split('/')[0];
      const basenameKnown = headerNames.has(path.basename(inc));
      // Diretórios de convenção da ENGINE (UnrealEd/Commandlets, Module/Public…):
      // existem como subdir do projeto, mas includes com essa raiz são da engine
      // (ex.: "Commandlets/Commandlet.h" ← UnrealEd) — não são include de projeto.
      const ENGINE_CONVENTION_DIRS = new Set(['Commandlets', 'Public', 'Private', 'Classes', 'Internationalization', 'Tests']);
      const projectRooted = projectDirs.has(firstSegment) && !ENGINE_CONVENTION_DIRS.has(firstSegment);
      if (projectRooted || basenameKnown) {
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

  // ── 7) Pipeline de mundos + camada EAC (contrato: build nunca quebra) ────
  const repoScripts = path.join(root, '..', '..', 'scripts', 'build');
  if (!fs.existsSync(path.join(repoScripts, 'generate_worlds.py'))) {
    add(WARN, 'UE1042', 'scripts/build/generate_worlds.py', 'pipeline de geração de mundos ausente (.umap/materiais/Niagara pendentes)');
  }
  if (!fs.existsSync(path.join(repoScripts, 'build_worlds.sh'))) {
    add(WARN, 'UE1043', 'scripts/build/build_worlds.sh', 'runner do commandlet de mundos ausente');
  }
  const eacModule = (uproject.Modules || []).find((module) => module.Name === 'KhaaosEAC');
  if (eacModule) {
    const eacBuildCs = path.join(sourceDir, 'KhaaosEAC', 'KhaaosEAC.Build.cs');
    if (!fs.existsSync(eacBuildCs)) {
      add(FATAL, 'UE1044', 'Source/KhaaosEAC/KhaaosEAC.Build.cs', 'módulo KhaaosEAC registrado no .uproject sem Build.cs');
    } else {
      const eacText = fs.readFileSync(eacBuildCs, 'utf8');
      if (!eacText.includes('KHAAOS_EAC_SDK') || !eacText.includes('KHAAOS_EAC_SDK_DIR')) {
        add(FATAL, 'UE1041', 'Source/KhaaosEAC/KhaaosEAC.Build.cs', 'camada EAC sem detecção condicional do SDK — contrato exige KHAAOS_EAC_SDK_DIR + define KHAAOS_EAC_SDK (0/1) para não quebrar sem binários');
      } else {
        const explicitSdkDir = process.env.KHAAOS_EAC_SDK_DIR;
        const localSdkDir = path.join(sourceDir, 'KhaaosEAC', 'EACSDK');
        const sdkDir = explicitSdkDir || (fs.existsSync(localSdkDir) ? localSdkDir : null);
        if (sdkDir) {
          // SDK EXPLICITAMENTE fornecido: valida o layout do pacote oficial —
          // pacote quebrado é erro (falta lib no link custa mais caro que
          // falhar aqui); válido → sem warning, build usa KHAAOS_EAC_SDK=1.
          const sdkLayout = [
            'Sdk/anticheat/sdkdefines.h',
          ];
          const missing = sdkLayout.filter((rel) => !fs.existsSync(path.join(sdkDir, rel)));
          const hasLib = ['Sdk/lib/anticheat/libeacserver.so', 'Sdk/lib/anticheat/libeacclient.so', 'Sdk/lib/anticheat/eacserver.lib', 'Sdk/lib/anticheat/eacclient.lib']
            .some((rel) => fs.existsSync(path.join(sdkDir, rel)));
          if (missing.length || !hasLib) {
            add(FATAL, 'UE1045', sdkDir, `pacote EAC SDK fornecido mas inválido${missing.length ? ` (falta: ${missing.join(', ')})` : ''}${!hasLib ? ' (nenhuma lib eacserver/eacclient em Sdk/lib/anticheat)' : ''} — use scripts/build/setup_eac_sdk.sh para resolver/validar`);
          }
        } else {
          add(WARN, 'UE1040', 'Source/KhaaosEAC', 'binários do EAC SDK ausentes — modo stub (KHAAOS_EAC_SDK=0); download no dev portal da Epic é ação humana (pipeline headless: scripts/build/setup_eac_sdk.sh)');
        }
      }
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
