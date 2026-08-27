# Многоступенчатая сборка: в итоговый образ не попадают ни исходники,
# ни инструменты сборки.
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

# Манифесты всех рабочих пространств: pnpm сверяет лок-файл целиком
# и отказывается ставить, если хоть один importer отсутствует.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @cairn/shared build && pnpm --filter @cairn/api build

FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
