import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'es2019',
    minify: 'esbuild',
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'helpers-only': resolve(__dirname, 'src/helpers-only.ts'),
        full: resolve(__dirname, 'src/full.ts'),
        'elements/coin-pile': resolve(__dirname, 'src/elements/coin-pile.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        format === 'es' ? `${entryName}.mjs` : `${entryName}.cjs`,
    },
    rollupOptions: {
      output: {
        preserveModules: false,
      },
    },
  },
});
