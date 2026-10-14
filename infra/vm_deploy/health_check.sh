#!/usr/bin/env bash
# Khaaos Run — Health Check Script
# Copyright Nexus-HUB57
set -euo pipefail

OK=0
FAIL=0

check() {
    if eval "$2"; then
        echo "  ✅ $1"
        ((OK++))
    else
        echo "  ❌ $1"
        ((FAIL++))
    fi
}

echo "━━━ Khaaos Run Health Check ━━━"

check "Docker daemon"        "sudo docker info &>/dev/null"
check "Economy API (3001)"   "curl -sf http://localhost:3001/health &>/dev/null"
check "PostgreSQL (5432)"    "pg_isready -h localhost -p 5432 &>/dev/null"
check "Redis (6379)"         "redis-cli -h localhost ping &>/dev/null"
check "UE5 Server (7777)"    "curl -sf http://localhost:7777 &>/dev/null || nc -z localhost 7777 &>/dev/null"
check "tmux session"         "tmux has-session -t khaaos_server 2>/dev/null"
check "Prometheus (9090)"    "curl -sf http://localhost:9090/-/healthy &>/dev/null"
check "Grafana (3000)"       "curl -sf http://localhost:3000/api/health &>/dev/null"

echo ""
echo "Results: $OK passed, $FAIL failed out of $((OK+FAIL)) checks"
if [[ $FAIL -gt 0 ]]; then
    echo "⚠️  Some services are not healthy!"
    exit 1
fi
echo "✅ All services healthy!"
