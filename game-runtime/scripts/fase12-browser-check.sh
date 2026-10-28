#!/usr/bin/env bash
# Fase 12 — validação de browser: julgar a Corte Marcial pela UI REAL do /console
# DURANTE uma partida ao vivo (servidor real + sala IN_PROGRESS + caso pendente).
# Tudo numa única sessão (o ambiente encerra processos entre chamadas).
set -e
cd /home/z/my-project/Khaaos_Run/game-runtime

echo "== [1] sobe servidor + cenário ao vivo =="
node scripts/fase12-live-scenario.mjs > /tmp/f12-live.log 2>&1 &
SCENARIO_PID=$!
for i in $(seq 1 60); do
  curl -s -o /dev/null http://127.0.0.1:8820/healthz && break
  sleep 0.5
done
sleep 6  # cenário: partida inicia + caso remetido
cat /tmp/f12-live.log
echo "== [2] partida ao vivo confirmada (healthz) =="
curl -s http://127.0.0.1:8820/healthz | head -c 220; echo

echo "== [3] /console no browser =="
agent-browser open http://127.0.0.1:8820/console
agent-browser wait 1500
agent-browser snapshot -i -c | head -12

echo "== [4] login kr_admin/kr123 (pré-preenchido) =="
agent-browser find text "Assumir o comando" click
agent-browser wait 2000
agent-browser get text "#meChip" || true

echo "== [5] Banco da Corte com caso pendente (partida EM CURSO) =="
agent-browser wait 2500   # refresh da corte a cada 3s
agent-browser snapshot -i -c | sed -n '1,40p'
agent-browser screenshot /home/z/my-project/download/fase12-console-caso-pendente.png

echo "== [6] VEREDITO pela UI: Honras de guerra · +200 KRC =="
agent-browser find text "Honras de guerra" click
agent-browser wait 2500
echo "-- mensagem do console:"
agent-browser eval "document.querySelector('#cmdMsg').textContent"
echo "-- histórico de julgamentos:"
agent-browser eval "document.querySelector('#courtHist').textContent.trim()"
echo "-- ata do protocolo (veredito_corte_marcial):"
agent-browser eval "Array.from(document.querySelectorAll('#ata div')).map(d => d.textContent).filter(t => t.includes('veredito') || t.includes('corte')).join(' | ')"
agent-browser screenshot /home/z/my-project/download/fase12-console-veredito-aplicado.png

echo "== [7] KRC real no ledger após o julgamento pela UI =="
TOKEN=$(curl -s -X POST http://127.0.0.1:8820/auth/login -H 'content-type: application/json' -d '{"username":"kr_player2","password":"kr123"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
curl -s http://127.0.0.1:8820/economy/balance -H "authorization: Bearer $TOKEN" | tee /dev/stderr | head -c 200; echo
curl -s http://127.0.0.1:8820/economy/history -H "authorization: Bearer $TOKEN" | python3 -c "
import json,sys
h = json.load(sys.stdin)
h = h if isinstance(h, list) else h.get('entries', [])
court = [e for e in h if str(e.get('idempotencyKey','')).startswith('court:')]
print('entries court:', [(e['type'], e['amount'], e['idempotencyKey']) for e in court])"

echo "== [8] encerra =="
kill $SCENARIO_PID 2>/dev/null || true
pkill -f "server/server.js.*8820" 2>/dev/null || true
pkill -f "PORT=8820" 2>/dev/null || true
echo "F12_BROWSER_OK"
