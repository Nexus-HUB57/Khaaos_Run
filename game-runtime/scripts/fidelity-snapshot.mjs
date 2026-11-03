// Khaaos Run — Fase 46 — SNAPSHOT de fidelidade (lib reutilizável do instrumento F44).
// ==============================================================================
// A Fase 44 criou o instrumento executável (fidelity-audit-lib.mjs + CLI
// audit-fidelity.mjs). A Fase 46 o transforma em SERVIÇO: o mesmo pipeline
// (README ao vivo → cânon → buildScene headless de cada mundo → counts reais →
// 53 checks) passa a ser consumível por QUALQUER portão:
//
//   • CLI audit-fidelity.mjs      → artifacts + exit code (CI/verify-all);
//   • ue5-preflight.yml           → portão ANTES do export OBJ (F46): o pipeline
//     UE5.8 CONSUME a geometria do runtime — se os mundos derivarem do README,
//     a deriva é cozida no build da engine;
//   • GET /admin/ue58/fidelity    → o Command Monitor roda a auditoria AO VIVO
//     e mostra o veredito check a check no painel.
//
// Design: módulo IMPORTÁVEL e puro de efeitos colaterais (não escreve artifacts
// — isso é do CLI; não imprime — isso é do chamador). O stub de canvas é
// instalado de forma idempotente (só se não houver document), mesmo padrão do
// CLI e dos testes headless.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const RUNTIME_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(RUNTIME_ROOT, '..');

// --- stub de canvas p/ texturas procedurais headless (mesmo padrão dos testes) ---
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', font: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  bezierCurveTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  fillText() {}, setTransform() {}, drawImage() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

/**
 * F47 — Extração LITE do `KHAAOS_WORLDS` de shared/worlds.ts.
 *
 * O snapshot é headless (não pode importar TS). Esta função faz um parse
 * estrutural simples: para cada bloco `WorldId: { ... }` dentro de
 * `KHAAOS_WORLDS: Record<WorldId, WorldDefinition> = {`, extrai apenas os 4
 * campos que o portão W audita: hazard.type, configRevision, biome, subtitle.
 *
 * Não é um parser TS completo — é um extrator determinístico dos campos
 * canônicos pinados. O teste de auto-verificação fidelity-audit.test.js já
 * cobre o caminho real (corrompe inputs e mostra os checks falhando).
 */
function extractSharedWorldsLite(src) {
  const WORLD_IDS = ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'];
  const out = {};

  // Localiza o início do objeto KHAAOS_WORLDS e seu fechamento (chaves balanceadas)
  const startIdx = src.indexOf('KHAAOS_WORLDS:');
  if (startIdx === -1) return null;
  const objStart = src.indexOf('{', startIdx);
  if (objStart === -1) return null;

  // Caminha pelas chaves para encontrar o fim do objeto KHAAOS_WORLDS
  let depth = 0;
  let objEnd = -1;
  for (let i = objStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { objEnd = i; break; }
    }
  }
  if (objEnd === -1) return null;
  const block = src.slice(objStart, objEnd + 1);

  for (const id of WORLD_IDS) {
    // Cada entrada começa com `  WorldId: {` ou `\n  WorldId: {`
    const entryRe = new RegExp(`\\b${id}:\\s*\\{`);
    const m = entryRe.exec(block);
    if (!m) continue;

    // Encontra o fechamento do objeto deste mundo (chaves balanceadas)
    let d = 0;
    let entryEnd = -1;
    for (let i = m.index + m[0].length - 1; i < block.length; i++) {
      if (block[i] === '{') d++;
      else if (block[i] === '}') {
        d--;
        if (d === 0) { entryEnd = i; break; }
      }
    }
    if (entryEnd === -1) continue;
    const entry = block.slice(m.index, entryEnd + 1);

    const strField = (key) => {
      const re = new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm');
      const mm = re.exec(entry);
      return mm ? mm[1] : undefined;
    };

    out[id] = {
      hazard: { type: strField('type') }, // captura o primeiro `type:` (que é o hazard.type)
      configRevision: strField('configRevision'),
      biome: strField('biome'),
      subtitle: strField('subtitle'),
    };
  }

  return Object.keys(out).length === 5 ? out : null;
}

/**
 * Roda a auditoria completa F44 sobre o repo REAL e devolve o relatório.
 * @param {{ repoRoot?: string, runtimeRoot?: string, readmeText?: string, simSource?: string, docs?: Object<string,string> }} overrides
 *   (injeção p/ testes — default lê o README/sim/matrizes do disco)
 * @returns {Promise<{ ok: boolean, summary: { pass: number, fail: number }, checks: Array, meta: object }>}
 */
export async function runFidelitySnapshot({
  repoRoot = REPO_ROOT,
  runtimeRoot = RUNTIME_ROOT,
  readmeText,
  simSource,
  docs,
} = {}) {
  const t0 = Date.now();
  const { SCENARIOS } = await import('../src/game3d/scenarios.js');
  const { getWorldLayout } = await import('../src/game3d/sim3d.js');
  const { districtDressing } = await import('../src/game3d/districts3d.js');
  const { buildScene, LIGHTING_PROFILES } = await import('../src/game3d/world3d.js');
  const { WORLD_AUDIO_PROFILES, FOOTSTEP_PROFILES } = await import('../src/game3d/worldAudioProfiles.js');
  const { auditWorlds } = await import('./fidelity-audit-lib.mjs');

  const readme = readmeText ?? readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const sim = simSource ?? readFileSync(path.join(runtimeRoot, 'src/game3d/sim3d.js'), 'utf8');

  // F47 — carrega o contrato E2E shared/worlds.ts como texto e extrai apenas o
  // export KHAAOS_WORLDS. O snapshot é HEADLESS (não pode importar TS), então
  // usamos uma extração por regex (a estrutura é estável e versionada). O
  // teste de auto-verificação (fidelity-audit.test.js) cobre o caminho real.
  let sharedWorlds = null;
  try {
    const sharedWorldsSrc = readFileSync(path.join(repoRoot, 'shared/worlds.ts'), 'utf8');
    sharedWorlds = extractSharedWorldsLite(sharedWorldsSrc);
  } catch (err) {
    // Sem shared/worlds.ts = check W vira fail no auditWorlds
  }

  const docTexts = docs ?? (() => {
    const out = {};
    for (const [id, rel] of Object.entries({
      f42: 'docs/FASE42_MUNDOS_FIDELIDADE_README.md',
      f43: 'docs/FASE43_DETALHES_MUNDOS.md',
    })) {
      try { out[id] = readFileSync(path.join(repoRoot, rel), 'utf8'); } catch { /* matriz ausente = check fail */ }
    }
    return out;
  })();

  // --- dados reais por mundo: dressing puro + cena construída (grupos nomeados) ---
  const dressingCounts = {};
  const sceneCounts = {};
  for (const [skey, scenario] of Object.entries(SCENARIOS)) {
    const layout = getWorldLayout(`AUDIT-${skey}`, scenario.id);
    dressingCounts[skey] = districtDressing(layout, scenario, { density: 1 }).counts;

    const { scene } = buildScene(4242, scenario.id, null, 'high');
    const named = {};
    // tubarões vivem nos WORLDMARKS (filhos diretos da cena); oilfire vive DENTRO
    // do grupo de dressing (reg.group, que buildScene NÃO adiciona à cena) —
    // dois contêineres, zero dupla contagem (contrato F44).
    scene.traverse((o) => { if (o.name === 'sharkfin') named.sharkfin = (named.sharkfin ?? 0) + 1; });
    const reg = scene.userData.districtDressing;
    if (reg?.group) reg.group.traverse((o) => { if (o.name === 'oilfire') named.oilfire = (named.oilfire ?? 0) + 1; });
    sceneCounts[skey] = named;
  }

  const report = auditWorlds({
    readmeText: readme,
    scenarios: SCENARIOS,
    dressingCounts,
    sceneCounts,
    lightingKeys: Object.keys(LIGHTING_PROFILES),
    simSource: sim,
    docs: docTexts,
    sharedWorlds,
    audio: { worlds: WORLD_AUDIO_PROFILES, footsteps: FOOTSTEP_PROFILES },
  });

  return {
    ...report,
    meta: {
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      worlds: Object.keys(SCENARIOS),
      dressingCounts,
      sceneCounts,
    },
  };
}
