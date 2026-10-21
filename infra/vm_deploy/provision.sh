#!/usr/bin/env bash
# Khaaos Run — VM Provisioning Script (9-step bootstrap)
# Copyright Nexus-HUB57. Ubuntu 22.04 LTS
set -euo pipefail

LOG="/var/log/khaaos_provision.log"
exec > >(tee -a "$LOG") 2>&1

step() { echo "━━━ Step $1: $2 ━━━"; }

# ─── Step 1: System Update ────────────────────────────────────────────────
step 1 "System Update"
sudo apt-get update -qq && sudo apt-get upgrade -y -qq

# ─── Step 2: Install Docker & Docker Compose ──────────────────────────────
step 2 "Install Docker & Docker Compose"
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
fi
sudo systemctl enable docker && sudo systemctl start docker

# ─── Step 3: Install Node.js 20 ──────────────────────────────────────────
step 3 "Install Node.js 20"
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# ─── Step 4: Install PostgreSQL 16 Client ─────────────────────────────────
step 4 "Install PostgreSQL 16 Client"
sudo apt-get install -y postgresql-client-16 2>/dev/null || sudo apt-get install -y postgresql-client

# ─── Step 5: Configure Firewall ───────────────────────────────────────────
step 5 "Configure Firewall"
sudo ufw --force enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3001/tcp  # Economy API
sudo ufw allow 7777/tcp  # UE5 Dedicated Server
sudo ufw allow 7778/tcp  # UE5 Beacon Port
sudo ufw allow 8111/tcp  # EOS Stats

# ─── Step 6: Clone Repository ─────────────────────────────────────────────
step 6 "Clone Repository"
REPO_DIR="${HOME}/Khaaos_Run"
if [[ ! -d "$REPO_DIR" ]]; then
    git clone https://github.com/nexus-hub57/khaaos-run.git "$REPO_DIR"
fi
cd "$REPO_DIR"

# ─── Step 7: Deploy Economy API ───────────────────────────────────────────
step 7 "Deploy Economy API"
cd infra/economy
cp .env.example .env 2>/dev/null || true
sudo docker compose up -d --build
cd "$REPO_DIR"

# ─── Step 8: Launch UE5 Dedicated Server ──────────────────────────────────
step 8 "Launch UE5 Dedicated Server"
# Server launched in tmux for persistence
if ! tmux has-session -t khaaos_server 2>/dev/null; then
    tmux new-session -d -s khaaos_server -c "$REPO_DIR"
    tmux send-keys -t khaaos_server "./KhaaosRunServer CIGKV -log -port=7777" Enter
fi

# ─── Step 9: Verify All Services ──────────────────────────────────────────
step 9 "Verify All Services"
bash infra/vm_deploy/health_check.sh

echo "━━━ Provisioning Complete ━━━"
