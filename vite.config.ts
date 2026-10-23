import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 builds one self-contained HTML file (fonts and scripts inlined) that opens from disk.
const single = process.env.SINGLE === '1';

export default defineConfig({
  root: 'web',
  base: './',
  plugins: single ? [react(), viteSingleFile()] : [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core/index.ts', import.meta.url)),
      '@engine': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@bench': fileURLToPath(new URL('./bench', import.meta.url)),
    },
  },
  build: { outDir: single ? '../dist-single' : '../dist', emptyOutDir: true, chunkSizeWarningLimit: 4000, assetsInlineLimit: single ? 100_000_000 : 4096 },
  server: { port: 5188 },
});
