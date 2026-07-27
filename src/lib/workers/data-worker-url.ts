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
 *
 * L2-H1 fix: Added top-level await so the bundled worker URL is resolved before
 * any consumer reads it. The relative fallback (`./assets/data-worker.js`) is
 * used in non-browser environments and as a safety net while the import resolves.
 */
let workerUrl: string = './assets/data-worker.js'

if (typeof window !== 'undefined') {
    // Browser / Vite build: resolve the bundled worker URL before the module
    // finishes loading. This prevents consumers from instantiating a Worker
    // with an empty or fallback URL.
    try {
        const mod = await import('./data-worker.ts?worker&url')
        const resolved = (mod as { default?: string }).default
        if (resolved) workerUrl = resolved
    } catch {
        // Import failed — keep the safe fallback. A wrong URL degrades
        // gracefully: new Worker rejects and callers retry or fall back to
        // main-thread processing.
    }
}

export { workerUrl }
export default workerUrl
