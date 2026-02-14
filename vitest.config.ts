// Minimal harness written with the failing tests; WS1 may extend it
// (e.g. happy-dom via `environmentMatchGlobs`/per-file `@vitest-environment` for component tests).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
