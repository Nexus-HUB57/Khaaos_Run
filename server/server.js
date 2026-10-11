import { WebSocketServer } from 'ws';
import { GameSimulation } from '../src/shared/simulation.js';
import { validateInput, ViolationTracker } from './antiCheat.js';

const PORT=Number(process.env.PORT||8787); const TICK_RATE=20; const DT=1/TICK_RATE;
const seed=process.env.MATCH_SEED||`CIGKV-${new Date().toISOString().slice(0,10)}`;
const sim=new GameSimulation({seed,botCount:12,tickRate:TICK_RATE}); const clients=new Map(); let nextClient=1;
const wss=new WebSocketServer({port:PORT});
function send(ws,message){if(ws.readyState===1)ws.send(JSON.stringify(message));}
function broadcast(message){for(const ws of clients.keys())send(ws,message);}
function inputForPlayer(){const first=[...clients.keys()][0];return first?clients.get(first).input:{seq:sim.tick,dx:0,dy:0,aimX:550,aimY:330,fire:false,interact:false};}
wss.on('connection',(ws)=>{const id=`client-${nextClient++}`;const client={id,seq:0,input:{seq:0,dx:0,dy:0,aimX:550,aimY:330,fire:false,interact:false},violations:new ViolationTracker()};clients.set(ws,client);send(ws,{type:'welcome',id,seed,tickRate:TICK_RATE,snapshot:sim.snapshot()});
  ws.on('message',(raw)=>{try{const msg=JSON.parse(raw.toString());if(msg.type==='input'){const candidate={...msg.input,seq:msg.input?.seq??-1};const previous={...client.input,x:sim.player.x,y:sim.player.y};const result=validateInput(previous,candidate,DT);if(!result.ok){client.violations.add(result.violations);send(ws,{type:'rejected',violations:result.violations,strikes:client.violations.count});if(client.violations.banned){send(ws,{type:'banned',reason:'anti-cheat threshold'});ws.close(4003,'anti-cheat');}return;}client.input=candidate;client.seq=candidate.seq;}}catch{client.violations.add(['malformed_message']);}});
  ws.on('close',()=>clients.delete(ws));
});
setInterval(()=>{const input=inputForPlayer();const snapshot=sim.step(input,DT);const events=sim.consumeEvents();broadcast({type:'snapshot',snapshot,events});},1000/TICK_RATE);
console.log(`[CIGKV authoritative] ws://localhost:${PORT} seed=${seed}`);
export { wss, sim };
