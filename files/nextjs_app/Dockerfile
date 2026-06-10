FROM node:22-alpine AS base
WORKDIR /app

# ── 依存関係インストール ──────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ── ビルド ───────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ── 本番ランタイム ────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# PID 1 問題を解消する tini
RUN apk add --no-cache tini

# 最小特権ユーザー
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Next.js standalone 成果物
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

# Prisma マイグレーション用ファイル
COPY --from=builder --chown=nextjs:nodejs /app/prisma          ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# prisma migrate deploy に必要な全依存を含む完全な node_modules
# (standalone の最小 node_modules を上書き統合)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules    ./node_modules

# カスタム出力先に生成された Prisma クライアント (output = "../src/generated/prisma")
COPY --from=builder --chown=nextjs:nodejs /app/src/generated   ./src/generated

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
# 起動時に DB マイグレーションを適用してからアプリを起動
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node server.js"]
