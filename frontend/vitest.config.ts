import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: { provider: 'v8', include: ['src/lib/**', 'src/api/client.ts'], reporter: ['text', 'json-summary'] },
  },
})
