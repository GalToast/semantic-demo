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
  resolve: {
    alias: {
      '@': SRC_DIR,
      '@lib': resolve(SRC_DIR, 'lib'),
      '@components': resolve(SRC_DIR, 'components'),
      '@legacy': JS_DIR
    },
    extensions: ['.svelte.ts', '.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js'],
    globals: true,
    setupFiles: ['tests/unit/vitest.setup.js'],
  },
})
