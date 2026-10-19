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

export class ViolationTracker {
  constructor() { this.count=0; this.strikes=[]; }
  add(violations) { if(!violations.length)return; this.count+=violations.length;this.strikes.push({at:Date.now(),violations});this.strikes=this.strikes.slice(-20); }
  get banned() { return this.count>=12; }
  get suspicious() { return this.count>=4; }
}
