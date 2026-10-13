import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    benchmark: { include: ['tests/**/*.bench.ts'] },
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'tests/rules/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/data/**', 'src/excel/**'],
      // Thin Firebase adapters and the React providers that wire them need the emulator
      // (or a browser) to exercise; their logic lives in the pure, tested modules beside them.
      exclude: [
        'src/data/firebase.ts',
        'src/data/auth.ts',
        'src/data/repos/**',
        'src/data/DataProvider.tsx',
        'src/data/useLedger.ts',
      ],
      thresholds: {
        'src/domain/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
        'src/data/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
        'src/excel/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
})
