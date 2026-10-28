#!/usr/bin/env bash
# Khaaos Run — Compilação dos mundos jogáveis via UE5.8 (commandlet Python).
#
# Executa scripts/build/generate_worlds.py dentro do Unreal Editor-Cmd e extrai
# o contrato JSON (linha "KHR_WORLDGEN_RESULT_JSON: {...}").
#
# Uso:
#   ./build_worlds.sh                    # gera mundos (exige editor local)
#   UE_ROOT=/epics/UE_5.8 ./build_worlds.sh
#   ./build_worlds.sh --check            # valida pipeline SEM editor (repo only)
#
# Sem editor disponível o script sai 0 com status "editor_unavailable" — o
# build de mundos é opt-in local/runner self-hosted, nunca bloqueia CI hosted.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/build/generate_worlds.py"
UPROJECT="$REPO_ROOT/Unreal/KhaaosRun/KhaaosRun.uproject"
LOG="/tmp/khaaos-worldgen-$$.log"

fail() { echo "KHR_WORLDGEN_RESULT_JSON: {\"status\":\"failed\",\"reason\":\"$1\"}"; exit 1; }

[ -f "$SCRIPT" ] || fail generate_worlds_py_missing
[ -f "$UPROJECT" ] || fail uproject_missing

if [ "${1:-}" = "--check" ]; then
  # Validação engine-less: pipeline presente, uproject com módulos e mapas no ini.
  node "$REPO_ROOT/scripts/build/ue58_preflight.mjs" "$REPO_ROOT/Unreal/KhaaosRun" > /dev/null || true
  grep -q "GameDefaultMap" "$REPO_ROOT/Unreal/KhaaosRun/Config/DefaultEngine.ini" \
    || fail gamedefaultmap_not_configured
  for fn in create_materials build_menu_map build_br_map create_niagara main; do
    grep -q "^def ${fn}(" "$SCRIPT" || fail "missing_function:${fn}"
  done
  # Fase 1 — pipeline Barburhen OBJ + colliders complexos (selftests determinísticos)
  python3 "$REPO_ROOT/scripts/build/export_barburhen_obj.py" --selftest >/dev/null || fail barburhen_obj_selftest
  python3 "$REPO_ROOT/scripts/build/bake_barburhen_colliders.py" --selftest >/dev/null || fail barburhen_colliders_selftest
  # Fase 2 — mundos 2-5 (Priadus/Ckesalth/Arukheea/CIGKV): OBJ + colliders engine-less
  python3 "$REPO_ROOT/scripts/build/export_world_obj.py" --selftest >/dev/null || fail world_obj_selftest
  python3 "$REPO_ROOT/scripts/build/bake_world_colliders.py" --selftest >/dev/null || fail world_colliders_selftest
  # Manifestos commitados (quando presentes) devem respeitar o contrato de import
  python3 - "$REPO_ROOT" <<'PY' || fail world_colliders_manifest_contract
import json, os, sys
root = sys.argv[1]
for world in ("Priadus", "Ckesalth", "Arukheea", "CIGKV"):
    path = os.path.join(root, "Unreal", "KhaaosRun", "Content", world, f"{world}_colliders.json")
    if not os.path.isfile(path):
        continue  # geração é opt-in; manifest ausente não falha o check
    data = json.load(open(path, encoding="utf-8"))
    assert data["version"] == 1, world
    assert data["import"]["collision_complexity"] == "UseComplexAsSimple", world
    assert data["objects"], world
PY
  echo 'KHR_WORLDGEN_RESULT_JSON: {"status":"ok","mode":"check","maps":[],"materials":[],"niagara":[],"warnings":[]}'
  exit 0
fi

# ── Modo engine-less: bake dos colliders dos mundos 2-5 (sem editor) ─────────
if [ "${1:-}" = "--colliders" ]; then
  python3 "$REPO_ROOT/scripts/build/export_world_obj.py" --all >/dev/null || fail world_obj_export
  for world in priadus ckesalth arukheea cigkv; do
    python3 "$REPO_ROOT/scripts/build/bake_world_colliders.py" "--world=$world" \
      || fail "world_colliders_bake:${world}"
  done
  echo 'KHR_WORLDGEN_RESULT_JSON: {"status":"ok","mode":"colliders","maps":["Priadus","Ckesalth","Arukheea","CIGKV"],"materials":[],"niagara":[],"warnings":[]}'
  exit 0
fi

# ── Localiza o editor ────────────────────────────────────────────────────────
EDITOR_CMD="${UE_EDITOR_CMD:-}"
if [ -z "$EDITOR_CMD" ]; then
  if [ -n "${UE_ROOT:-}" ]; then
    for cand in "$UE_ROOT/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" "$UE_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd" "$UE_ROOT/Engine/Binaries/Win64/UnrealEditor.exe"; do
      [ -x "$cand" ] && { EDITOR_CMD="$cand"; break; }
    done
  fi
fi
if [ -z "$EDITOR_CMD" ]; then
  echo 'KHR_WORLDGEN_RESULT_JSON: {"status":"ok","mode":"editor_unavailable","message":"defina UE_ROOT ou UE_EDITOR_CMD — geração de mundos é opt-in local/runner (UE ~90 GB, licenciado)","maps":[],"materials":[],"niagara":[],"warnings":[]}'
  exit 0
fi

# ── Roda o commandlet e extrai o JSON do contrato ────────────────────────────
"$EDITOR_CMD" "$UPROJECT" -run=pythonscript -script="$SCRIPT" \
  -unattended -nopause -nosplash -nullrhi > "$LOG" 2>&1 || true
RESULT="$(grep -o 'KHR_WORLDGEN_RESULT_JSON: .*' "$LOG" | tail -1 | sed 's/^KHR_WORLDGEN_RESULT_JSON: //')"
if [ -z "$RESULT" ]; then
  echo "KHR_WORLDGEN_RESULT_JSON: {\"status\":\"failed\",\"reason\":\"no_result_marker\",\"log\":\"$LOG\"}"
  tail -20 "$LOG" || true
  exit 1
fi
echo "KHR_WORLDGEN_RESULT_JSON: $RESULT"
python3 - "$RESULT" <<'PY' || exit 1
import json, sys
data = json.loads(sys.argv[1])
assert data.get("status") in ("ok", "partial"), data
PY
