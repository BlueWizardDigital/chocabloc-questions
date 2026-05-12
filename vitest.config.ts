import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/elements/**/*.browser.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/internal/future-formats.ts',  // intentionally unused in v0
        'src/elements/**/*.ts',             // covered by browser tests, not vitest
        'src/full.ts',                      // re-export only
        'src/index.ts',                     // re-export only
        'src/elements/coin-pile.ts',        // re-export only
        'src/helpers-only.ts',              // re-export only
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
