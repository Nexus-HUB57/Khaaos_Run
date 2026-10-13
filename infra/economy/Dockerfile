# Khaaos Run — Economy API Dockerfile
# Copyright Nexus-HUB57. Multi-stage Node.js 20 Alpine build

# ─── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build 2>/dev/null || true

# ─── Stage 2: Production ───────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S khaaos && adduser -S khaaos -G khaaos
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
RUN chown -R khaaos:khaaos /app
USER khaaos
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]
