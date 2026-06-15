import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 */

// ── Mock appState (plain JS object — NO Svelte 5 $state runes) ─────────────────

const mockState = vi.hoisted(() => ({
  legendOpen: false,
}));

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    get legendOpen() { return mockState.legendOpen; },
    set legendOpen(v: boolean) { mockState.legendOpen = v; },
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  legendOpen,
  toggleLegend,
  setLegendOpen,
} from '@lib/stores/legend.svelte.ts';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('legend store — T4 writable + withLegendNotify migration', () => {
  beforeEach(() => {
    legendOpen.set(false);
    mockState.legendOpen = false;
  });

  it('legendOpen.set(true) toggles writable + appState', () => {
    legendOpen.set(true);
    expect(get(legendOpen)).toBe(true);
    expect(mockState.legendOpen).toBe(true);
  });

  it('legendOpen.set(false) clears both writable + appState', () => {
    legendOpen.set(true);
    legendOpen.set(false);
    expect(get(legendOpen)).toBe(false);
    expect(mockState.legendOpen).toBe(false);
  });

  it('toggleLegend() switches false -> true', () => {
    expect(get(legendOpen)).toBe(false);
    toggleLegend();
    expect(get(legendOpen)).toBe(true);
    expect(mockState.legendOpen).toBe(true);
  });

  it('toggleLegend() switches true -> false', () => {
    legendOpen.set(true);
    toggleLegend();
    expect(get(legendOpen)).toBe(false);
    expect(mockState.legendOpen).toBe(false);
  });

  it('setLegendOpen(true) explicitly sets', () => {
    setLegendOpen(true);
    expect(get(legendOpen)).toBe(true);
    expect(mockState.legendOpen).toBe(true);
  });

  it('setLegendOpen(false) explicitly clears', () => {
    legendOpen.set(true);
    setLegendOpen(false);
    expect(get(legendOpen)).toBe(false);
    expect(mockState.legendOpen).toBe(false);
  });

  it('subscriber fires on legendOpen.set(true)', () => {
    const cb = vi.fn();
    const unsub = legendOpen.subscribe(cb);
    legendOpen.set(true);
    unsub();
    expect(cb).toHaveBeenLastCalledWith(true);
  });

  it('subscriber fires on legendOpen.set(false)', () => {
    legendOpen.set(true);
    const cb = vi.fn();
    const unsub = legendOpen.subscribe(cb);
    legendOpen.set(false);
    unsub();
    expect(cb).toHaveBeenLastCalledWith(false);
  });

  it('subscriber fires on toggleLegend', () => {
    const cb = vi.fn();
    const unsub = legendOpen.subscribe(cb);
    toggleLegend();
    unsub();
    expect(cb).toHaveBeenLastCalledWith(true);
  });

  it('subscriber fires on setLegendOpen', () => {
    const cb = vi.fn();
    const unsub = legendOpen.subscribe(cb);
    setLegendOpen(true);
    unsub();
    expect(cb).toHaveBeenLastCalledWith(true);
  });
});
