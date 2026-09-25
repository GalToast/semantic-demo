/**
 * @lib/engine/data-worker-url-bridge.ts — Bridge for the Vite worker URL import.
 *
 * The `?worker&url` query is Vite-specific: it tells Vite to treat the target
 * as a web worker and return its bundled URL string at build time. This magic
 * cannot be re-exported through an intermediate module in the traditional sense,
 * but it CAN live in a bridge file that is itself processed by Vite — the
 * query is resolved at build time for each import site that Vite processes.
 *
 * This bridge keeps the direct `js/` import inside the engine boundary
 * (src/lib/engine/) so that src/lib/semantic-threads.ts satisfies the
 * Svelte-bridge import contract without a documented exemption.
 *
 * Special case documented: 2026-06-14, Bridge-Debt Batch 3.
 */
export { default as workerUrl } from '../../../js/workers/data-worker.ts?worker&url';
