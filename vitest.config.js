import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_DIR = resolve(__dirname, 'src')

export default defineConfig({
    // Override runes: true from svelte.config.js for tests so that
    // @testing-library/svelte-core's wrapper-scaffold.svelte (which uses
    // export let) compiles in legacy mode while our own runes-using
    // components still auto-detect correctly.
    plugins: [svelte({ compilerOptions: { runes: undefined } })],
    // Mirror the @lib / @components / @ aliases from vite.config.ts so active
    // Svelte/TS unit tests resolve the same module graph as the app.
    resolve: {
        conditions: ['browser', 'svelte'],
        alias: {
            '@': SRC_DIR,
            '@lib': resolve(SRC_DIR, 'lib'),
            '@components': resolve(SRC_DIR, 'components')
        },
        // Resolve .svelte.ts extension so stores like search.svelte.ts can be
        // imported as @lib/stores/search without the explicit extension.
        // Required because Vitest's import analysis does not use the Svelte
        // plugin's built-in .svelte.ts resolution during static analysis.
        extensions: ['.svelte.ts', '.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    },
    test: {
        environment: 'jsdom',
        testTimeout: 20000,
        include: ['tests/unit-active/**/*.{test,spec}.{js,mjs,ts}', 'tests/scripts/**/*.{test,spec}.{js,mjs,ts}'],
        globals: true,
        // setupFiles runs before any test file. Store tests import modules that
        // call window.matchMedia during module initialization.
        setupFiles: ['tests/unit-active/vitest.setup.js'],
        sequence: {
            concurrent: false
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            thresholds: {
                statements: 25,
                branches: 14,
                functions: 28,
                lines: 24
            },
            exclude: ['**/*.d.ts', 'src/app.d.ts', 'src/app.html', 'src/main.ts']
        }
    }
})
