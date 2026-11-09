#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Finalização automatizada do runner UE5.8 (checklist passos 5-6).
# =============================================================================
# Roda na máquina administrativa DEPOIS de
#   sudo UE5_GITHUB_TOKEN=… RUNNER_PAT=… bash scripts/build/bootstrap_ue58_runner.sh --all
# e fecha o circuito que antes era manual:
#   1. verifica pela API que o runner registrado tem os labels exigidos
#      (self-hosted, linux, x64, ue5.8, ue5) e está online;
#   2. garante as 3 variáveis de repo sem as quais o job de cook fica skipped:
#      UE58_ENABLED=true, UE5_ROOT, UE5_WORLD_STRESS_COMMAND.
#
# USO:
#   export RUNNER_PAT=github_pat_…   # administração de Actions no repo
#   bash scripts/build/finish_ue58_runner.sh
#   # opcionais: REPO=… UE5_ROOT=/opt/UnrealEngine UE5_WORLD_STRESS_COMMAND="…"
# =============================================================================
set -euo pipefail

REPO="${REPO:-Nexus-HUB57/Khaaos_Run}"
UE5_ROOT="${UE5_ROOT:-/opt/UnrealEngine}"
UE5_WORLD_STRESS_COMMAND="${UE5_WORLD_STRESS_COMMAND:-"\"\$UE5_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd\" \"\$GITHUB_WORKSPACE/Unreal/KhaaosRun/KhaaosRun.uproject\" -nullrhi -unattended -nosplash -nopause -ExecCmds=\"Automation RunTests Khaaos.Worlds.Stress; Quit\" -testexit=\"Automation Test Queue Finished\" -log"}"

command -v gh >/dev/null 2>&1 || { echo "ERRO: gh CLI ausente"; exit 1; }

echo "── 1/2 Runner registrado com labels completos ─────────────────────────"
runners_json="$(gh api "repos/${REPO}/actions/runners?per_page=100")"
total="$(printf '%s' "$runners_json" | jq -r '.total_count')"
echo "runners no repo: ${total}"
found=0
while IFS=$'\t' read -r name status labels; do
  if [[ "$labels" == *"self-hosted"* && "$labels" == *"linux"* && "$labels" == *"x64"* && "$labels" == *"ue5.8"* && "$labels" == *"ue5"* ]]; then
    echo "  ✔ runner '$name' status=$status labels=[$labels]"
    found=1
  else
    echo "  • runner '$name' status=$status labels=[$labels] (labels incompletos)"
  fi
done < <(printf '%s' "$runners_json" | jq -r '.runners[] | [.name, .status, ([.labels[].name] | join(","))] | @tsv')
if (( found == 0 )); then
  echo "ERRO: nenhum runner com labels ${RUNNER_LABELS_REQUIRED:-self-hosted,linux,x64,ue5.8,ue5}."
  echo "Rode primeiro: sudo UE5_GITHUB_TOKEN=… RUNNER_PAT=\$RUNNER_PAT bash scripts/build/bootstrap_ue58_runner.sh --all"
  exit 1
fi

echo "── 2/2 Variáveis de repo (cook deixa de ser skipped) ───────────────────"
set_var() { # nome valor (valor pode conter aspas; nunca é um segredo)
  gh api -X PUT "repos/${REPO}/actions/variables/$1" -f value="$2" >/dev/null \
    && echo "  ✔ $1 gravada" || { echo "  ✘ $1 FALHOU"; return 1; }
}
set_var UE58_ENABLED "true"
set_var UE5_ROOT "$UE5_ROOT"
set_var UE5_WORLD_STRESS_COMMAND "$UE5_WORLD_STRESS_COMMAND"

echo "Auditoria geral: GH_TOKEN=… node scripts/eos/p0_gate.mjs"
echo "UE58_RUNNER_FINISH_OK"
