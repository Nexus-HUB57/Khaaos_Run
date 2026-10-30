// Khaaos Run — Fase 16 — prisma frustrado compartilhado (veículos + trem).
// Geometria procedural única p/ narizes de locomotiva e greenhouses de carros:
// retângulo base → retângulo topo recuado, dando PILARES INCLINADOS de verdade
// (para-brisa/vidro traseiro/nariz afilado) em 12 triângulos, sem GLTF externo.
import * as THREE from 'three';

/**
 * @param {{ wB:number, wT:number, lB:number, lT:number, h:number }} spec
 *   wB/wT largura base/topo, lB/lT comprimento base/topo, h altura.
 *   Base em y=0 (centro do objeto), topo em y=h com recuo simétrico.
 */
export function frustumPrism({ wB, wT, lB, lT, h }) {
  const xB = wB / 2, zB = lB / 2, xT = wT / 2, zT = lT / 2;
  const v = [
    [-xB, 0, -zB], [xB, 0, -zB], [xB, 0, zB], [-xB, 0, zB],   // base 0..3
    [-xT, h, -zT], [xT, h, -zT], [xT, h, zT], [-xT, h, zT],   // topo 4..7
  ];
  const quad = (a, b, c, d) => [a, b, c, a, c, d];
  const pos = [
    ...quad(0, 1, 5, 4),   // frente (-z)
    ...quad(2, 3, 7, 6),   // trás (+z)
    ...quad(1, 2, 6, 5),   // direita (+x)
    ...quad(3, 0, 4, 7),   // esquerda (-x)
    ...quad(4, 5, 6, 7),   // topo
    ...quad(3, 2, 1, 0),   // base
  ].flatMap((i) => v[i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
