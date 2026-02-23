import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['schemas/**/*.test.ts', 'assertions/**/*.test.ts'],
    globals: true,
  },
});
