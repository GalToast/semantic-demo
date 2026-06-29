/**
 * @lib/workers/data-worker-url.ts — Vite worker URL import boundary.
 *
 * The `?worker&url` query is Vite-specific: it tells Vite to treat the target
 * as a web worker and return its bundled URL string at build time. This magic
 * cannot be re-exported through an intermediate module in the traditional sense,
 * but it can live in a boundary module that is itself processed by Vite. The
 * query is resolved at build time for each import site that Vite processes.
 *
 * This module keeps the bundler-specific import in the worker boundary so
 * runtime callers can share one URL without duplicating the Vite query.
 *
 * Special case documented: 2026-06-20 worker URL closeout.
 */
let workerUrl: string = ''

if (typeof window === 'undefined') {
    // Node / test environment: Vite worker URL query is not resolvable.
    // Provide a placeholder so modules that import this boundary can still load.
    workerUrl = '/assets/data-worker.js'
} else {
    // Browser / Vite build: resolve the bundled worker URL at runtime.
    // The dynamic import keeps the Vite query out of the static module graph
    // so Node-based test runners don't choke on it.
    const mod = await import('./data-worker.ts?worker&url')
    workerUrl = (mod as { default?: string }).default || ''
}

export { workerUrl }
export default workerUrl
