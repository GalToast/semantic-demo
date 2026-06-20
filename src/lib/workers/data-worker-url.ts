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
export { default as workerUrl } from './data-worker.ts?worker&url'
