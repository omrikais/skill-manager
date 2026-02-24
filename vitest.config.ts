import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@fs': path.resolve(__dirname, 'src/fs'),
      '@deploy': path.resolve(__dirname, 'src/deploy'),
      '@commands': path.resolve(__dirname, 'src/commands'),
      '@tui': path.resolve(__dirname, 'src/tui'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
});
