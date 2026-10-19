import { defineConfig } from 'vitest/config'

// End-to-end run against a local Anvil node. Needs Foundry (anvil, forge).
export default defineConfig({
  define: { __TESTNET__: 'true' },
  test: {
    include: ['e2e/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
