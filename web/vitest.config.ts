import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./test-setup.ts'],
    css: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // Playwright E2E specs live in tests/e2e/ (see playwright.config.ts testDir)
    // and must only be collected by `playwright test`, not by vitest — vitest
    // cannot run @playwright/test's test.describe and fails collection.
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
    includeSource: ['**/*.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test-setup.ts',
        'test-helpers/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.d.ts',
        'wasm/', // Generated WASM types
        'mocks/', // Mock data
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75,
      },
      all: true,
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    benchmark: {
      include: ['**/*.bench.ts'],
    },
  },
})
