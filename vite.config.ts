import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Claude Code の worktree（.claude/worktrees）内のテストを二重に拾わない
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
