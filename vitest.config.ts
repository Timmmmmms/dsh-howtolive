import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    css: true,
    server: {
      deps: {
        inline: ['@deepseek-ai/dsh-client-ui-primitives'],
      },
    },
  },
})
