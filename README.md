# Poker Hand Text Generator

ライブポーカーのハンドをスマホからその場で入力し、共有用のテキストを生成する Web アプリです。

## 概要

遊んだハンドをテーブルでタップ入力していくと、友達やコミュニティに貼り付けられるハンド履歴テキストができあがります。ログインなしでもブラウザだけで使えます。Google アカウントでログインすると、ハンドをサーバーに保存して後から見返せるほか、Claude などの AI サービスから MCP 経由で自分のハンドを読ませることもできます。

## 主な機能

### ハンドの入力

- **セッション設定** — ブラインド額・BB アンティ、通貨（$ / ₩ / ₱ / なし）、人数、自分のポジション、店名・日付
- **アクション入力** — fold / check / call / bet / raise / all-in / straddle をアクション順に入力。コール額・ポット額・次に行動するプレイヤーは自動で計算されます
- **カード入力** — 手札とボード（フロップ・ターン・リバー）をカードピッカーで選択。好きな順番で入力でき、手札はアクションの後から入力することもできます
- **1つ戻る** — 入力ミスはアクション単位で取り消せます
- **ショーダウン** — 相手の手札を入れると勝者を手札評価で自動判定し、チョップ（ポット分割）にも対応します
- **サイドポット** — 3人以上でオールインが絡んだ場合もメイン / サイドポットに分けて勝者を記録します

### テキスト出力

- 記録したハンドからコピー用テキストを自動生成します（出力は英語表記）
- ハンドにタイトル（最大20文字）を付けられます
- セッション中の複数ハンドを一覧で管理できます

### ログインして使う機能

ログインは Google アカウントで行います（他のログイン方法はありません）。

- **ハンドの保存・同期** — 記録したハンドを自動でサーバーに保存し、「過去ハンド一覧」から見返せます。詳細画面ではテキストを再生成でき、不要なハンドは1件ずつ削除できます
- **AI サービスとの連携** — リモート MCP サーバーを用意しており、Claude などから自分のハンドの一覧・詳細を読み込めます（読み取り専用）

### その他

- 設定画面で表示テーマ（ネイビー / ミスト）を切り替えられます

## 出力フォーマット例

```
2026-10-31
KKでポット獲得

$1/2 - 6 players

Setup
CO (hero) [K♠ K♦]

Preflop (6 players, Pot size: 0)
SB posts small blind $1
BB posts big blind $2
UTG folds
HJ folds
CO (hero) raises $6
BTN folds
SB folds
BB calls $4

Flop (2 players, Pot size: 13) [A♥ 7♣ 2♦]
BB checks
CO (hero) bets $8
BB calls $8

Turn (2 players, Pot size: 29) [9♠]
BB checks
CO (hero) checks

River (2 players, Pot size: 29) [3♥]
BB bets $15
CO (hero) calls $15

Summary (Pot size: 59)
BB shows [Q♥ J♥]
CO shows [K♠ K♦]
CO wins $59
```

サイドポットがある場合は `wins main pot` / `wins side pot`、チョップの場合は `splits` と出力されます。

## 構成

- **フロントエンド** — React 19 + TypeScript / Vite / React Router v7。Vercel で配信
- **認証** — Supabase（Google OAuth）
- **バックエンド** — Go の API サーバー（Google Cloud Run）。データベースは Supabase の PostgreSQL。リモート MCP サーバー（`/mcp`）も同じサーバーに載っています
- **テスト** — Vitest + @testing-library/react

バックエンドの API・認証・デプロイ手順は [server/README.md](server/README.md) を参照してください。

## 開発

```bash
npm install
npm run dev     # 開発サーバー（http://localhost:5173）
npm test        # テスト
npm run build   # 型チェック + 本番ビルド
npm run lint    # ESLint
```

ログイン・保存機能を使うには、次の環境変数を `.env.local` などに設定します。未設定でもログイン以外の機能は動きます。

- `VITE_SUPABASE_URL` — Supabase のプロジェクト URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase の公開キー
- `VITE_API_BASE_URL` — バックエンド API の URL（ローカルなら `http://localhost:8080`）

## 注意事項

- ログインしていない場合、データはブラウザのメモリ上にだけあり、ページをリロードすると消えます。必要なテキストはコピーして保存してください
