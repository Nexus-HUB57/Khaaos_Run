// Khaaos Run — Task 56: LOCOMOÇÃO HUMANA — blender determinístico de passada.
// Problema que fecha: o estado de movimento chegava à animação BINÁRIO
// (speedNorm 0 → .8 → 1.2 num frame) e a fase da passada era DERIVADA do
// relógio global (sin(t*W) com W variando por frame). Trocar andar↔sprint
// reescalava o argumento do seno na MESMA posição temporal — as pernas
// TELEPORTAVAM para outra fase da passada (o "movimento artificial").
//
// Solução: (1) speedNorm é ESTADO suavizado — persegue o alvo com taxa
// exponencial (aceleração mais rápida que frenagem, como músculo real);
// (2) a fase da passada é INTEGRADA por ator (phase += dt·W(speed)) — mudar
// a velocidade agora só muda a CADÊNCIA futura, nunca a fase atual;
// (3) parado de verdade (speed < STRIDE.rest) a fase CONGELA — sem deriva.
//
// Módulo PURO (zero THREE, determinístico, sem Math.random): o mesmo contrato
// headless-safe de sim3d/interiorsPlan — testável em node e reusável por
// player, bots e espectador. animateOperative consome { speedNorm, phase }.

export const STRIDE = {
  baseW: 8.6,        // rad/s da passada em passo (contrato Fase 16 preservado)
  sprintGain: 2.2,   // acréscimo de cadência por unidade de speedNorm
  maxSn: 1.2,        // teto canônico do sprint (main3d usa 1.2)
  rest: .015,        // abaixo disso o ator está em pé (fase congela)
};

// frequência da passada — contínua, clampada ao teto do sprint
export function strideFrequency(sn = 0) {
  const s = Math.max(0, Math.min(STRIDE.maxSn, Number.isFinite(sn) ? sn : 0));
  return STRIDE.baseW + STRIDE.sprintGain * s;
}

export function createLocomotionBlend({ accelRate = 7.5, decelRate = 5.2, maxSn = STRIDE.maxSn, sprintOn = 1.02, sprintUpRate = 5.5, sprintDownRate = 7 } = {}) {
  let speed = 0;   // speedNorm suavizado 0..maxSn
  let phase = 0;   // fase da passada em rad (integrada, nunca resetada)
  let sprintK = 0; // low-ready com CONSTANTE DE TEMPO PRÓPRIA (peso do corpo:
                   // abaixar/erguer a arma leva ~0,3 s mesmo com mudança brusca
                   // de velocidade — função instantânea de speed snapava na
                   // banda 1.02–1.2 em ~1 frame sob desaceleração exponencial)
  return {
    get speed() { return speed; },
    get phase() { return phase; },
    get sprintK() { return sprintK; },
    // avança um tick; target = speedNorm alvo (binário do snapshot/sim é aceito);
    // opts.sprint = intenção de sprint (false quando ADS/crouch/fire — opcional)
    update(dt, target = 0, { sprint = null } = {}) {
      const d = Math.max(0, Math.min(.25, Number.isFinite(dt) ? dt : 0)); // clamp anti-hitch (tab switch)
      const tgt = Math.max(0, Math.min(maxSn, Number.isFinite(target) ? target : 0));
      // exponencial assimétrica: levanta rápido, assenta devagar (peso do corpo)
      const rate = tgt > speed ? accelRate : decelRate;
      speed += (tgt - speed) * (1 - Math.exp(-rate * d));
      if (speed < 1e-4) speed = 0;
      // low-ready: entra acima do teto de andar, com tempo de corpo próprio
      const sprintTarget = (sprint === false || speed < sprintOn) ? 0 : 1;
      sprintK += (sprintTarget - sprintK) * (1 - Math.exp(-(sprintTarget > sprintK ? sprintUpRate : sprintDownRate) * d));
      if (sprintK < 1e-4) sprintK = 0;
      // fase só integra EM MOVIMENTO: parado não deriva (passos fantasmas)
      if (speed >= STRIDE.rest) phase += strideFrequency(speed) * d;
      if (phase > 6.283185307179586e4) phase %= 6.283185307179586; // wrap após ~10k rad (sem perda de continuidade perceptível)
      return { speedNorm: speed, phase, sprintK };
    },
  };
}
