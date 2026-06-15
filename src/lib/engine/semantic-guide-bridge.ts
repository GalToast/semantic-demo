/**
 * @lib/engine/semantic-guide-bridge.ts — Thin bridge for semantic guide Svelte 5 logic.
 *
 * Re-exports native Svelte 5 symbols so that legacy engine code or Svelte
 * orchestration can call them.
 */

export {
  semanticGuideIcon,
  setSemanticGuideButtonState,
  getSemanticGuideTitle,
  showSummaryCard,
  hideSummaryCard,
  requestSemanticGuide,
} from '@lib/journey/semantic-guide';
