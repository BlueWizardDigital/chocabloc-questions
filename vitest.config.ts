import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/elements/**/*.browser.test.ts'],
    // Coverage block deferred to M2 — needs @vitest/coverage-v8 dep
    // which is intentionally not yet installed.
  },
});
