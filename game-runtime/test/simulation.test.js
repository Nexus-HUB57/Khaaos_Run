import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRng } from '../src/shared/rng.js';
import { rollLoot } from '../src/shared/weapons.js';
import { GameSimulation } from '../src/shared/simulation.js';
import { validateInput } from '../server/antiCheat.js';

test('mesma seed reproduz a sequência de RNG',()=>{const a=new SeededRng('REPLAY-42'),b=new SeededRng('REPLAY-42');assert.deepEqual(Array.from({length:20},()=>a.next()),Array.from({length:20},()=>b.next()));});
test('seed fixa reproduz loot inicial',()=>{const a=new GameSimulation({seed:'LOOT-42',botCount:0}),b=new GameSimulation({seed:'LOOT-42',botCount:0});assert.deepEqual(a.loot,b.loot);});
test('loot avançado respeita raridade e catálogo',()=>{const drops=rollLoot(new SeededRng('TABLE-1'),'armory',100);assert.equal(drops.length,100);assert.ok(drops.every(d=>d.kind));assert.ok(drops.some(d=>d.weapon?.rarity==='RARO'||d.weapon?.rarity==='LENDARIO'));});
test('replay contém inputs e pode ser reconstruído',()=>{const a=new GameSimulation({seed:'MATCH-9',botCount:0});a.start('belt');for(let i=0;i<30;i++)a.step({seq:i,dx:i%2?1:0,dy:0,aimX:700,aimY:330,fire:i%4===0},.05);const replay=a.exportReplay();const b=new GameSimulation({seed:replay.seed,botCount:0});b.start('belt');for(const frame of replay.inputs)b.step(frame.input,.05);assert.equal(a.player.x,b.player.x);assert.equal(a.player.xp,b.player.xp);assert.equal(a.player.weapon,b.player.weapon);});
test('anti-cheat rejeita vetor impossível e sequência repetida',()=>{const prev={seq:4,x:550,y:330};assert.equal(validateInput(prev,{seq:5,dx:1,dy:0,aimX:600,aimY:330}).ok,true);const bad=validateInput(prev,{seq:4,dx:9,dy:0,aimX:5000,aimY:330});assert.equal(bad.ok,false);assert.deepEqual(bad.violations,['sequence_replay','movement_vector','aim_range']);});
