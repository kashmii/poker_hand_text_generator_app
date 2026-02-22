# Poker Hand Text Generator

ライブポーカーのハンドをテキスト形式で一時的に記録・共有するためのWebアプリ

## 概要

ポーカーセッションで遊んだハンドをその場でスマホから入力し、友達やコミュニティへの共有用テキストをワンタップで生成できます。データベース不要で、ブラウザ上のみで動作します。

## 主な機能

- **セッション設定** — ブラインド額、プレイヤー人数、通貨、店名・日付を設定
- **ハンド入力** — ストリートごとのアクション（fold / check / call / bet / raise / all-in / straddle）を順番にタップ入力
- **ボード入力** — フロップ・ターン・リバーのコミュニティカードを選択
- **ショーダウン対応** — ショーダウンでのホールカード表示と勝者記録
- **サイドポット対応** — 3人以上でオールインが発生した場合の継続アクションを正しく処理
- **テキスト出力** — コピー可能なハンド履歴テキストを自動生成（英語 / 日本語切替）
- **タイトル付与** — 記録したハンドにタイトルを設定（最大20文字、インライン編集）
- **複数ハンド管理** — セッション中に複数ハンドを記録し、まとめてコピー可能

## 出力フォーマット例

```
2026-02-22
KKでポット獲得

$1/2 - 6 players

Setup
CO [K♠ K♦]

Preflop (Pot size: 0)
SB posts small blind $1
BB posts big blind $2
UTG folds
HJ folds
CO raises $12
BTN folds
SB folds
BB calls $10

Flop (Pot size: 25) [A♥ 7♣ 2♦]
BB checks
CO bets $15
BB folds

Summary (Pot size: 40)
CO wins $40
```

## 技術スタック

- **React 19** + **TypeScript**
- **Vite** (ビルドツール)
- **React Router v7** (ルーティング)
- **Vitest** + **@testing-library/react** (テスト)

## セットアップ

```bash
npm install
npm run dev
```

## テスト

```bash
npm test
```

## 注意事項

- データはブラウザのメモリ上にのみ保存されます。ページをリロードすると消えます
- コピーしたテキストを別途保存してください
