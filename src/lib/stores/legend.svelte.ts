/**
 * @lib/stores/legend.svelte.ts — Legend panel visibility store
 *
 * Manages whether the category legend panel is open.
 * Default: open on desktop (>768px), closed on mobile.
 */
import { writable } from 'svelte/store';

function getInitialState(): boolean {
  if (typeof window !== 'undefined') {
    return window.innerWidth > 768;
  }
  return false;
}

/** Whether the legend panel is open. */
export const legendOpen = writable<boolean>(getInitialState());

/** Toggle the legend panel open/closed. */
export function toggleLegend(): void {
  legendOpen.update((v) => !v);
}

/** Set the legend panel to a specific open/closed state. */
export function setLegendOpen(open: boolean): void {
  legendOpen.set(open);
}
