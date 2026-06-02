import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      exclude: ['tests/**'],
      outDir: 'dist',
      entryRoot: 'src',
      rollupTypes: false,
      copyDtsFiles: true,
    }),
  ],
  build: {
    target: 'es2019',
    minify: 'esbuild',
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'helpers-only': resolve(__dirname, 'src/helpers-only.ts'),
        full: resolve(__dirname, 'src/full.ts'),
        bridge: resolve(__dirname, 'src/bridge.ts'),
        'elements/coin-pile': resolve(__dirname, 'src/elements/coin-pile.ts'),
        'elements/canvas-question': resolve(__dirname, 'src/elements/canvas-question.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        format === 'es' ? `${entryName}.mjs` : `${entryName}.cjs`,
    },
    rollupOptions: {
      output: {
        preserveModules: false,
        chunkFileNames: 'chunks/[name].[hash].mjs',
      },
    },
    emptyOutDir: true,
  },
});
