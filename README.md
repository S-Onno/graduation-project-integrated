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
graduation-project-integrated/
├── app/                            # Ansible Role (roles/app) 対応ディレクトリ
│   ├── defaults/                   # Ansible デフォルト変数定義
│   │   └── main.yml
│   ├── files/                      # 静的配布ファイル群
│   │   ├── nextjs_app/             # ★ Next.js アプリ本体（開発作業ディレクトリ）
│   │   └── nginx.conf              # Nginx リバースプロキシ設定
│   ├── tasks/                      # Ansible デプロイタスク定義
│   │   └── main.yml
│   └── templates/                  # テンプレート・Docker Compose 設定群
│       ├── .env.example            # Compose 用環境変数テンプレート
│       ├── .env.example.j2         # Ansible 用環境変数テンプレート
│       ├── app_docker-compose.yml   # Docker Compose 定義
│       ├── app_docker-compose.yml.j2# Ansible 用 Compose テンプレート
│       ├── nginx.conf.j2           # Ansible 用 Nginx テンプレート
│       └── postgres_db_data/       # DB実データ保存領域（git管理外）
├── .gitignore                      # リポジトリ全体用除外設定
└── README.md                       # プロジェクト仕様書・手順書
```
具体的なディレクトリ構成については下記を参照（前期での情報：最新は上記を参照）
https://app.notion.com/p/_-36b8ff38ca3980a6a0f7fb2f59dfde6d?source=copy_link


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


6/10時点
```bash
npm install
```
(node.jsのインタビューが必要な場合は、下記も実行してください。)
```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
セットアップのなにか
sudo dnf install -y nodejs
nodeのインストール
そのあとに
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

.envの中身（コピペ用）
```bash
# ============================================================
# files\nextjs_app\.env
# ローカル開発用 環境変数
# ※ このファイルはGit管理対象外 (.gitignore で除外)
# ============================================================

# --- Database ---
# ローカルで postgres:16-alpine を起動している場合は localhost:5432
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app_db?schema=public"

# --- NextAuth.js ---
NEXTAUTH_SECRET="Qz+QChHEkWWTOO2w4/YPRnRNrcM2yla552loudN3ax8="
NEXTAUTH_URL="http://localhost:3000"

```

.envの中身（コピペ用）
```bash
# files\nextjs_app\.env.example

# --- Database ---
# ローカルで postgres:16-alpine を起動している場合は localhost:5432
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app_db?schema=public"

# --- NextAuth.js ---
NEXTAUTH_SECRET="Qz+QChHEkWWTOO2w4/YPRnRNrcM2yla552loudN3ax8="
NEXTAUTH_URL="http://localhost:3000"

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

3コンテナ構成（Nginx・Next.js・PostgreSQL）を一括起動する手順です。**Section 1（ローカル開発環境のセットアップ）の完了後**に行ってください。

### 2-1. 環境変数ファイルの作成

```bash
cp templates/.env.example templates/.env
```

ローカル（localhost）で動かす場合はそのままでOKです。別のIPやサーバーで動かす場合は `templates/.env` を開き、`NEXTAUTH_URL` を書き換えてください。

```env
# 例: サーバーのIPが 192.168.1.50 の場合
NEXTAUTH_URL=http://192.168.1.50:8080
```

### 2-2. コンテナの起動（ビルド込み）

```bash
docker compose -f templates/app_docker-compose.yml --env-file templates/.env up -d --build
```

### 2-3. コンテナの状態確認

```bash
docker compose -f templates/app_docker-compose.yml ps
```

期待する結果：3つすべてが `running` で、`postgres_db` が `healthy`

```
NAME          STATUS
web_server    running
nextjs_app    running
postgres_db   running (healthy)
```

### 2-4. ログ確認（Prisma + Next.js の起動ログ）

```bash
docker compose -f templates/app_docker-compose.yml logs --tail=50 nextjs_app
```

確認ポイント：

- `The database is already in sync with the Prisma schema.` が出ているか
- `✓ Ready in XXXms` が出ているか

### 2-5. アプリへの疎通確認

```bash
curl -I http://localhost:8080
```

期待する結果：`HTTP/1.1 200 OK` または `HTTP/1.1 307 Temporary Redirect`（ログインページへのリダイレクト）

### 2-6. DBの死活確認

```bash
docker exec postgres_db pg_isready -U postgres -d app_db
```

期待する結果：`accepting connections`

### 2-7. コード変更を反映する

コードを変更した場合は `--build` 付きで再実行します（ホットリロードではなく、コード変更ごとに再ビルドする運用です）。

```bash
docker compose -f templates/app_docker-compose.yml --env-file templates/.env up -d --build nextjs_app
```

### 2-8. 停止・後片付け

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
| `docker compose up` 時にPostgreSQLが `port is already allocated` で失敗する | セクション1の `local_postgres` コンテナ（ポート5432）が起動中だと衝突します。`docker stop local_postgres` で停止してから実行してください |
| WSL環境で `npm install` が `UNC パスはサポートされません` 等のエラーで失敗する | WindowsのPowerShell/CMDから実行している可能性があります。WSL（Bash）のターミナルから `/home/...` のLinuxパスで実行してください |
