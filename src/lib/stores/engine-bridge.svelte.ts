/**
 * @lib/stores/engine-bridge.svelte.ts — Shared engine bridge reference (Svelte 5 runes)
 *
 * Holds the single EngineBridge instance created by Canvas.svelte.
 * Other components (ThreadInspector, SemanticOverlay, etc.) read
 * from this store to access the bridge for WebGL operations.
 */
import type { EngineBridge } from '@lib/engine';

export let engineBridgeStore = $state<EngineBridge | null>(null);

export const hasEngineBridge = $derived(engineBridgeStore !== null);

/** Set the bridge instance (called by Canvas.svelte after init). */
export function setEngineBridge(bridge: EngineBridge | null): void {
  engineBridgeStore = bridge;
}

/** Get the current bridge value (non-reactive, for imperative calls). */
export function getEngineBridge(): EngineBridge | null {
  return engineBridgeStore;
}
