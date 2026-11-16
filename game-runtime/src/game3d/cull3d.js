// Khaaos Run — Task 70 — POLÍTICA de culling por distância (pura, testável).
// Perfil real (sonda em jogo): 3759 meshes, ~1100 draw calls, 89% dos meshes
// além de 80 m — a cena é draw-call bound (98k tris é irrelevante; o custo é
// o submit por mesh). Este módulo decide QUEM pode ser escondido a que raio;
// o main3d executa o passe (throttle 250 ms) sobre a cena real.
// Regras de segurança: avatares/loot/grenadas/em-voo nunca (tag noCull
// propagada na raiz); céu/montanhas nunca (altura ≥ landmarkY); shells
// (casco dos prédios — skyline) só além de shellM; props de solo além de
// propM; grama além de grassM. Histerese evita piscar na fronteira.
export const CULL = Object.freeze({
  propM: 110,            // props de solo (crates/pedras/bushes anônimos)
  shellM: 320,           // casco dos prédios (landmark urbano — fog domina além)
  grassM: 90,            // tufos de grama (decoração rasteira)
  landmarkY: 18,         // acima disso = céu/montanhas — NUNCA cull
  hysteresisM: 8,        // folga ao REABRIR (fronteira não pisca)
  passMs: 250,           // período do passe (4 Hz — custo O(n) barato)
});

/** Raio de culling para um mesh, ou null quando NUNCA deve ser escondido.
 * name: (parent.name || name) como o passe resolve; worldY: altura mundial. */
export function cullRadiusFor({ name = '', worldY = 0 } = {}) {
  if (!Number.isFinite(worldY) || worldY >= CULL.landmarkY) return null; // céu/montanhas
  const n = String(name);
  if (n.startsWith('shell:')) return CULL.shellM;
  if (/grass/i.test(n)) return CULL.grassM;
  return CULL.propM;
}

/** Marca a subárvore de uma RAIZ como isenta (avatares, armas, em-voo,
 * decals). Idempotente; conta os nós marcados NOVOS (p/ testes). */
export function propagateNoCull(root) {
  if (!root?.userData) return 0;
  let n = 0;
  const walk = (o) => {
    if (!o?.userData) return;
    if (!o.userData.noCull) { o.userData.noCull = true; n++; }
    for (const c of o.children ?? []) walk(c);
  };
  walk(root);
  return n;
}

/** Distância EFETIVA câmera→mesh usando a bounding sphere do mesh:
 * dist = max(0, dist(câmera, centro_mundo) − raio). Para meshes GRANDES
 * (terreno 440 m centrado na origem, domo do céu, shells) o centro pode
 * estar além do raio de cull COM o jogador EM CIMA do mesh — a distância ao
 * centro sozinha esconde o chão inteiro (regressão T70: "mundo preto").
 * Câmera dentro da esfera ⇒ 0 ⇒ nunca culled. */
export function cullEffectiveDist({ camX = 0, camY = 0, camZ = 0, cx = 0, cy = 0, cz = 0, r = 0 } = {}) {
  const dx = cx - camX, dy = cy - camY, dz = cz - camZ;
  const rad = Math.max(0, Number(r) || 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) return 0; // defensivo: nunca cull
  return Math.max(0, Math.hypot(dx, dy, dz) - rad);
}

/** Decisão de visibilidade com HISTERESE: quem está escondido só reabre
 * dentro do raio + folga (evita pop na fronteira). baseVisible false nunca
 * é forçado a true (respeita esconderijos do próprio jogo). */
export function cullDecide({ dist = 0, radius = null, baseVisible = true, hidden = false } = {}) {
  if (!baseVisible) return false;
  if (radius == null) return true;
  const d = Math.max(0, dist);
  return hidden ? d < radius + CULL.hysteresisM : d < radius;
}
