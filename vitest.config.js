import { defineConfig } from 'vitest/config'

// Backend security tests run in a Node environment (they exercise serverless
// handlers + shared lib helpers). External providers (Groq / Supabase / Stripe /
// Finnhub) are always mocked — tests never touch the network or spend credits.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    setupFiles: ['./test/setup.js'],
  },
})
