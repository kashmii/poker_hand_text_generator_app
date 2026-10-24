import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // MCP サーバー（mcp/）は自前の vitest 設定でテストする
    exclude: [...configDefaults.exclude, 'mcp/**'],
  },
})
