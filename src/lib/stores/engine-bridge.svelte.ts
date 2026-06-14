/**
 * @lib/stores/engine-bridge.svelte.ts — Shared engine bridge reference (Svelte 5 runes)
 *
 * Holds the single EngineBridge instance created by Canvas.svelte.
 */
import { toStore } from 'svelte/store';
import type { EngineBridge } from '@lib/engine/adapters/types';
import { appState } from '@lib/state/app.svelte.ts';

/** Reactive binding to the engine bridge instance in the kernel. */
export const engineBridgeStore = toStore(
  () => appState.engineBridge as EngineBridge | null,
  (v) => appState.withMutation(() => { appState.engineBridge = v; })
);

/** Set the global engine bridge instance. */
export function setEngineBridge(bridge: EngineBridge | null): void {
  engineBridgeStore.set(bridge);
}

/** Get the current bridge value (non-reactive). */
export function getEngineBridge(): EngineBridge | null {
  return appState.engineBridge as EngineBridge | null;
}
