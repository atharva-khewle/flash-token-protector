import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  // `--mode testnet` is the only way the local test chain gets into a bundle.
  define: { __TESTNET__: JSON.stringify(mode === 'testnet') },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}))
