export class NetworkClient {
  constructor({url,onStatus,onSnapshot,onEvent,onRejected}={}){this.url=url;this.onStatus=onStatus;this.onSnapshot=onSnapshot;this.onEvent=onEvent;this.onRejected=onRejected;this.socket=null;this.latest=null;this.previous=null;this.offset=0;}
  connect(){this.socket=new WebSocket(this.url);this.socket.onopen=()=>this.onStatus?.('CONECTANDO AO RING');this.socket.onclose=()=>this.onStatus?.('DESCONECTADO');this.socket.onerror=()=>this.onStatus?.('FALHA DE REDE');this.socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.type==='welcome'||msg.type==='match_found'){this.onStatus?.(`MATCHMAKING // ${msg.roomId||'FILA'}`);if(msg.snapshot)this.push(msg.snapshot);}if(msg.type==='snapshot')this.push(msg.snapshot);if(msg.type==='rejected')this.onRejected?.(msg);if(msg.type==='banned')this.onStatus?.('BANIDO PELO ANTI-CHEAT');};}
  push(snapshot){this.previous=this.latest||snapshot;this.latest={snapshot,receivedAt:performance.now()};this.onSnapshot?.(snapshot);snapshot.events?.forEach(e=>this.onEvent?.(e));}
  send(type,payload){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify({type,...payload}));}
  sendInput(input){this.send('input',{input:{...input,clientDt:.05}});}
  start(entry){this.send('start',{entry});}
  interpolate(alpha=0.5){if(!this.previous||!this.latest)return this.latest?.snapshot;const a=this.previous.snapshot,b=this.latest.snapshot;const blend=(x,y)=>x+(y-x)*alpha;const player=b.player?{...b.player,x:blend(a.player?.x??b.player.x,b.player.x),y:blend(a.player?.y??b.player.y,b.player.y)}:null;return {...b,player};}
}
