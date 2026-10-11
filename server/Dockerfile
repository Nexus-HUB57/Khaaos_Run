# The backend is part of the root Node application; build with repository root as context.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

ENV NODE_ENV=production
ENV PORT=5000
COPY --from=build --chown=node:node /app/dist ./dist
USER node

EXPOSE 5000
CMD ["npm", "start"]
