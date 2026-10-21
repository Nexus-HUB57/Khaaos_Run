import { SeededRng } from './rng.js';
import { WEAPONS, rollLoot } from './weapons.js';

export const MAP = { width: 1100, height: 660, ring: { x: 550, y: 330, radius: 480 } };
export const DEFAULT_INPUT = Object.freeze({ dx: 0, dy: 0, aimX: 550, aimY: 330, fire: false, interact: false });

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class GameSimulation {
  constructor({ seed = 'CIGKV-DEFAULT', botCount = 12, tickRate = 20 } = {}) {
    this.seed = String(seed); this.rng = new SeededRng(this.seed); this.tickRate = tickRate; this.tick = 0; this.time = 600; this.events = []; this.replay = [];
    this.ring = { x: MAP.ring.x, y: MAP.ring.y, radius: MAP.ring.radius, target: 480, pulse: 1 };
    this.player = this.spawnPlayer(); this.bots = Array.from({ length: botCount }, (_, i) => this.spawnBot(i)); this.bullets = []; this.loot = this.spawnLoot(); this.terminals = [{x:910,y:330,active:true},{x:175,y:300,active:true},{x:600,y:330,active:true}];
  }
  spawnPlayer() { return { id:'player', x:550, y:330, r:12, life:100, defense:35, xp:0, krc:250, kills:0, speed:190, weapon:'g19', cooldown:0, inventory:{ metal:0, wood:0, components:0, medkit:1, fuel:0, ammo:{'9MM':45} }, extracted:0 }; }
  spawnBot(i) { const a=this.rng.next()*Math.PI*2, d=90+this.rng.next()*380; return { id:`bot-${String(i+1).padStart(2,'0')}`, name:`ZHEERS-${String(i+1).padStart(2,'0')}`, x:550+Math.cos(a)*d, y:330+Math.sin(a)*d, r:10, life:100, angle:this.rng.next()*6.28, cd:this.rng.next()*2, alive:true, weapon:this.rng.pick(['g19','mp5','m4']) }; }
  spawnLoot() { const zones=['armory','industrial','park','extraction']; return Array.from({length:18}, (_, i) => { const zone=zones[i%zones.length]; const x=40+this.rng.int(0,1020), y=35+this.rng.int(0,570); return { id:`loot-${i}`, x, y, zone, ...rollLoot(this.rng, zone, 1)[0], active:true }; }); }
  start(entry='belt') { this.player.defense=entry==='belt'?60:18; this.player.speed=entry==='belt'?190:225; this.emit('entry', { entry }); }
  emit(type, payload={}) { this.events.push({ tick:this.tick, type, ...payload }); }
  consumeEvents() { const e=this.events; this.events=[]; return e; }
  record(input) { this.replay.push({ tick:this.tick, input:{...DEFAULT_INPUT,...input} }); }
  step(rawInput=DEFAULT_INPUT, dt=1/20) {
    const input={...DEFAULT_INPUT,...rawInput}; this.record(input); if(this.time<=0 || this.player.life<=0) return this.snapshot();
    this.tick++; this.time=Math.max(0,this.time-dt); const p=this.player; p.cooldown=Math.max(0,p.cooldown-dt);
    const len=Math.hypot(input.dx,input.dy)||1; p.x=clamp(p.x+(input.dx/len)*p.speed*dt,18,MAP.width-18); p.y=clamp(p.y+(input.dy/len)*p.speed*dt,18,MAP.height-18);
    if(this.time<480) this.ring.radius=Math.max(this.ring.target,this.ring.radius-dt*.42); const pulse=Math.floor((600-this.time)/40)+1; if(pulse!==this.ring.pulse){this.ring.pulse=pulse;this.ring.target=Math.max(110,430-pulse*38);this.emit('pulse',{pulse,target:this.ring.target});}
    if(distance(p,this.ring)>this.ring.radius){p.life-=dt*3.5;this.emit('ringDamage',{amount:dt*3.5});}
    if(input.fire) this.fire('player', input.aimX, input.aimY);
    this.updateBots(dt); this.updateBullets(dt); if(input.interact) this.interact();
    if(this.time<=0) this.emit('victory'); if(p.life<=0) this.emit('eliminated'); return this.snapshot();
  }
  fire(ownerId, aimX, aimY) { const actor=ownerId==='player'?this.player:this.bots.find(b=>b.id===ownerId); if(!actor||!actor.alive||actor.cooldown>0)return false; const weapon=WEAPONS[actor.weapon]; if(!weapon||weapon.projectileSpeed===0)return false; if(ownerId==='player'){const ammo=actor.inventory.ammo[weapon.ammo]||0;if(ammo<=0){this.emit('empty',{weapon:weapon.name});return false;}actor.inventory.ammo[weapon.ammo]--;}
    const angle=Math.atan2(aimY-actor.y,aimX-actor.x); actor.cooldown=1/weapon.fireRate; this.bullets.push({x:actor.x+Math.cos(angle)*15,y:actor.y+Math.sin(angle)*15,vx:Math.cos(angle)*weapon.projectileSpeed,vy:Math.sin(angle)*weapon.projectileSpeed,owner:ownerId,damage:weapon.damage,life:weapon.range/weapon.projectileSpeed}); return true; }
  updateBots(dt) { const p=this.player; for(const b of this.bots){if(!b.alive)continue;b.cd-=dt;const a=Math.atan2(p.y-b.y,p.x-b.x),d=distance(p,b);b.angle+=(this.rng.next()-.5)*dt;if(d<300){b.x+=Math.cos(a)*dt*35;b.y+=Math.sin(a)*dt*35;if(b.cd<=0){this.fire(b.id,p.x,p.y);b.cd=1.4+this.rng.next()*2;}}else{b.x+=Math.cos(b.angle)*dt*12;b.y+=Math.sin(b.angle)*dt*12;}b.x=clamp(b.x,20,MAP.width-20);b.y=clamp(b.y,20,MAP.height-20);}}
  updateBullets(dt) { for(const b of this.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.owner==='player'){for(const bot of this.bots){if(bot.alive&&distance(bot,b)<bot.r+4){bot.life-=b.damage;b.life=0;if(bot.life<=0){bot.alive=false;this.player.kills++;this.player.xp+=120;this.player.krc+=15;this.emit('kill',{target:bot.name});}}}}else if(distance(this.player,b)<this.player.r+4){b.life=0;if(this.player.defense>0)this.player.defense=Math.max(0,this.player.defense-b.damage*.28);else this.player.life-=b.damage*.35;}}this.bullets=this.bullets.filter(b=>b.life>0&&b.x>-30&&b.x<MAP.width+30&&b.y>-30&&b.y<MAP.height+30); }
  interact() { const p=this.player; const item=this.loot.find(i=>i.active&&distance(i,p)<30); if(item){item.active=false;if(item.kind==='resource'||item.kind==='consumable'||item.kind==='ammo')this.player.inventory[item.kind==='ammo'?'ammo':item.id]=(item.kind==='ammo'?{...this.player.inventory.ammo,[item.id]:(this.player.inventory.ammo[item.id]||0)+item.amount}: (this.player.inventory[item.id]||0)+item.amount);else if(item.kind==='weapon'){this.player.weapon=item.id;this.player.inventory.weapon=item.id;}this.emit('loot',{item:item.name||item.id,rarity:item.rarity});return;}
    const terminal=this.terminals.find(t=>t.active&&distance(t,p)<35); if(terminal){terminal.active=false;p.extracted++;p.xp+=250;this.emit('extract',{count:p.extracted});}
  }
  craft() { const i=this.player.inventory;if((i.wood||0)>=2&&(i.metal||0)>=2){i.wood-=2;i.metal-=2;i.weapon='sucata';this.player.weapon='sucata';this.player.xp+=80;this.emit('craft',{item:WEAPONS.sucata.name});return true;}return false; }
  applySnapshot(snapshot) { if(!snapshot)return; this.seed=snapshot.seed??this.seed; this.tick=snapshot.tick??this.tick; this.time=snapshot.time??this.time; this.ring={...this.ring,...snapshot.ring}; if(snapshot.player)this.player=structuredClone(snapshot.player); this.bots=(snapshot.bots??[]).map(b=>({...b})); this.bullets=(snapshot.bullets??[]).map(b=>({...b})); this.loot=(snapshot.loot??this.loot).map(i=>({...i})); this.terminals=(snapshot.terminals??this.terminals).map(t=>({...t})); }
  snapshot() { return { seed:this.seed,tick:this.tick,time:this.time,ring:{...this.ring},player:structuredClone(this.player),bots:this.bots.map(b=>({...b})),bullets:this.bullets.map(b=>({...b})),loot:this.loot.map(i=>({...i})),terminals:this.terminals.map(t=>({...t})),replayLength:this.replay.length }; }
  exportReplay() { return { version:1, seed:this.seed, tickRate:this.tickRate, inputs:this.replay }; }
}
