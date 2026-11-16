// Reprodutível: node game-runtime/scripts/audit-character-triangle-budget.mjs
// Mede a geometria real criada pelos factories do runtime; não usa dados simulados.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// As texturas procedurais são headless; este canvas mínimo espelha o audit F51.
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
  fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
  ellipse() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: () => ({ data: new Uint8ClampedArray(4).fill(128) }),
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {}, measureText: () => ({ width: 10 }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const [{ createOperative, createWeaponModel }, { CANON }, { applyOperativeGear, buildGearMesh, GEAR_LIMITS }, { ATTACHMENTS, ATTACHMENT_RARITY_TREATMENTS, applyMythicSkin, buildAttachmentMesh, unregisterMythic }, { WEAPONS, RARITIES }, { HERO_ASSET }, THREE] = await Promise.all([
  import('../src/game3d/entities3d.js'),
  import('../src/game3d/heads3d.js'),
  import('../src/game3d/gear3d.js'),
  import('../src/game3d/attachments3d.js'),
  import('../src/shared/weapons.js'),
  import('../src/game3d/hero3d.js'),
  import('three'),
]);

const HERO_MESH_BUDGET = HERO_ASSET.budget.heroMeshMaxTriangles;
const GAMEPLAY_BUDGET = HERO_ASSET.budget.equippedEntityMaxTriangles;
const GEAR_LEVELS = {
  vest: Array.from({ length: GEAR_LIMITS.vest + 1 }, (_, i) => i),
  helmet: Array.from({ length: GEAR_LIMITS.helmet + 1 }, (_, i) => i),
  pack: Array.from({ length: GEAR_LIMITS.pack + 1 }, (_, i) => i),
};
const MYTHIC_STAGES = [0, 1, 2, 3, 4];
const RARITY_TIERS = Object.keys(ATTACHMENT_RARITY_TREATMENTS);
const WEAPON_SKINS = [null, ...Object.keys(RARITIES)];

function inheritedVisible(node) {
  for (let current = node; current; current = current.parent) if (!current.visible) return false;
  return true;
}

function elementRange(geometry) {
  const elements = geometry.index?.count ?? geometry.attributes?.position?.count ?? 0;
  const start = geometry.drawRange?.start ?? 0;
  const wanted = geometry.drawRange?.count ?? Infinity;
  const count = Number.isFinite(wanted) ? Math.min(wanted, Math.max(0, elements - start)) : Math.max(0, elements - start);
  return { start, end: start + count, count };
}

function meshTriangles(mesh, visibleOnly) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return 0;
  if (visibleOnly && (!inheritedVisible(mesh) || mesh.material?.visible === false)) return 0;
  const range = elementRange(geometry);
  if (Array.isArray(mesh.material) && geometry.groups?.length) {
    return geometry.groups.reduce((sum, group) => {
      if (visibleOnly && mesh.material[group.materialIndex]?.visible === false) return sum;
      const start = Math.max(range.start, group.start);
      const end = Math.min(range.end, group.start + group.count);
      return sum + Math.max(0, Math.floor((end - start) / 3));
    }, 0);
  }
  return Math.floor(range.count / 3);
}

function meshDrawCalls(mesh) {
  if (!inheritedVisible(mesh)) return 0;
  if (Array.isArray(mesh.material)) {
    return (mesh.geometry?.groups ?? []).filter((group) => group.count > 0 && mesh.material[group.materialIndex]?.visible !== false).length;
  }
  return mesh.material?.visible === false ? 0 : 1;
}

function measure(root) {
  const result = { triangles: 0, storedTriangles: 0, drawCalls: 0, visibleMeshes: 0, storedMeshes: 0 };
  root.traverse((node) => {
    if (!node.isMesh) return;
    result.storedMeshes += 1;
    result.storedTriangles += meshTriangles(node, false);
    const visibleTriangles = meshTriangles(node, true);
    if (visibleTriangles > 0) result.visibleMeshes += 1;
    result.triangles += visibleTriangles;
    result.drawCalls += meshDrawCalls(node);
  });
  return result;
}

function gearCombinations() {
  const rows = [];
  for (const vest of GEAR_LEVELS.vest) {
    for (const helmet of GEAR_LEVELS.helmet) {
      for (const pack of GEAR_LEVELS.pack) rows.push({ vest, helmet, pack });
    }
  }
  return rows;
}

function* subsets(items) {
  for (let mask = 0; mask < (1 << items.length); mask += 1) {
    yield items.filter((_, index) => (mask & (1 << index)) !== 0);
  }
}

const operativeRows = [];
const gearRows = [];
const gearPieceRows = [];
const attachmentPieceRows = [];
const mythicPieceRows = [];
const gearStates = gearCombinations();
const canonIds = Object.keys(CANON).sort();

for (const kind of ['vest', 'helmet', 'pack']) {
  for (let level = 1; level <= GEAR_LIMITS[kind]; level += 1) {
    const stats = measure(buildGearMesh(kind, level));
    gearPieceRows.push({ kind, level, triangles: stats.triangles, drawCalls: stats.drawCalls, meshes: stats.visibleMeshes });
  }
}
for (const attachmentId of Object.keys(ATTACHMENTS).sort()) {
  for (const rarity of ['COMUM', 'INCOMUM', 'RARO', 'LENDARIO', 'MITICA']) {
    const stats = measure(buildAttachmentMesh(attachmentId, { rarity }));
    attachmentPieceRows.push({ attachmentId, rarity, triangles: stats.triangles, drawCalls: stats.drawCalls, meshes: stats.visibleMeshes });
  }
}

for (let stage = 1; stage <= 4; stage += 1) {
  const group = new THREE.Group();
  applyMythicSkin(group, stage);
  const stats = measure(group);
  mythicPieceRows.push({ stage, triangles: stats.triangles, drawCalls: stats.drawCalls, meshes: stats.visibleMeshes });
}

for (const operativeId of canonIds) {
  for (const baseHelmet of [false, true]) {
    const { group, parts } = createOperative({
      variant: operativeId,
      skin: '#d9a06b',
      eye: '#f59e0b',
      hair: '#171717',
      helmet: baseHelmet,
    });
    for (const gear of gearStates) {
      applyOperativeGear(parts, gear);
      const measured = measure(group);
      gearRows.push({
        operativeId,
        baseHelmet,
        vestLevel: gear.vest,
        helmetLevel: gear.helmet,
        packLevel: gear.pack,
        visibleTriangles: measured.triangles,
        storedTriangles: measured.storedTriangles,
        visibleDrawCalls: measured.drawCalls,
        visibleMeshes: measured.visibleMeshes,
      });
    }
  }
}

for (const operativeId of canonIds) {
  const rows = gearRows.filter((row) => row.operativeId === operativeId);
  const defaultOn = rows.find((row) => row.baseHelmet && row.vestLevel === 0 && row.helmetLevel === 0 && row.packLevel === 0);
  const defaultOff = rows.find((row) => !row.baseHelmet && row.vestLevel === 0 && row.helmetLevel === 0 && row.packLevel === 0);
  const worst = rows.reduce((a, b) => b.visibleTriangles > a.visibleTriangles ? b : a);
  const best = rows.reduce((a, b) => b.visibleTriangles < a.visibleTriangles ? b : a);
  operativeRows.push({
    operativeId,
    baseWithHelmetTriangles: defaultOn.visibleTriangles,
    baseWithoutHelmetTriangles: defaultOff.visibleTriangles,
    minWithGearTriangles: best.visibleTriangles,
    maxWithGearTriangles: worst.visibleTriangles,
    maxGearState: { baseHelmet: worst.baseHelmet, vest: worst.vestLevel, helmet: worst.helmetLevel, pack: worst.packLevel },
    scenarios: rows.length,
    maxVisibleDrawCalls: Math.max(...rows.map((row) => row.visibleDrawCalls)),
    marginAtWorst: GAMEPLAY_BUDGET - worst.visibleTriangles,
  });
}

const weaponRows = [];
for (const weaponId of Object.keys(WEAPONS).sort()) {
  const compatible = Object.keys(ATTACHMENTS).filter((attachmentId) => ATTACHMENTS[attachmentId].compatible.includes(weaponId));
  const attachmentSets = [...subsets(compatible)];
  const attachmentRarities = Object.keys(ATTACHMENTS).length ? RARITY_TIERS : ['INCOMUM'];
  for (const attachments of attachmentSets) {
    for (const attachmentRarity of (attachments.length ? attachmentRarities : ['—'])) {
      for (const weaponSkin of WEAPON_SKINS) {
        for (const mythicStage of MYTHIC_STAGES) {
          const attachmentRarityArray = attachments.map(() => attachmentRarity === '—' ? 'INCOMUM' : attachmentRarity);
          const { group } = createWeaponModel(weaponId, weaponSkin, {
            attachments,
            attachmentRarities: attachmentRarityArray,
            mythicStage,
          });
          const measured = measure(group);
          weaponRows.push({
            weaponId,
            compatibleAttachments: compatible.length,
            attachments: [...attachments],
            attachmentRarity,
            weaponSkin: weaponSkin ?? 'none',
            mythicStage,
            triangles: measured.triangles,
            drawCalls: measured.drawCalls,
            meshes: measured.visibleMeshes,
          });
          unregisterMythic(group);
          group.traverse((node) => node.geometry?.dispose?.());
        }
      }
    }
  }
}

const weaponSummary = Object.keys(WEAPONS).sort().map((weaponId) => {
  const rows = weaponRows.filter((row) => row.weaponId === weaponId);
  const base = rows.find((row) => row.attachments.length === 0 && row.weaponSkin === 'none' && row.mythicStage === 0);
  const worst = rows.reduce((a, b) => b.triangles > a.triangles ? b : a);
  return {
    weaponId,
    combinationsMeasured: rows.length,
    compatibleAttachments: worst.compatibleAttachments,
    baseTriangles: base?.triangles ?? 0,
    maxTriangles: worst.triangles,
    maxState: { attachments: worst.attachments, attachmentRarity: worst.attachmentRarity, weaponSkin: worst.weaponSkin, mythicStage: worst.mythicStage },
    maxDrawCalls: Math.max(...rows.map((row) => row.drawCalls)),
  };
});

// Para cada configuração de personagem, combina-se o gear medido com o estado
// máximo observado de cada arma. Isso cobre o pior tier/anexos/skin/mítico por
// arma sem materializar 48 milhões de combinações redundantes.
const maxWeaponRows = Object.keys(WEAPONS).sort().map((weaponId) =>
  weaponRows.filter((row) => row.weaponId === weaponId).reduce((a, b) => b.triangles > a.triangles ? b : a));
const equippedRows = gearRows.flatMap((gear) => maxWeaponRows.map((weapon) => {
  const totalTriangles = gear.visibleTriangles + weapon.triangles;
  const weaponState = `${weapon.attachments.join('|') || '—'}; rarity=${weapon.attachmentRarity}; skin=${weapon.weaponSkin}; mythic=${weapon.mythicStage}`;
  return {
    operativeId: gear.operativeId,
    baseHelmet: gear.baseHelmet,
    vestLevel: gear.vestLevel,
    helmetLevel: gear.helmetLevel,
    packLevel: gear.packLevel,
    operativeTrianglesWithGear: gear.visibleTriangles,
    weaponId: weapon.weaponId,
    weaponTriangles: weapon.triangles,
    weaponState,
    totalTriangles,
    totalDrawCalls: gear.visibleDrawCalls + weapon.drawCalls,
    marginToBudget: GAMEPLAY_BUDGET - totalTriangles,
    overBudget: totalTriangles > GAMEPLAY_BUDGET,
  };
}));

const overallBodyWorst = operativeRows.reduce((a, b) => b.maxWithGearTriangles > a.maxWithGearTriangles ? b : a);
const overallWeaponWorst = weaponSummary.reduce((a, b) => b.maxTriangles > a.maxTriangles ? b : a);
const overallEquippedWorst = equippedRows.reduce((a, b) => b.totalTriangles > a.totalTriangles ? b : a);
const equippedOverBudgetRows = equippedRows.filter((row) => row.overBudget);
const overBudgetCount = equippedOverBudgetRows.length;
for (const operative of operativeRows) {
  const rows = equippedRows.filter((row) => row.operativeId === operative.operativeId);
  const worst = rows.reduce((a, b) => b.totalTriangles > a.totalTriangles ? b : a);
  operative.maxEquippedEntityTriangles = worst.totalTriangles;
  operative.maxEquippedWeaponId = worst.weaponId;
  operative.maxEquippedWeaponTriangles = worst.weaponTriangles;
  operative.maxEquippedGearState = { baseHelmet: worst.baseHelmet, vest: worst.vestLevel, helmet: worst.helmetLevel, pack: worst.packLevel };
  operative.overBudgetEquippedScenarios = rows.filter((row) => row.overBudget).length;
  operative.equippedScenarios = rows.length;
  operative.marginAtWorstEquipped = GAMEPLAY_BUDGET - worst.totalTriangles;
}
const combinedWorstTriangles = overallEquippedWorst.totalTriangles;
const combinedWorstDrawCalls = overallEquippedWorst.totalDrawCalls;
const generatedAt = new Date();
const runDate = generatedAt.toISOString().slice(0, 10);
const report = {
  generatedAt: generatedAt.toISOString(),
  heroMeshSubBudgetTriangles: HERO_MESH_BUDGET,
  gameplayFullBudgetTriangles: GAMEPLAY_BUDGET,
  equippedEntityScenarioCount: equippedRows.length,
  equippedEntityOverBudgetScenarioCount: overBudgetCount,
  sourceMethod: 'Factories do runtime Three.js e catálogos CANON/WEAPONS/ATTACHMENTS, sem malha simulada.',
  operativeCount: canonIds.length,
  gearLevels: GEAR_LEVELS,
  baseHelmetStates: [false, true],
  gearScenariosPerOperative: gearStates.length * 2,
  gearScenarioCount: gearRows.length,
  weaponMaxStatesPerGearScenario: maxWeaponRows.length,
  operativeRows,
  gearPieceRows,
  attachmentPieceRows,
  mythicPieceRows,
  weaponScenarioCount: weaponRows.length,
  weaponRows: weaponSummary,
  weaponCombinationDetails: weaponRows,
  worstCombinedThirdPersonEntity: {
    ...overallEquippedWorst,
  },
};

const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
function toCsv(rows, columns) {
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')).join('\n')}\n`;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputDir = resolve(repoRoot, 'docs/reports');
await mkdir(outputDir, { recursive: true });
const reportPath = resolve(outputDir, `OPERATIVE_TRIANGLE_BUDGET_${runDate}.md`);
const jsonPath = resolve(outputDir, `OPERATIVE_TRIANGLE_BUDGET_${runDate}.json`);
const gearCsvPath = resolve(outputDir, `OPERATIVE_GEAR_SCENARIOS_${runDate}.csv`);
const weaponCsvPath = resolve(outputDir, `WEAPON_ATTACHMENT_SCENARIOS_${runDate}.csv`);
const equippedCsvPath = resolve(outputDir, `OPERATIVE_EQUIPPED_SCENARIOS_${runDate}.csv`);

const fmt = (n) => Number(n).toLocaleString('en-US');
const operativeTable = operativeRows.map((row) => {
  const state = `bodyHelmet=${row.maxEquippedGearState.baseHelmet ? 'on' : 'off'}, vest=${row.maxEquippedGearState.vest}, helmet=${row.maxEquippedGearState.helmet}, pack=${row.maxEquippedGearState.pack}, weapon=${row.maxEquippedWeaponId}`;
  return `| ${row.operativeId} | ${fmt(row.baseWithHelmetTriangles)} | ${fmt(row.baseWithoutHelmetTriangles)} | ${fmt(row.maxWithGearTriangles)} | ${fmt(row.maxEquippedEntityTriangles)} | ${row.marginAtWorstEquipped >= 0 ? '+' : ''}${fmt(row.marginAtWorstEquipped)} | ${row.overBudgetEquippedScenarios}/${row.equippedScenarios} | ${state} |`;
}).join('\n');
const gearPieceTable = [...gearPieceRows].sort((a, b) => b.triangles - a.triangles).map((row) => `| ${row.kind} Nv${row.level} | ${fmt(row.triangles)} | ${row.drawCalls} | ${row.meshes} |`).join('\n');
const attachmentMaxRows = Object.keys(ATTACHMENTS).sort().map((attachmentId) => attachmentPieceRows.filter((row) => row.attachmentId === attachmentId).reduce((a, b) => b.triangles > a.triangles ? b : a));
const attachmentPieceTable = attachmentMaxRows.sort((a, b) => b.triangles - a.triangles).map((row) => `| ${row.attachmentId} | ${row.rarity} | ${fmt(row.triangles)} | ${row.drawCalls} | ${row.meshes} |`).join('\n');
const mythicPieceTable = mythicPieceRows.map((row) => `| ${row.stage} | ${fmt(row.triangles)} | ${row.drawCalls} | ${row.meshes} |`).join('\n');
const weaponTable = weaponSummary.map((row) => `| ${row.weaponId} | ${fmt(row.baseTriangles)} | ${fmt(row.maxTriangles)} | ${row.compatibleAttachments} | ${row.combinationsMeasured} | ${row.maxDrawCalls} | ${row.maxState.attachments.join(', ') || '—'}; tier=${row.maxState.attachmentRarity}; skin=${row.maxState.weaponSkin}; mythic=${row.maxState.mythicStage} |`).join('\n');
const reportText = `# Auditoria de triângulos — operativos e loadouts (${runDate})

Gerado em ${report.generatedAt}. O audit mede malhas dos factories reais Three.js, sem geometria simulada. **Teto de gameplay: ${fmt(GAMEPLAY_BUDGET)} triângulos para a entidade third-person completa (corpo + gear + uma arma com anexos/skin/overlay).** O mesh Hero FBX isolado mantém subteto de ${fmt(HERO_MESH_BUDGET)}; ele não substitui nem define o orçamento equipado.

## Escopo e método

- 33 identidades CANON; a contagem-base inclui corpo, cabeça/rosto, acessórios identitários e sombra de contato de createOperative().
- 5.280 combinações reais de corpo/gear (capacete-base ligado/desligado × níveis de colete, capacete dinâmico e mochila), aplicadas por applyOperativeGear(). A métrica runtime usa só meshes e materiais visíveis; storedTriangles também preserva geometria ocultada por substituição.
- 9.120 estados reais de arma entre as nove do catálogo, incluindo subconjuntos compatíveis de anexos, cinco tiers de raridade, skins e estágios míticos 0–4.
- A verificação equipada testa **${equippedRows.length.toLocaleString('en-US')} casos**: cada um dos 5.280 estados de corpo/gear combinado com o estado de maior contagem medido para cada uma das nove armas. É uma envoltória conservadora da pior configuração por arma; não materializa os 48 milhões de pares redundantes com todos os estados de skin/raridade.
- Medimos separadamente cada peça de gear, cada anexo, os overlays míticos por estágio e draw calls. Custo de render considera index/position e drawRange; cada mesh/material group visível conta como draw call. Armas first-person e objetos de mundo estão fora do ator third-person.

## Resultado executivo

- **${overBudgetCount.toLocaleString('en-US')} de ${equippedRows.length.toLocaleString('en-US')} combinações equipadas excedem ${fmt(GAMEPLAY_BUDGET)} triângulos.** Portanto, todos os estados catalogados passam pelo novo gate de triângulos.
- Pior entidade completa: **${overallEquippedWorst.operativeId}**, body helmet ${overallEquippedWorst.baseHelmet ? 'on' : 'off'}, vest Nv${overallEquippedWorst.vestLevel}, helmet Nv${overallEquippedWorst.helmetLevel}, pack Nv${overallEquippedWorst.packLevel}, com **${overallEquippedWorst.weaponId}** e estado \`${overallEquippedWorst.weaponState}\`: **${fmt(combinedWorstTriangles)} triângulos**, margem de **${fmt(GAMEPLAY_BUDGET - combinedWorstTriangles)}**.
- A arma de maior custo é a **${overallWeaponWorst.weaponId}**: ${fmt(overallWeaponWorst.maxTriangles)} triângulos. O estado máximo da M4 usa mira4x + silenciador + magestendida + gripvertical, raridade COMUM, skin COMUM e overlay mítico no estágio 4: 852 triângulos.
- O subteto de **${fmt(HERO_MESH_BUDGET)}** aplica-se somente ao mesh Hero; não há conflito entre validar o FBX isolado e impor o teto de ${fmt(GAMEPLAY_BUDGET)} ao ator completo depois de gear/arma.

## Consumo por operativo — cenário máximo já equipado

| Operativo | Base com capacete | Base sem capacete | Máx. corpo + gear | Máx. corpo + gear + arma | Margem até ${fmt(GAMEPLAY_BUDGET)} | Cenários acima | Loadout completo máximo |
|---|---:|---:|---:|---:|---:|---:|---|
${operativeTable}

## Custo das peças de gear

Valores absolutos da malha gerada por buildGearMesh; níveis Nv2+ de capacete e Nv1+ de mochila substituem geometrias-base, portanto estes valores não devem ser somados cegamente ao corpo.

| Peça | Triângulos | Draw calls | Meshes |
|---|---:|---:|---:|
${gearPieceTable}

## Custo máximo dos acessórios de arma

Pior tier por peça (COMUM inclui a geometria extra do desgaste). As contagens incluem o chip de raridade.

| Acessório | Tier mais pesado | Triângulos | Draw calls | Meshes |
|---|---|---:|---:|---:|
${attachmentPieceTable}

### Overlay mítico isolado por estágio

| Estágio | Triângulos | Draw calls | Meshes |
|---:|---:|---:|---:|
${mythicPieceTable}

## Armas — custo máximo observado

| Arma | Base (tri) | Máx. (tri) | Slots compatíveis | Combinações medidas | Máx. draw calls | Estado máximo |
|---|---:|---:|---:|---:|---:|---|
${weaponTable}

## Priorização de otimização

**P0 — arma e VFX que mais consomem o orçamento e a CPU de render.** A M4 no estado completo medido chega a 852 triângulos/47 draw calls; Mira 4x e silenciador são os maiores anexos individuais, e o overlay mítico estágio 4 adiciona 176 triângulos/9 meshes-draw calls. Priorizar redução de segmentos nos cilindros/anéis, reaproveitamento/merge por material, e deslocar riscos/chips emissivos para textura/atlas ou instância; preservar legibilidade da silhueta e sockets. O tier COMUM acrescenta 12 triângulos e um draw call por scratch geométrico.

**P1 — colete Nv4 e capacete de assalto.** O colete Nv4 é 144 triângulos distribuídos em 12 draw calls (maior fragmentação do gear); consolidar placas/ombros/LED em poucas geometrias por material. Capacete Nv3 tem 276 triângulos/6 draw calls e Nv2 já tem 228/2; reduzir segmentos do dome e fundir trilhos/mount sem apagar leitura visual balística.

**P2 — grip vertical e mochila Nv3.** Grip comum chega a 84 triângulos/7 draw calls, devido às ranhuras e desgaste; trocar sulcos por normal/roughness e fundir peças. Mochila Nv3 é 116/8, mas substitui mochila-base e tende a reduzir a contagem líquida do corpo; otimizar draw calls e volumes ocultos antes de reduzir silhueta.

No cenário máximo, o cap de triângulos tem ${fmt(GAMEPLAY_BUDGET - combinedWorstTriangles)} de folga; a dimensão urgente remanescente é fragmentação de draw calls, não extrapolação dos triângulos. O maior cenário de draw calls fica reportado no JSON/CSV e requer perfilamento de GPU antes de fixar um segundo teto.

## Reexecução e artefatos

- JSON: \`OPERATIVE_TRIANGLE_BUDGET_${runDate}.json\` — métricas completas, por-operativo, por-peça e por arma.
- CSV gear: \`OPERATIVE_GEAR_SCENARIOS_${runDate}.csv\` — 5.280 combinações corpo/gear.
- CSV armas: \`WEAPON_ATTACHMENT_SCENARIOS_${runDate}.csv\` — 9.120 estados por arma/anexos/raridade/skin/estágio.
- CSV equipado: \`OPERATIVE_EQUIPPED_SCENARIOS_${runDate}.csv\` — 47.520 estados corpo/gear + envelope máximo de cada arma, com margem para o cap.
- Reexecutar: \`node game-runtime/scripts/audit-character-triangle-budget.mjs\`.
`;

await Promise.all([
  writeFile(reportPath, reportText, 'utf8'),
  writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
  writeFile(gearCsvPath, toCsv(gearRows, ['operativeId', 'baseHelmet', 'vestLevel', 'helmetLevel', 'packLevel', 'visibleTriangles', 'storedTriangles', 'visibleDrawCalls', 'visibleMeshes']), 'utf8'),
  writeFile(weaponCsvPath, toCsv(weaponRows, ['weaponId', 'compatibleAttachments', 'attachments', 'attachmentRarity', 'weaponSkin', 'mythicStage', 'triangles', 'drawCalls', 'meshes']), 'utf8'),
  writeFile(equippedCsvPath, toCsv(equippedRows, ['operativeId', 'baseHelmet', 'vestLevel', 'helmetLevel', 'packLevel', 'operativeTrianglesWithGear', 'weaponId', 'weaponTriangles', 'weaponState', 'totalTriangles', 'totalDrawCalls', 'marginToBudget', 'overBudget']), 'utf8'),
]);
console.log(JSON.stringify({ reportPath, jsonPath, gearCsvPath, weaponCsvPath, equippedCsvPath, operativeCount: canonIds.length, gearScenarioCount: gearRows.length, weaponScenarioCount: weaponRows.length, equippedEntityBudget: GAMEPLAY_BUDGET, equippedEntityScenarioCount: equippedRows.length, equippedEntityOverBudgetScenarioCount: overBudgetCount, worstOperative: overallBodyWorst, worstWeapon: overallWeaponWorst, combinedWorstTriangles, combinedWorstDrawCalls }, null, 2));
if (overBudgetCount > 0) {
  console.error(`Budget equipado violado: ${overBudgetCount} de ${equippedRows.length} cenários excedem ${GAMEPLAY_BUDGET} triângulos.`);
  process.exitCode = 1;
}
