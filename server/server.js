import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MatchRoom } from './room.js';
import { validateInput, ViolationTracker } from './antiCheat.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
export function createAuthoritativeServer({port=Number(process.env.PORT||8787),adminToken=process.env.ADMIN_TOKEN||'change-me',roomCapacity=16}={}){
  const rooms=new Map(),clients=new Map(),queue=[];let nextClient=1,nextRoom=1;const metrics={startedAt:Date.now(),connections:0,rejections:0,violations:0,bans:0,messages:0,ticks:0};
  const getRoom=(client)=>client.roomId?rooms.get(client.roomId):null;
  function assign(client){let room=[...rooms.values()].find(r=>r.players.size<r.capacity&&!r.started);if(!room){room=new MatchRoom({id:`ring-${nextRoom++}`,seed:`${process.env.MATCH_SEED||'CIGKV'}-${nextRoom}` ,capacity:roomCapacity});rooms.set(room.id,room);}room.addPlayer(client.id);client.roomId=room.id;queue.splice(queue.indexOf(client),1);send(client.ws,{type:'match_found',roomId:room.id,position:room.players.size,capacity:room.capacity,snapshot:room.snapshot(client.id)});}
  function send(ws,msg){if(ws.readyState===1)ws.send(JSON.stringify(msg));}
  function broadcastRoom(room,msg){for(const c of clients.values())if(c.roomId===room.id)send(c.ws,msg);}
  function authorized(req){return req.headers['x-admin-token']===adminToken||new URL(req.url,'http://localhost').searchParams.get('token')===adminToken;}
  const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/admin.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(ROOT,'admin.html')));return;}if(url.pathname.startsWith('/admin/')){if(!authorized(req)){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:'unauthorized'}));return;}const payload={metrics,queue:queue.length,rooms:[...rooms.values()].map(r=>r.metrics()),clients:[...clients.values()].map(c=>({id:c.id,roomId:c.roomId,strikes:c.violations.count,suspicious:c.violations.suspicious})),now:Date.now()};res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(payload));return;}res.writeHead(404);res.end();});
  const wss=new WebSocketServer({server,path:'/ws'});
  wss.on('connection',(ws)=>{const client={id:`client-${nextClient++}`,ws,roomId:null,seq:0,input:{seq:0,dx:0,dy:0,aimX:550,aimY:330,fire:false,interact:false},violations:new ViolationTracker(),connectedAt:Date.now()};clients.set(client.id,client);metrics.connections++;queue.push(client);send(ws,{type:'queued',id:client.id,queue:queue.length});assign(client);
    ws.on('message',(raw)=>{metrics.messages++;try{const msg=JSON.parse(raw.toString());if(msg.type==='start'){const room=getRoom(client);room?.start(client.id,msg.entry||'belt');return;}if(msg.type!=='input')return;const room=getRoom(client);const candidate={...msg.input,seq:msg.input?.seq??-1};const p=room?.players.get(client.id);const previous={...client.input,x:p?.x??550,y:p?.y??330};const result=validateInput(previous,candidate,1/20);if(!result.ok){client.violations.add(result.violations);metrics.rejections++;metrics.violations+=result.violations.length;send(ws,{type:'rejected',violations:result.violations,strikes:client.violations.count});if(client.violations.banned){metrics.bans++;send(ws,{type:'banned',reason:'anti-cheat threshold'});ws.close(4003,'anti-cheat');}return;}client.input=candidate;client.seq=candidate.seq;room?.input(client.id,candidate,1/20);}catch{client.violations.add(['malformed_message']);metrics.violations++;}});
    ws.on('close',()=>{const room=getRoom(client);room?.removePlayer(client.id);clients.delete(client.id);const qi=queue.indexOf(client);if(qi>=0)queue.splice(qi,1);});
  });
  const timer=setInterval(()=>{metrics.ticks++;for(const room of rooms.values()){room.tick(1/20);for(const c of clients.values())if(c.roomId===room.id)send(c.ws,{type:'snapshot',snapshot:room.snapshot(c.id),events:[]});}},50);
  const cleanup=setInterval(()=>{for(const [id,room] of rooms)if(room.players.size===0&&Date.now()-room.lastActivity>60000)rooms.delete(id);},10000);
  return {server,wss,rooms,clients,queue,metrics,close:()=>{clearInterval(timer);clearInterval(cleanup);for(const c of clients.values())c.ws.close();return new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){const app=createAuthoritativeServer();app.server.listen(Number(process.env.PORT||8787),()=>console.log(`[CIGKV authoritative] http://localhost:${process.env.PORT||8787} | ws path /ws | admin /admin.html`));}
