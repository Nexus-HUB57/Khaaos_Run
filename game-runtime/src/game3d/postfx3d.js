// Khaaos Run — Pós-processamento "Live Action" (Fase 3 — realismo).
// EffectComposer: RenderPass → Bloom sutil → Grade cinematográfico → OutputPass.
// O grade adiciona vinheta, grão de filme, contraste leve e tinta as sombras de
// frio / altas luzes de quente (look de câmera de cinema). Escap via ?fx=0.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { postFxPlanFor } from './perf3d.js'; // Fase 35 — plano por tier (SSR só no high)

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    // Acabamento limpo de beta: o grão continua orgânico, mas não mascara
    // normal maps, roughness e microdetalhes de fachadas/terreno.
    uGrain: { value: 0.022 },
    uVignette: { value: 0.23 },
    uSaturation: { value: 1.045 },
    uContrast: { value: 1.035 },
    uHighlightRollOff: { value: 0.28 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uSaturation, uContrast, uHighlightRollOff;
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
      // shoulder suave: preserva metal molhado, céu e luminárias sem clipping
      float peak = max(max(c.rgb.r, c.rgb.g), c.rgb.b);
      float shoulder = max(peak - 0.78, 0.0) * uHighlightRollOff;
      c.rgb /= (1.0 + shoulder);
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

// Cria a cadeia de pós-processamento; retorna null se indisponível (fallback direto)
// ou quando o PLANO do tier é null (low — Fase 35: render direto, sem composer).
export function createPostFX(renderer, scene, camera, { quality = 'high' } = {}) {
  try {
    // Fase 35 — plano por tier (perf3d.postFxPlanFor): intensidade de bloom,
    // grão do grade e SSR (exclusivo do high) vêm da MESMA fonte de verdade
    // usada pelo auto-tier em runtime — medium deixou de pagar SSR (achado G2).
    const plan = postFxPlanFor(quality);
    if (!plan) return null;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    let ssr = null;
    // SSR é deliberadamente limitado ao tier alto e renderizado em resolução
    // reduzida: reflexos de asfalto molhado/metal permanecem convincentes sem
    // transformar o Barburhen em um custo de GPU incompatível com touch.
    if (plan.ssr) {
      try {
        ssr = new SSRPass({
          renderer, scene, camera,
          width: Math.max(320, Math.floor(size.x * .72)),
          height: Math.max(180, Math.floor(size.y * .72)),
        });
        ssr.maxDistance = 22;
        ssr.thickness = .12;
        ssr.opacity = .28;
        ssr.blur = true;
        ssr.fresnel = true;
        ssr.distanceAttenuation = true;
        composer.addPass(ssr);
      } catch {
        ssr = null;
      }
    }
    const bloom = new UnrealBloomPass(size, plan.bloomStrength, 0.52, 0.88);
    composer.addPass(bloom);
    const grade = new ShaderPass(GradeShader);
    grade.uniforms.uGrain.value = plan.grain;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    let elapsed = 0;
    return {
      composer,
      ssr,
      bloom,
      grade,
      render(dt = 0) {
        elapsed += dt;
        grade.uniforms.uTime.value = elapsed % 1000;
        composer.render(dt);
      },
      setSize(w, h) {
        composer.setSize(w, h);
        ssr?.setSize(Math.max(320, Math.floor(w * .72)), Math.max(180, Math.floor(h * .72)));
      },
    };
  } catch {
    return null;
  }
}
