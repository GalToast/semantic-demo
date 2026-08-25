/**
 * @lib/workers/mycelium-build-worker-url.ts — Vite worker URL import boundary
 * for the mycelium build worker (mirrors data-worker-url.ts).
 *
 * The `?worker&url` query is Vite-specific and must be imported at a site
 * Vite processes; this boundary module keeps the bundler-specific import so
 * runtime callers share one resolved URL.
 */
let workerUrl: string = './assets/mycelium-build-worker.js'

if (typeof window !== 'undefined') {
    try {
        const mod = await import('./mycelium-build-worker.ts?worker&url')
        const resolved = (mod as { default?: string }).default
        if (resolved) workerUrl = resolved
    } catch {
        // Import failed — keep the safe fallback. buildMyceliumBuffersInWorker
        // resolves null on worker failure and createMycelium uses the sync path.
    }
}

export { workerUrl }
export default workerUrl
