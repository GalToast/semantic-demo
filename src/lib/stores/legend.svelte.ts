/**
 * @lib/stores/legend.svelte.ts — Legend panel visibility store
 *
 * Manages whether the category legend panel is open.
 * Default: open on desktop (>768px), closed on mobile.
 */
import { toStore } from 'svelte/store';
import { appState } from '@lib/state/app.svelte.ts';

/** Whether the legend panel is open. Reactive binding to the kernel. */
export const legendOpen = toStore(
  () => appState.legendOpen,
  (v) => appState.withMutation(() => { appState.legendOpen = v; })
);

/** Toggle the legend panel open/closed. */
export function toggleLegend(): void {
  legendOpen.update((v) => !v);
}

/** Set the legend panel to a specific open/closed state. */
export function setLegendOpen(open: boolean): void {
  legendOpen.set(open);
}
