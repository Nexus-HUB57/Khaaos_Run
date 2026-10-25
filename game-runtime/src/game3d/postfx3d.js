// Khaaos Run — Pós-processamento "Live Action" (Fase 3 — realismo).
// EffectComposer: RenderPass → Bloom sutil → Grade cinematográfico → OutputPass.
// O grade adiciona vinheta, grão de filme, contraste leve e tinta as sombras de
// frio / altas luzes de quente (look de câmera de cinema). Escap via ?fx=0.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.36 },
    uSaturation: { value: 1.07 },
    uContrast: { value: 1.055 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uSaturation, uContrast;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // tinta de cinema: sombras frias, altas luzes quentes
      vec3 shadowTint = vec3(0.93, 0.985, 1.06);
      vec3 highTint   = vec3(1.05, 1.00, 0.94);
      c.rgb *= mix(shadowTint, highTint, smoothstep(0.15, 0.85, l));
      // contraste + saturação controlados
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      // vinheta
      vec2 d = vUv - 0.5;
      float vig = 1.0 - uVignette * dot(d, d) * 1.9;
      c.rgb *= clamp(vig, 0.0, 1.0);
      // grão de filme animado
      float g = (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * uGrain;
      c.rgb += g;
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};

// Cria a cadeia de pós-processamento; retorna null se indisponível (fallback direto).
export function createPostFX(renderer, scene, camera, { quality = 'high' } = {}) {
  try {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    const bloom = new UnrealBloomPass(size, quality === 'high' ? 0.32 : 0.22, 0.55, 0.82);
    composer.addPass(bloom);
    const grade = new ShaderPass(GradeShader);
    if (quality !== 'high') grade.uniforms.uGrain.value = 0.03;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    let elapsed = 0;
    return {
      composer,
      bloom,
      grade,
      render(dt = 0) {
        elapsed += dt;
        grade.uniforms.uTime.value = elapsed % 1000;
        composer.render(dt);
      },
      setSize(w, h) { composer.setSize(w, h); },
    };
  } catch {
    return null;
  }
}
