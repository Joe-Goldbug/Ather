import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.tsx'],
    exclude: ['node_modules', 'dist', '**/*.pg.test.ts'],
    globals: true,
  },
});
