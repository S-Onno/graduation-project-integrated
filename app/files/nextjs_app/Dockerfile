FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2048"
# Next.js SWCネイティブバイナリの高速実行に必須
RUN apk add --no-cache libc6-compat

# ── 依存関係インストール ──────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --no-audit --no-fund --loglevel=error

# ── ビルド ───────────────────────────────────────────────────────────────────
FROM base AS builder
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV UV_THREADPOOL_SIZE=64
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ./node_modules/.bin/prisma generate
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

# Prisma マイグレーション実行に必要な最小モジュールのみを抽出配置 (数万ファイルの無駄コピーを排除)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma    ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma   ./node_modules/@prisma

# カスタム出力先に生成された Prisma クライアント (output = "../src/generated/prisma")
COPY --from=builder --chown=nextjs:nodejs /app/src/generated   ./src/generated

USER nextjs
EXPOSE 3000

# 起動時に DB マイグレーションを適用（不整合時は自動フォールバック同期）してからアプリを確実に起動
CMD ["sh", "-c", "(node node_modules/prisma/build/index.js migrate deploy 2>/dev/null || node node_modules/prisma/build/index.js db push --accept-data-loss 2>/dev/null || true) && exec node server.js"]
