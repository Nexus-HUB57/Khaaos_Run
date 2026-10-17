import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MatchRoom } from './room.js';
import { validateInput, ViolationTracker } from './antiCheat.js';
import { AuthService, hasRole } from './auth.js';
import { DurableJsonStore } from './store.js';
import { DistributedRateLimiter, SharedMemoryRateStore } from './rateLimit.js';
import { chooseRegion, chooseRoom, normalizeRegion } from './matchmaking.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const jsonBody=req=>new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>1e6)reject(new Error('payload too large'));});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'));}catch(e){reject(e);}});});
const bearer=req=>String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');

export function createAuthoritativeServer({port=Number(process.env.PORT||8787),adminToken=process.env.ADMIN_TOKEN||'change-me',roomCapacity=16,auth,store,rateStore=new SharedMemoryRateStore(),regionCapacity}={}){
  const users=process.env.KR_USERS_JSON?JSON.parse(process.env.KR_USERS_JSON):[];
  const identity=auth||new AuthService({secret:process.env.AUTH_SECRET||'dev-only-change-me',users});
  const durable=store||new DurableJsonStore(process.env.KR_STORE||path.join(ROOT,'.data','server.json'));
  const limiter=new DistributedRateLimiter({store:rateStore,limit:30,windowMs:1000,prefix:'ws-input'});
  const rooms=new Map(),clients=new Map(),queue=[];let nextClient=1,nextRoom=1;
  const metrics={startedAt:Date.now(),connections:0,rejections:0,violations:0,bans:0,messages:0,ticks:0,rateLimited:0,reconnects:0,authFailures:0,backpressure:0,oversized:0};
  const MAX_BUFFERED_BYTES=256*1024;
  const send=(ws,msg)=>{if(ws?.readyState!==1)return false;if(ws.bufferedAmount>MAX_BUFFERED_BYTES){metrics.backpressure++;ws.close(4008,'backpressure');return false;}ws.send(JSON.stringify(msg));return true;};
  const getRoom=client=>client.roomId?rooms.get(client.roomId):null;
  function authorizedAdmin(req){const token=bearer(req)||req.headers['x-admin-token']||new URL(req.url,'http://localhost').searchParams.get('token');return (identity.verify(token)&&hasRole(identity.verify(token),'admin'))||token===adminToken;}
  function assign(client){let room=chooseRoom(rooms,client.region,roomCapacity);if(!room){room=new MatchRoom({id:`ring-${nextRoom++}`,seed:`${process.env.MATCH_SEED||'CIGKV'}-${nextRoom}`,region:client.region,capacity:roomCapacity});rooms.set(room.id,room);}room.addPlayer(client.id);client.roomId=room.id;queue.splice(queue.indexOf(client),1);send(client.ws,{type:'match_found',id:client.id,roomId:room.id,region:room.region,position:room.players.size,capacity:room.capacity,resumeToken:client.resumeToken,snapshot:room.snapshot(client.id)});}
  const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');try{
    if(req.method==='GET'&&url.pathname==='/healthz'){res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({status:'ok',uptimeMs:Date.now()-metrics.startedAt,ticks:metrics.ticks,rooms:rooms.size,connections:clients.size,queue:queue.length}));return;}
    if(req.method==='GET'&&url.pathname==='/readyz'){const ready=typeof durable.listSessions==='function'&&typeof rateStore.incr==='function';res.writeHead(ready?200:503,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({status:ready?'ready':'not_ready',checks:{sessionStore:typeof durable.listSessions==='function',rateStore:typeof rateStore.incr==='function'}}));return;}
    if(req.method==='POST'&&url.pathname==='/auth/login'){const ip=req.socket.remoteAddress||'unknown',allowed=limiter.allow(`login:${ip}`);if(!allowed.allowed){res.writeHead(429);res.end(JSON.stringify({error:'rate_limited'}));return;}const body=await jsonBody(req),logged=identity.login(body.username,body.password);if(!logged){metrics.authFailures++;res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:'invalid_credentials'}));return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(logged));return;}
    if(url.pathname==='/admin.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(ROOT,'admin.html')));return;}
    if(url.pathname.startsWith('/admin/')){if(!authorizedAdmin(req)){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:'unauthorized'}));return;}const a=identity.verify(bearer(req));const payload={metrics,queue:queue.length,rooms:[...rooms.values()].map(r=>r.metrics()),clients:[...clients.values()].map(c=>({id:c.id,username:c.identity.username,role:c.identity.role,region:c.region,roomId:c.roomId,strikes:c.violations.count,suspicious:c.violations.suspicious})),sessions:durable.listSessions().length,admin:a?.username||'legacy-token',now:Date.now()};res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(payload));return;}
    res.writeHead(404);res.end();
  }catch{res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:'bad_request'}));}});
  const wss=new WebSocketServer({server,path:'/ws',maxPayload:16*1024,perMessageDeflate:false});
  wss.on('connection',(ws,req)=>{const url=new URL(req.url,'ws://localhost'),token=url.searchParams.get('token');const user=identity.verify(token);if(!user){metrics.authFailures++;send(ws,{type:'auth_required'});ws.close(4001,'auth-required');return;}const resume=url.searchParams.get('resume'),saved=resume?durable.getSession(resume):null;let client;if(saved&&saved.userId===user.sub&&saved.expiresAt>Date.now()&&rooms.get(saved.roomId)?.players.has(saved.id)){client={id:saved.id,ws,roomId:saved.roomId,seq:0,input:{seq:0,dx:0,dy:0,aimX:550,aimY:330,fire:false,interact:false},violations:new ViolationTracker(),identity:user,region:normalizeRegion(user.region),resumeToken:resume,connectedAt:Date.now()};metrics.reconnects++;}else{client={id:`client-${nextClient++}`,ws,roomId:null,seq:0,input:{seq:0,dx:0,dy:0,aimX:550,aimY:330,fire:false,interact:false},violations:new ViolationTracker(),identity:user,region:chooseRegion(user.region,{}),resumeToken:crypto.randomBytes(24).toString('base64url'),connectedAt:Date.now()};}
    clients.set(client.id,client);metrics.connections++;if(!client.roomId){queue.push(client);send(ws,{type:'queued',id:client.id,region:client.region,queue:queue.length});assign(client);}else send(ws,{type:'resumed',id:client.id,roomId:client.roomId,region:client.region,resumeToken:client.resumeToken,snapshot:getRoom(client).snapshot(client.id)});
    ws.on('message',raw=>{metrics.messages++;if(raw.length>16*1024){metrics.oversized++;ws.close(4009,'payload-too-large');return;}const limited=limiter.allow(client.identity.sub);if(!limited.allowed){metrics.rateLimited++;send(ws,{type:'rate_limited',retryAt:limited.resetAt});return;}try{const msg=JSON.parse(raw.toString());if(msg.type==='start'){getRoom(client)?.start(client.id,msg.entry||'belt');return;}if(msg.type!=='input')return;const room=getRoom(client),candidate={...msg.input,seq:msg.input?.seq??-1},p=room?.players.get(client.id),previous={...client.input,x:p?.x??550,y:p?.y??330},result=validateInput(previous,candidate,1/20);if(!result.ok){client.violations.add(result.violations);metrics.rejections++;metrics.violations+=result.violations.length;send(ws,{type:'rejected',violations:result.violations,strikes:client.violations.count});if(client.violations.banned){metrics.bans++;send(ws,{type:'banned',reason:'anti-cheat threshold'});ws.close(4003,'anti-cheat');}return;}client.input=candidate;client.seq=candidate.seq;room?.input(client.id,candidate,1/20);}catch{client.violations.add(['malformed_message']);metrics.violations++;}});
    ws.on('close',()=>{const expiresAt=Date.now()+15000;durable.setSession(client.resumeToken,{id:client.id,userId:user.sub,roomId:client.roomId,expiresAt});clients.delete(client.id);});
  });
  const timer=setInterval(()=>{metrics.ticks++;for(const room of rooms.values()){room.tick(1/20);for(const c of clients.values())if(c.roomId===room.id)send(c.ws,{type:'snapshot',snapshot:room.snapshot(c.id),events:[]});}},50);
  const cleanup=setInterval(()=>{for(const [id,room] of rooms)if(room.players.size===0&&Date.now()-room.lastActivity>60000)rooms.delete(id);for(const session of durable.listSessions())if(session.expiresAt<Date.now())durable.deleteSession(Object.keys(durable.data.sessions).find(k=>durable.data.sessions[k]===session));},10000);
  return {server,wss,rooms,clients,queue,metrics,auth:identity,store:durable,rateStore,close:()=>{clearInterval(timer);clearInterval(cleanup);for(const c of clients.values())c.ws.close();return new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){const app=createAuthoritativeServer();app.server.listen(Number(process.env.PORT||8787),()=>console.log(`[CIGKV authoritative] http://localhost:${process.env.PORT||8787} | /ws | /auth/login | /admin.html`));}
