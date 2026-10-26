const MAX_INPUT_GAP = 0.45;
const MAX_AIM_DISTANCE = 1200;

export function validateInput(previous, next, dt = 1/20) {
  const violations=[];
  if(!Number.isInteger(next.seq)||next.seq<=previous.seq) violations.push('sequence_replay');
  if(!Number.isFinite(next.dx)||!Number.isFinite(next.dy)||Math.hypot(next.dx,next.dy)>1.01) violations.push('movement_vector');
  if(!Number.isFinite(next.aimX)||!Number.isFinite(next.aimY)||Math.hypot(next.aimX-previous.x,next.aimY-previous.y)>MAX_AIM_DISTANCE) violations.push('aim_range');
  if(Number.isFinite(next.clientDt)&&Math.abs(next.clientDt-dt)>MAX_INPUT_GAP) violations.push('client_timing');
  return { ok:violations.length===0, violations };
}

// Validação de input para o modo 3D (MatchRoom3D): mesmo contrato de movimento,
// agora com yaw/pitch (aim em ângulos) e one-shots booleanos.
const MAX_PITCH = 1.4;          // cliente clamp em ±1.35
const MAX_YAW_RATE = 14;        // rad/s — 180°/s largamente suficiente (sens padrão ~0.0021/px)
export function validateInput3D(previous, next, dt = 1/20) {
  const violations=[];
  if(!Number.isInteger(next.seq)||next.seq<=previous.seq) violations.push('sequence_replay');
  if(!Number.isFinite(next.dx)||!Number.isFinite(next.dy)||Math.hypot(next.dx,next.dy)>1.01) violations.push('movement_vector');
  if(!Number.isFinite(next.yaw)) violations.push('aim_range');
  if(!Number.isFinite(next.pitch)||Math.abs(next.pitch)>MAX_PITCH) violations.push('aim_range');
  if(Number.isFinite(next.yaw)&&Number.isFinite(previous.yaw)){
    let delta=Math.abs(next.yaw-previous.yaw)%(Math.PI*2);
    if(delta>Math.PI) delta=Math.PI*2-delta; // wrap — vira da forma curta
    if(delta>MAX_YAW_RATE*dt) violations.push('yaw_rate');
  }
  for(const flag of ['fire','ads','sprint','jump','interact','reload','medkit','throw','gloo','crouch']){
    if(next[flag]!==undefined && typeof next[flag]!=='boolean') violations.push('field_type');
  }
  if(next.slot!==undefined && next.slot!==0 && next.slot!==1 && next.slot!==2) violations.push('field_type');
  // rtt (Fase 3): se presente, deve ser numérico finito — o servidor faz o clamp
  if(next.rtt!==undefined && !Number.isFinite(next.rtt)) violations.push('field_type');
  if(Number.isFinite(next.clientDt)&&Math.abs(next.clientDt-dt)>MAX_INPUT_GAP) violations.push('client_timing');
  return { ok:violations.length===0, violations };
}

export class ViolationTracker {
  constructor() { this.count=0; this.strikes=[]; }
  add(violations) { if(!violations.length)return; this.count+=violations.length;this.strikes.push({at:Date.now(),violations});this.strikes=this.strikes.slice(-20); }
  get banned() { return this.count>=12; }
  get suspicious() { return this.count>=4; }
}
