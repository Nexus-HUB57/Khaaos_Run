import fs from 'node:fs';
import path from 'node:path';

export class DurableJsonStore{constructor(filePath){this.filePath=filePath;this.data={sessions:{},users:{}};this.load();}load(){try{this.data={...this.data,...JSON.parse(fs.readFileSync(this.filePath,'utf8'))};}catch{}return this.data;}flush(){fs.mkdirSync(path.dirname(this.filePath),{recursive:true});const tmp=`${this.filePath}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(this.data));fs.renameSync(tmp,this.filePath);}setSession(id,session){this.data.sessions[id]=session;this.flush();return session;}getSession(id){return this.data.sessions[id]||null;}deleteSession(id){delete this.data.sessions[id];this.flush();}listSessions(){return Object.values(this.data.sessions);}}
