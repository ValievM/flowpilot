import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig(({ command }) => ({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  build: { outDir: '../../.vite/renderer/main_window', emptyOutDir: true },
  plugins: [
    {
      name: 'renderer-content-security-policy',
      transformIndexHtml: {
        order: 'pre',
        handler: () => ({
          tags: [
            {
              tag: 'meta',
              attrs: {
                'http-equiv': 'Content-Security-Policy',
                content:
                  command === 'serve'
                    ? "default-src 'self'; script-src 'self' http://localhost:*; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:* ws://localhost:*; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'"
                    : "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'",
              },
              injectTo: 'head',
            },
          ],
        }),
      },
    },
  ],
}));
