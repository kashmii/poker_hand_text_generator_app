# poker-hands-mcp

自分のハンド履歴を Claude から読むための個人用 MCP サーバー（stdio）。
Claude Desktop が子プロセスとして起動し、Go の API（`GET /hands`, `GET /hands/{id}`）を個人用APIキーで呼ぶ。

| tool | 内容 |
| --- | --- |
| `list_hands` | ハンドの概要を新しい順に返す（`limit` / `playedFrom` / `playedTo` で絞れる） |
| `get_hand` | ハンド1件をアプリと同じハンド履歴テキストで返す |

どちらも読み取りだけ。Go 側でも個人用キーは GET/HEAD しか通さない。

## ビルド

```bash
npm install
npm run build   # dist/index.js（依存を同梱した1ファイル）
```

## Claude Desktop への登録

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "poker-hands": {
      "command": "node",
      "args": ["/絶対パス/poker_hand_text_generator/mcp/dist/index.js"],
      "env": {
        "POKER_API_URL": "https://<Cloud Run のURL>",
        "POKER_API_KEY": "<Go 側の PERSONAL_API_KEY と同じ値>"
      }
    }
  }
}
```

## 開発

```bash
npm test          # vitest（MCP クライアントをメモリ上でつないで tool を呼ぶ）
npm run typecheck
```
