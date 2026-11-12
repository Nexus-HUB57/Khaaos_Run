// Khaaos Run — Fase 44 — AUDITORIA EXECUTÁVEL de fidelidade Mundos ↔ README.
//
// A Fase 42/43 materializou os Mundos 1:1 com o README e pinou o contrato em
// testes. Este módulo é o INSTRUMENTO que impede a deriva de volta: ele lê o
// README AO VIVO (fonte única da verdade), extrai o cânon de cada Mundo
// (setores, dinâmica, fecho de anel, substantivos de cenário) e cruza com o
// runtime real (SCENARIOS, dressing construído, perfis de luz, vocabulário).
// Qualquer discrepância — setor renomeado no runtime, dinâmica vazada para
// outro mundo, builder abaixo da densidade Free Fire, typo regressivo — vira
// um check `fail` e o CLI sai com exit code 1 (CI vermelha até erradicado).
//
// Design: a lib é PURA e testável — recebe o texto do README e valores
// pré-computados (counts de dressing, extras de cena, chaves de luz). O CLI
// (audit-fidelity.mjs) alimenta com dados reais; o teste de auto-verificação
// (fidelity-audit.test.js) alimenta com entradas CORROMPIDAS e prova que os
// checks pegam a deriva — a auditoria da própria auditoria.

// ---------------------------------------------------------------------------
// 1. Extração do cânon do README (fonte única da verdade)
// ---------------------------------------------------------------------------

const WORLD_HEAD_RE = /^### (W[1-4])\/C[1-4] — (.+?) \((.+)\)$/gm;

/**
 * Normaliza uma linha de setor do README para os nomes de setor do runtime.
 * Aliases documentados (matriz F42) — nada escondido:
 *  - CIGKV "Setor de Testes (Proving Grounds)" → Proving Grounds + Urbano Denso
 *    (função da linha: "Urbano denso, prédios destrutíveis, túneis")
 *  - "Pátio de Armamento (Armory Hub)" → Pátio de Armamento
 *  - linhas de extração (ZEX) → Terminal ZEX
 *  - W2 "Área de Caça + Templo Antigo" → dois setores no runtime
 *  - demais: remove o parêntese (fração/observação) e mantém o nome
 */
const STRIP_PARENS = (s) => s.replace(/\s*\(([^)]*)\)\s*$/, '').trim();

/**
 * Modelo de alias: `required` (o runtime PRECISA ter) e `optional` (âncora
 * válida para S2 mas não obrigatória — frações/observações do README).
 * Linhas de extração: o README as nomeia por função (estação/matadouro/…);
 * o runtime as representa pelo Terminal ZEX — W1 ainda mantém o nome literal
 * "Zona de Extração" como setor, então a base vira opcional.
 */
function sectorAliases(worldKey, rawName, rowText = '') {
  const clean = rawName.trim();
  if (/Extra(ç|c)(ã|a)o/i.test(clean)) {
    const base = STRIP_PARENS(clean);
    return { required: ['Terminal ZEX'], optional: base && base !== 'Terminal ZEX' ? [base] : [] };
  }
  if (worldKey === 'CIGKV' && /Setor de Testes/i.test(clean)) {
    return /urbano denso/i.test(rowText)
      ? { required: ['Proving Grounds'], optional: ['Urbano Denso'] }
      : { required: ['Proving Grounds'], optional: [] };
  }
  if (worldKey === 'CIGKV' && /Armory Hub/i.test(clean)) {
    return { required: ['Pátio de Armamento'], optional: [] };
  }
  if (worldKey === 'W2' && /Área de Ca(ç|c)a \+ Templo/i.test(clean)) {
    return { required: ['Área de Caça', 'Templo Antigo'], optional: [] };
  }
  const base = STRIP_PARENS(clean);
  return { required: base ? [base] : [clean], optional: [] };
}

function parseSectorTable(sectionText, worldKey) {
  const rows = [];
  let inTable = false;
  for (const line of sectionText.split('\n')) {
    if (/^\|\s*Setor\s*\|/.test(line)) { inTable = true; continue; }
    if (inTable && /^\|\s*-/.test(line)) continue;
    if (inTable) {
      const m = line.match(/^\|\s*(.+?)\s*\|/);
      if (!m || !m[1]) { if (rows.length) break; continue; }
      rows.push({ raw: m[1], aliases: sectorAliases(worldKey, m[1], line) });
    }
  }
  return rows;
}

/**
 * Extrai o cânon dos cinco Mundos do texto do README.
 * @returns {{ worlds: Object.<key, {key,world,name,epithet,dynamicsText,sectors:Array,closeKeyword}> , issues: string[] }}
 */
export function extractWorldsFromReadme(readmeText) {
  const issues = [];
  const worlds = {};

  // --- CIGKV (seção "Protocolo CIGKV — Campo de Treinamento") ---
  const cigStart = readmeText.indexOf('## Protocolo CIGKV');
  if (cigStart < 0) issues.push('README: seção "Protocolo CIGKV" ausente');
  else {
    // próximo heading de nível 2 LINE-ANCHORED (indexOf('## ') casaria dentro
    // de '### ' — o offset +1 dentro de '### ' contém '## ')
    const rest = readmeText.slice(cigStart + 4);
    const nextH2 = rest.match(/^## /m);
    const cigText = readmeText.slice(cigStart, nextH2 ? cigStart + 4 + nextH2.index : undefined);
    const dynMatch = cigText.match(/\*\*Pulso Khaaos\*\*:?\s*(.*)/);
    worlds.CIGKV = {
      key: 'CIGKV', world: 'CIGKV', name: 'Khaaos Ville', epithet: 'Campo de Treinamento',
      dynamicsText: dynMatch ? dynMatch[0] : '',
      sectors: parseSectorTable(cigText, 'CIGKV'),
      closeKeyword: null, // protocolo de praça central — o CIGKV não desvia
    };
  }

  // --- W1–W4 (seção "Mundos Oficiais (W1–W4)") ---
  const wStart = readmeText.search(/^## Mundos Oficiais \(W1–W4\)/m);
  if (wStart < 0) issues.push('README: seção "Mundos Oficiais (W1–W4)" ausente');
  else {
    const wText = readmeText.slice(wStart);
    const heads = [...wText.matchAll(WORLD_HEAD_RE)];
    for (let i = 0; i < heads.length; i++) {
      const [, wkey, name, epithet] = heads[i];
      const start = heads[i].index + heads[i][0].length;
      const end = i + 1 < heads.length ? heads[i + 1].index : wText.indexOf('\n---', start);
      const section = wText.slice(start, end > 0 ? end : undefined);
      const dyn = section.match(/\*\*Din(â|a)mica\*\*:?\s*(.*)/);
      worlds[wkey] = {
        key: wkey, world: name.trim(), name, epithet: epithet.trim(),
        dynamicsText: dyn ? dyn[0] : '',
        sectors: parseSectorTable(section, wkey),
        closeKeyword: wkey === 'W1' ? 'Parque'
          : wkey === 'W2' ? 'Templo'
          : wkey === 'W3' ? 'Vila Sombria'
          : 'Pris(ã|a)o',
      };
    }
  }
  for (const key of ['CIGKV', 'W1', 'W2', 'W3', 'W4']) {
    if (!worlds[key]) issues.push(`README: cânon do mundo ${key} não extraído`);
  }
  return { worlds, issues };
}

// ---------------------------------------------------------------------------
// 2. Tabelas canônicas (cada mínimo justificado por um substantivo do README)
// ---------------------------------------------------------------------------

// Dinâmica ambiental por mundo (README "Dinâmica") → survival.type do runtime.
// BARBURHEN é id-gated no sim (acidTimer −1 hp/10 s — chuva ácida "Água da Morte").
export const DYNAMICS_CONTRACT = Object.freeze({
  CIGKV: { pattern: /Pulso Khaaos/i, type: 'KHAOS_GRAVITY' },
  W1: { pattern: /chuva (á|a)cida/i, type: 'ACID_RAIN_SIM', simGate: 'Barburhen', simToken: 'acidTimer' },
  W2: { pattern: /esporos t(ó|o)xicos/i, type: 'SPORE_FOG' },
  W3: { pattern: /fuma(ç|c)a t(ó|o)xica/i, type: 'TOXIC_SMOKE' },
  W4: { pattern: /Tsunami/i, type: 'TSUNAMI_WAVE' },
});

// Setor onde o anel FECHA (README) → nome canônico no runtime.
export const RING_FINAL_CONTRACT = Object.freeze({
  W1: { pattern: /Parque/, name: 'Parque Abandonado' },
  W2: { pattern: /Templo/i, name: 'Templo Antigo' },
  W3: { pattern: /Vila Sombria/, name: 'Vila Sombria' },
  W4: { pattern: /Pris(ã|a)o/i, name: 'Prisão do Sol da Noite' },
});

// Dressing mínimo por mundo (qualidade nível Free Fire/Garena). Cada builder
// materializa um substantivo canônico do README:
//  Barburhen: "construções inacabadas"(skeleton) "desabamentos"(collapse)
//    "carros abandonados"(burntcar) "fumaça"(smokecolumn) "degrada dia após
//    dia"(crater/rubble)
//  Priadus: "flora carnívora"(carnplant) "neblina alucinógena"(mist)
//    "pântanos"(waterpool) selva(mangrove/sporesac/templestep)
//  Ckesalth: "lagoas de petróleo"(oilpool) "areia movediça"(quicksand)
//    deserto(dune) refinaria(oiltank/refinetower)
//  Arukheea: "Prisão do Sol da Noite"(prisonwall) "luz perpétua"(lighthouse)
//    "Cemitério das Baleias"(whaleribs) marina com naufrágios(shipwreck)
//  CIGKV: campo de instrução(tent/flagmast/bleacher/tirerow — armory hub)
export const DRESSING_MIN = Object.freeze({
  CIGKV: Object.freeze({ tent: 4, flagmast: 4, bleacher: 2, tirerow: 2 }),
  BARBURHEN: Object.freeze({ skeleton: 2, collapse: 2, burntcar: 1, smokecolumn: 1, crater: 2, rubble: 3 }),
  PRIADUS: Object.freeze({ carnplant: 3, mist: 4, waterpool: 2, mangrove: 3, sporesac: 2, templestep: 1 }),
  CKESALTH: Object.freeze({ oilpool: 2, quicksand: 2, dune: 3, oiltank: 2, refinetower: 1, bones: 3 }),
  ARUKHEEA: Object.freeze({ prisonwall: 2, lighthouse: 1, whaleribs: 2, shipwreck: 2, palmtree: 3 }),
});

// Setores "Plus" do runtime SEM linha própria na tabela do README, mas com a
// decisão REGISTRADA na matriz de auditoria F42 (a trilha honesta: nada
// escondido). Alterar o setor ⇒ atualizar a matriz F42 junto.
export const DOCUMENTED_PLUS = Object.freeze({
  W3: Object.freeze(["Areia Movediça"]),  // F42: "setor 3 = 'Areia Movediça' (Plus− do README)"
  W4: Object.freeze(["Marina Fantasma"]), // F42/F44: marina dos naufrágios (ilha dos piratas) — decisão registrada na matriz
});

// Extras construídos fora do districtDressing (cena real, worldmarks/bUILDERS):
//  Arukheea "tubarões" → sharkfin no MAR dos worldmarks
//  Ckesalth "petróleo EM CHAMAS" → grupos oilfire nos oilpools
export const SCENE_MIN = Object.freeze({
  ARUKHEEA: Object.freeze({ sharkfin: 2 }),
  CKESALTH: Object.freeze({ oilfire: 2 }),
});

// Mapa W# → chave de cenário no runtime
export const SCENARIO_KEY = Object.freeze({ CIGKV: 'CIGKV', W1: 'BARBURHEN', W2: 'PRIADUS', W3: 'CKESALTH', W4: 'ARUKHEEA' });

// Contrato ACÚSTICO por mundo (Fase 48) — a identidade sonora de cada Mundo
// (`src/game3d/worldAudioProfiles.js`, consumida por audio3d.js) segue a MESMA
// doutrina de fidelidade da luz (Q1) e do dressing (B1): ancorada no README.
//  - labelRegex  : o rótulo acústico deve citar o substantivo canônico do
//                  README (W1 "chuva ácida"/ruínas industriais; W2 selva/
//                  esporos; W3 deserto/fumaça; W4 ilha/maré; CIGKV pátio
//                  militar do Campo de Instrução);
//  - rain        : pinado SOMENTE onde a dinâmica canônica é explícita —
//                  W1 tem chuva ácida contínua (rain alto); W3 é o Deserto
//                  das Almas Esquecidas (zero chuva); CIGKV é campo aberto
//                  de instrução (zero chuva). W2 (neblina de esporos) e W4
//                  (tsunami/maré) NÃO têm semântica de chuva no README —
//                  não pinado (a auditoria não inventa regra que o cânon
//                  não declara).
export const AUDIO_CONTRACT = Object.freeze({
  CIGKV: Object.freeze({ labelRegex: /p(á|a)tio militar|campo de instru/i, rain: Object.freeze({ max: 0 }) }),
  Barburhen: Object.freeze({ labelRegex: /ru(í|i)nas industriais|chuva (á|a)cida/i, rain: Object.freeze({ min: 0.5 }) }),
  Priadus: Object.freeze({ labelRegex: /selva (ú|u)mida|esporos/i }),
  Ckesalth: Object.freeze({ labelRegex: /des(é|e)rtica|fuma(ç|c)a/i, rain: Object.freeze({ max: 0 }) }),
  Arukheea: Object.freeze({ labelRegex: /ilha|mar(é|e)/i }),
});

// ---------------------------------------------------------------------------
// 3. Motor de auditoria
// ---------------------------------------------------------------------------

function check(checks, { id, world, name, ok, detail }) {
  checks.push({ id, world, name, status: ok ? 'pass' : 'fail', detail });
}

/**
 * Roda a auditoria completa. Entradas:
 *  - readmeText        : texto bruto do README.md (fonte da verdade)
 *  - scenarios         : SCENARIOS do runtime (ou clone corrompido nos testes)
 *  - dressingCounts    : { [scenarioKey]: { builder: n } } de districtDressing
 *  - sceneCounts       : { [scenarioKey]: { builder: n } } da cena construída
 *  - lightingKeys      : chaves de LIGHTING_PROFILES (perfil dedicado = chave própria)
 *  - simSource         : texto de sim3d.js (gate da chuva ácida W1)
 *  - docs              : { f42?: string, f43?: string } textos das matrizes
 *  - sharedWorlds      : (F47) KHAAOS_WORLDS de shared/worlds.ts — contrato E2E
 *                        que anteriormente ficava de fora do portão F44 e
 *                        driftava silenciosamente para o layout pré-F42.
 *  - audio             : (F48) { worlds: WORLD_AUDIO_PROFILES, footsteps:
 *                        FOOTSTEP_PROFILES } de worldAudioProfiles.js — a
 *                        identidade acústica dos mundos sob o MESMO portão
 *                        (checks AU1–AU4).
 */
export function auditWorlds({ readmeText, scenarios, dressingCounts = {}, sceneCounts = {}, lightingKeys = [], simSource = '', docs = {}, sharedWorlds = null, audio = null }) {
  const checks = [];
  const { worlds, issues } = extractWorldsFromReadme(readmeText);
  for (const issue of issues) {
    checks.push({ id: 'README', world: '—', name: 'extração do cânon', status: 'fail', detail: issue });
  }

  for (const [wkey, canon] of Object.entries(worlds)) {
    const skey = SCENARIO_KEY[wkey];
    const sc = scenarios[skey];
    if (!sc) {
      check(checks, { id: 'S0', world: wkey, name: 'cenário existe no runtime', ok: false, detail: `SCENARIOS.${skey} ausente` });
      continue;
    }
    const worldTag = `${wkey} ${canon.world}`;

    // --- S1/S2 — setores README ↔ runtime (ida e volta) ---
    const required = [];
    const optional = [];
    for (const row of canon.sectors) {
      required.push(...row.aliases.required);
      optional.push(...row.aliases.optional);
    }
    const missing = required.filter((n) => !sc.sectorNames.includes(n));
    check(checks, {
      id: 'S1', world: worldTag, name: 'setores do README presentes no runtime', ok: missing.length === 0,
      detail: missing.length ? `faltando: ${missing.join(', ')}` : `${sc.sectorNames.length} setores cobrem ${required.length} âncoras do README`,
    });
    const allowed = new Set([...required, ...optional, ...(DOCUMENTED_PLUS[wkey] ?? [])]);
    const ungrounded = sc.sectorNames.filter((n) => !allowed.has(n));
    check(checks, {
      id: 'S2', world: worldTag, name: 'setores do runtime ancorados no README/matriz F42 (sem invenção)', ok: ungrounded.length === 0,
      detail: ungrounded.length === 0 ? 'todos os setores têm âncora canônica' : `sem âncora: ${ungrounded.join(', ')}`,
    });

    // --- D1 — dinâmica ambiental canônica ---
    const dc = DYNAMICS_CONTRACT[wkey];
    const dynOk = canon.dynamicsText && dc.pattern.test(canon.dynamicsText);
    check(checks, {
      id: 'D1', world: worldTag, name: `dinâmica canônica (${dc.type})`, ok: dynOk,
      detail: dynOk ? `README: "${canon.dynamicsText.slice(0, 80)}…"` : 'linha **Dinâmica** não encontrada ou padrão divergente',
    });
    if (wkey === 'W1') {
      // chuva ácida é id-gated NO SIM (sem survival no cenário)
      const acidOk = sc.survival === undefined
        && simSource.includes(dc.simToken)
        && simSource.includes(dc.simGate);
      check(checks, {
        id: 'D1a', world: worldTag, name: 'chuva ácida id-gated no sim (sem survival)', ok: acidOk,
        detail: acidOk ? `sim3d tem ${dc.simToken} + gate ${dc.simGate}; cenário sem survival` : 'survival deveria ser undefined e o sim precisa do gate',
      });
    } else {
      const typeOk = sc.survival?.type === dc.type;
      check(checks, {
        id: 'D1b', world: worldTag, name: `survival.type = ${dc.type}`, ok: typeOk,
        detail: typeOk ? `type=${sc.survival?.type}` : `esperado ${dc.type}, obtido ${sc.survival?.type ?? 'ausente'}`,
      });
    }

    // --- D2 — exclusividade: a dinâmica é SÓ deste mundo ---
    const leaked = Object.entries(scenarios)
      .filter(([k, other]) => k !== skey && other.survival?.type === dc.type)
      .map(([k]) => k);
    check(checks, {
      id: 'D2', world: worldTag, name: 'dinâmica exclusiva do mundo (sem vazamento)', ok: leaked.length === 0,
      detail: leaked.length ? `${dc.type} vazou para ${leaked.join(', ')}` : `${dc.type} só em ${skey}`,
    });

    // --- R1 — fecho de anel no setor canônico ---
    if (canon.closeKeyword) {
      const rc = RING_FINAL_CONTRACT[wkey];
      const ring = sc.ringFinal ?? {};
      // O README pode nomear o alvo SEM ele ser um setor (W3: "Vila Sombria"
      // existe só na linha Dinâmica) — a âncora é o nome canônico, não o
      // rótulo de setor.
      const ringOk = !!canon.dynamicsText && rc.pattern.test(canon.dynamicsText)
        && ring.name === rc.name
        && Number.isFinite(ring.x) && Number.isFinite(ring.z);
      check(checks, {
        id: 'R1', world: worldTag, name: `anel fecha em ${rc.name}`, ok: ringOk,
        detail: ringOk ? `ringFinal (${ring.x}, ${ring.z}) = setor canônico` : `esperado ${rc.name} (README), obtido ${ring.name ?? 'ausente'}`,
      });
    }

    // --- B1 — dressing canônico com densidade Free Fire ---
    const counts = dressingCounts[skey] ?? {};
    const short = Object.entries(DRESSING_MIN[skey] ?? {})
      .filter(([kind, min]) => (counts[kind] ?? 0) < min)
      .map(([kind, min]) => `${kind} ${counts[kind] ?? 0}/${min}`);
    check(checks, {
      id: 'B1', world: worldTag, name: 'dressing canônico ≥ mínimo Free Fire', ok: short.length === 0,
      detail: short.length ? `abaixo do mínimo: ${short.join(', ')}` : `${Object.keys(DRESSING_MIN[skey] ?? {}).length} builders canônicos na densidade`,
    });

    // --- B2 — extras de cena real (worldmarks/builders fora do dressing) ---
    const scene = sceneCounts[skey] ?? {};
    const shortScene = Object.entries(SCENE_MIN[skey] ?? {})
      .filter(([kind, min]) => (scene[kind] ?? 0) < min)
      .map(([kind, min]) => `${kind} ${scene[kind] ?? 0}/${min}`);
    check(checks, {
      id: 'B2', world: worldTag, name: 'extras de cena (mar/fogo) construídos', ok: shortScene.length === 0,
      detail: shortScene.length ? `abaixo do mínimo: ${shortScene.join(', ')}` : Object.keys(SCENE_MIN[skey] ?? {}).length
        ? `${Object.entries(SCENE_MIN[skey]).map(([k, m]) => `${k}≥${m}`).join(', ')} na cena`
        : 'n/a (nenhum extra canônico)',
    });

    // --- Q1/Q2 — qualidade visual (barra Free Fire/Garena) ---
    if (lightingKeys.length) {
      const dedicated = lightingKeys.includes(sc.id);
      check(checks, {
        id: 'Q1', world: worldTag, name: 'perfil de luz dedicado (F41)', ok: dedicated,
        detail: dedicated ? `LIGHTING_PROFILES['${sc.id}'] próprio` : 'caindo no perfil default (sem identidade de luz)',
      });
    }
    const paletteOk = !!sc.sky?.top && !!sc.sky?.mid && !!sc.sky?.horizon && !!sc.fogColor && !!sc.groundTint;
    check(checks, {
      id: 'Q2', world: worldTag, name: 'paleta completa (céu 3 bandas + fog + ground)', ok: paletteOk,
      detail: paletteOk ? `${sc.sky.top} / ${sc.sky.mid} / ${sc.sky.horizon}` : 'céu/fog/tint incompletos',
    });

    // --- AU2/AU3/AU4 — identidade acústica (Fase 48) ---
    // O perfil de áudio do mundo (worldAudioProfiles.js, consumido pelo
    // audio3d.setWorldAmbience) segue ancorado no README, como a luz (Q1) e o
    // dressing (B1). AU1 (cobertura global) fica fora do loop, junto dos W/X.
    if (audio) {
      const ac = AUDIO_CONTRACT[canon.world];
      const profile = audio.worlds?.[canon.world];
      if (ac && profile) {
        const labelOk = typeof profile.label === 'string' && ac.labelRegex.test(profile.label);
        check(checks, {
          id: 'AU2', world: worldTag, name: 'rótulo acústico cita substantivo canônico do README', ok: labelOk,
          detail: labelOk ? `label="${profile.label}"` : `label="${profile.label ?? 'ausente'}" não casa ${ac.labelRegex}`,
        });
        const surfaceOk = !!profile.surface && !!audio.footsteps?.[profile.surface];
        check(checks, {
          id: 'AU3', world: worldTag, name: 'superfície de passos tem perfil de footstep (fecho)', ok: surfaceOk,
          detail: surfaceOk ? `surface="${profile.surface}" ∈ FOOTSTEP_PROFILES` : `surface="${profile.surface ?? 'ausente'}" sem FOOTSTEP_PROFILES`,
        });
        if (ac.rain) {
          const rain = profile.rain;
          const rainOk = typeof rain === 'number'
            && (ac.rain.min === undefined || rain >= ac.rain.min)
            && (ac.rain.max === undefined || rain <= ac.rain.max);
          const expect = ac.rain.min !== undefined ? `≥ ${ac.rain.min}` : `= 0`;
          check(checks, {
            id: 'AU4', world: worldTag, name: `chuva coerente com a dinâmica canônica (${expect})`, ok: rainOk,
            detail: rainOk ? `rain=${rain}` : `rain=${rain} viola o cânon (${expect})`,
          });
        }
      } else {
        check(checks, {
          id: 'AU2', world: worldTag, name: 'perfil acústico existe para o mundo canônico', ok: false,
          detail: ac ? `WORLD_AUDIO_PROFILES['${canon.world}'] ausente` : `sem contrato acústico para ${canon.world}`,
        });
      }
    }
  }

  // --- W (F47) — paridade shared/worlds.ts (contrato E2E) ↔ runtime scenarios ---
  // Antes do F47, o portão F44 só auditava o runtime — `shared/worlds.ts`
  // driftou silenciosamente para o layout pré-F42 (lava no Ckesalth, tsunami no
  // Priadus, SAFE_TRAINING no CIGKV). Este bloco fecha o buraco.
  if (sharedWorlds) {
    const SHARED_WORLDS_EXPECT = Object.freeze({
      CIGKV: { hazardType: 'KHAOS_GRAVITY', subtitleRegex: /Khaaos Ville/i, biomeRegex: /Vila Militar Murada/i },
      Barburhen: { hazardType: 'ACID_RAIN', subtitleRegex: /Mundo da Destrui(ç|c)(ã|a)o/i, biomeRegex: /Urbano P(ó|o)s-Guerra/i },
      Priadus: { hazardType: 'SPORE_FOG', subtitleRegex: /Floresta da Escurid(ã|a)o/i, biomeRegex: /(Selva Densa|P(â|a)ntanos|Flora Carn(í|i)vora|Neblina)/i },
      Ckesalth: { hazardType: 'TOXIC_SMOKE', subtitleRegex: /Deserto das Almas Esquecidas/i, biomeRegex: /(Deserto|( Petr(ó|o)leo|Fuma(ç|c)a T(ó|o)xica|Areia Movedi(ç|c)a))/i },
      Arukheea: { hazardType: 'TSUNAMI_WAVE', subtitleRegex: /Ilha dos Gritos Calados/i, biomeRegex: /(Ilha Isolada|Pris(ã|a)o do Sol da Noite|Tsunami|Tubar(õ|o)es)/i },
    });
    const WORLDS_WITH_RUNTIME_SURVIVAL = new Set(['CIGKV', 'Priadus', 'Ckesalth', 'Arukheea']);

    // Map WorldId (shared/worlds.ts) → SCENARIO_KEY (runtime scenarios.js).
    // SCENARIO_KEY é keyed por W1..W4 (não por Barburhen/Priadus/etc.), então
    // precisamos de um mapa direto WorldId → scenarioKey.
    const SHARED_WORLD_TO_SCENARIO_KEY = Object.freeze({
      CIGKV: 'CIGKV',
      Barburhen: 'BARBURHEN',
      Priadus: 'PRIADUS',
      Ckesalth: 'CKESALTH',
      Arukheea: 'ARUKHEEA',
    });

    for (const [worldId, expect] of Object.entries(SHARED_WORLDS_EXPECT)) {
      const skey = SHARED_WORLD_TO_SCENARIO_KEY[worldId];
      const sc = scenarios[skey];
      const w = sharedWorlds[worldId];
      const worldTag = `${worldId} ${sc?.id ?? '—'}`;

      // W1 — hazard.type paridade
      if (w?.hazard?.type) {
        const hazardOk = w.hazard.type === expect.hazardType;
        check(checks, {
          id: 'W1', world: worldTag, name: `shared/worlds.ts hazard.type = ${expect.hazardType}`, ok: hazardOk,
          detail: hazardOk ? `type=${w.hazard.type}` : `esperado ${expect.hazardType}, obtido ${w.hazard.type}`,
        });
      } else {
        check(checks, { id: 'W1', world: worldTag, name: `shared/worlds.ts hazard.type = ${expect.hazardType}`, ok: false, detail: 'entrada KHAAOS_WORLDS ausente ou sem hazard' });
      }

      // W2 — runtime survival.type paridade (Barburhen é exceção — id-gated no sim3d)
      if (WORLDS_WITH_RUNTIME_SURVIVAL.has(worldId)) {
        const runtimeOk = sc?.survival?.type === expect.hazardType;
        check(checks, {
          id: 'W2', world: worldTag, name: `runtime survival.type paridade com shared/worlds.ts`, ok: runtimeOk,
          detail: runtimeOk ? `type=${sc.survival.type} ↔ shared/worlds.ts` : `runtime="${sc?.survival?.type}", shared="${w?.hazard?.type}"`,
        });
      } else {
        // Barburhen: runtime tem survival undefined (chuva ácida id-gated no sim3d)
        const okBarb = sc?.survival === undefined;
        check(checks, {
          id: 'W2', world: worldTag, name: `runtime survival ausente (chuva ácida id-gated no sim3d)`, ok: okBarb,
          detail: okBarb ? 'sobrevivência undefined; hazard conceitual ACID_RAIN em shared/worlds.ts' : `runtime survival="${sc?.survival?.type}" deveria ser undefined`,
        });
      }

      // W3 — configRevision pinned
      const revOk = w?.configRevision === 'f42-2026-11-02';
      check(checks, {
        id: 'W3', world: worldTag, name: 'configRevision pinned em f42-2026-11-02', ok: revOk,
        detail: revOk ? `rev=${w.configRevision}` : `esperado "f42-2026-11-02", obtido "${w?.configRevision ?? 'ausente'}"`,
      });

      // W4 — biome contém keyword canônica do README
      const biomeOk = !!w?.biome && expect.biomeRegex.test(w.biome);
      check(checks, {
        id: 'W4', world: worldTag, name: 'biome contém keyword canônica do README', ok: biomeOk,
        detail: biomeOk ? `"${w.biome.slice(0, 60)}…"` : `biome="${w?.biome ?? 'ausente'}" não casa ${expect.biomeRegex}`,
      });

      // W5 — subtitle contém nome canônico do README
      const subOk = !!w?.subtitle && expect.subtitleRegex.test(w.subtitle);
      check(checks, {
        id: 'W5', world: worldTag, name: 'subtitle contém nome canônico do README', ok: subOk,
        detail: subOk ? `"${w.subtitle}"` : `subtitle="${w?.subtitle ?? 'ausente'}" não casa ${expect.subtitleRegex}`,
      });
    }

    // W6 — nenhum hazard.type é VOLCANIC_LAVA ou SAFE_TRAINING (não-cânon F42)
    const forbidden = ['VOLCANIC_LAVA', 'SAFE_TRAINING'];
    const badWorlds = Object.entries(sharedWorlds)
      .filter(([, w]) => forbidden.includes(w?.hazard?.type))
      .map(([id]) => id);
    check(checks, {
      id: 'W6', world: 'GLOBAL', name: 'nenhum hazard.type é VOLCANIC_LAVA ou SAFE_TRAINING (não-cânon F42)', ok: badWorlds.length === 0,
      detail: badWorlds.length ? `tokens proibidos em ${badWorlds.join(', ')}` : 'todos os 5 mundos usam hazards canônicos F42',
    });

    // W7 — 5 mundos cobertos
    const expectedCount = Object.keys(SHARED_WORLDS_EXPECT).length;
    const actualCount = Object.keys(sharedWorlds).length;
    check(checks, {
      id: 'W7', world: 'GLOBAL', name: `shared/worlds.ts cobre os ${expectedCount} mundos canônicos`, ok: actualCount === expectedCount,
      detail: actualCount === expectedCount ? `${actualCount}/${expectedCount} mundos` : `esperado ${expectedCount}, obtido ${actualCount}`,
    });
  }

  // --- AU1 (F48) — cobertura acústica EXATA: o mapa de perfis cobre os 5
  // mundos canônicos e nada mais (nem mundo inventado, nem mundo faltando).
  if (audio) {
    const canonical = new Set(['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']);
    const keys = new Set(Object.keys(audio.worlds ?? {}));
    const extra = [...keys].filter((k) => !canonical.has(k));
    const missing = [...canonical].filter((k) => !keys.has(k));
    check(checks, {
      id: 'AU1', world: 'GLOBAL', name: 'perfis acústicos cobrem exatamente os 5 mundos canônicos', ok: extra.length === 0 && missing.length === 0,
      detail: extra.length ? `mundo sem cânon: ${extra.join(', ')}` : missing.length ? `mundo canônico sem perfil: ${missing.join(', ')}` : '5/5 mundos com identidade sonora',
    });
  }

  // --- X1 — não-cânon erradicado (lições F42) ---
  const lavaWorlds = Object.values(scenarios).filter((s) => s.survival?.type === 'VOLCANIC_LAVA').map((s) => s.id);
  check(checks, {
    id: 'X1', world: 'GLOBAL', name: 'erupção de lava não é cânon de nenhum mundo', ok: lavaWorlds.length === 0,
    detail: lavaWorlds.length ? `VOLCANIC_LAVA em ${lavaWorlds.join(', ')}` : 'nenhum cenário com survival de lava',
  });
  const typoWorlds = Object.values(scenarios).filter((s) => /Khaoos/i.test(s.mapLabel ?? '')).map((s) => s.id);
  check(checks, {
    id: 'X2', world: 'GLOBAL', name: 'typo regressivo "Khaoos" erradicado', ok: typoWorlds.length === 0,
    detail: typoWorlds.length ? `typo em ${typoWorlds.join(', ')}` : 'mapLabel do CIGKV = "Khaaos Ville"',
  });

  // --- DOC — matrizes de auditoria versionadas citam os mundos do escopo ---
  // F42 = matriz completa (5 mundos); F43 = detalhes W1–W4 (CIGKV fora do
  // escopo da fase — o campo de instrução não recebeu builders novos).
  const DOC_EXPECT = {
    f42: ['Khaaos Ville', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'],
    f43: ['Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'],
  };
  for (const [id, text] of Object.entries(docs)) {
    const expect = DOC_EXPECT[id];
    if (!expect) continue;
    const cited = expect.filter((n) => text.includes(n));
    check(checks, {
      id: `DOC-${id.toUpperCase()}`, world: 'GLOBAL', name: `matriz de auditoria ${id} cobre o escopo (${expect.length} mundos)`, ok: cited.length === expect.length,
      detail: cited.length === expect.length ? `${expect.length}/${expect.length} mundos citados` : `citados: ${cited.join(', ') || 'nenhum'}`,
    });
  }

  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };
  return { ok: summary.fail === 0, summary, checks };
}

/** Renderiza o relatório em Markdown (para artifacts/audit-fidelity.md). */
export function renderReport(report) {
  const lines = [
    '# Auditoria de Fidelidade — Mundos ↔ README',
    '',
    `Veredito: **${report.ok ? 'FIEL ✅' : 'DISCREPÂNCIAS ❌'}** — ${report.summary.pass} checks OK, ${report.summary.fail} falhas`,
    '',
    '| Check | Mundo | Verificação | Status | Detalhe |',
    '|---|---|---|---|---|',
  ];
  for (const c of report.checks) {
    lines.push(`| ${c.id} | ${c.world} | ${c.name} | ${c.status === 'pass' ? '✅' : '❌'} | ${c.detail.replaceAll('|', '\\|')} |`);
  }
  lines.push('', '> Instrumento F44: lê o README ao vivo e cruza com o runtime — qualquer deriva de fidelidade quebra o CI.', '');
  return lines.join('\n');
}
