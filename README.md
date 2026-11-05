# タスク×動物育成アプリ

タスク管理にゲーム性（動物育成）を組み合わせた卒業制作アプリです。
タスクを完了すると動物を獲得・育成でき、動物園（Zoo）への配置やエリア解放が進みます。

## 技術スタック

| 分類 | 技術 | バージョン |
|---|---|---|
| フロントエンド/バックエンド | Next.js (App Router) / React | 16.4.3 / 19.3.1 |
| ランタイム | Node.js | 22.23.4 |
| データベース | PostgreSQL | 16.15 |
| 認証 | NextAuth.js（Credentials・JWT） | 4.24.15 |
| ORM | Prisma | 7.10.1 |
| ゲーム描画 | PixiJS (`@pixi/react`) | 8 系 |
| リバースプロキシ | Nginx | 1.30.6 |
| インフラ | Docker Compose / Ansible | ― |

Node.js・PostgreSQL・Nginx のバージョンは `app/defaults/main.yml`、npm パッケージのバージョンは `app/files/nextjs_app/package.json` が正です。

## ディレクトリ構成

```
graduation-project-integrated/
├── app/                                  # Ansible Role (roles/app) 対応ディレクトリ
│   ├── defaults/
│   │   └── main.yml                      # Ansible デフォルト変数（イメージのバージョン等）    [インフラ班]
│   ├── files/
│   │   ├── nextjs_app/                   # ★ Next.js アプリ本体（開発作業ディレクトリ）       [開発班]
│   │   └── nginx.conf                    # ローカル用 Nginx 設定                              [開発班]
│   ├── tasks/
│   │   └── main.yml                      # Ansible デプロイタスク                             [インフラ班]
│   └── templates/
│       ├── .env.example                  # 環境変数テンプレート                               [インフラ班]
│       ├── app_docker-compose.yml        # ローカル用 Docker Compose                          [開発班]
│       ├── app_docker-compose.yml.j2     # サーバー用 Compose テンプレート（Ansible）          [インフラ班]
│       ├── nginx.conf.j2                 # サーバー用 Nginx テンプレート（Ansible）            [インフラ班]
│       └── postgres_db_data/             # ローカル DB の実データ（git 管理外）
├── .gitignore
└── README.md                             # 本ファイル                                         [インフラ班]
```

### 編集ルール

- 開発班が編集するのは `app/files/nextjs_app/` 配下と、ローカル用ファイル（`app/files/nginx.conf`、`app/templates/app_docker-compose.yml`）のみ。
- `.j2`、`app/defaults/`、`app/tasks/` はインフラ班が管理する。
- ディレクトリ構成や管理者を変えるときは、同じ PR でこの README も更新する。
- `app/files/nextjs_app/src` 以外を変更する PR は、インフラ班もレビューに入れる。

### サーバーへの反映の仕組み

サーバーへの配布はインフラ班のリポジトリ（Ansible）が行います。

1. このリポジトリの main を clone する。
2. `app/files/nextjs_app/` だけをサーバーの `/opt/app/nextjs_app/` にコピーする。
3. Dockerfile と `.dockerignore` は、インフラ班リポジトリの版で上書きする。
4. 環境変数は Ansible vault から生成し、ビルドして起動する。

そのため、`app/files/nextjs_app/` の外にあるファイル（ローカル用の compose や nginx 設定など）はサーバーでは使われません。また、ローカルとサーバーでは Dockerfile が異なります。

---

## 1. ローカル開発環境のセットアップ（`npm run dev`）

DB だけ Docker で動かし、Next.js は `npm run dev` で起動する開発スタイルです。コードの変更がすぐ画面に反映されます。

### 1-1. リポジトリの取得

```bash
git clone <このリポジトリのURL>
cd graduation-project-integrated
```

### 1-2. 環境変数ファイルの作成

```bash
cd app/files/nextjs_app
cp .env.example .env
```

`.env` を開き、以下を設定します。`.env` は git 管理外です。**値をリポジトリやドキュメントに書かないでください。**

| 変数 | 説明 | ローカルでの値 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 接続文字列 | `postgresql://postgres:postgres@localhost:5432/app_db?schema=public` |
| `NEXTAUTH_SECRET` | ログイン情報（Cookie）の署名鍵 | 下のコマンドで各自生成した値 |
| `NEXTAUTH_URL` | アプリの URL | `http://localhost:3000` |

```bash
# NEXTAUTH_SECRET の生成
openssl rand -base64 32
```

### 1-3. PostgreSQL の起動（リポジトリの直下で実行）

```bash
docker compose -f app/templates/app_docker-compose.yml up -d postgres_db
```

### 1-4. 依存パッケージと Prisma のセットアップ（`app/files/nextjs_app` で実行）

```bash
npm ci                          # package-lock.json どおりにインストール
npx --no-install prisma generate       # Prisma Client の生成（src/generated/prisma）
npx --no-install prisma migrate deploy # マイグレーションを DB に適用（テーブル作成）
npx --no-install prisma db seed        # 初期データ（エリア 4・動物 12）を投入
```

- `npx` で「Need to install the following packages」と聞かれたら `n` で断ってください。プロジェクトのバージョンがまだ入っていない合図です（先に `npm ci` を実行）。
- スキーマを変更したときは `npx prisma migrate dev --name <変更内容>` でマイグレーションファイルを作り、一緒にコミットします。

### 1-5. 開発サーバーの起動（スキップしてよい。Docker上で動作確認をして。）

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスします。

- Next.js 16 は起動時に `tsconfig.json` や `next-env.d.ts` を自動で書き換え、`AGENTS.md` を作ることがあります。**これらはコミットしないでください。**

---

## 2. Docker Compose によるフル環境（Nginx + Next.js + PostgreSQL）

3 コンテナをまとめて起動し、本番に近い形（ビルド済みのアプリ + Nginx）で確認する手順です。コマンドはすべて**リポジトリの直下**で実行します。

### 2-1. 起動（ビルド込み）

```bash
docker compose -f app/templates/app_docker-compose.yml up -d --build
```

起動時にマイグレーションが自動で適用されます。初期データ（seed）は自動では入らないため、DB を新しく作ったときは「1-4」の `prisma db seed` を一度実行してください。

### 2-2. 状態の確認

```bash
docker compose -f app/templates/app_docker-compose.yml ps
```

期待する結果：3 つすべてが起動中で、`postgres_db` が `healthy`

```
NAME          STATUS
web_server    Up
nextjs_app    Up
postgres_db   Up (healthy)
```

### 2-3. ログの確認

```bash
docker compose -f app/templates/app_docker-compose.yml logs --tail=50 nextjs_app
```

確認ポイント：

- `No pending migrations to apply.` または `All migrations have been successfully applied.` が出ているか
- `✓ Ready` が出ているか

### 2-4. アクセス

ブラウザで [http://localhost:8080](http://localhost:8080) にアクセスします（ログイン画面が表示されれば OK）。

### 2-5. コード変更の反映

ホットリロードはありません。コードを変更したら `--build` 付きで再実行します。

```bash
docker compose -f app/templates/app_docker-compose.yml up -d --build nextjs_app
```

### 2-6. 停止・初期化

```bash
# 停止（DB のデータは残る）
docker compose -f app/templates/app_docker-compose.yml down

# DB を空にして作り直す（注意: データが消えます。必要なら先にバックアップ）
docker exec postgres_db pg_dump -U postgres -d app_db > ~/zootask_db_backup.sql
docker compose -f app/templates/app_docker-compose.yml down
docker run --rm -v "$PWD/app/templates":/t alpine:3.22 rm -rf /t/postgres_db_data
```

DB のデータフォルダは Postgres の権限で作られるため、通常の `rm` では削除できません。上のように Docker 経由で削除します。

### 2-7. PR を出す前の確認（推奨）

サーバーは空の DB から構築されるため、PR の前に一度「2-6」で DB を空にし、「2-1」から起動して、アカウント作成・ログイン・タスク作成ができることを確認してください。

---

## 3. 開発の進め方

1. 最新の `develop` から作業ブランチを作る。
   ```bash
   git switch develop
   git pull origin develop
   git switch -c feature/<作業名>
   ```
2. 作業してコミットし、push する。
3. GitHub で PR を作る。**マージ先（base）が `develop` になっているか必ず確認**する（初期状態は `main`）。
4. develop で確認できたら、`develop` → `main` の PR を作る。main はサーバーに反映される。

---

## 環境変数まとめ

| ファイル | 用途 | git 管理 |
|---|---|---|
| `app/files/nextjs_app/.env` | ローカル開発（`npm run dev`、Prisma コマンド）用 | 除外 |
| `app/files/nextjs_app/.env.example` | 上記のテンプレート | 含む |
| `app/templates/.env.example` | 環境変数テンプレート | 含む |

- `app/templates/app_docker-compose.yml` に書かれているパスワードと `NEXTAUTH_SECRET` は**ローカル専用のダミー値**です。サーバーでは使用しません。
- サーバーのパスワード・シークレットは、インフラ班が Ansible vault で管理します。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `npx prisma migrate deploy` が `Connection refused` で失敗する | PostgreSQL コンテナが起動しているか確認する（`docker compose -f app/templates/app_docker-compose.yml ps` で `healthy` か） |
| `npx prisma ...` で「Need to install the following packages」と聞かれる | `n` で断り、`app/files/nextjs_app` で `npm ci` を実行してから再実行する |
| `prisma db seed` が `Cannot find module '../src/generated/prisma/client'` で失敗する | 先に `npx --no-install prisma generate` を実行する |
| `http://localhost:8080/` を開くとログイン画面ではなく `/tasks` に移る | DB を作り直す前のログイン情報（Cookie）が残っている。ログアウトするか、ブラウザの Cookie（`next-auth.session-token`）を削除する |
| ログイン後すぐセッションが切れる / 認証エラー | `NEXTAUTH_URL` が実際にアクセスしている URL・ポートと一致しているか確認する |
| `prisma generate` 後も型エラーが出る | `src/generated/prisma` が生成されているか確認し、エディタを再起動する |
| `docker compose up` で `port is already allocated` | 5432 や 8080 を使う別のコンテナが動いている。`docker ps` で確認して停止する |
| WSL で `npm install` が `UNC パスはサポートされません` 等で失敗する | Windows の PowerShell/CMD ではなく、WSL（Bash）のターミナルから `/home/...` のパスで実行する |
