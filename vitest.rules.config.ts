import { defineConfig } from 'vitest/config'

// Firestore rules tests: need the emulator (npm run test:rules), so they are kept out of test:unit.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
