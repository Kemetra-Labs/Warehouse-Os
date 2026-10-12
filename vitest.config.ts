import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/data/**', 'src/excel/**'],
      thresholds: {
        'src/domain/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
        'src/data/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
        'src/excel/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
})
