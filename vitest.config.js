import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { acquireVitestSingleFlight } from './scripts/vitest-single-flight.mjs'

// Prevent concurrent full Vitest runs from exhausting the workstation. This
// is config-level so both `npm run test:unit` and direct `npx vitest run` use it.
acquireVitestSingleFlight()

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
        // Use vmThreads pool to avoid process-fork hangs with large Svelte/JSDOM
        // suites while keeping test isolation via VM modules.
        pool: 'vmThreads',
        // Inline the Svelte package so its ESM internals resolve correctly inside
        // the vmThreads runner (avoids "Cannot use import statement outside a module").
        server: {
            deps: {
                inline: ['svelte']
            }
        },
        // setupFiles runs before any test file. Store tests import modules that
        // call window.matchMedia during module initialization.
        setupFiles: ['tests/unit-active/vitest.setup.js'],
        // One-time TDB fixture ensure (no-op when fresh): regenerates the
        // gitignored tmp/perf9/semantic_threads.dat.bin the semantic-tdb tests read.
        globalSetup: ['scripts/tdb1-fixture-ensure.mjs'],
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
