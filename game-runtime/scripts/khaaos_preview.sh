#!/usr/bin/env bash
# khaaos_preview.sh — gerenciador do stack de preview do Khaaos Run
#   server autoritativo :8787 (KR_DEV_AUTH=1) + vite :3000 + gateway :81
# Portátil: RUN_DIR/log por env; default = raiz do game-runtime (pai de scripts/)
# Uso: khaaos_preview.sh start|stop|restart|status
set -u

RUN_DIR="${KR_RUNTIME_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
LOG_DIR="${KR_PREVIEW_LOGS:-/tmp/khaaos-preview-logs}"
GATEWAY_URL="${KR_GATEWAY_URL:-http://127.0.0.1:81/}"
VITE_URL="${KR_VITE_URL:-http://127.0.0.1:3000/}"
SERVER_HEALTH="${KR_SERVER_HEALTH:-http://127.0.0.1:8787/healthz}"
mkdir -p "$LOG_DIR"

http_code() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2>/dev/null; }
alive()     { [ "$(http_code "$1")" != "000" ]; }

stop_all() {
  pkill -f 'node server/server.js' 2>/dev/null
  pkill -f 'vite --config vite.preview.config.js' 2>/dev/null
  sleep 1
}

start_all() {
  if ! alive "$SERVER_HEALTH"; then
    ( cd "$RUN_DIR" && KR_DEV_AUTH=1 PORT=8787 nohup node server/server.js \
        > "$LOG_DIR/server.log" 2>&1 & echo $! > "$LOG_DIR/server.pid" )
    echo "server :8787 → iniciando (pid $(cat "$LOG_DIR/server.pid"))"
  else
    echo "server :8787 → já no ar"
  fi

  if ! alive "$VITE_URL"; then
    ( cd "$RUN_DIR" && nohup npx vite --config vite.preview.config.js \
        > "$LOG_DIR/vite.log" 2>&1 & echo $! > "$LOG_DIR/vite.pid" )
    echo "vite   :3000 → iniciando (pid $(cat "$LOG_DIR/vite.pid"))"
  else
    echo "vite   :3000 → já no ar"
  fi
}

wait_up() {
  local i=0 s v
  while [ $i -lt 40 ]; do
    s=$(http_code "$SERVER_HEALTH")
    v=$(http_code "$VITE_URL")
    if [ "$s" != "000" ] && [ "$v" != "000" ]; then
      echo "PREVIEW: OK (server:$s vite:$v gateway:$(http_code "$GATEWAY_URL"))"
      return 0
    fi
    sleep 1; i=$((i+1))
  done
  echo "PREVIEW: DEGRADADO"
  [ "$s" = "000" ] && echo "  - server :8787 DOWN (log: $LOG_DIR/server.log)" && tail -5 "$LOG_DIR/server.log"
  [ "$v" = "000" ] && echo "  - vite :3000 DOWN (log: $LOG_DIR/vite.log)" && tail -5 "$LOG_DIR/vite.log"
  return 1
}

status_all() {
  local s v g
  s=$(http_code "$SERVER_HEALTH")
  v=$(http_code "$VITE_URL")
  g=$(http_code "$GATEWAY_URL")
  echo "server :8787 → $s | vite :3000 → $v | gateway :81 → $g"
  if [ "$s" != "000" ] && [ "$v" != "000" ]; then
    echo "PREVIEW: OK"
  else
    echo "PREVIEW: DEGRADADO"
  fi
}

case "${1:-status}" in
  start)   start_all; wait_up ;;
  stop)    stop_all; echo "stack parado" ;;
  restart) stop_all; start_all; wait_up ;;
  status)  status_all ;;
  *) echo "uso: $0 start|stop|restart|status"; exit 2 ;;
esac
