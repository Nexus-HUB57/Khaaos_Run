# =============================================================================
# Khaaos Run — Discord Bot Dockerfile | Devs Ph.D
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

USER node
EXPOSE 0

CMD ["node", "bot.js"]
