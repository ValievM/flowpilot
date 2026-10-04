import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  build: { outDir: '../../.vite/renderer/main_window', emptyOutDir: true },
});
