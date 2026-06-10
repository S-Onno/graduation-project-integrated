# タスク×動物育成アプリ

タスク管理にゲーム性（動物育成）を組み合わせた卒業制作アプリです。
タスクを完了すると動物を獲得・育成でき、動物箱（Zoo）への配置やエリア解放が進みます。

## 技術スタック

| 分類 | 技術 |
|---|---|
| フロントエンド/バックエンド | Next.js 15 (App Router) / React 19 / Node.js 22 |
| データベース | PostgreSQL 16 (`postgres:16-alpine`) |
| 認証 | NextAuth.js |
| ORM | Prisma 7 |
| ゲーム描画 | PixiJS (`@pixi/react`) |
| インフラ | Docker Compose / Nginx |

## ディレクトリ構成

```
graduation-project-docker-create/
├── files/
│   ├── nextjs_app/        # Next.js アプリ本体
│   └── nginx.conf         # Nginx リバースプロキシ設定
├── templates/
│   ├── app_docker-compose.yml      # Docker Compose 定義
│   ├── app_docker-compose.yml.j2   # Ansible 用テンプレート
│   ├── .env.example                # Compose 用環境変数テンプレート
│   └── postgres_db_data/           # DB実データ（git管理外）
└── .gitignore
```

## 前提条件

- Node.js 22 系 / npm
- Docker / Docker Compose v2
- Git

---

## 1. ローカル開発環境のセットアップ（Next.jsアプリ単体）

DBコンテナだけDockerで動かし、Next.jsアプリは `npm run dev` で起動する開発スタイルです。

### 1-1. リポジトリの取得

```bash
git clone <このリポジトリのURL>
cd graduation-project-docker-create/files/nextjs_app
```

### 1-2. 依存パッケージのインストール

```bash
npm install
```

### 1-3. 環境変数ファイルの作成

```bash
cp .env.example .env
```

`.env` を開き、以下を設定します。

| 変数 | 説明 | 例 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL接続文字列 | `postgresql://postgres:postgres@localhost:5432/app_db?schema=public` |
| `NEXTAUTH_SECRET` | NextAuthのセッション暗号化キー | `openssl rand -base64 32` の出力をそのまま貼り付け |
| `NEXTAUTH_URL` | アプリのURL（ローカル開発時） | `http://localhost:3000` |

```bash
# NEXTAUTH_SECRET の生成例
openssl rand -base64 32
```

### 1-4. PostgreSQLの起動（ローカル検証用）

```bash
docker run -d --name local_postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app_db \
  -p 5432:5432 \
  postgres:16-alpine
```

`.env` の `DATABASE_URL` のユーザー/パスワード/DB名がこのコマンドと一致していることを確認してください。

### 1-5. Prismaのセットアップ

```bash
# Prisma Clientの生成
npx prisma generate

# スキーマをDBに反映（テーブル作成）
npx prisma db push

# （任意）初期データの投入
npx prisma db seed
```

### 1-6. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスして動作確認してください。

---

## 2. Docker Composeによるフル環境構築（Nginx + Next.js + PostgreSQL）

本番／デモサーバー（AlmaLinux等）で、3コンテナ構成（Nginx・Next.js・PostgreSQL）を一括起動する手順です。

> ⚠️ **既知の制限**: 現在の `templates/app_docker-compose.yml` は、サーバー上の `/opt/app/` 配下にファイルが配置されていることを前提としています。今後のタスクで相対パス化を予定しています。

### 2-1. ファイルの配置

サーバー上に `/opt/app/` ディレクトリを作成し、以下のように配置します。

```bash
sudo mkdir -p /opt/app
sudo cp -r files/nextjs_app /opt/app/nextjs_app
sudo cp files/nginx.conf /opt/app/nginx.conf
sudo mkdir -p /opt/app/postgres_db_data
```

### 2-2. 環境変数ファイルの作成

```bash
cp templates/.env.example templates/.env
```

`templates/.env` を開き、`NEXTAUTH_URL` を自分のサーバーのIPアドレスに書き換えます。

```env
# 例: サーバーのIPが 192.168.1.50 の場合
NEXTAUTH_URL=http://192.168.1.50:8080
```

### 2-3. コンテナの起動

```bash
docker compose -f templates/app_docker-compose.yml --env-file templates/.env up -d --build
```

起動時に自動的に以下が実行されます。

- PostgreSQLコンテナの起動とヘルスチェック
- `npx prisma db push` によるスキーマ反映
- Next.jsアプリの起動

### 2-4. 動作確認

```bash
# コンテナの状態確認
docker compose -f templates/app_docker-compose.yml ps

# ログ確認
docker compose -f templates/app_docker-compose.yml logs -f nextjs_app
```

ブラウザで `http://<サーバーのIP>:8080` にアクセスして動作確認してください。

### 2-5. 停止・後片付け

```bash
# コンテナ停止
docker compose -f templates/app_docker-compose.yml down

# DBデータも含めて完全に削除する場合（注意: データが消えます）
docker compose -f templates/app_docker-compose.yml down
sudo rm -rf templates/postgres_db_data/*
```

---

## 環境変数まとめ

| ファイル | 用途 | git管理 |
|---|---|---|
| `files/nextjs_app/.env` | ローカル開発（`npm run dev`）用 | ❌ 除外 |
| `files/nextjs_app/.env.example` | 上記のテンプレート | ✅ 含む |
| `templates/.env` | Docker Compose起動時の変数（`NEXTAUTH_URL`等） | ❌ 除外 |
| `templates/.env.example` | 上記のテンプレート | ✅ 含む |

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `npx prisma db push` が `Connection refused` で失敗する | PostgreSQLコンテナが起動完了しているか確認（`docker compose ps` でhealthyか確認） |
| ログイン後すぐセッションが切れる / 認証エラー | `NEXTAUTH_URL` が実際にアクセスしているURL・ポートと一致しているか確認 |
| `npx prisma generate` 実行後も型エラーが出る | `src/generated/prisma` が生成されているか確認し、エディタを再起動 |
