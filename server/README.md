# server

ハンド保存用の Go API サーバー。Google Cloud Run に置く。

## ローカルで動かす

DB の接続文字列はファイルに書かず、Secret Manager から取り出して環境変数で渡す。

```bash
go test ./...
export DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url)"
PORT=8080 ALLOWED_ORIGINS=http://localhost:5173 go run .
curl localhost:8080/health   # {"db":"ok","status":"ok"}
```

Docker で動かす場合（`DATABASE_URL` は上と同じく export 済みの前提）:

```bash
docker build -t poker-hand-server:local .
docker run --rm -p 8080:8080 -e DATABASE_URL -e ALLOWED_ORIGINS=http://localhost:5173 poker-hand-server:local
```

## 環境変数

| 名前 | 内容 | 例 |
|---|---|---|
| `PORT` | 待ち受けポート（Cloud Run が自動で設定する） | `8080` |
| `ALLOWED_ORIGINS` | ブラウザからのアクセスを許可するオリジン（カンマ区切り） | `http://localhost:5173,https://xxx.vercel.app` |
| `DATABASE_URL` | Supabase の接続文字列（Session pooler）。必須。Cloud Run では Secret Manager の `database-url` から渡す | — |

## `/health`

| 状態 | 応答 |
|---|---|
| DB につながる | `200 {"db":"ok","status":"ok"}` |
| DB につながらない | `503 {"db":"error","status":"ng"}`（原因はサーバーのログに出る） |

Cloud Scheduler から毎日呼び、Supabase 無料プランの一時停止（7日間アクセスなし）を防ぐ役目もある（設定は「Cloud Scheduler（毎日の /health）」を参照）。

## DB のマイグレーション

`migrations/` の SQL を番号順に、手で1回ずつ適用する（`-1` で1つのトランザクションとして実行し、失敗したら全部取り消す）。

```bash
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f migrations/0001_create_hands.sql
```

| ファイル | 内容 | 適用 |
|---|---|---|
| `0001_create_hands.sql` | `hands` テーブルとインデックスを作り、RLS を有効にする | 済み（2026-10-17） |
| `0002_revoke_api_roles.sql` | `anon` / `authenticated` から `hands` への権限を外す | 済み（2026-10-17） |

## Cloud Run へのデプロイ

### 初回だけ行う準備

1. gcloud CLI をインストールしてログインする

   ```bash
   brew install --cask google-cloud-sdk
   gcloud auth login
   ```

2. GCP コンソールでプロジェクトを作り、請求先アカウント（クレジットカード）を紐づける
3. **予算アラートを設定する**（「お支払い」→「予算とアラート」。例: 月100円）
4. 使うプロジェクトとリージョンを設定し、必要な API を有効にする

   ```bash
   gcloud config set project <PROJECT_ID>
   gcloud config set run/region asia-northeast1
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

5. ビルド用サービスアカウントに Cloud Run Builder ロールを付ける（新しいプロジェクトはこの権限がなく、ビルドが PERMISSION_DENIED で失敗する）

   ```bash
   gcloud projects add-iam-policy-binding <PROJECT_ID> \
     --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
     --role="roles/run.builder"
   ```

6. Supabase の接続文字列（Session pooler）を Secret Manager に登録する（パスワードを含むので本人が実行する）

   ```bash
   gcloud services enable secretmanager.googleapis.com
   printf '%s' '<接続文字列>' | gcloud secrets create database-url --data-file=-
   # 2回目以降（パスワード変更など）は versions add で新しいバージョンを追加する
   printf '%s' '<接続文字列>' | gcloud secrets versions add database-url --data-file=-
   ```

7. Cloud Run（実行用サービスアカウント）がこのシークレットだけを読めるようにする

   ```bash
   gcloud secrets add-iam-policy-binding database-url \
     --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

### デプロイ

`server/` で実行する。Dockerfile を元に Cloud Build がイメージを作るので、手元の Mac（arm64）と Cloud Run（amd64）の CPU の違いを気にしなくてよい。

```bash
gcloud run deploy poker-hand-server \
  --source . \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-env-vars "^@^ALLOWED_ORIGINS=http://localhost:5173,https://pokerhandtextgeneratorapp.vercel.app" \
  --set-secrets "DATABASE_URL=database-url:latest"
```

- `^@^`: gcloud は通常カンマを環境変数の区切りとして扱うため、区切り文字を `@` に変えて値の中のカンマをそのまま渡す
- `--allow-unauthenticated`: ブラウザから直接呼べるようにする（ユーザーの認証は後で Go 側の JWT 検証で行う）
- `--max-instances 1`: 大量アクセスがあっても台数を増やさず、請求額が膨らまないようにする
- `--set-secrets`: Secret Manager の最新バージョンを環境変数 `DATABASE_URL` として渡す。値はインスタンスの起動時に読まれるので、シークレットを更新したら再デプロイ（または `gcloud run services update`）して反映する

2回目以降、コードだけを変えたときは `gcloud run deploy poker-hand-server --source .` だけでよい（前回の設定は引き継がれる）。

デプロイ後に表示される URL で確認する:

```bash
curl https://<表示されたURL>/health
```

許可オリジンだけを変える場合は、ビルドし直さずに環境変数だけ更新できる:

```bash
gcloud run services update poker-hand-server \
  --update-env-vars "^@^ALLOWED_ORIGINS=http://localhost:5173,https://pokerhandtextgeneratorapp.vercel.app"
```

### デプロイ後に行う設定

初回デプロイで作られる Artifact Registry の `cloud-run-source-deploy` リポジトリに、古いイメージを自動削除するポリシーを設定する（最新3つは残し、それ以外で1日以上前のものを削除）。

```bash
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --location=asia-northeast1 --policy=cleanup-policy.json --no-dry-run
```

## Cloud Scheduler（毎日の /health）

Supabase 無料プランの一時停止を防ぐため、毎日9時（日本時間）に `/health` を呼ぶ。`/health` は DB に接続するので、Supabase へのアクセスが毎日発生する。Cloud Scheduler は3ジョブまで無料。

```bash
gcloud services enable cloudscheduler.googleapis.com
gcloud scheduler jobs create http poker-hand-server-keepalive \
  --location=asia-northeast1 \
  --schedule="0 9 * * *" \
  --time-zone="Asia/Tokyo" \
  --uri="https://poker-hand-server-1012979960209.asia-northeast1.run.app/health" \
  --http-method=GET \
  --attempt-deadline=60s \
  --max-retry-attempts=3 \
  --min-backoff=5m
```

- 失敗した場合（Cloud Run の起動待ちや Supabase の一時的な不調など）は、5分以上空けて最大3回やり直す

確認方法:

```bash
# 今すぐ1回実行する
gcloud scheduler jobs run poker-hand-server-keepalive --location=asia-northeast1

# 最後の実行結果（status が {} なら成功）
gcloud scheduler jobs describe poker-hand-server-keepalive --location=asia-northeast1 \
  --format="yaml(lastAttemptTime,status,scheduleTime)"

# Cloud Run 側に Scheduler からのアクセスが届いているか
gcloud logging read 'resource.type="cloud_run_revision" AND httpRequest.userAgent:"Google-Cloud-Scheduler"' \
  --limit=5 --format="table(timestamp,httpRequest.status,httpRequest.latency)"
```
