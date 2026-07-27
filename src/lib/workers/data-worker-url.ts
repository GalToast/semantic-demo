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
 * L2-H1 fix: Removed top-level await. The dynamic import is now fire-and-forget
 * via .then(), eliminating the race window where workerUrl was '' during async
 * resolution. Initialises to the safe Node fallback so no consumer ever sees an
 * empty string. The live `let` binding updates when the import resolves.
 */
let workerUrl: string = '/assets/data-worker.js'

if (typeof window !== 'undefined') {
    // Browser / Vite build: resolve the bundled worker URL at runtime.
    // The dynamic import keeps the Vite query out of the static module graph
    // so Node-based test runners don't choke on it.
    // Fire-and-forget: no top-level await, so the module resolves synchronously
    // with the safe fallback. The live binding updates when the import resolves.
    import('./data-worker.ts?worker&url')
        .then(mod => {
            const resolved = (mod as { default?: string }).default
            if (resolved) workerUrl = resolved
        })
        .catch(() => {
            // Import failed — keep the safe default fallback.
            // A wrong URL degrades gracefully: new Worker rejects, callers
            // retry or fall back to main-thread processing.
        })
}

export { workerUrl }
export default workerUrl
