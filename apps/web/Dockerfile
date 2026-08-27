FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @cairn/shared build && pnpm --filter @cairn/web build

FROM node:22-alpine AS runner
WORKDIR /app

# Самодостаточная сборка: сервер и трассированные зависимости уже внутри
# `.next/standalone`, поэтому в итоговом образе не нужны ни пакетный менеджер,
# ни исходники, ни конфиг Next — он вкомпилирован при сборке.
COPY --from=builder /app/apps/web/.next/standalone ./
# Статику Next трассировка не переносит: её кладут рядом с сервером вручную.
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

ENV NODE_ENV=production
ENV PORT=3000
# Без этого сервер слушает только localhost и недоступен из сети Compose.
ENV HOSTNAME=0.0.0.0

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
