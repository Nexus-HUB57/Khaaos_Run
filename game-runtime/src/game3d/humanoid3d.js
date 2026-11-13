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
    if (!clips.length && avatarId !== HUMANOID_CLIP_SOURCE) {
      const src = await loadAvatarGlb(HUMANOID_CLIP_SOURCE); // retarget por NOME
      if (src?.clips?.length) clips = src.clips;
    }
    const byName = (rx) => clips.find((c) => c.name.toLowerCase() === rx) ?? null;
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

/**
 * Cria o corpo humanoide de um ator. Retorna null em QUALQUER falha
 * (id inválido, rede, rig sem hips, tier estático) — o chamador mantém o
 * procedural (mesma doutrina hero3d/avatars3d).
 */
export async function createHumanoidBody({ avatarId } = {}) {
  const spec = avatarById(avatarId);
  if (!spec || spec.tier === 'static') return null;
  const asset = await loadAvatarGlb(avatarId);
  if (!asset?.root) return null;
  if (!boneMap(asset.root)?.hips) return null; // rig inesperado → procedural
  const root = skeletonClone(asset.root); // clone skinned correto (bones próprios)
  root.name = `humanoid_${avatarId}`;
  stripMixamorigPrefix(root);                  // binding dos clips por NOME (see acima)
  normalizeAvatarScale(root);
  fitAvatarToGround(root);
  root.traverse((n) => {
    if (n.isMesh || n.isSkinnedMesh) { n.castShadow = true; n.receiveShadow = true; }
    if (n.isObject3D) n.userData.avatarAsset = avatarId; // exclusão das rotinas de ocultação
  });
  // Task 64 — BONES DO CLONE (correção estrutural): boneMap(asset.root)
  // devolvia os nós do ASSET EM CACHE — desanexados da cena. Poses de mira/
  // agachamento, solda da arma (weldWeaponToHand) e gear (syncHumanoidGear)
  // mutavam nós INVISÍVEIS enquanto o clone animado seguia em jogo: arma
  // "flutuando", gear sumido, mira sem resposta do corpo. O boneMap agora
  // atravessa o CLONE que realmente entra na cena.
  const bones = boneMap(root);
  if (!bones?.hips) return null;               // clone sem rig → procedural
  const clips = await clipsForAvatar(avatarId);
  const mixer = new THREE.AnimationMixer(root);
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
    root,
    mixer,
    actions,
    bones,
    rest: captureRest(bones),
    w: { idle: 1, walk: 0, run: 0 },
    deadPose: false,
    host: null,
    weaponRig: null,
  };
}

/**
 * Prende o corpo humanoide no operativo (playerOp ou LOD de bot):
 * oculta a MALHA procedural (arma/sombra/nameTag continuam vivas), adiciona o
 * GLB ao grupo e guarda o weaponRig p/ solda por frame. Retorna o entry.
 */
export function attachHumanoidToOperative(op, body) {
  if (!op?.group || !body?.root) return null;
  const keep = new Set();
  const wr = op.group.userData?.weaponRig ?? op.parts?.weaponRig;
  if (wr?.group) wr.group.traverse((o) => keep.add(o));
  if (op.parts?.shadow) op.parts.shadow.traverse((o) => keep.add(o));
  op.group.traverse((o) => {
    if (o === body.root || keep.has(o) || o.userData?.avatarAsset) return;
    // Task 64 — GEAR NÃO DORME: capacete/colete/mochila (grupos `gear_*` do
    // F28) são re-ancorados nos bones do corpo real por syncHumanoidGear —
    // esconder aqui apagaria o equipamento do jogador/bot com corpo GLB.
    if (typeof o.name === 'string' && o.name.startsWith('gear_')) return;
    if (o.isMesh || o.isSkinnedMesh) o.visible = false; // só a MALHA dorme (pivôs face etc. ok)
  });
  op.group.add(body.root);
  body.host = op;
  body.weaponRig = wr ?? null;
  return body;
}

// Poses procedurais (aplicadas APÓS mixer.update — aditivas sobre o clip):
function poseAim(entry, pitch, ads) {
  const b = entry.bones;
  const p = Math.max(-1.2, Math.min(1.2, pitch || 0));
  if (b.spine1) b.spine1.rotation.x += p * .28;
  if (b.spine2) b.spine2.rotation.x += p * .34;
  if (b.head) b.head.rotation.x += p * .22;       // olhar acompanha a mira
  if (ads) {                                       // recuo de ombro da mira
    if (b.rightarm) b.rightarm.rotation.z -= .04;
    if (b.leftarm) b.leftarm.rotation.z += .04;
  }
}
function poseCrouch(entry) {
  const b = entry.bones;
  if (b.hips?.position) b.hips.position.y -= .32;  // agachamento real do rig
  if (b.spine2) b.spine2.rotation.x += .28;
  if (b.leftleg) b.leftleg.rotation.x += .5;
  if (b.rightleg) b.rightleg.rotation.x += .5;
  if (b.leftfoot) b.leftfoot.rotation.x -= .18;
  if (b.rightfoot) b.rightfoot.rotation.x -= .18;
}
function poseKnocked(entry, t) {                   // deitado arrastando (DBNO)
  const b = entry.bones;
  const crawl = Math.sin(t * 5.2) * .5;
  entry.root.rotation.x = -1.15;                    // deita de costas (topo p/ +z)
  if (b.hips?.position) b.hips.position.y += .1;
  if (b.rightarm) b.rightarm.rotation.x = 1.1 + crawl * .3;
  if (b.leftarm) b.leftarm.rotation.x = 1.1 - crawl * .3;
  if (b.rightforearm) b.rightforearm.rotation.x = .5;
  if (b.leftforearm) b.leftforearm.rotation.x = .5;
  if (b.rightupleg) b.rightupleg.rotation.x = .55;
  if (b.leftupleg) b.leftupleg.rotation.x = .55 - crawl * .12;
  if (b.rightleg) b.rightleg.rotation.x = .5;
  if (b.leftleg) b.leftleg.rotation.x = .5;
  if (b.head) b.head.rotation.y = Math.sin(t * 1.3) * .18;
}
function poseAir(entry, t) {                       // queda livre: espalhado
  const b = entry.bones;
  const flap = Math.sin(t * 5) * .35;
  if (b.rightarm) b.rightarm.rotation.z = -1.05 - flap * .3;
  if (b.leftarm) b.leftarm.rotation.z = 1.05 + flap * .3;
  if (b.rightupleg) b.rightupleg.rotation.x = .5;
  if (b.leftupleg) b.leftupleg.rotation.x = .35;
  if (b.rightleg) b.rightleg.rotation.x = .45;
  if (b.leftleg) b.leftleg.rotation.x = .3;
}
function poseDeadRelax(entry) {                    // caído: membros abrem e assentam
  const b = entry.bones;
  if (b.rightarm) b.rightarm.rotation.z = -.55;
  if (b.leftarm) b.leftarm.rotation.z = .55;
  if (b.rightforearm) b.rightforearm.rotation.x = .35;
  if (b.leftforearm) b.leftforearm.rotation.x = .35;
  if (b.rightupleg) b.rightupleg.rotation.x = .18;
  if (b.leftupleg) b.leftupleg.rotation.x = .12;
  if (b.rightleg) b.rightleg.rotation.x = .22;
  if (b.leftleg) b.leftleg.rotation.x = .1;
  if (b.head) b.head.rotation.z = .18;
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
 * { t, speedNorm, phase, pitch, dead, ads, crouch, knocked, air }.
 * Locomoção é fase-travada (gait.js); idle anda no relógio; mira/crouch/
 * knocked/air são poses aditivas pós-mixer; morte congela e relaxa.
 * Retorna o entry (encadeável).
 */
export function animateHumanoid(entry, {
  t = 0, speedNorm = 0, phase = null, pitch = 0,
  dead = false, ads = false, crouch = false, knocked = false, air = 0,
  leanVel = 0,
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
  }
  const sn = Math.max(0, Math.min(1.25, Number.isFinite(speedNorm) ? speedNorm : 0));
  const PH = Number.isFinite(phase) ? phase : t * 8.6;
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
    if (w > 0) a.time = phaseLockedTime(PH, a.getClip().duration); // pé planta onde o corpo chega
  };
  setLocked(entry.actions.walk, entry.w.walk);
  setLocked(entry.actions.run, entry.w.run);
  const idle = entry.actions.idle;
  if (idle) {
    idle.paused = false;                    // idle é o único no relógio (respiração)
    idle.setEffectiveWeight(entry.w.idle);
  }
  entry.mixer.update(special ? 0 : Math.max(0, 1 / 60));
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
      if (b.hips?.position) b.hips.position.y -= HUMANOID_LAND.hipDrop * k;
      if (b.leftleg) b.leftleg.rotation.x += HUMANOID_LAND.knee * k;
      if (b.rightleg) b.rightleg.rotation.x += HUMANOID_LAND.knee * k;
      if (b.spine2) b.spine2.rotation.x += HUMANOID_LAND.spine * k;
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
    // transform local fixa no espaço da MÃO (a animação do bone carrega a arma;
    // a calibração HUMANOID_GRIP alinha cano à mão — ajuste visual centralizado)
    g.position.set(HUMANOID_GRIP.pos[0], HUMANOID_GRIP.pos[1], HUMANOID_GRIP.pos[2]);
    g.quaternion.setFromEuler(new THREE.Euler(HUMANOID_GRIP.rot[0], HUMANOID_GRIP.rot[1], HUMANOID_GRIP.rot[2]));
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
  helmet: Object.freeze({ bone: 'head', pos: Object.freeze([0, .055, .012]), rot: Object.freeze([0, 0, 0]), scale: .96 }),
  vest:   Object.freeze({ bone: 'spine2', pos: Object.freeze([0, .04, .012]), rot: Object.freeze([0, 0, 0]), scale: 1.04 }),
  pack:   Object.freeze({ bone: 'spine1', pos: Object.freeze([0, .02, .055]), rot: Object.freeze([0, 0, 0]), scale: 1.02 }),
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
    group.parent?.remove(group);
    bone.add(group);
    group.position.set(fit.pos[0], fit.pos[1], fit.pos[2]);
    group.rotation.set(fit.rot[0], fit.rot[1], fit.rot[2]);
    group.scale.setScalar(fit.scale);
    group.visible = true; // attach escondeu as malhas procedurais — gear volta
    group.traverse((o) => { o.userData.humanoidGear = true; }); // exclusão de ocultação
    group.userData.gearKind = kind;
    moved++;
  }
  return moved;
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
