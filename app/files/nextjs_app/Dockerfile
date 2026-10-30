ARG NODE_IMAGE=node:22.23.4-alpine
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2048"
# Next.js SWCネイティブバイナリの高速実行に必須
RUN apk add --no-cache libc6-compat

# ── 依存関係インストール ──────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --no-audit --no-fund --loglevel=error

# ── ビルド ───────────────────────────────────────────────────────────────────
FROM base AS builder
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV UV_THREADPOOL_SIZE=64
COPY --from=deps /app/node_modules ./node_modules
# Prismaスキーマを先行コピーしてクライアント生成 (スキーマ不変時は完全キャッシュ)
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN ./node_modules/.bin/prisma generate
# アプリケーションソースをコピー
COPY . .
# Next.js ビルドキャッシュをBuildKitで永続化し差分コンパイルを最大加速
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ── Prisma CLI (起動時マイグレーション用) ─────────────────────────────────────
# Prisma 7 の CLI は依存が多い (effect, c12 等) ため、CLI と prisma.config.ts が読む
# dotenv だけを別ステージで導入する。バージョンは package-lock.json と揃えること
FROM base AS prisma-cli
WORKDIR /prisma-cli
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund --loglevel=error --no-package-lock \
      prisma@7.10.1 dotenv@17.4.2

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

# Prisma マイグレーション実行に必要なモジュール (CLI と依存一式) を配置
COPY --from=prisma-cli --chown=nextjs:nodejs /prisma-cli/node_modules ./node_modules

# カスタム出力先に生成された Prisma クライアント (output = "../src/generated/prisma")
COPY --from=builder --chown=nextjs:nodejs /app/src/generated   ./src/generated

USER nextjs
EXPOSE 3000

# 起動時に DB マイグレーションを適用してからアプリを起動
# 失敗時はエラーをログに残して起動を止める (テーブルがないまま動き続けるのを防ぐ)
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node server.js"]
