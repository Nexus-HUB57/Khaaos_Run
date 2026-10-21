#!/bin/bash
# Khaaos Run — UE5 Build VM User Data (cloud-init)
# Runs on first boot to set up UE5.8 build environment
set -euo pipefail

BUILD_MODE="${build_mode}"
PROJECT_VERSION="${project_version}"
S3_BUCKET="${s3_bucket}"
UE5_VERSION="5.8"
UE5_INSTALL="/opt/UnrealEngine/${UE5_VERSION}"
REPO_DIR="/opt/khaaos-run"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ─── System Setup ───
log "Installing system dependencies..."
yum update -y
yum install -y git cmake gcc-c++ make python3 python3-pip \
  vulkan vulkan-devel mesa-libGL-devel libX11-devel libXrandr-devel \
  xorg-x11-server-Xvfb zip unzip p7zip p7zip-plugins \
  docker awscli jq Nano

systemctl enable docker
systemctl start docker
usermod -aG docker ec2-user

# ─── NVIDIA GPU Driver (for g5 instances) ───
log "Installing NVIDIA drivers..."
if lspci | grep -q NVIDIA; then
  yum install -y kernel-devel-$(uname -r) kernel-headers-$(uname -r)
  # Use NVIDIA GRID driver for g5 instances
  aws s3 cp --recursive s3://ec2-linux-nvidia-drivers/latest/ /tmp/nvidia/
  chmod +x /tmp/nvidia/NVIDIA-Linux-x86_64*.run
  /tmp/nvidia/NVIDIA-Linux-x86_64*.run --silent
  nvidia-smi || log "WARNING: nvidia-smi failed - GPU may not be fully configured"
fi

# ─── Clone UE5 Engine (source build for Linux Dedicated Server) ───
log "Cloning Unreal Engine ${UE5_VERSION}..."
mkdir -p "${UE5_INSTALL}"
cd "${UE5_INSTALL}"

# Epic's official GitHub mirror requires auth; use ZIP download
git clone --depth 1 --branch ${UE5_VERSION} \
  https://github.com/EpicGames/UnrealEngine.git . \
  2>/dev/null || {
  # Fallback: download release tarball
  log "Git clone failed, downloading UE5 tarball..."
  curl -L "https://releases.unrealengine.com/download/UE${UE5_VERSION}-Linux.zip" \
    -o /tmp/ue5.zip
  unzip -q /tmp/ue5.zip -d "${UE5_INSTALL}"
}

# ─── Build UE5 from Source ───
log "Building UE5 (this takes 2-4 hours on g5.2xlarge)..."
cd "${UE5_INSTALL}"
./Setup.sh
./GenerateProjectFiles.sh

if [ "${BUILD_MODE}" = "headless" ]; then
  # Headless: build only the Dedicated Server target (faster ~1h)
  make KhaaosRunServer Linux -j$(nproc) \
    TARGET=Server CONFIG=Development
else
  # Full: build Editor + Server + Client (~3-4h)
  make -j$(nproc)
fi

log "UE5 build complete."

# ─── Clone Khaaos Run Repository ───
log "Cloning Khaaos Run repository..."
git clone --depth 1 --branch main \
  https://github.com/khaaos-run/khaaos-run.git "${REPO_DIR}" \
  2>/dev/null || {
  log "Falling back to local repo copy..."
  mkdir -p "${REPO_DIR}"
}

# ─── Build Khaaos Run Dedicated Server ───
log "Building Khaaos Run Dedicated Server..."
cd "${REPO_DIR}/Unreal/KhaaosRun"

# Generate project files
"${UE5_INSTALL}/Engine/BuildScripts/GenerateProjectFiles.sh" \
  -project="$(pwd)/KhaaosRun.uproject" -game -engine

# Build server
"${UE5_INSTALL}/Engine/BuildScripts/Build.sh" \
  KhaaosRunServer Linux Development \
  -project="$(pwd)/KhaaosRun.uproject" \
  -build -j$(nproc)

# Package dedicated server
"${UE5_INSTALL}/Engine/BuildScripts/RunUAT.sh" BuildCookRun \
  -project="$(pwd)/KhaaosRun.uproject" \
  -noP4 -platform=Linux -target=KhaaosRunServer \
  -serverconfig=Development -cook -build -stage \
  -archive -archivedirectory="${REPO_DIR}/Build/Dist"

log "Khaaos Run server build complete."

# ─── Upload Build Artifacts to S3 ───
log "Uploading build artifacts to S3..."
BUILD_TAG="v${PROJECT_VERSION}-$(date +%Y%m%d-%H%M%S)"

# Upload dedicated server binary
aws s3 sync "${REPO_DIR}/Build/Dist/" \
  "s3://${S3_BUCKET}/builds/${BUILD_TAG}/server/" \
  --exclude "*.log" --exclude "*.pdb"

# Upload Docker image
cd "${REPO_DIR}"
docker build -t khaaos-run-server:${BUILD_TAG} \
  -f Unreal/KhaaosRun/Build/Dockerfile .
docker save khaaos-run-server:${BUILD_TAG} | \
  gzip > /tmp/khaaos-run-server-${BUILD_TAG}.tar.gz
aws s3 cp /tmp/khaaos-run-server-${BUILD_TAG}.tar.gz \
  "s3://${S3_BUCKET}/builds/${BUILD_TAG}/docker/"

# Write build manifest
cat > /tmp/build-manifest.json << EOF
{
  "version": "${BUILD_TAG}",
  "ue5_version": "${UE5_VERSION}",
  "build_mode": "${BUILD_MODE}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "instance_type": "$(curl -s http://169.254.169.254/latest/meta-data/instance-type)",
  "artifacts": {
    "server_binary": "s3://${S3_BUCKET}/builds/${BUILD_TAG}/server/",
    "docker_image": "s3://${S3_BUCKET}/builds/${BUILD_TAG}/docker/"
  }
}
EOF
aws s3 cp /tmp/build-manifest.json \
  "s3://${S3_BUCKET}/builds/${BUILD_TAG}/manifest.json"

log "========================================="
log "BUILD COMPLETE: ${BUILD_TAG}"
log "Server: s3://${S3_BUCKET}/builds/${BUILD_TAG}/server/"
log "Docker: s3://${S3_BUCKET}/builds/${BUILD_TAG}/docker/"
log "========================================="

# Signal completion
touch /tmp/build-complete
