# Khaaos Run — game-runtime (servidor autoritativo)
# Imagem de produção/staging: só dependências de runtime, migrações e server.
# Build context deve ser a RAIZ do repo (compose usa context: ../..) para os
# caminhos de COPY serem estáveis: docker build -f game-runtime/Dockerfile .
FROM node:22-alpine AS base
WORKDIR /app
RUN addgroup -S khaaos && adduser -S khaaos -G khaaos

# ── Dependências (camada cacheada; npm ci exige os manifests primeiro) ──────
FROM base AS deps
COPY game-runtime/package.json game-runtime/package-lock.json* /app/game-runtime/
WORKDIR /app/game-runtime
RUN npm ci --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/game-runtime/node_modules /app/game-runtime/node_modules
COPY game-runtime/package.json /app/game-runtime/package.json
COPY game-runtime/server /app/game-runtime/server
# src/ é compartilhado client/server (simulação, rng, armas, cenários 3D)
COPY game-runtime/src /app/game-runtime/src
COPY game-runtime/scripts/migrate.js /app/game-runtime/scripts/migrate.js
COPY game-runtime/migrations /app/game-runtime/migrations
RUN chown -R khaaos:khaaos /app
USER khaaos
WORKDIR /app/game-runtime
EXPOSE 8787
# Healthcheck nativo: liveness sem depender do agente externo.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8787}/healthz" >/dev/null || exit 1
CMD ["node", "server/server.js"]
