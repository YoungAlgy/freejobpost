import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
  // Mirror the @/* alias from tsconfig.json so test files can use the same
  // import paths as production code.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
