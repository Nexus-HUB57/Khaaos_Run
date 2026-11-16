// Khaaos Run — Fase 57: CORPO HUMANO REALISTA EM JOGO (rigs GLB Tripo).
//
// Problema eliminado por este módulo: os rigs realistas (GLB, esqueleto Mixamo
// de 23 joints) existiam apenas na VITRINE do menu e atrás de `?avatar=` — em
// partida o jogador e todos os atores seguiam no CORPO PROCEDURAL antigo
// (blocos/insígnias com senoides) — o "avatar robotizado" da era Fase 9.
//
// Solução end-to-end: o GLB humano passa a ser o corpo PADRÃO de TODOS os
// atores em jogo (jogador em 3ª pessoa + bots + remotos), com:
//   • LOCOMOÇÃO HUMANA fase-travada (gait.js): walk/run são amostrados pela
//     FASE da passada (metros percorridos), não pelo relógio — os pés do clip
//     aterrisam onde o corpo chega (zero patinação, herdando F42);
//   • BLEND por peso EWMA idle↔walk↔run (suave, sem pop);
//   • MIRA procedural aditiva (spine1/spine2 + cabeça) sobre o mixer;
//   • AGACHAMENTO (hips abaixam + tronco inclina), QUEDA LIVRE (pose espalhada),
//     RASTEJO DBNO (deitado arrastando braços) e MORTE (relaxa, caído assenta);
//   • ARMA SOLDADA NA MÃO DIREITA por frame (bone world → arma), mantendo o
//     grip no punho do corpo REAL (fim da arma no corpo procedural invisível);
//   • FALLBACK DOCTRINE (hero3d/avatars3d): qualquer falha de load/rig → o
//     chamador mantém createOperative() procedural — o boot NUNCA quebra.
//
// Retarget implícito: TODOS os rigs Tripo compartilham o MESMO esqueleto
// (nomes `mixamorig:*`, 23 joints) — os clips do animated-avatar-m-01
// (idle/walk/run) rebinam diretamente nos demais rigs (binding por NOME).
//
// Headless-safe: THREE puro + boneMap PURA (aceita nós fake em testes);
// determinístico (zero Math.random); importável por node --test.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { avatarById, loadAvatarGlb, normalizeAvatarScale, fitAvatarToGround } from './avatars3d.js';
import { ewma } from './gait.js';

// Rigs com ESQUELETO real (animated ou rigged) — elegíveis para gameplay.
// Estáticos (T/A-pose sem skin) ficam de fora: corpo que não anima regrediria.
export const HUMANOID_AVATAR_POOL = Object.freeze([
  'animated-avatar-m-01',  // clips embutidos (idle/run/shoot/walk/standing_relax)
  'rigged-avatar-m-01',
  'rigged-avatar-m-02',
  'rigged-avatar-m-04',
  'rigged-avatar-f-01',
  'rigged-avatar-f-03',
]);

// GLB-fonte dos CLIPS de locomoção (o único tier animated do lote).
export const HUMANOID_CLIP_SOURCE = 'animated-avatar-m-01';

// Escape hatch explícito p/ ?avatar=: mantém o corpo procedural legado.
export const LEGACY_BODY_IDS = Object.freeze(['legacy', 'off', '0', 'none']);

// hash determinístico de string → índice do pool (mesmo esquema do repo:
// charCodeAt ponderado, sem Math.random).
export function pickAvatarForActor(seed) {
  const s = String(seed ?? 'khaaos');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUMANOID_AVATAR_POOL[h % HUMANOID_AVATAR_POOL.length];
}

/**
 * Resolve o avatar de GAMEPLAY de um ator:
 *  • override em LEGACY_BODY_IDS → null (corpo procedural legado, escape hatch);
 *  • override ∈ pool (rigged/animated) → o override;
 *  • override estático/inválido → null (não anima: procedural assume);
 *  • sem override → determinístico pelo seed do ator.
 */
export function resolveGameplayAvatar(overrideId, seed) {
  if (overrideId != null && overrideId !== '') {
    const id = String(overrideId);
    if (LEGACY_BODY_IDS.includes(id.toLowerCase())) return null;  // escape hatch
    if (HUMANOID_AVATAR_POOL.includes(id)) return id;             // escolha explícita
    return null; // estático/inválido p/ gameplay (não anima) → procedural
  }
  return pickAvatarForActor(seed);
}

// boneMap PURA: atravessa .children e normaliza nomes `mixamorig:Xxx` →
// chave minúscula sem prefixo (hips, spine, spine1, spine2, neck, head,
// leftshoulder…, righthand…). NÃO usa THREE — testável com nós fake.
const BONE_KEYS = [
  'hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'leftshoulder', 'leftarm', 'leftforearm', 'lefthand',
  'rightshoulder', 'rightarm', 'rightforearm', 'righthand',
  'leftupleg', 'leftleg', 'leftfoot', 'lefttoebase',
  'rightupleg', 'rightleg', 'rightfoot', 'righttoebase',
];
export function normalizeBoneName(name) {
  return String(name ?? '')
    .replace(/^mixamorig:?/i, '')
    .replace(/[\s_]/g, '')
    .toLowerCase();
}
export function boneMap(root) {
  const map = {};
  const walk = (node) => {
    const key = normalizeBoneName(node?.name);
    if (key && BONE_KEYS.includes(key) && !map[key]) map[key] = node;
    const kids = node?.children ?? [];
    for (const c of kids) walk(c);
  };
  walk(root);
  return Object.keys(map).length ? map : null;
}

/**
 * Pesos de locomoção PUROS por speedNorm (0..1.25):
 *   idle domina perto de 0, walk é o regime de transição, run assume no sprint.
 * Somam ≈1 (fallback walk cobre a lacuna entre fade-out do idle e fade-in do run).
 */
export function locomotionWeights(speedNorm) {
  const sn = Math.max(0, Math.min(1.25, Number.isFinite(speedNorm) ? speedNorm : 0));
  const wIdle = Math.max(0, 1 - sn / .3);
  const wRun = Math.max(0, (sn - .62) / .3);
  const wWalk = Math.max(0, Math.min(1, 1 - wIdle - wRun));
  const sum = wIdle + wWalk + wRun;
  return {
    idle: wIdle / sum,
    walk: wWalk / sum,
    run: wRun / sum,
  };
}

// Fase (rad, cresce sem limite) → tempo do clip (s): (phase % 2π)/2π · duração.
// Um ciclo de passada = 2π de fase (2 passos) — o clip anda EXATAMENTE junto
// do deslocamento real (gait.js), com wrap estável.
export function phaseLockedTime(phase, duration) {
  if (!Number.isFinite(duration) || duration <= 1e-6) return 0;
  const p = Number.isFinite(phase) ? Math.max(0, phase) : 0;
  return ((p % (2 * Math.PI)) / (2 * Math.PI)) * duration;
}

// Fase 60 — REALISMO DE MOVIMENTO HUMANO (funções PURAS + integração):
//   • leanPitch — inclinação do tronco pela ACELERAÇÃO (arrancada/freada),
//     que o relógio sozinho nunca dá; zero em cruzeiro, ±0.2 rad nos picos;
//   • headYawClamp — arco de rotação de cabeça seguro (±0.85 rad, sem exorcismo);
//   • strideCadenceScale — cadência por sexo do rig (perna mais curta = passo
//     mais frequente): F 1.06, M 1.0 — variedade humana sem quebrar o pé-planta.
export function leanPitch(accel, speedNorm = 0) {
  const a = Math.max(-1, Math.min(1, Number.isFinite(accel) ? accel : 0));
  const sn = Math.max(0, Math.min(1.25, Number.isFinite(speedNorm) ? speedNorm : 0));
  const speedGate = Math.min(1, sn / .55);           // parado não inclina
  return a * .2 * speedGate;
}
export function headYawClamp(yaw) {
  const y = Number.isFinite(yaw) ? yaw : 0;
  return Math.max(-.85, Math.min(.85, y));
}
export function strideCadenceScale(sex) {
  return String(sex ?? 'M').toUpperCase() === 'F' ? 1.06 : 1;
}

// Rest pose capturada na criação (quaternion/position de cada bone) — a morte
// relaxa para ela e a ressurreição restaura, determinístico.
function captureRest(bones) {
  const rest = {};
  for (const [k, b] of Object.entries(bones)) {
    rest[k] = {
      q: b.quaternion ? b.quaternion.clone() : null,
      p: b.position ? b.position.clone() : null,
    };
  }
  return rest;
}
export { captureRest };
function restoreRest(bones, rest) {
  for (const [k, b] of Object.entries(bones)) {
    const r = rest[k];
    if (!r) continue;
    if (b.quaternion && r.q) b.quaternion.copy(r.q);
    if (b.position && r.p) b.position.copy(r.p);
  }
}

// cache: mesma PROMISE do asset (loadAvatarGlb) + clips resolvidos por id.
const clipCache = new Map();
async function clipsForAvatar(avatarId) {
  if (clipCache.has(avatarId)) return clipCache.get(avatarId);
  const promise = (async () => {
    const asset = await loadAvatarGlb(avatarId);
    if (!asset?.root) return null;
    let clips = asset.clips ?? [];
    let clipRoot = asset.root;                 // rig que AUTOROU os clips
    if (!clips.length && avatarId !== HUMANOID_CLIP_SOURCE) {
      const src = await loadAvatarGlb(HUMANOID_CLIP_SOURCE); // retarget por NOME
      if (src?.clips?.length) { clips = src.clips; clipRoot = src.root; }
    }
    const rest = hipsRestTranslation(clipRoot); // Task 65 — translação de bind p/ in-place
    const byName = (rx) => {
      const c = clips.find((c) => c.name.toLowerCase() === rx) ?? null;
      return c ? stripClipRootMotion(c, rest) : null;
    };
    return Object.freeze({
      idle: byName('idle'),
      walk: byName('walk'),
      run: byName('run'),
      shoot: byName('shoot'),
    });
  })();
  clipCache.set(avatarId, promise);
  return promise;
}
export function resetHumanoidClipCache() { clipCache.clear(); }

// Os clips Tripo/Mixamo apontam para nós `mixamorig:Xxx`, mas o PARSED PATH do
// three.js trata `mixamorig:` como DIRETÓRIO do track (parsedPath.nodeName = 'Hips')
// — o binding procura o bone `Hips` e NUNCA acha `mixamorig:Hips` (warning
// "No target node found" + rig congelado, inclusive na vitrine Fase 56). O clone
// do corpo humano renomeia os bones (strip do prefixo) para o binding por NOME
// funcionar em TODOS os rigs — o boneMap canônico aceita as duas formas.
const MIXAMORIG_PREFIX = 'mixamorig:';
export function stripMixamorigPrefix(root) {
  root.traverse((n) => {
    if (typeof n.name === 'string' && n.name.startsWith(MIXAMORIG_PREFIX)) {
      n.name = n.name.slice(MIXAMORIG_PREFIX.length);
    }
  });
  return root;
}

// ----------------------------------------------------------------------------------
// Task 65 — CALIBRAÇÃO CANÔNICA (orientação, bind-frame e root motion)
// ----------------------------------------------------------------------------------
// 1. ORIENTAÇÃO: rigs Tripo/Mixamo exportados olham +X no espaço do clone
//    (medido: T-pose abre os braços ao longo de ±Z → frente = ±X; face
//    confirmada em −X pós-flip π → original +X); o jogo inteiro assume modelo
//    olhando −Z (Task 62). O clone nasce girado π/2 num PIVÔ limpo
//    (rotation.y = 0 gerido pelo animateHumanoid) — quem "vê" o corpo (arma,
//    câmera TPS, poses em espaço do pivô) herda a convenção correta sem
//    recalcular constantes.
export const HUMANOID_MODEL_YAW = Math.PI / 2;

// 2. FRAME DE BIND: eixos LOCAIS dos bones Tripo são não-padronizados (medido:
//    coluna yawada ~90°, braços/pernas ~175° vs eixos canônicos Mixamo). Captura
//    o frame MUNDIAL de cada bone no espaço do PIVÔ (bind pose, pós-flip) — as
//    poses aditivas passam a ser escritas em SEMÂNTICA DO CORPO (pitch de mira,
//    flexão de joelho) e convertidas ao espaço do bone por conjugação.
function captureBindFrames(root, bones) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bind = { q: {}, p: {}, l: {}, s: {} };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const [k, bone] of Object.entries(bones)) {
    bone.updateWorldMatrix(true, false);
    m.multiplyMatrices(rootInv, bone.matrixWorld);
    m.decompose(pos, q, scl);
    bind.q[k] = q.clone();
    bind.p[k] = pos.clone();
    bind.l[k] = bone.quaternion.clone(); // quat LOCAL no bind (fórmulas exatas)
    // escala ACUMULADA do bone (o normalizeAvatarScale escala o clone inteiro —
    // filhos do bone herdam ×1.8: gear/cosméticos/arma nasciam GIGANTES e Δ de
    // posição (agachamento) amplificava — tudo que entra no bone divide por s)
    bind.s[k] = Math.max(1e-6, Math.abs(scl.x));
  }
  return bind;
}

// Eixos canônicos (espaço do pivô: −Z frente, +Y cima).
const ROOT_AXES = Object.freeze({
  x: Object.freeze(new THREE.Vector3(1, 0, 0)),
  y: Object.freeze(new THREE.Vector3(0, 1, 0)),
  z: Object.freeze(new THREE.Vector3(0, 0, 1)),
});
const _tmpV = new THREE.Vector3();

/** Δ de rotação expresso no CORPO (pivô: x=pitch, y=yaw, z=roll) → quaternion
 * NO ESPAÇO DO BONE para PREMULTIPLICAR após o mixer. Fórmula exata para
 * QUALQUER pose corrente do clip: C = bindL·bindQ⁻¹·Δ·bindQ·bindL⁻¹ — o Δ
 * mundial resultante é exatamente a rotação pedida no corpo. Sem frame de
 * bind (corpos fake de teste) → multiplicação canônica direta. */
export function addRootRot(entry, key, axis, angle) {
  const b = entry?.bones?.[key];
  if (!b?.quaternion || !Number.isFinite(angle) || !angle) return null;
  const qDes = new THREE.Quaternion().setFromAxisAngle(ROOT_AXES[axis] ?? ROOT_AXES.x, angle);
  const bindQ = entry.bind?.q?.[key];
  const bindL = entry.bind?.l?.[key];
  if (!bindQ || !bindL) return qDes;
  return bindL.clone().multiply(bindQ.clone().invert()).multiply(qDes).multiply(bindQ).multiply(bindL.clone().invert());
}

/** Aplica Δ de rotação em semântica do corpo (aditivo sobre o pose do mixer). */
export function applyAddRot(entry, key, axis, angle) {
  const q = addRootRot(entry, key, axis, angle);
  if (q) entry.bones[key].quaternion.premultiply(q);
}

/** Pose ABSOLUTA em semântica do corpo (Euler no espaço do pivô): após a
 * aplicação, a orientação MUNDIAL do bone é exatamente o Euler pedido
 * (local = bindL·bindQ⁻¹·desEjo). Substitui o que o clip pôs no bone — mesma
 * semântica dos sets absolutos das poses knocked/air/dead do rig procedural. */
export function applySetRot(entry, key, rx = 0, ry = 0, rz = 0) {
  const b = entry?.bones?.[key];
  if (!b?.quaternion) return;
  const qDes = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  const bindQ = entry.bind?.q?.[key];
  const bindL = entry.bind?.l?.[key];
  b.quaternion.copy(bindQ && bindL
    ? bindL.clone().multiply(bindQ.clone().invert()).multiply(qDes)
    : qDes);
}

/** Δ de POSIÇÃO em metros do corpo (pivô) → Δ no espaço local do bone
 * (compensando a escala acumulada do bone — Task 65). */
export function addRootVec(entry, key, dx, dy, dz) {
  const bindQ = entry.bind?.q?.[key];
  const bindS = entry.bind?.s?.[key] ?? 1;
  const v = _tmpV.set(dx / bindS, dy / bindS, dz / bindS);
  if (!bindQ) return v.clone();
  return v.applyQuaternion(bindQ.clone().invert()).clone();
}

/** Ancora um Object3D num bone com POSIÇÃO/ORIENTAÇÃO/ESCALA em metros do
 * corpo (espaço do pivô, −Z frente): gear e cosméticos seguem o bone animado
 * mas nascem no lugar certo e no tamanho certo INDEPENDENTE dos eixos e da
 * escala acumulada do rig. `pos` é ABSOLUTA no corpo por padrão; `rel: true`
 * interpreta pos como OFFSET do bind do bone (segue o drift do esqueleto —
 * cabeça/colete/mochila). `scale` multiplica o tamanho autoral.
 * Retorna true quando aplicado (bone/frame existentes). */
export function placeOnBone(entry, key, obj, { pos = [0, 0, 0], quat = null, scale = 1, rel = false } = {}) {
  const b = entry?.bones?.[key];
  if (!b || !obj?.isObject3D) return false;
  const bindQ = entry.bind?.q?.[key];
  const bindP = entry.bind?.p?.[key];
  const bindS = entry.bind?.s?.[key] ?? 1;
  if (!bindQ || !bindP) return false;
  if (rel) _tmpV.set(bindP.x + (pos[0] ?? 0), bindP.y + (pos[1] ?? 0), bindP.z + (pos[2] ?? 0));
  else _tmpV.set(pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0);
  _tmpV.sub(bindP);
  obj.position.copy(_tmpV.divideScalar(bindS).applyQuaternion(bindQ.clone().invert()));
  obj.quaternion.copy(bindQ.clone().invert());
  if (quat) obj.quaternion.multiply(quat);
  obj.scale.divideScalar(bindS).multiplyScalar(scale); // tamanho autoral em metros
  return true;
}

// 3. ROOT MOTION: os clips walk/run/shoot do lote Tripo vêm com o deslocamento
//    do autor EMBUTIDO na translação de Hips (medido: ~2.9 m por ciclo de run
//    num eixo lateral do corpo) — reproduzidos fase-travados, o corpo desliza
//    e "teleporta" no wrap do clip. A conversão in-place zera o deslocamento
//    líquido: Hips volta à translação de BIND (constante), mantendo rotações.
export function hipsRestTranslation(assetRoot) {
  const hips = boneMap(assetRoot)?.hips;
  return hips?.position
    ? [hips.position.x, hips.position.y, hips.position.z]
    : [0, 0, .5];
}
export function stripClipRootMotion(clip, restTranslation) {
  if (!clip || !restTranslation) return clip;
  let touched = false;
  for (let i = 0; i < clip.tracks.length; i++) {
    const t = clip.tracks[i];
    if (!/\.position$/.test(t.name)) continue;
    if (!/^mixamorig:?Hips\.position$|^Hips\.position$/i.test(t.name)) continue;
    // deriva líquida POR COMPONENTE (max−min de cada eixo) acima do ruído de
    // bob → root motion (misturar componentes daria falso positivo no idle)
    let range = 0;
    for (let c = 0; c < 3; c++) {
      let mn = Infinity, mx = -Infinity;
      for (let k = 0; k < t.times.length; k++) {
        const v = t.values[k * 3 + c];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      range = Math.max(range, mx - mn);
    }
    if (range < .25) continue;                 // bob legítimo (idle) — mantém
    const [x, y, z] = restTranslation;
    const times = [0, t.times[t.times.length - 1] || clip.duration || 1];
    clip.tracks[i] = new THREE.VectorKeyframeTrack(t.name, times, [x, y, z, x, y, z]);
    touched = true;
  }
  return touched ? clip : clip;
}

/**
 * Cria o corpo humanoide de um ator. Retorna null em QUALQUER falha
 * (id inválido, rede, rig sem hips, tier estático) — o chamador mantém o
 * procedural (mesma doutrina hero3d/avatars3d).
 *
 * Task 65 — SINCRONIA ESTRUTURAL (3 correções canônicas):
 *   1. ORIENTAÇÃO: os rigs Tripo olham +Z no espaço local do clone, mas o
 *      jogo assume modelo olhando −Z (convenção do procedural, Task 62). O
 *      clone entra GIRADO π num PIVÔ (entry.root) — o pivô fica limpo
 *      (rotation.y = 0 gerido pelo animateHumanoid) e todo o espaço-local do
 *      pivô passa a valer a convenção −Z: poseWeaponReady, lean de curva e
 *      morte herdam os sinais corretos sem recalcular constantes.
 *   2. FRAME DE BIND: os eixos LOCAIS dos bones dos rigs Tripo são
 *      não-padronizados (coluna yawada ~90°, braços ~175° vs Mixamo) — poses
 *      aditivas em rotação de Euler bone-local giravam o tronco em vez de
 *      inclinar. O frame MUNDIAL de bind de cada bone (no espaço do pivô) é
 *      capturado aqui e as poses passam por conjugação (bind⁻¹·Δ·bind),
 *      devolvendo semântica física real: pitch de mira inclina, joelho dobra.
 *   3. GEAR/COSMÉTICOS: same frame resolve o encaixe por ROOT-space (ver
 *      placeOnBone/syncHumanoidGear/humanoidCosmetics3d).
 */
export async function createHumanoidBody({ avatarId } = {}) {
  const spec = avatarById(avatarId);
  if (!spec || spec.tier === 'static') return null;
  const asset = await loadAvatarGlb(avatarId);
  if (!asset?.root) return null;
  if (!boneMap(asset.root)?.hips) return null; // rig inesperado → procedural
  const clone = skeletonClone(asset.root); // clone skinned correto (bones próprios)
  clone.name = `humanoid_body_${avatarId}`;
  stripMixamorigPrefix(clone);                 // binding dos clips por NOME (see acima)
  clone.rotation.y = HUMANOID_MODEL_YAW;       // rigs Tripo olham +Z → pivô expõe −Z
  normalizeAvatarScale(clone);
  fitAvatarToGround(clone);
  clone.traverse((n) => {
    if (n.isMesh || n.isSkinnedMesh) { n.castShadow = true; n.receiveShadow = true; }
    if (n.isObject3D) n.userData.avatarAsset = avatarId; // exclusão das rotinas de ocultação
  });
  // pivô limpo: rotation.y = 0 (animateHumanoid gerencia x/z); o π vive no clone
  const root = new THREE.Group();
  root.name = `humanoid_${avatarId}`;
  root.add(clone);
  // Task 64 — BONES DO CLONE (correção estrutural): boneMap(asset.root)
  // devolvia os nós do ASSET EM CACHE — desanexados da cena. Poses de mira/
  // agachamento, solda da arma (weldWeaponToHand) e gear (syncHumanoidGear)
  // mutavam nós INVISÍVEIS enquanto o clone animado seguia em jogo: arma
  // "flutuando", gear sumido, mira sem resposta do corpo. O boneMap agora
  // atravessa o CLONE que realmente entra na cena.
  const bones = boneMap(clone);
  if (!bones?.hips) return null;               // clone sem rig → procedural
  const bind = captureBindFrames(root, bones); // Task 65 — frames de bind (espaço do pivô)
  const clips = await clipsForAvatar(avatarId);
  const mixer = new THREE.AnimationMixer(clone);
  const mk = (clip) => {
    if (!clip) return null;
    const a = mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    a.paused = true;                            // fase-travada: o tempo é setado por frame
    return a;
  };
  const actions = { idle: mk(clips.idle), walk: mk(clips.walk), run: mk(clips.run) };
  if (!actions.idle && !actions.walk && !actions.run) return null; // sem animação → procedural
  // NÃO congelar: host/weaponRig/deadPose são mutados pelo attach e pelo loop
  // (módulo ESM roda em strict mode — freeze lançaria TypeError).
  return {
    kind: 'humanoid',
    avatarId,
    root,      // pivô (rotation.y limpo; convenção −Z no espaço-local)
    body: clone, // clone girado π (mesh+skeleton) — alvo do mixer
    mixer,
    actions,
    bones,
    bind,      // Task 65 — frames de bind por bone (espaço do pivô)
    rest: captureRest(bones),
    w: { idle: 1, walk: 0, run: 0 },
    deadPose: false,
    landT: 0,          // Fase 60 — impulso de aterrissagem (decai em animate)
    host: null,
    weaponRig: null,
  };
}

/**
 * Prende o corpo humanoide no operativo (playerOp ou LOD de bot):
 * oculta a MALHA procedural (arma/sombra/nameTag continuam vivas), adiciona o
 * GLB ao grupo e guarda o weaponRig p/ solda por frame. Retorna o entry.
 * Task 65 — o skip de gear agora cobre a SUBÁRVORE inteira de cada grupo
 * `gear_*`: o traverse antigo pulava só o NÓ do grupo e escondia as MALHAS
 * FILHAS — com gear pré-existente (oficiais nascem equipados), syncHumanoidGear
 * re-ancorava um grupo visível com filhos invisíveis (equipamento apagado).
 */
export function attachHumanoidToOperative(op, body) {
  if (!op?.group || !body?.root) return null;
  const keep = new Set();
  const wr = op.group.userData?.weaponRig ?? op.parts?.weaponRig;
  if (wr?.group) wr.group.traverse((o) => keep.add(o));
  if (op.parts?.shadow) op.parts.shadow.traverse((o) => keep.add(o));
  // subárvores de gear (F28): nada dentro delas pode dormir — syncHumanoidGear
  // re-ancora nos bones do corpo real e religa a visibilidade.
  const gearNodes = new Set();
  op.group.traverse((o) => {
    if (typeof o.name === 'string' && o.name.startsWith('gear_')) {
      o.traverse((c) => gearNodes.add(c));
    }
  });
  op.group.traverse((o) => {
    if (o === body.root || keep.has(o) || o.userData?.avatarAsset) return;
    if (gearNodes.has(o)) return;            // Task 65 — gear NÃO DORME (subárvore)
    if (o.isMesh || o.isSkinnedMesh) o.visible = false; // só a MALHA dorme (pivôs face etc. ok)
  });
  op.group.add(body.root);
  body.host = op;
  body.weaponRig = wr ?? null;
  return body;
}

// Poses procedurais (aplicadas APÓS mixer.update — aditivas sobre o clip).
// Task 65 — TODAS escritas em SEMÂNTICA DO CORPO (espaço do pivô: −Z frente,
// +Y cima) e convertidas ao eixo real do bone por conjugação (bind⁻¹·Δ·bind) —
// nos rigs Tripo os eixos locais dos bones NÃO são canônicos (coluna ~90°,
// braços ~175°): pitch de mira em Euler bone-local girava o tronco, joelho
// "dobra" torcia a perna. Sinais canônicos:
//   pitch +  = frente (−Z) sobe (olhar/cano sobe) · knee − = pé vai para +Z
//   roll z   = spread de braços · yaw y = virada de cabeça/corpo
function poseAim(entry, pitch, ads) {
  const p = Math.max(-1.2, Math.min(1.2, pitch || 0));
  applyAddRot(entry, 'spine1', 'x', p * .28);
  applyAddRot(entry, 'spine2', 'x', p * .34);
  applyAddRot(entry, 'head', 'x', p * .22);       // olhar acompanha a mira
  if (ads) {                                       // recuo de ombro da mira
    applyAddRot(entry, 'rightarm', 'z', -.04);
    applyAddRot(entry, 'leftarm', 'z', .04);
  }
}
function poseCrouch(entry) {
  const hips = entry.bones.hips;
  if (hips?.position) {                            // agachamento real do rig
    const d = addRootVec(entry, 'hips', 0, -.32, 0);
    hips.position.add(d);
  }
  applyAddRot(entry, 'spine2', 'x', -.28);         // tronco adianta (−Z desce)
  applyAddRot(entry, 'leftleg', 'x', -.5);         // joelhos dobram (pé → +Z)
  applyAddRot(entry, 'rightleg', 'x', -.5);
  applyAddRot(entry, 'leftfoot', 'x', .18);        // sola compensa no chão
  applyAddRot(entry, 'rightfoot', 'x', .18);
}
function poseKnocked(entry, t) {                   // deitado de costas arrastando (DBNO)
  const crawl = Math.sin(t * 5.2) * .5;
  entry.root.rotation.x = 1.15;                     // costas no chão (front −Z sobe)
  const hips = entry.bones.hips;
  if (hips?.position) hips.position.add(addRootVec(entry, 'hips', 0, .1, 0));
  applySetRot(entry, 'rightarm', 1.1 + crawl * .3, 0, 0);
  applySetRot(entry, 'leftarm', 1.1 - crawl * .3, 0, 0);
  applySetRot(entry, 'rightforearm', .5, 0, 0);
  applySetRot(entry, 'leftforearm', .5, 0, 0);
  applySetRot(entry, 'rightupleg', .55, 0, 0);
  applySetRot(entry, 'leftupleg', .55 - crawl * .12, 0, 0);
  applySetRot(entry, 'rightleg', .5, 0, 0);
  applySetRot(entry, 'leftleg', .5, 0, 0);
  applySetRot(entry, 'head', 0, Math.sin(t * 1.3) * .18, 0);
}
function poseAir(entry, t) {                       // queda livre: espalhado
  const flap = Math.sin(t * 5) * .35;
  applySetRot(entry, 'rightarm', 0, 0, -1.05 - flap * .3);
  applySetRot(entry, 'leftarm', 0, 0, 1.05 + flap * .3);
  applySetRot(entry, 'rightupleg', .5, 0, 0);
  applySetRot(entry, 'leftupleg', .35, 0, 0);
  applySetRot(entry, 'rightleg', .45, 0, 0);
  applySetRot(entry, 'leftleg', .3, 0, 0);
}
function poseDeadRelax(entry) {                    // caído: membros abrem e assentam
  applySetRot(entry, 'rightarm', 0, 0, -.55);
  applySetRot(entry, 'leftarm', 0, 0, .55);
  applySetRot(entry, 'rightforearm', .35, 0, 0);
  applySetRot(entry, 'leftforearm', .35, 0, 0);
  applySetRot(entry, 'rightupleg', .18, 0, 0);
  applySetRot(entry, 'leftupleg', .12, 0, 0);
  applySetRot(entry, 'rightleg', .22, 0, 0);
  applySetRot(entry, 'leftleg', .1, 0, 0);
  applySetRot(entry, 'head', 0, 0, .18);
}

// peso EWMA do frame — suaviza o blend e o corte de estado
function blendWeights(entry, target) {
  const a = .3;
  entry.w.idle = ewma(entry.w.idle, target.idle, a);
  entry.w.walk = ewma(entry.w.walk, target.walk, a);
  entry.w.run = ewma(entry.w.run, target.run, a);
  const s = entry.w.idle + entry.w.walk + entry.w.run || 1;
  entry.w.idle /= s; entry.w.walk /= s; entry.w.run /= s;
}

/**
 * Anima o corpo humanoide — MESMO contrato de opts de animateOperative:
 * { t, speedNorm, phase, pitch, dead, ads, crouch, knocked, air } + Fase 60:
 * { accel, yaw, armed, sex, onLand } + Task 65: { dt } (dt REAL do frame — o
 * mixer fixo 1/60 fazia o idle correr 2× a 120 fps e rastejar a 30 fps).
 * Locomoção é fase-travada (gait.js); idle anda no relógio; mira/crouch/
 * knocked/air são poses aditivas pós-mixer (em SEMÂNTICA DO CORPO, Task 65);
 * morte congela e relaxa. Fase 60: lean por aceleração no tronco, cabeça
 * segue a mira em YAW, arma em low-ready quando armada (sem ADS), squash de
 * aterrissagem e cadência por sexo. Retorna o entry (encadeável).
 */
export function animateHumanoid(entry, {
  t = 0, speedNorm = 0, phase = null, pitch = 0,
  dead = false, ads = false, crouch = false, knocked = false, air = 0,
  leanVel = 0,
  accel = 0, yaw = 0, armed = false, sex = null, onLand = false,
  dt = 1 / 60,
} = {}) {
  if (!entry?.mixer) return entry;
  if (dead) {
    if (!entry.deadPose) {
      entry.mixer.stopAllAction();
      entry.deadPose = true;
      poseDeadRelax(entry);
    }
    return entry;
  }
  if (entry.deadPose) {                     // reviveu: restaura rest e religa ações
    if (entry.rest) restoreRest(entry.bones, entry.rest);
    entry.deadPose = false;
    for (const a of Object.values(entry.actions)) {
      if (a) { a.enabled = true; a.paused = true; a.setEffectiveWeight(0); a.play(); }
    }
    entry.root.rotation.x = 0;
    entry.root.rotation.z = 0;
  }
  const sn = Math.max(0, Math.min(1.25, Number.isFinite(speedNorm) ? speedNorm : 0));
  const PH = Number.isFinite(phase) ? phase : t * 8.6;
  const CADENCE = strideCadenceScale(sex);   // Fase 60 — cadência por sexo
  // Estados especiais (rastejo/queda) CORTAM a locomoção instantaneamente —
  // são eventos abruptos (a pose procedural assume no mesmo frame); a saída
  // volta SUAVE pela EWMA (fade-in da passada). Morto congela via deadPose.
  const special = knocked || air > 0;
  if (special) {
    entry.w.idle = 0; entry.w.walk = 0; entry.w.run = 0;
  } else {
    blendWeights(entry, locomotionWeights(sn));
  }
  const setLocked = (a, w) => {
    if (!a) return;
    a.setEffectiveWeight(w);
    if (w > 0) a.time = phaseLockedTime(PH * CADENCE, a.getClip().duration); // pé planta onde o corpo chega
  };
  setLocked(entry.actions.walk, entry.w.walk);
  setLocked(entry.actions.run, entry.w.run);
  const idle = entry.actions.idle;
  if (idle) {
    idle.paused = false;                    // idle é o único no relógio (respiração)
    idle.setEffectiveWeight(entry.w.idle);
  }
  const dtMixer = Number.isFinite(dt) ? Math.max(0, Math.min(.25, dt)) : 1 / 60;
  entry.mixer.update(special ? 0 : dtMixer);
  entry.root.rotation.x = 0;               // limpa pose do frame anterior
  entry.root.rotation.z = 0;
  // ---- Task 64 — extras humanos: ABSORÇÃO de aterrissagem + LEAN de curva ----
  // dt derivado de t (determinístico); extras vivem no entry (lazy).
  const b = entry.bones;
  if (!entry.extras) entry.extras = newHumanoidExtras();
  const ex = entry.extras;
  const dtF = Number.isFinite(t) && Number.isFinite(ex.prevT) ? Math.max(0, Math.min(.1, t - ex.prevT)) : 0;
  ex.prevT = t;
  if (!special) {
    if (ex.prevAir > 0 && air <= 0) ex.landT = HUMANOID_LAND.seconds; // pousou
    if (ex.landT > 0) {
      ex.landT = Math.max(0, ex.landT - dtF);
      const k = ex.landT / HUMANOID_LAND.seconds;    // 1 no impacto → 0
      if (b.hips?.position) b.hips.position.add(addRootVec(entry, 'hips', 0, -HUMANOID_LAND.hipDrop * k, 0));
      applyAddRot(entry, 'leftleg', 'x', -HUMANOID_LAND.knee * k);   // joelho absorve (pé → +Z)
      applyAddRot(entry, 'rightleg', 'x', -HUMANOID_LAND.knee * k);
      applyAddRot(entry, 'spine2', 'x', -HUMANOID_LAND.spine * k);   // tronco adianta
    }
    // banking para dentro da curva (leanVel = rad/s do yaw, EWMA do chamador);
    // só com velocidade — parado o corpo permanece ereto.
    const leanTarget = Math.max(-2, Math.min(2, leanVel || 0)) * .5 * HUMANOID_LEAN.maxZ;
    ex.leanZ += (leanTarget - ex.leanZ) * Math.min(1, HUMANOID_LEAN.gain * Math.max(1, dtF * 60));
    entry.root.rotation.z = Math.max(-HUMANOID_LEAN.maxZ, Math.min(HUMANOID_LEAN.maxZ, ex.leanZ))
      * (speedNorm > .1 ? 1 : .25);
  } else {
    ex.leanZ = 0;
  }
  ex.prevAir = air;
  if (knocked) { poseKnocked(entry, t); return entry; }
  if (air > 0) { poseAir(entry, t); return entry; }
  poseAim(entry, pitch, ads);
  // Fase 60 — camada humana final (sobre o aim, antes do crouch):
  if (onLand && entry.landT <= 0) entry.landT = .32;   // borda de aterrissagem
  if (entry.landT > 0) {                               // squash de pouso (decai)
    const k = Math.max(0, Math.min(1, 1 - entry.landT / .32));
    if (entry.bones.hips?.position) entry.bones.hips.position.add(addRootVec(entry, 'hips', 0, -.09 * Math.sin(Math.PI * k), 0));
    entry.landT = Math.max(0, entry.landT - dtMixer);
  }
  const lean = leanPitch(accel, sn);                   // tronco responde à aceleração
  if (lean) {
    applyAddRot(entry, 'spine1', 'x', -lean * .7);     // arrancada adianta o tronco
    applyAddRot(entry, 'spine2', 'x', -lean * .5);
    applyAddRot(entry, 'head', 'x', lean * .4);        // olhos compensam
  }
  const hy = headYawClamp(yaw);                        // cabeça acompanha a mira em YAW
  if (hy) applyAddRot(entry, 'head', 'y', hy);
  if (armed && !ads) {                                 // low-ready humano (arma baixa, pronta)
    applyAddRot(entry, 'rightforearm', 'x', .42);      // antebraço dobra p/ frente
    applyAddRot(entry, 'leftforearm', 'x', .3);
  }
  if (crouch) poseCrouch(entry);
  return entry;
}

/**
 * Solda a ARMA na mão direita do corpo REAL (por frame, após animateHumanoid):
 * reparenta o weaponRig ao bone righthand (uma vez) e copia a transform de
 * mundo do bone → arma segue a animação do GLB (grip compensado p/ caber na
 * palma). Determinístico; nada aqui pode lançar.
 */
export function weldWeaponToHand(entry, weaponRig = entry?.weaponRig) {
  try {
    if (!entry?.bones?.righthand || !weaponRig?.group) return false;
    const hand = entry.bones.righthand;
    // troca de arma: o husk do rig ANTERIOR sai da mão (attachWeapon descarta
    // o mount procedural, mas o grupo antigo ficou órfão no bone do GLB).
    if (entry.weaponRig && entry.weaponRig !== weaponRig && entry.weaponRig.group?.parent === hand) {
      hand.remove(entry.weaponRig.group);
    }
    entry.weaponRig = weaponRig;
    const g = weaponRig.group;
    if (g.parent !== hand) hand.add(g);          // arma vive NA MÃO do corpo real
    // Task 65 — a escala ACUMULADA do bone (normalizeAvatarScale escala o
    // clone ×1.8) inflava a arma — a fábrica de armas entrega em metros do
    // corpo; compensa escala E offset de grip (que também é ampliado).
    hand.getWorldScale(_tmpV);
    const s = Math.max(1e-6, Math.abs(_tmpV.x));
    // transform local fixa no espaço da MÃO (a animação do bone carrega a arma;
    // a calibração HUMANOID_GRIP alinha cano à mão — ajuste visual centralizado)
    g.position.set(HUMANOID_GRIP.pos[0] / s, HUMANOID_GRIP.pos[1] / s, HUMANOID_GRIP.pos[2] / s);
    g.quaternion.setFromEuler(new THREE.Euler(HUMANOID_GRIP.rot[0], HUMANOID_GRIP.rot[1], HUMANOID_GRIP.rot[2]));
    g.scale.setScalar(1 / s);
    return true;
  } catch { return false; }
}

// offset de empunhadura da arma no espaço da MÃO mixamorig (mão ~7 cm eixo y
// aponta para os dedos; cano da arma alinha ao +y da mão). Constante única de
// calibração — ajuste visual em um lugar só.
export const HUMANOID_GRIP = Object.freeze({
  pos: Object.freeze([0, -.03, -.01]),
  rot: Object.freeze([-Math.PI / 2, 0, .12]),
});

// ----------------------------------------------------------------------------------
// Task 64 — GEAR (capacete/colete/mochila) NO CORPO REAL
// ----------------------------------------------------------------------------------
// O gear F28 ancora nos grupos PROCEDURAIS (parts.head/parts.torso), que o
// attachHumanoidToOperative ESCONDE — com o corpo GLB padrão, capacete,
// colete e mochila sumiam do jogador e dos bots. O sync abaixo RE-ANCORA os
// grupos `gear_*` nos BONES do rig real (mesh acompanha a animação) com
// calibração única por peça. Idempotente e barato: só move quando o pai mudou.
const HUMANOID_GEAR_FIT = Object.freeze({
  // Task 65 — offsets RELATIVOS ao bind do bone, em METROS DO CORPO (−Z frente,
  // +Y cima), convertidos ao espaço do bone por placeOnBone (rel: true) —
  // seguem o drift do esqueleto (medido: head em x +0.078) e compensam a
  // escala acumulada (×1.8) e os eixos não-canônicos dos rigs Tripo.
  helmet: Object.freeze({ bone: 'head', rel: true, pos: Object.freeze([0, .10, 0]), scale: .96 }),
  vest:   Object.freeze({ bone: 'spine2', rel: true, pos: Object.freeze([0, .01, -.02]), scale: 1.04 }),
  pack:   Object.freeze({ bone: 'spine1', rel: true, pos: Object.freeze([0, .04, .09]), scale: 1.02 }),
});
export const HUMANOID_GEAR_TAGS = Object.freeze({
  helmet: 'gear_helmet', vest: 'gear_vest', pack: 'gear_pack',
});

// Re-ancora (uma vez por mudança de pai) o gear procedural nos bones do GLB.
// Retorna o número de peças movidas — 0 quando nada a fazer (barato por frame).
// Upgrade de nível (applyOperativeGear recria o grupo no anchor procedural):
// a versão ANTIGA que já estava no bone é REMOVIDA aqui — sem isto o bone
// acumularia capacete/colete/mochila duplicados ao longo da partida.
export function syncHumanoidGear(body, opParts) {
  if (!body?.bones || !opParts) return 0;
  let moved = 0;
  for (const [kind, tag] of Object.entries(HUMANOID_GEAR_TAGS)) {
    const fit = HUMANOID_GEAR_FIT[kind];
    const bone = body.bones[fit.bone];
    if (!bone) continue;
    // grupo NOVO vem sempre do anchor procedural (applyOperativeGear cria lá)
    const group = opParts.head?.getObjectByName(tag)
      ?? opParts.torso?.getObjectByName(tag);
    if (!group) continue;                    // nada novo — o que está no bone segue
    // TODOS os husks antigos no bone saem (upgrades acumulam cópias órfãs
    // com o MESMO tag — getObjectByName acharia só a primeira)
    for (const child of [...bone.children]) {
      if (child !== group && child.name === tag) bone.remove(child);
    }
    if (group.parent === bone) continue;
    const anchorQuat = group.quaternion.clone(); // rotação de fábrica (fit fino)
    group.parent?.remove(group);
    bone.add(group);
    // Task 65 — encaixe em METROS DO CORPO via bind-frame (relativo ao bind do
    // bone: segue o drift do esqueleto), preservando a rotação de fábrica do
    // mesh (fábricas de gear constroem em espaço canônico).
    placeOnBone(body, fit.bone, group, { pos: fit.pos, quat: anchorQuat, scale: fit.scale, rel: fit.rel });
    // Task 65 — visibilidade da SUBÁRVORE inteira: o attach pode ter dormido
    // as malhas filhas (gear pré-existente ao attach) — religar tudo.
    group.traverse((o) => { o.visible = true; });
    group.traverse((o) => { o.userData.humanoidGear = true; }); // exclusão de ocultação
    group.userData.gearKind = kind;
    moved++;
  }
  _reconcileCosmeticGearVisibility(body);
  return moved;
}

// Task 65 — doutrina F28 no corpo GLB: capacete/colete/mochila do F28
// SUBSTITUEM o equivalente cosmético da identidade (F60) — sem isto os dois
// empilham no mesmo bone (boné laranja DENTRO do capacete balístico). A faixa
// de facção (faction_trim) permanece sempre. Roda a cada sync (attach,
// pickup e remoção de gear) — idempotente e barato.
function _reconcileCosmeticGearVisibility(body) {
  const parts = body.root?.userData?.cosmeticGroup?.userData?.cosmeticParts;
  if (!parts) return;
  for (const m of parts) {
    const a = m.userData?.cosmeticAnchor;
    if (!a) continue;
    const kind = a.bone === 'head' ? 'helmet' : (a.bone === 'spine1' ? 'pack' : 'vest');
    const f28 = body.bones[a.bone]?.children?.find((c) => c.name === HUMANOID_GEAR_TAGS[kind]);
    m.visible = !f28 || m.name === 'faction_trim';
  }
}

// ----------------------------------------------------------------------------------
// Task 64 — EMPUNHADURA DE DUAS MÃOS (suporte da mão esquerda no foregrip)
// ----------------------------------------------------------------------------------
// weldWeaponToHand solda a arma na mão DIREITA; o clip deixa a esquerda
// balançando livre — postura de tiro de uma mão só. O solver abaixo orienta o
// braço ESQUERDO ao ponto de apoio (magwell) da arma: IK fake clamped (o rig
// procedural usa a mesma técnica desde o Task 62), determinístico, aplicado
// APÓS o mixer (aditivo sobre o clip, como poseAim).
export const LEFT_HAND_SUPPORT = Object.freeze({
  reach: .56,      // envergadura útil ombro→punho (rig 1.8 m)
  maxBend: 1.25,   // flexão máxima do cotovelo (rad)
  gain: .85,       // fração da correção angular aplicada (suaviza o snap)
  maxSwing: 1.35,  // teto de rotação do úmero (rad) — nunca vira helicóptero
});

// Quaternion mundial acumulado de um nó (getWorldQuaternion exige cadeia
// atualizada — aqui o chamador garante updateWorldMatrix antes).
function _worldQuat(node, out) {
  return node ? node.getWorldQuaternion(out ?? new THREE.Quaternion()) : (out ?? new THREE.Quaternion());
}

/**
 * Orienta o braço esquerdo ao foregrip da arma soldada (empunhadura de 2 mãos).
 * Retorna true quando a pose foi aplicada. Sem arma/rig/bones → false (no-op).
 * A direção é clampada ao alcance do braço e à rotação máxima do ombro —
 * a mão NUNCA flutua longe do corpo; quando o alvo está fora de alcance o
 * cotovelo dobra no máximo e a mão aponta NA DIREÇÃO do apoio.
 */
export function poseLeftHandSupport(entry, weaponRig = entry?.weaponRig) {
  try {
    const b = entry?.bones;
    const g = weaponRig?.group;
    if (!b?.leftarm || !b.leftforearm || !g?.parent) return false;
    const magW = weaponRig.model?.magW ?? weaponRig.magW;
    const gripW = weaponRig.model?.gripW ?? weaponRig.gripW;
    if (!magW || !gripW) return false;
    // ponto de apoio em MUNDO: pos da arma + (magwell − grip) girado pela arma
    g.updateWorldMatrix(true, false);
    const wq = _worldQuat(g);
    const wp = g.getWorldPosition(new THREE.Vector3());
    const target = wp.add(magW.clone().sub(gripW).applyQuaternion(wq));
    const applied = _aimArmAt(entry, 'left', target);
    if (!applied) return false;
    // cotovelo: dobra proporcional à distância restante (mais perto = mais dobra)
    const arm = b.leftarm;
    arm.updateWorldMatrix(true, false);
    const dist = target.distanceTo(arm.getWorldPosition(new THREE.Vector3()));
    const bendK = Math.max(0, Math.min(1, 1 - dist / LEFT_HAND_SUPPORT.reach));
    b.leftforearm.rotation.x += LEFT_HAND_SUPPORT.maxBend * bendK * .55;
    return true;
  } catch { return false; }
}

// Task 64 — solver de braço compartilhado (2 mãos + postura de prontidão):
// corrige a DIREÇÃO do úmero NO ESPAÇO DO PAI do bone. A correção é
// PREMULTIPLICADA (q_parent_child' = corr · q_local) — multiplicar à direita
// aplicaria a rotação no espaço LOCAL do bone (eixos do Mixamo girados), e a
// mão nunca chegava ao apoio. Clamp angular no teto do ombro, gain suave.
function _aimArmAt(entry, side, worldTarget) {
  const b = entry.bones;
  const arm = side === 'left' ? b.leftarm : b.rightarm;
  if (!arm?.parent) return false;
  arm.updateWorldMatrix(true, false);
  const shoulderPos = arm.getWorldPosition(new THREE.Vector3());
  const dir = worldTarget.clone().sub(shoulderPos);
  const dist = dir.length();
  if (!(dist > 1e-4)) return false;
  dir.multiplyScalar(1 / dist);
  const restDir = arm.position.clone().normalize();      // eixo do braço em repouso
  const parentQ = _worldQuat(arm.parent);
  const dirLocal = dir.applyQuaternion(parentQ.clone().invert());
  const corr = new THREE.Quaternion().setFromUnitVectors(restDir, dirLocal);
  const ang = 2 * Math.acos(Math.max(-1, Math.min(1, corr.w)));
  const clamped = ang > LEFT_HAND_SUPPORT.maxSwing
    ? new THREE.Quaternion().slerp(corr, LEFT_HAND_SUPPORT.maxSwing / ang)
    : corr;
  arm.quaternion.premultiply(new THREE.Quaternion().slerp(clamped, LEFT_HAND_SUPPORT.gain));
  return true;
}

/**
 * Task 64 — POSTURA DE PRONTIDÃO do braço direito: o clip deixa a arma no
 * quadril (braço pendurado); um operativo em campo carrega a arma erguida
 * (low-ready), subindo à linha de vista em ADS e abaixando no sprint.
 * Alvo em espaço do ROOT do corpo (modelo olha −z), transformado a mundo —
 * mesmo solver do suporte esquerdo (_aimArmAt).
 */
export function poseWeaponReady(entry, { speedNorm = 0, ads = false } = {}) {
  try {
    const b = entry?.bones;
    if (!b?.rightarm || !b.rightforearm || !entry.root) return false;
    if (!entry.extras) entry.extras = newHumanoidExtras();
    const ex = entry.extras;
    // blends EWMA determinísticos (sem snap ao alternar ADS/sprint)
    ex.adsK = ewma(ex.adsK ?? 0, ads ? 1 : 0, .2);
    ex.lowK = ewma(ex.lowK ?? 0, speedNorm > 1.02 ? 1 : 0, .18);
    // alvo no espaço do root: prontidão (peito) ↔ ADS (linha de vista) ↔ sprint (low-ready)
    const p = ex.adsK, l = ex.lowK;
    const tx = .16 + .02 * l;
    const ty = 1.18 + .32 * p - .42 * l;
    const tz = -.34 - .12 * p + .18 * l;
    const target = new THREE.Vector3(tx, ty, tz).applyMatrix4(entry.root.matrixWorld);
    const ok = _aimArmAt(entry, 'right', target);
    if (!ok) return false;
    // cotovelo: arma ergida dobra o antebraço (mais em ADS, menos no sprint)
    b.rightforearm.rotation.x += .55 + .25 * p - .2 * l;
    return true;
  } catch { return false; }
}

// ----------------------------------------------------------------------------------
// Task 64 — MOVIMENTOS HUMANOS EXTRAS: lean de curva + absorção de aterrissagem
// ----------------------------------------------------------------------------------
// LEAN: corredores humanos INCLINAM o tronco para dentro da curva; o yaw vem
// do chamador (EWMA no main3d) — aqui vira banking no eixo z do corpo.
// LAND: após a queda (air>0 → 0) os joelhos ABSORVEM o impacto (~0.4 s):
// quadril desce, tronco inclina, braços abrem levemente — decai exponencial.
export const HUMANOID_LEAN = Object.freeze({ maxZ: .16, gain: .12 });
export const HUMANOID_LAND = Object.freeze({ seconds: .42, hipDrop: .16, knee: .55, spine: .18 });

// Estado inicial dos extras (mutado por animateHumanoid — determinístico).
export function newHumanoidExtras() {
  return { leanZ: 0, landT: 0, prevAir: 0, prevT: null };
}


export function resetHumanoidCache() {
  clipCache.clear();
}
