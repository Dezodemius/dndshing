import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json-summary'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,tsx}'],
        // src/test holds shared test fixtures, not product code — counting it
        // as uncovered would drag the reported percentage down for nothing.
        exclude: [
          'src/main.tsx',
          'src/vite-env.d.ts',
          'src/**/*.test.{ts,tsx}',
          'src/test/**',
        ],
      },
    },
  }),
)
