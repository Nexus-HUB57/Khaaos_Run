// Smoke de transporte do preview: login HTTP + WebSocket autenticado.
// Uso: node scripts/preview_ws_smoke.mjs [baseUrl]
// Valida o caminho EXTERNO (:81 → Caddy → :3000 → proxy /ws → :8787).
const BASE = process.argv[2] || 'http://127.0.0.1:81';

const code = async (url, opts) => {
  try { const r = await fetch(url, opts); return r.status; } catch { return 0; }
};

const health = await code(`${BASE}/healthz`);
console.log(`healthz: ${health}`);
if (health !== 200) { console.log('SMOKE_FAIL healthz'); process.exit(1); }

const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'kr_player', password: 'kr123' }),
});
console.log(`login: ${login.status}`);
if (!login.ok) { console.log('SMOKE_FAIL login'); process.exit(1); }
const { token } = await login.json();
if (!token) { console.log('SMOKE_FAIL token'); process.exit(1); }

const wsOk = await new Promise((resolve) => {
  let done = false;
  const finish = (v) => { if (!done) { done = true; resolve(v); } };
  try {
    const ws = new WebSocket(`ws://${new URL(BASE).host}/ws?token=${encodeURIComponent(token)}&mode=3d`);
    const timer = setTimeout(() => finish(false), 8000);
    ws.onopen = () => console.log('ws: upgrade 101 OK');
    ws.onmessage = (ev) => {
      const s = String(ev.data || '').slice(0, 80);
      console.log(`ws<- ${s}`);
      if (s.includes('{')) { clearTimeout(timer); try { ws.close(); } catch {} finish(true); }
    };
    ws.onerror = () => { clearTimeout(timer); finish(false); };
    ws.onclose = () => { clearTimeout(timer); finish(done && true); };
  } catch { finish(false); }
});

console.log(wsOk ? 'SMOKE_OK' : 'SMOKE_FAIL ws');
process.exit(wsOk ? 0 : 1);
