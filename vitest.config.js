import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_DIR = resolve(__dirname, 'src')

export default defineConfig({
  plugins: [svelte()],
  // 2026-06-06: Mirror the @lib / @components / @ aliases from vite.config.ts
  // so the focused svelte-parity-attrs unit test can resolve the
  // parity-attrs.ts module's transitive imports. Without these aliases
  // vitest's import-analysis cannot resolve @lib/... and the test suite
  // errors out before any test runs.
  resolve: {
    alias: {
      '@': SRC_DIR,
      '@lib': resolve(SRC_DIR, 'lib'),
      '@components': resolve(SRC_DIR, 'components')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js'],
    globals: true,
    // 2026-06-06: setupFiles runs before any test file. The svelte-parity-attrs
    // test imports src/lib/stores/viewport.ts, which calls window.matchMedia at
    // module init. Without this stub, vitest errors before any test runs.
    setupFiles: ['tests/unit/vitest.setup.js'],
  },
})
