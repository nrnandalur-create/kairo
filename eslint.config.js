import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Server-side code (Vercel serverless functions + shared lib) and tests run
  // under Node, not the browser — give them Node globals (process, Buffer, …)
  // so they don't trip no-undef.
  {
    files: ['api/**/*.js', 'lib/**/*.js', 'test/**/*.js', 'supabase/functions/**/*.{js,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
