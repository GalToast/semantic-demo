import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 */

// ── Mock appState (plain JS object — NO Svelte 5 $state runes) ─────────────────

const mockState = vi.hoisted(() => ({
  engineBridge: null as any,
}));

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    get engineBridge() { return mockState.engineBridge; },
    set engineBridge(v: any) { mockState.engineBridge = v; },
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  engineBridgeStore,
  setEngineBridge,
  getEngineBridge,
} from '@lib/stores/engine-bridge.svelte.ts';

// ── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_BRIDGE = { id: 'fake-engine-1' };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('engine-bridge store — T4 writable + withEngineBridgeNotify migration', () => {
  beforeEach(() => {
    engineBridgeStore.set(null);
    mockState.engineBridge = null;
  });

  it('engineBridgeStore.set(null) stores null', () => {
    engineBridgeStore.set(null);
    expect(get(engineBridgeStore)).toBeNull();
  });

  it('engineBridgeStore.set(fakeBridge) stores bridge', () => {
    engineBridgeStore.set(FAKE_BRIDGE as any);
    expect(get(engineBridgeStore)).toBe(FAKE_BRIDGE);
  });

  it('engineBridgeStore.update returns same value if updater is identity', () => {
    engineBridgeStore.set(FAKE_BRIDGE as any);
    engineBridgeStore.update((existing) => existing);
    expect(get(engineBridgeStore)).toBe(FAKE_BRIDGE);
  });

  it('engineBridgeStore.update replaces value', () => {
    const OLD_BRIDGE = { id: 'old' };
    const NB = { id: 'new' };
    engineBridgeStore.set(OLD_BRIDGE as any);
    engineBridgeStore.update(() => NB as any);
    expect(get(engineBridgeStore)).toBe(NB);
  });

  it('setEngineBridge updates writable AND appState', () => {
    setEngineBridge(FAKE_BRIDGE as any);
    expect(get(engineBridgeStore)).toBe(FAKE_BRIDGE);
    expect(mockState.engineBridge).toBe(FAKE_BRIDGE);
  });

  it('setEngineBridge(null) clears both writable + appState', () => {
    setEngineBridge(FAKE_BRIDGE as any);
    setEngineBridge(null);
    expect(get(engineBridgeStore)).toBeNull();
    expect(mockState.engineBridge).toBeNull();
  });

  it('subscriber fires when engineBridgeStore.set() is called', () => {
    const cb = vi.fn();
    const unsub = engineBridgeStore.subscribe(cb);
    engineBridgeStore.set(FAKE_BRIDGE as any);
    unsub();
    expect(cb).toHaveBeenCalledWith(FAKE_BRIDGE);
  });

  it('subscriber fires when engineBridgeStore.update() changes value', () => {
    const cb = vi.fn();
    const unsub = engineBridgeStore.subscribe(cb);
    engineBridgeStore.update(() => FAKE_BRIDGE as any);
    unsub();
    expect(cb).toHaveBeenCalledWith(FAKE_BRIDGE);
  });

  it('subscriber fires when setEngineBridge is called', () => {
    const cb = vi.fn();
    const unsub = engineBridgeStore.subscribe(cb);
    setEngineBridge(FAKE_BRIDGE as any);
    unsub();
    expect(cb).toHaveBeenCalledWith(FAKE_BRIDGE);
  });

  it('getEngineBridge reads current writable state', () => {
    engineBridgeStore.set(FAKE_BRIDGE as any);
    expect(getEngineBridge()).toBe(FAKE_BRIDGE);
  });

  it('getEngineBridge returns null after reset', () => {
    engineBridgeStore.set(FAKE_BRIDGE as any);
    engineBridgeStore.set(null);
    expect(getEngineBridge()).toBeNull();
  });
});
