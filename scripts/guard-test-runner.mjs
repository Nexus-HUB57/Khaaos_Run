// Khaaos Run — Guarda anti-reversão de suítes de teste (lição dos ciclos #127/#132).
// Merges concorrentes já: (1) reintroduziram vitest ao package.json, (2) restauraram
// suítes importando vitest + aliases @game/* que NUNCA rodam sob o runner do repo
// (node --test) — arquivos mortos que fingem cobertura, (3) derrubaram arquivos de
// teste em merges. Este guard valida o manifesto tests/test-suite-guard.json e
// falha cedo (antes do npm test) em CI e localmente.
// Uso: node scripts/guard-test-runner.mjs   (ou npm run guard:tests)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(root, "tests", "test-suite-guard.json");

export function runGuardChecks({ manifestPath = MANIFEST, rootDir = root } = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const violations = [];

  // 1 — arquivos canônicos presentes (anti-deleção silenciosa)
  for (const rel of manifest.mustExist ?? []) {
    if (!existsSync(path.join(rootDir, rel))) {
      violations.push(`ARQUIVO AUSENTE: ${rel} — suíte canônica do manifesto foi deletada/movida`);
    }
  }

  // 2 — contagem mínima por diretório (anti-deleção em massa)
  for (const [dir, min] of Object.entries(manifest.minFiles ?? {})) {
    const abs = path.join(rootDir, dir);
    if (!existsSync(abs)) { violations.push(`DIRETÓRIO AUSENTE: ${dir}`); continue; }
    const n = countTestFiles(abs);
    if (n < min) {
      violations.push(`SUÍTES ABAIXO DO MÍNIMO: ${dir} tem ${n}, manifesto exige ≥ ${min} — deleção de testes detectada`);
    }
  }

  // 3 — imports proibidos em QUALQUER arquivo de teste (runner errado = arquivo morto)
  // Parsing por linha de import real (não substring bruta): comentários mencionando
  // o módulo proibido NÃO são violação (lição do falso positivo "UCLASS em comentário").
  const forbidden = manifest.forbiddenImports ?? [];
  const alias = manifest.forbiddenAliasPrefix;
  const scanDirs = Object.keys(manifest.minFiles ?? {});
  for (const dir of scanDirs) {
    const abs = path.join(rootDir, dir);
    if (!existsSync(abs)) continue;
    for (const file of walkTestFiles(abs)) {
      const rel = path.relative(rootDir, file);
      const specs = importSpecifiers(readFileSync(file, "utf8"));
      for (const mod of forbidden) {
        if (specs.some((s) => s === mod || s.startsWith(`${mod}/`))) {
          violations.push(`IMPORT PROIBIDO: ${rel} importa "${mod}" — o runner do repo é node:test (o CI NUNCA executa este arquivo)`);
        }
      }
      if (alias && specs.some((s) => s.startsWith(alias))) {
        violations.push(`ALIAS PROIBIDO: ${rel} importa "${alias}…" — aliases só resolvem sob config removida; use import relativo com extensão`);
      }
    }
  }

  // 4 — dependências proibidas nos manifests de pacote
  for (const rel of manifest.depManifests ?? []) {
    const abs = path.join(rootDir, rel);
    if (!existsSync(abs)) continue;
    const pkg = JSON.parse(readFileSync(abs, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    for (const bad of manifest.forbiddenDeps ?? []) {
      if (deps[bad] != null) {
        violations.push(`DEPENDÊNCIA PROIBIDA: ${rel} declara "${bad}@${deps[bad]}" — runner do repo é node:test nativo`);
      }
    }
  }

  return { ok: violations.length === 0, violations, manifest };
}

// ---------- helpers ----------
// Extrai specifiers de imports/require REAIS. Linhas de comentário (//, *, /*)
// são ignoradas — documentação citando um módulo não é uma dependência dele.
function importSpecifiers(src) {
  const specs = [];
  for (const rawLine of src.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    if (!/^(?:import|export)\b/.test(line) && !line.includes("require(")) continue;
    for (const m of line.matchAll(/['"]([^'"]+)['"]/g)) specs.push(m[1]);
  }
  return specs;
}

function countTestFiles(dir) {
  let n = 0;
  for (const f of walkTestFiles(dir)) n++;
  return n;
}

function walkTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "helpers") continue;
      out.push(...walkTestFiles(abs));
    } else if (isTestFile(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function isTestFile(name) {
  return /^.*\.test\.(m|c)?[jt]sx?$/.test(name);
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, violations } = runGuardChecks();
  if (!ok) {
    console.error("✗ GUARDA DE SUÍTES: violações detectadas — o runner do repo é node:test e o manifesto tests/test-suite-guard.json é contrato:");
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log("✓ GUARDA DE SUÍTES: manifesto íntegro (arquivos canônicos, mínimos de contagem, zero vitest/aliases, deps limpas).");
}
