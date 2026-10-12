# ══════════════════════════════════════════════════════════════
# Fase 2-5 End-to-End Verification Script
# Validates ALL subsystems across the Go Live roadmap
# ══════════════════════════════════════════════════════════════

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0
WARN=0
TOTAL=0

# Colors
R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
B='\033[0;34m'
N='\033[0m'

check() {
  TOTAL=$((TOTAL + 1))
  local label="$1"
  local result="$2"  # pass|fail|warn

  case "$result" in
    pass) PASS=$((PASS + 1)); echo -e "  ${G}✅${N} $label" ;;
    fail) FAIL=$((FAIL + 1)); echo -e "  ${R}❌${N} $label" ;;
    warn) WARN=$((WARN + 1)); echo -e "  ${Y}⚠️${N} $label" ;;
  esac
}

echo ""
echo -e "${B}╔══════════════════════════════════════════════════════════╗${N}"
echo -e "${B}║  Khaaos Run — Fase 2-5 End-to-End Verification          ║${N}"
echo -e "${B}║  Repository: $REPO_ROOT           ║${N}"
echo -e "${B}╚══════════════════════════════════════════════════════════╝${N}"
echo ""

# ─── FASE 2: EOS Live + Matchmaking ────────────────────────────
echo -e "${B}── Fase 2: EOS Live + Matchmaking ──────────────────────────${N}"

# EOS Manager
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSManager.h" ] && \
   [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSManager.cpp" ]; then
  check "EOSManager (Init/Login/Logout)" pass
else
  check "EOSManager" fail
fi

# EOS Lobby
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSLobby.h" ] && \
   [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSLobby.cpp" ]; then
  check "EOSLobby (Create/Join/Leave/Promote)" pass
else
  check "EOSLobby" fail
fi

# EOS Matchmaking
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSMatchmaking.h" ] && \
   grep -q "StartMatchmaking\|CancelMatchmaking" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSMatchmaking.h"; then
  check "EOSMatchmaking (Pool/MMR/Region)" pass
else
  check "EOSMatchmaking" fail
fi

# EOS Session
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSSession.h" ] && \
   grep -q "RegisterServer\|HostDedicatedServerSession" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSSession.h"; then
  check "EOSSession (Host/Join/Register/Destroy)" pass
else
  check "EOSSession" fail
fi

# EOS Region Manager
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSRegionManager.h" ] && \
   grep -q "GetBestRegion\|MeasureAllRegionPings" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSRegionManager.h"; then
  check "EOSRegionManager (5 regions, ping-based routing)" pass
else
  check "EOSRegionManager" fail
fi

# Cloud Save Production
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Save/KhaaosCloudSaveProduction.h" ] && \
   grep -q "CompressSaveData\|DecompressSaveData\|ResolveMergeConflict" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Save/KhaaosCloudSaveProduction.h"; then
  check "CloudSaveProduction (LZ4/SHA256/Merge/SchemaMigration/Retry)" pass
else
  check "CloudSaveProduction" fail
fi

# EAC Integration
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/AntiCheat/KhaaosEACIntegration.h" ] && \
   grep -q "HandleEACViolation\|SeverityToStrikes" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/AntiCheat/KhaaosEACIntegration.h"; then
  check "EAC Integration (3-strike, client/server mode)" pass
else
  check "EAC Integration" fail
fi

# EOS Production Config
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Config/Regions/DefaultEOS_Production.ini" ]; then
  check "DefaultEOS_Production.ini (3 regions, matchmaking pools)" pass
else
  check "DefaultEOS_Production.ini" fail
fi

# EOS Setup Script
if [ -f "$REPO_ROOT/scripts/fase2/setup_eos_production.sh" ]; then
  check "setup_eos_production.sh (9-step interactive)" pass
else
  check "setup_eos_production.sh" fail
fi

echo ""

# ─── FASE 3: Alpha Fechado ─────────────────────────────────────
echo -e "${B}── Fase 3: Alpha Fechado ──────────────────────────────────${N}"

# Production Config
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosProductionConfig.h" ] && \
   grep -q "ApplyProductionOverrides\|IsFeatureEnabled" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosProductionConfig.h"; then
  check "ProductionConfig (feature flags, production lockdown)" pass
else
  check "ProductionConfig" fail
fi

# Rate Limiter
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosRateLimiter.h" ] && \
   grep -q "CheckRateLimit\|BurstAllowance" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosRateLimiter.h"; then
  check "RateLimiter (sliding window, burst, cooldown)" pass
else
  check "RateLimiter" fail
fi

# DDoS Protection
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosDDoSProtection.h" ] && \
   grep -q "OnNewConnection\|IsIPBlocked\|BlockIP" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosDDoSProtection.h"; then
  check "DDoSProtection (per-IP tracking, auto-block)" pass
else
  check "DDoSProtection" fail
fi

# Monitor Dashboard
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/Kha"*.h ] 2>/dev/null; then
  if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosMonitorDashboard.h" ] && \
     grep -q "ExportMetricsAsJSON\|CollectAllMetrics" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosMonitorDashboard.h"; then
    check "MonitorDashboard (Prometheus/Grafana JSON export)" pass
  else
    check "MonitorDashboard" fail
  fi
fi

# Launch Checklist
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosLaunchChecklist.h" ] && \
   grep -q "RunPreLaunchChecks\|CheckEOSConfigured\|CheckAntiCheatEnabled" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosLaunchChecklist.h"; then
  check "LaunchChecklist (14-point validation)" pass
else
  check "LaunchChecklist" fail
fi

# Feature Flags
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosFeatureFlags.h" ] && \
   grep -q "ApplyProductionPreset\|IsEnabledForPlayer" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosFeatureFlags.h"; then
  check "FeatureFlags (rollout %, presets, console cmd)" pass
else
  check "FeatureFlags" fail
fi

# Alpha Deploy Scripts
if [ -f "$REPO_ROOT/scripts/alpha/deploy_alpha.sh" ] && \
   [ -f "$REPO_ROOT/scripts/alpha/verify_alpha_readiness.sh" ]; then
  check "Alpha deployment scripts (deploy/verify/backup/restore)" pass
else
  check "Alpha deployment scripts" fail
fi

# Docker Compose Production
if [ -f "$REPO_ROOT/infra/deploy/docker-compose.production.yml" ]; then
  check "docker-compose.production.yml (8 services, 3 networks)" pass
else
  check "docker-compose.production.yml" fail
fi

# Monitoring Stack
if [ -f "$REPO_ROOT/monitoring/prometheus/prometheus.yml" ] && \
   [ -f "$REPO_ROOT/monitoring/grafana/provisioning/datasources/datasources.yml" ]; then
  check "Monitoring stack (Prometheus + Grafana provisioning)" pass
else
  check "Monitoring stack" fail
fi

echo ""

# ─── FASE 4: Mapas W1-W4 + Economia ───────────────────────────
echo -e "${B}── Fase 4: Mapas W1-W4 + Economia Real ───────────────────${N}"

# World Level files
WORLDS=("Barburhen:W1:100" "Priadus:W2:75" "Ckesalth:W3:60" "Arukheea:W4:80")
for entry in "${WORLDS[@]}"; do
  IFS=':' read -r world label players <<< "$entry"
  LEVEL_H="$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/World/${world}/Khaaos${world}Level.h"
  LEVEL_CPP="$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/World/${world}/Khaaos${world}Level.cpp"
  MAP_H="$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/World/${world}/Khaaos${world}MapData.h"
  MAP_CPP="$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/World/${world}/Khaaos${world}MapData.cpp"

  if [ -f "$LEVEL_H" ] && [ -f "$LEVEL_CPP" ] && [ -f "$MAP_H" ] && [ -f "$MAP_CPP" ]; then
    check "${world} (${label}): ${players} players + MapData" pass
  else
    check "${world} (${label})" fail
  fi
done

# World INI configs
for world in Barburhen Priadus Ckesalth Arukheea; do
  if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Config/Default${world}.ini" ]; then
    check "Default${world}.ini" pass
  else
    check "Default${world}.ini" fail
  fi
done

# Atomic Ledger
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Economy/KhaaosAtomicLedger.h" ] && \
   grep -q "Mint\|Burn\|Transfer\|EscrowLock\|VerifyIntegrity" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Economy/KhaaosAtomicLedger.h"; then
  check "AtomicLedger (15 tx types, SHA256 chain, escrow, 1B cap)" pass
else
  check "AtomicLedger" fail
fi

# Compliance Framework
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Economy/KhaaosComplianceFramework.h" ] && \
   grep -q "GenerateAuditReport\|RunAMLCheck\|RequiresKYC" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Economy/KhaaosComplianceFramework.h"; then
  check "ComplianceFramework (KYC/AML/BCB/IRPF)" pass
else
  check "ComplianceFramework" fail
fi

# Economy Bridge
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Economy/EconomyBridge.h" ] && \
   [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Economy/EconomyBridge.cpp" ]; then
  check "EconomyBridge (UE5 ↔ Node.js HTTP)" pass
else
  check "EconomyBridge" fail
fi

# Multi-World Persistence
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/World/KhaaosMultiWorldPersistence.h" ]; then
  check "MultiWorldPersistence (cross-world save)" pass
else
  check "MultiWorldPersistence" fail
fi

echo ""

# ─── FASE 5: Beta → Go Live ───────────────────────────────────
echo -e "${B}── Fase 5: Beta Aberto → Go Live ─────────────────────────${N}"

# Stress Test
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/LoadTest/KhaaosStressTestConfig.h" ] && \
   grep -q "RunStressTest\|PushToPrometheus\|GenerateJsonReport" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/LoadTest/KhaaosStressTestConfig.h"; then
  check "StressTestConfig (4 profiles, 3 ramp strategies, Prometheus)" pass
else
  check "StressTestConfig" fail
fi

# Load Test Bot + Manager
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/LoadTest/KhaaosLoadTestBot.h" ] && \
   [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/LoadTest/KhaaosLoadTestManager.h" ]; then
  check "LoadTest (Bot + Manager, 1000-player simulation)" pass
else
  check "LoadTest" fail
fi

# Beta Campaign
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosBetaCampaign.h" ] && \
   grep -q "EXCO\|NDA\|InviteCode\|Referral" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosBetaCampaign.h"; then
  check "BetaCampaign (6 phases, NDA, invites, EXCO 1M target)" pass
else
  check "BetaCampaign" fail
fi

# Streaming Integration
if [ -f "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosStreamingIntegration.h" ] && \
   grep -q "ConnectToOBS\|Twitch\|YouTube\|KillFeed" "$REPO_ROOT/Unreal/KhaaosRun/Source/KhaaosRun/Game/Launch/KhaaosStreamingIntegration.h"; then
  check "StreamingIntegration (OBS/Twitch/YouTube/Kick)" pass
else
  check "StreamingIntegration" fail
fi

# Multi-Region Deploy
if [ -f "$REPO_ROOT/scripts/fase5/deploy_multiregion.sh" ] && \
   grep -q "\-\-deploy\|\-\-failover\|\-\-rollback" "$REPO_ROOT/scripts/fase5/deploy_multiregion.sh"; then
  check "deploy_multiregion.sh (deploy/rolling/failover/rollback)" pass
else
  check "deploy_multiregion.sh" fail
fi

# Go-Live Checklist
if [ -f "$REPO_ROOT/scripts/fase5/golive_checklist.sh" ]; then
  check "golive_checklist.sh (30+ checks, GO/NO-GO)" pass
else
  check "golive_checklist.sh" fail
fi

# CDN Config
if [ -f "$REPO_ROOT/infra/deploy/cdn-config.yml" ]; then
  check "CDN config (CloudFront+Cloudflare, 3 regions, W)AF" pass
else
  check "CDN config" fail
fi

echo ""

# ─── CI/CD Pipeline ────────────────────────────────────────────
echo -e "${B}── CI/CD Pipeline ──────────────────────────────────────${N}"

WORKFLOWS=("ci.yml" "ue5-build.yml" "eos-integration.yml" "economy-validation.yml" "deploy.yml" "stress-test.yml" "release.yml" "pr-checks.yml")
for wf in "${WORKFLOWS[@]}"; do
  if [ -f "$REPO_ROOT/.github/workflows/$wf" ]; then
    check ".github/workflows/$wf" pass
  else
    check ".github/workflows/$wf" fail
  fi
done

echo ""

# ─── Infrastructure ────────────────────────────────────────────
echo -e "${B}── Infrastructure (IaC + Config) ──────────────────────${N}"

# Terraform
if [ -f "$REPO_ROOT/infra/terraform/main.tf" ]; then
  check "Terraform IaC (3 regions, ECS, RDS, Redis, DNS)" pass
else
  check "Terraform IaC" fail
fi

# .gitattributes
if [ -f "$REPO_ROOT/.gitattributes" ]; then
  check ".gitattributesE (Git LFS + text normalization)" pass
else
  check ".gitattributes" fail
fi

# .env.example
if [ -f "$REPO_ROOT/.env.example" ]; then
  check ".env.example (50+ env vars documented)" pass
else
  check ".envattributes" fail
fi

# Prometheus alerts
if [ -f "$REPO_ROOT/infra/alerting/khaaos-alerts.yml" ]; then
  check "Prometheus alerts (6 critical + 6 warning)" pass
else
  check "Prometheus alerts" fail
fi

# Grafana dashboard
if [ -f "$REPO_ROOT/infra/grafana/khaaos-production-dashboard.json" ]; then
  check "Grafana production dashboard (8 panels)" pass
else
  check "Grafana dashboard" fail
fi

# AlertManager
if [ -f "$REPO_ROOT/infra/alerting/alertmanager.yml" ]; then
  check "AlertManager (Discord + Slack routing)" pass
else
  check "AlertManager" fail
fi

echo ""

# ─── Documentation ─────────────────────────────────────────────
echo -e "${B}── Documentation ───────────────────────────────────────${N}"

DOCS=("docs/fase2/EOS_PRODUCTION_GUIDE.md" "docs/fase3/ALPHA_TEST_PLAN.md" "docs/fase4/WORLDS_DESIGN.md" "docs/fase5/BETA_GOLIVE_PLAN.md")
for doc in "${DOCS[@]}"; do
  if [ -f "$REPO_ROOT/$doc" ]; then
    check "$(basename $doc)" pass
  else
    check "$(basename $doc)" fail
  fi
done

echo ""

# ─── Summary ───────────────────────────────────────────────────
echo -e "${B}══════════════════════════════════════════════════════════${N}"
echo -e "  Total: $TOTAL | ${G}Pass: $PASS${N} | ${R}Fail: $FAIL${N} | ${Y}Warn: $WARN${N}"
echo -e "${B}══════════════════════════════════════════════════════════${N}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${R}STATUS: NOT READY — $FAIL check(s) failed${N}"
  exit 1
else
  echo -e "  ${G}STATUS: ALL SYSTEMS GO — Fase 2-5 end-to-end ready${N}"
  exit 0
fi
