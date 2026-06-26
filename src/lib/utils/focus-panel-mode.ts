/**
 * @lib/utils/focus-panel-mode.ts — Focus panel mode enum and body data-attribute helpers
 *
 * Port of
 * Note: In a later phase, this will be replaced by a Svelte store.
 * For now, it mirrors the legacy DOM-centric pattern.
 */

export const FOCUS_PANEL_MODE = Object.freeze({
  OVERVIEW: 'overview',
  FIELD_NODE: 'field-node',
  MANUAL_PANEL: 'manual-panel',
  MANUAL_COLLAPSED: 'manual-collapsed',
  LEGEND_OPEN: 'legend-open'
} as const);

export type FocusPanelMode = (typeof FOCUS_PANEL_MODE)[keyof typeof FOCUS_PANEL_MODE];

export function getFocusPanelMode(): FocusPanelMode {
  if (typeof document === 'undefined') return FOCUS_PANEL_MODE.OVERVIEW;
  return (document.body?.dataset?.focusPanelMode as FocusPanelMode | undefined) ?? FOCUS_PANEL_MODE.OVERVIEW;
}

export function setFocusPanelMode(mode: FocusPanelMode | string | null | undefined): void {
  if (typeof document === 'undefined' || !document.body) return;
  const resolved = mode || FOCUS_PANEL_MODE.OVERVIEW;
  document.body.dataset.focusPanelMode = resolved;
  // Mirror to CSS class for class-based selectors (e.g., .fpm-field-node)
  for (const cls of Array.from(document.body.classList)) {
    if (cls.startsWith('fpm-')) document.body.classList.remove(cls);
  }
  document.body.classList.add(`fpm-${resolved}`);
}
