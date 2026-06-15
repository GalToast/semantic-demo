/**
 * @lib/engine/semantic-dive-bridge.ts — Thin bridge for semantic dive Svelte 5 logic.
 *
 * Re-exports native Svelte 5 symbols so that legacy engine code or Svelte
 * orchestration can call them.
 */

export {
  initSemanticDiveUiSubscriptions,
  syncSemanticDiveUi,
} from '@lib/journey/semantic-dive';
