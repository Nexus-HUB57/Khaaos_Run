# =============================================================================
# Khaaos Run — UE5.8 Linux Dedicated Server | Multi-Stage Docker Build
# Devs Ph.D | Copyright Nexus-HUB57. All Rights Reserved.
# =============================================================================
#
# Stage 1 (builder): ~50GB — Compiles UE5.8 Linux dedicated server
# Stage 2 (runtime): ~5GB  — Minimal Ubuntu runtime with server binary
#
# Ports:
#   7777  — Game traffic (UDP)
#   7778  — Beacon port (UDP)
#   27015 — Steam query port (UDP)
#
# Usage:
#   docker build -t khaaos-server:latest .
#   docker run -p 7777:7777/udp -p 7778:7778/udp -p 27015:27015/udp khaaos-server
# =============================================================================

# ── Stage 1: Build UE5 Linux Server ──────────────────────────────────────────────
FROM ghcr.io/epicgames/unreal-engine:dev-slim-5.8 AS builder

LABEL maintainer="devs@khaaos.run" \
      org.opencontainers.image.title="Khaaos Run Dedicated Server Builder" \
      org.opencontainers.image.description="UE5.8 Linux dedicated server build stage" \
      org.opencontainers.image.vendor="Nexus-HUB57" \
      org.opencontainers.image.version="1.0.0"

WORKDIR /project

# Copy project files first for better layer caching
COPY KhaaosRun.uproject .
COPY Source/ Source/
COPY Config/ Config/

# Generate project files
RUN /home/ue4/UnrealEngine/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh \
      -project=/project/KhaaosRun.uproject \
      -game \
      -engine

# Build dedicated server target (Linux Server)
RUN /home/ue4/UnrealEngine/Engine/Build/BatchFiles/Linux/Build.sh \
      KhaaosRunServer Linux Development \
      -project=/project/KhaaosRun.uproject \
      -WaitMutex -FromDist

# Package the server build
RUN /home/ue4/UnrealEngine/Engine/Build/BatchFiles/RunUAT.sh \
      BuildCookRun \
      -project=/project/KhaaosRun.uproject \
      -noP4 \
      -platform=Linux \
      -target=KhaaosRunServer \
      -serverconfig \
      -cook \
      -build \
      -stage \
      -pak \
      -archive \
      -archivedirectory=/project/PackagedServer

# ── Stage 2: Minimal Runtime ─────────────────────────────────────────────────────
FROM ubuntu:22.04 AS runtime

LABEL maintainer="devs@khaaos.run" \
      org.opencontainers.image.title="Khaaos Run Dedicated Server" \
      org.opencontainers.image.description="Production UE5.8 Linux dedicated server for Khaaos Run" \
      org.opencontainers.image.vendor="Nexus-HUB57" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Nexus-HUB57/Khaaos_Run"

# Avoid interactive prompts during package install
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
      libSDL2-2.0-0 \
      libopus0 \
      libvorbis0a \
      libogg0 \
      libfontconfig1 \
      libfreetype6 \
      libpng16-16 \
      libjpeg-turbo8 \
      libopenexr25 \
      libtbb2 \
      libcurl4 \
      locales \
      ca-certificates \
      && rm -rf /var/lib/apt/lists/*

# Generate UTF-8 locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8 \
      LANGUAGE=en_US:en \
      LC_ALL=en_US.UTF-8

# Create non-root user for security
RUN groupadd -r khaaos && useradd -r -g khaaos -d /home/khaaos -s /sbin/nologin khaaos

# Copy packaged server from builder
COPY --from=builder /project/PackagedServer/LinuxServer /home/khaaos/server

# Set ownership
RUN chown -R khaaos:khaaos /home/khaaos/server

# Create directories for logs, config, and saved data
RUN mkdir -p /home/khaaos/server/KhaaosRun/Saved/Logs \
      && mkdir -p /home/khaaos/server/KhaaosRun/Saved/Config \
      && mkdir -p /home/khaaos/server/KhaaosRun/Saved/Cloud \
      && chown -R khaaos:khaaos /home/khaaos/server/KhaaosRun/Saved

# Switch to non-root user
USER khaaos
WORKDIR /home/khaaos/server

# ── Environment Variables ────────────────────────────────────────────────────────
ENV SERVER_NAME="KhaaosRun-Server" \
      MAX_PLAYERS=100 \
      MAP_NAME="Main" \
      GAME_MODE="KhaaosGameMode" \
      TICK_RATE=60 \
      REGION="us-east-1" \
      ADDITIONAL_ARGS=""

# Expose game ports
EXPOSE 7777/udp \
       7778/udp \
       27015/udp

# Volume mount points for persistent data
VOLUME ["/home/khaaos/server/KhaaosRun/Saved/Logs", \
        "/home/khaaos/server/KhaaosRun/Saved/Config", \
        "/home/khaaos/server/KhaaosRun/Saved/Cloud"]

# Health check — verify server process is listening on game port
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
      CMD pgrep -f "KhaaosRunServer" > /dev/null || exit 1

# Entry point — launch dedicated server
ENTRYPOINT ["/home/khaaos/server/KhaaosRun/Binaries/Linux/KhaaosRunServer"]
CMD ["${MAP_NAME}?listen?MaxPlayers=${MAX_PLAYERS}?Game=${GAME_MODE}", \
     "-port=7777", \
     "-beaconport=7778", \
     "-queryport=27015", \
     "-tickrate=${TICK_RATE}", \
     "-log", \
     "${ADDITIONAL_ARGS}"]
