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
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { syncPostResolution, disposePostResources } from './renderpipeline3d.js';
import { visualPostPlan } from './visualprofile3d.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uTint: { value: 1 },
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
    uniform float uTime, uGrain, uVignette, uSaturation, uContrast, uHighlightRollOff, uTint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // tinta de cinema: sombras frias, altas luzes quentes
      vec3 shadowTint = vec3(0.93, 0.985, 1.06);
      vec3 highTint   = vec3(1.05, 1.00, 0.94);
      c.rgb *= mix(vec3(1.0), mix(shadowTint, highTint, smoothstep(0.15, 0.85, l)), uTint);
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
// ou quando o PLANO do tier é null (low — Fase 34: render direto, sem composer).
export function createPostFX(renderer, scene, camera, { quality = 'high', profile = 'cinematic' } = {}) {
  let composer = null;
  const ownedPasses = [];
  try {
    // Fase 34 — plano por tier (perf3d.postFxPlanFor): intensidade de bloom,
    // grão do grade e SSR (exclusivo do high) vêm da MESMA fonte de verdade
    // usada pelo auto-tier em runtime — medium deixou de pagar SSR (achado G2).
    const plan = visualPostPlan(quality, profile);
    if (!plan) return null;
    composer = new EffectComposer(renderer);
    const addPass = (pass) => { ownedPasses.push(pass); composer.addPass(pass); };
    addPass(new RenderPass(scene, camera));
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
        addPass(ssr);
      } catch {
        ssr?.dispose();
        ssr = null;
      }
    }
    let bloom = null;
    if (plan.bloomStrength > 0) {
      bloom = new UnrealBloomPass(size, plan.bloomStrength, 0.52, 0.88);
      addPass(bloom);
    }
    const grade = new ShaderPass(GradeShader);
    grade.uniforms.uGrain.value = plan.grain;
    grade.uniforms.uVignette.value = plan.vignette;
    grade.uniforms.uSaturation.value = plan.saturation;
    grade.uniforms.uContrast.value = plan.contrast;
    grade.uniforms.uTint.value = plan.tint;
    grade.uniforms.uHighlightRollOff.value = plan.highlightRollOff;
    addPass(grade);
    addPass(new OutputPass());
    // FXAA recebe imagem em display-space; MSAA do canvas não cobre os FBOs.
    const aa = new ShaderPass(FXAAShader);
    addPass(aa);
    const resize = (w, h) => syncPostResolution({ renderer, composer, ssr, aa }, w, h);
    resize(size.x, size.y);
    let disposed = false;
    let elapsed = 0;
    return {
      composer,
      ssr,
      bloom,
      grade,
      aa,
      render(dt = 0) {
        if (disposed) return;
        elapsed += dt;
        grade.uniforms.uTime.value = elapsed % 1000;
        composer.render(dt);
      },
      setSize(w, h) {
        if (!disposed) resize(w, h);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        disposePostResources(composer, ownedPasses);
      },
    };
  } catch {
    disposePostResources(composer, ownedPasses);
    return null;
  }
}
