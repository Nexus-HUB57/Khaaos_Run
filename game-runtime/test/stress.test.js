import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAuthoritativeServer } from '../server/server.js';
import { AuthService, hashPassword } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';

test('stress: múltiplos jogadores autenticados por região recebem snapshots', async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kr-stress-'));const auth=new AuthService({secret:'stress-secret',users:[{id:'u1',username:'load',role:'player',region:'sa-east',passwordHash:hashPassword('pass','salt')} ]});const app=createAuthoritativeServer({port:0,roomCapacity:8,auth,store:new DurableJsonStore(path.join(dir,'state.json')),rateStore:new SharedMemoryRateStore(),adminToken:'legacy'});await new Promise(resolve=>app.server.listen(0,resolve));const port=app.server.address().port;const token=auth.login('load','pass').token;const total=24,sockets=[],rooms=new Set();let snapshots=0;await new Promise((resolve,reject)=>{let opened=0;const timeout=setTimeout(()=>reject(new Error(`timeout opened=${opened} snapshots=${snapshots}`)),5000);for(let i=0;i<total;i++){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);sockets.push(ws);ws.on('open',()=>{opened++;ws.send(JSON.stringify({type:'input',input:{seq:1,dx:0,dy:0,aimX:550,aimY:330,fire:false,interact:false}}));});ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.type==='match_found')rooms.add(msg.roomId);if(msg.type==='snapshot')snapshots++;if(rooms.size>=3&&snapshots>=total&&opened===total){clearTimeout(timeout);resolve();}});ws.on('error',reject);}});assert.ok(rooms.size>=3);assert.ok(snapshots>=total);for(const ws of sockets)ws.close();await new Promise(r=>setTimeout(r,50));const metrics=await fetch(`http://127.0.0.1:${port}/admin/metrics?token=legacy`).then(r=>r.json());assert.equal(metrics.metrics.connections,total);assert.equal(metrics.rooms.length,3);const denied=await fetch(`http://127.0.0.1:${port}/admin/metrics?token=wrong`);assert.equal(denied.status,401);await app.close();fs.rmSync(dir,{recursive:true,force:true});});
