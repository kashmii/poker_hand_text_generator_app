import { defineConfig } from 'vitest/config';

// 親ディレクトリの vite.config.ts（Web アプリ用・jsdom）を拾わないよう、ここで設定を閉じる
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
