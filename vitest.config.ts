import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `tests/golden` holds emitted output, which contains its own test files.
    // Those are fixtures to compare against, not tests to run: running them
    // here would execute generated code inside the generator's own suite.
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/golden/**', '**/node_modules/**', 'dist/**'],
  },
});
