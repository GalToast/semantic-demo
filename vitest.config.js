import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_DIR = resolve(__dirname, 'src')
const JS_DIR = resolve(__dirname, 'js')

export default defineConfig({
  plugins: [svelte()],
  // Mirror the @lib / @components / @ aliases from vite.config.ts so active
  // Svelte/TS unit tests resolve the same module graph as the app.
  resolve: {
    alias: {
      '@': SRC_DIR,
      '@lib': resolve(SRC_DIR, 'lib'),
      '@components': resolve(SRC_DIR, 'components'),
      // @legacy maps to the project root js/ directory so dynamic imports
      // like import('@legacy/modules/view-controller.js') resolve correctly
      // during unit tests.  The ambient type declaration in
      // src/lib/types/legacy-modules.d.ts provides type safety.
      '@legacy-js': JS_DIR
    },
    // Resolve .svelte.ts extension so stores like search.svelte.ts can be
    // imported as @lib/stores/search without the explicit extension.
    // Required because Vitest's import analysis does not use the Svelte
    // plugin's built-in .svelte.ts resolution during static analysis.
    extensions: ['.svelte.ts', '.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit-active/**/*.{test,spec}.{js,mjs,ts}'],
    globals: true,
    // setupFiles runs before any test file. Store tests import modules that
    // call window.matchMedia during module initialization.
    setupFiles: ['tests/unit/vitest.setup.js'],
  },
})
