/**
 * @lib/engine/semantic-threads-worker-bridge.ts — Bridge for the semantic
 * threads data worker URL.
 *
 * Keeps Vite's legacy worker URL import behind the engine boundary so
 * src/lib/semantic-threads.ts does not import from js/ directly.
 */

import workerUrl from '../../../js/workers/data-worker.js?worker&url';

export function getSemanticThreadsWorkerUrl(): string {
  return workerUrl;
}
