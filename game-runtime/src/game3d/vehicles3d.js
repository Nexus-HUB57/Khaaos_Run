// Khaaos Run — Fase 16 (P0) — Veículos do ZU no padrão do jogo.
//
// A Fase 8 construía carros/vans como CAIXAS com rodas-caixa: silhueta robótica
// que destoava do padrão Khaaos Run (Live Action, referência FreeFire). Aqui a
// silhueta ganha anatomia automotiva REAL, ainda 100% instanciada (custo de
// draw calls constante, sem GLTF externo):
//   • casco baixo + capô/tampa-malas (degraus de silhueta, não um bloco);
//   • greenhouse em PRISMA com pilares inclinados (para-brisa/vidro traseiro
//     declinados como em um sedan de verdade) + teto fino na cor do corpo;
//   • rodas CILÍNDRICAS com aro (eixo no lugar, raio coerente com o perfil);
//   • faixas de farol (quente) e lanternas (vermelho) emissivas + para-choques;
//   • van com cabine + baú alto e linha de portas traseiras.
// Determinístico (sem Math.random) e puramente visual: nada de colisores —
// a sim continua autoritativa (mesmo contrato da Fase 8).
import * as THREE from 'three';
import { frustumPrism } from './prisms3d.js';

/**
 * Perfis por tipo — fonte única de verdade da silhueta (testável em node puro).
 * Eixos locais: comprimento no Z (frente = -z), largura no X, yaw na instância.
 */
export const VEHICLE_PROFILES = Object.freeze({
  car: Object.freeze({
    hull: { w: 1.86, h: .5, l: 4.3, y: .42 },                       // casco (mono-box baixo)
    hoodLid: { w: 1.68, h: .07, l: 1.28, y: .64, z: -1.36 },        // capô (degrau à frente)
    trunkLid: { w: 1.68, h: .07, l: .96, y: .64, z: 1.56 },         // tampa do mala (degrau atrás)
    cabin: { wB: 1.62, wT: 1.3, lB: 2.1, lT: 1.42, h: .5, y: .68, z: .06 }, // greenhouse em prisma
    roof: { w: 1.3, h: .06, l: 1.5, y: 1.21, z: .1 },               // teto fino sobre o prisma
    wheel: { r: .34, w: .24, track: 1.72, base: 2.66 },              // eixo/entre-eixos reais
    light: { headW: .34, headH: .11, headY: .52, tailW: .26, tailH: .1, tailY: .54 },
    bumper: { w: 1.8, h: .16, d: .16, y: .3 },
  }),
  van: Object.freeze({
    hull: { w: 2.0, h: .74, l: 5.3, y: .58 },                       // chassi-cabine
    cargo: { w: 1.98, h: 1.62, l: 3.5, y: 1.76, z: 1.05 },          // baú alto (furgão)
    cabin: { wB: 1.9, wT: 1.62, lB: 1.5, lT: 1.05, h: .58, y: .95, z: -1.78 }, // cabine dianteira
    roof: { w: 1.62, h: .06, l: 1.12, y: 1.56, z: -1.78 },
    doorsLine: { w: 1.5, h: 1.3, d: .04, y: 1.76, z: 2.82 },        // linha das portas traseiras
    wheel: { r: .4, w: .28, track: 1.84, base: 3.2 },
    light: { headW: .3, headH: .13, headY: .62, tailW: .14, tailH: .5, tailY: 1.5 },
    bumper: { w: 1.94, h: .18, d: .18, y: .38 },
  }),
});

/** Ângulo do para-brisa a partir do prisma da cabine (rad) — sanity de silhueta. */
export function windshieldSlope(profile) {
  const c = profile.cabin;
  return Math.atan2(c.h, (c.lB - c.lT) / 2);
}

/** Roda cilíndrica (eixo ao longo do X local) — geometria compartilhada. */
function wheelGeometry(r, w) {
  const g = new THREE.CylinderGeometry(r, r, w, 12);
  g.rotateZ(Math.PI / 2);      // eixo Y → X (rola no plano XY do veículo)
  return g;
}

const CAR_COLORS = ['#8a2f2b', '#2b4a6f', '#5d5f63', '#6f5a2b', '#3d5a3a', '#26282c'];

/**
 * Constrói o tráfego REALISTA a partir das placements da Fase 8 (mesmas
 * posições/yaw/cor — zero mudança de gameplay). Todos os meshes são
 * InstancedMesh com sombra; retorna contagens p/ inspeção e2e.
 */
export function buildTrafficVehicles(scene, placements) {
  const stats = { car: 0, van: 0, drawCalls: 0 };
  const dummy = new THREE.Object3D();
  const glassMat = new THREE.MeshStandardMaterial({ color: '#0d1118', roughness: .16, metalness: .72 });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: .92 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#7d8189', roughness: .35, metalness: .85 });
  const bumperMat = new THREE.MeshStandardMaterial({ color: '#191b1f', roughness: .6, metalness: .3 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffe9b0', emissiveIntensity: 1.1, roughness: .25 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#5c0f14', emissive: '#ff2d38', emissiveIntensity: 1.15, roughness: .3 });

  for (const type of ['car', 'van']) {
    const list = placements.filter((t) => t.type === type);
    if (!list.length) continue;
    stats[type] = list.length;
    const p = VEHICLE_PROFILES[type];
    const n = list.length;
    const paintedMat = new THREE.MeshStandardMaterial({ roughness: .34, metalness: .62 });
    const paint = new THREE.InstancedMesh(new THREE.BoxGeometry(p.hull.w, p.hull.h, p.hull.l), paintedMat, n);
    // capô/tampa (car) ou baú (van) também pintados na cor da instância
    const lidSpec = type === 'car'
      ? { a: p.hoodLid, b: p.trunkLid }
      : { a: p.cargo, b: null };
    const lidA = new THREE.InstancedMesh(
      new THREE.BoxGeometry(lidSpec.a.w, lidSpec.a.h, lidSpec.a.l), paintedMat, n,
    );
    const lidB = lidSpec.b
      ? new THREE.InstancedMesh(new THREE.BoxGeometry(lidSpec.b.w, lidSpec.b.h, lidSpec.b.l), paintedMat, n)
      : null;
    const cabin = new THREE.InstancedMesh(frustumPrism(p.cabin), glassMat, n);
    const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(p.roof.w, p.roof.h, p.roof.l), paintedMat, n);
    const wheels = new THREE.InstancedMesh(wheelGeometry(p.wheel.r, p.wheel.w), tireMat, n * 4);
    const rims = new THREE.InstancedMesh(wheelGeometry(p.wheel.r * .55, p.wheel.w + .02), rimMat, n * 4);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(p.light.headW, p.light.headH, .06), headMat, n * 2);
    const tails = new THREE.InstancedMesh(new THREE.BoxGeometry(p.light.tailW, p.light.tailH, .06), tailMat, n * 2);
    const bumpers = new THREE.InstancedMesh(new THREE.BoxGeometry(p.bumper.w, p.bumper.h, p.bumper.d), bumperMat, n * 2);
    let doors = null;
    if (type === 'van' && p.doorsLine) {
      doors = new THREE.InstancedMesh(new THREE.BoxGeometry(p.doorsLine.w, p.doorsLine.h, p.doorsLine.d), bumperMat, n);
    }

    list.forEach((t, i) => {
      const cos = Math.cos(t.rot), sin = Math.sin(t.rot);
      const at = (lx, ly, lz) => {
        dummy.position.set(t.x + cos * lx + sin * lz, ly, t.z - sin * lx + cos * lz);
      };
      const place = (mesh, li, lx, ly, lz, extraRotX = 0) => {
        at(lx, ly, lz);
        dummy.rotation.set(extraRotX, t.rot, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        if (li >= 0) mesh.setMatrixAt(li, dummy.matrix);
      };
      const color = new THREE.Color(CAR_COLORS[t.color % CAR_COLORS.length]);
      place(paint, i, 0, p.hull.y, 0);
      paint.setColorAt(i, color);
      // capô/tampa-malas/baú: o z do spec é deslocamento local ao veículo
      place(lidA, i, 0, lidSpec.a.y, lidSpec.a.z ?? 0);
      lidA.setColorAt(i, color);
      if (lidB) {
        place(lidB, i, 0, lidSpec.b.y, lidSpec.b.z ?? 0);
        lidB.setColorAt(i, color);
      }
      place(cabin, i, 0, p.cabin.y, p.cabin.z);
      place(roof, i, 0, p.roof.y, p.roof.z);
      let wi = i * 4;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        place(wheels, wi, sx * (p.wheel.track / 2), p.wheel.r, sz * (p.wheel.base / 2));
        place(rims, wi, sx * (p.wheel.track / 2 + .01), p.wheel.r, sz * (p.wheel.base / 2));
        wi++;
      }
      // faróis no nariz do casco; lanternas na traseira real (baú na van)
      const tailZ = (type === 'van' && p.cargo)
        ? p.cargo.z + p.cargo.l / 2 + .01
        : p.hull.l / 2 + .01;
      let li = i * 2;
      for (const sx of [-1, 1]) {
        place(heads, li, sx * (p.hull.w / 2 - p.light.headW / 2 - .06), p.light.headY, -p.hull.l / 2 - .01);
        place(tails, li, sx * (p.hull.w / 2 - p.light.tailW / 2 - .06), p.light.tailY, tailZ);
        place(bumpers, li, 0, p.bumper.y, sx === -1 ? -p.hull.l / 2 - .02 : p.hull.l / 2 + .02);
        li++;
      }
      if (doors) place(doors, i, 0, p.doorsLine.y, p.doorsLine.z);
    });

    const meshes = [paint, lidA, lidB, cabin, roof, wheels, rims, heads, tails, bumpers, doors].filter(Boolean);
    for (const m of meshes) {
      m.castShadow = true; m.receiveShadow = true;
      m.instanceMatrix.needsUpdate = true;
      scene.add(m);
      stats.drawCalls++;
    }
    paint.instanceColor.needsUpdate = true;
    if (lidA.instanceColor) lidA.instanceColor.needsUpdate = true;
    if (lidB?.instanceColor) lidB.instanceColor.needsUpdate = true;
  }
  return stats;
}
