#!/usr/bin/env node
// Claude Desktop などの MCP クライアントが子プロセスとして起動する。
// 標準入出力は MCP のやりとりに使うので、ログは必ず標準エラーに出す（console.log は使わない）
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createHandsApi } from './api';
import { createServer } from './server';

// 例: POKER_API_URL="https://<Cloud Run のURL>"、POKER_API_KEY は Go 側の PERSONAL_API_KEY と同じ値
const baseUrl = process.env.POKER_API_URL;
const apiKey = process.env.POKER_API_KEY;
if (!baseUrl || !apiKey) {
  console.error('poker-hands-mcp: POKER_API_URL and POKER_API_KEY must be set');
  process.exit(1);
}

const server = createServer(createHandsApi(baseUrl, apiKey));
await server.connect(new StdioServerTransport());
console.error('poker-hands-mcp: running on stdio');
