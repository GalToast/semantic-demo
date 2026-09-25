import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 *
 * Consolidated viewport state-class-migration test (separate file).
 * Extracted from viewport-state-class-migration.test.ts as part of
 * Wave 21.1 — each remaining store gets its own standalone consolidated
 * file to avoid race conditions when multiple workers edit in parallel.
 *
 * Pattern: vi.hoisted mutable state + vi.mock factory with unique name
 * to avoid collision if both this file and the main scaffold run in the
 * same process.
 *
 * Run: npx vitest run tests/unit-active/state-class-migration-2-viewport.test.ts
 */

// ── Hoisted mock state (unique name: _viewportState) ─────────────────────────
// vi.hoisted ensures these exist when vi.mock factories execute at import time.

const _viewportState = vi.hoisted(() => ({
  viewportWidth: 1280,
  viewportHeight: 720,
  viewportDpr: 1,
  viewportReducedMotion: false,
  viewportIsCompact: false,
}));

// ── Mock factory ─────────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    get viewportWidth() { return _viewportState.viewportWidth; },
    set viewportWidth(v: number) { _viewportState.viewportWidth = v; },
    get viewportHeight() { return _viewportState.viewportHeight; },
    set viewportHeight(v: number) { _viewportState.viewportHeight = v; },
    get viewportDpr() { return _viewportState.viewportDpr; },
    set viewportDpr(v: number) { _viewportState.viewportDpr = v; },
    get viewportReducedMotion() { return _viewportState.viewportReducedMotion; },
    set viewportReducedMotion(v: boolean) { _viewportState.viewportReducedMotion = v; },
    get viewportIsCompact() { return _viewportState.viewportIsCompact; },
    set viewportIsCompact(v: boolean) { _viewportState.viewportIsCompact = v; },
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  viewport,
  syncViewport,
  viewportWidth,
  viewportHeight,
  dpr,
  reducedMotion,
  isCompact,
  isMobile,
  isLandscape,
  isCompactLandscape,
  isUltraCompactPortrait,
  getViewportSize,
  isMobileViewport,
  prefersReducedMotion,
  getDevicePixelRatio,
  isCompactFocusStage,
} from '@lib/stores/viewport.svelte.ts';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('viewport store — T4 writable + withViewportNotify migration', () => {
  beforeEach(() => {
    _viewportState.viewportWidth = 1280;
    _viewportState.viewportHeight = 720;
    _viewportState.viewportDpr = 1;
    _viewportState.viewportReducedMotion = false;
    _viewportState.viewportIsCompact = false;
  });

  it('viewport() returns current appState dimensions', () => {
    const s = viewport();
    expect(s.width).toBe(1280);
    expect(s.height).toBe(720);
    expect(s.dpr).toBe(1);
  });

  it('viewport.set() updates writable AND appState fields', () => {
    viewport.set({
      width: 375,
      height: 812,
      dpr: 2,
      reducedMotion: true,
      isCompact: true,
      isMobile: true,
      isLandscape: false,
      isCompactLandscape: false,
      isUltraCompactPortrait: false,
    });
    expect(_viewportState.viewportWidth).toBe(375);
    expect(_viewportState.viewportHeight).toBe(812);
    expect(_viewportState.viewportDpr).toBe(2);
    expect(_viewportState.viewportReducedMotion).toBe(true);
    expect(_viewportState.viewportIsCompact).toBe(true);
  });

  it('subscriber fires when viewport.set() changes', () => {
    const cb = vi.fn();
    const unsub = viewport.subscribe(cb);
    viewport.set({
      width: 375, height: 812, dpr: 2, reducedMotion: false,
      isCompact: true, isMobile: true, isLandscape: false,
      isCompactLandscape: false, isUltraCompactPortrait: false,
    });
    unsub();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][0].width).toBe(375);
  });

  it('viewport.update transforms state', () => {
    viewport.set({
      width: 1280, height: 720, dpr: 1, reducedMotion: false,
      isCompact: false, isMobile: false, isLandscape: true,
      isCompactLandscape: false, isUltraCompactPortrait: false,
    });
    viewport.update((s) => ({ ...s, width: 1920 }));
    expect(get(viewport).width).toBe(1920);
    expect(_viewportState.viewportWidth).toBe(1920);
  });

  it('syncViewport reads from window and writes to appState', () => {
    Object.defineProperty(window, 'innerWidth', { value: 480, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true });

    syncViewport();
    expect(_viewportState.viewportWidth).toBe(480);
    expect(_viewportState.viewportHeight).toBe(800);
    expect(_viewportState.viewportDpr).toBe(2);
  });

  it('syncViewport notifies store subscribers (regression: canvas resize)', () => {
    // Regression test for the mobile canvas resize seam.
    // syncViewport() must update _viewportWritable so that $viewport
    // subscribers (e.g. Canvas.svelte $effect → bridge.resize()) fire.
    // Reset store to known state first (previous test's syncViewport may
    // have left stale values in the writable).
    viewport.set({
      width: 1280, height: 720, dpr: 1, reducedMotion: false,
      isCompact: false, isMobile: false, isLandscape: true,
      isCompactLandscape: false, isUltraCompactPortrait: false,
    });

    Object.defineProperty(window, 'innerWidth', { value: 390, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, writable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true });

    const cb = vi.fn();
    const unsub = viewport.subscribe(cb);

    // First call is the subscribe snapshot (should be reset 1280)
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].width).toBe(1280);

    syncViewport();

    // Subscriber should have been notified with the new dimensions
    expect(cb).toHaveBeenCalledTimes(2);
    const updated = cb.mock.calls[1][0];
    expect(updated.width).toBe(390);
    expect(updated.height).toBe(844);
    expect(updated.isCompact).toBe(true);
    expect(updated.isMobile).toBe(true);
    expect(updated.isLandscape).toBe(false);

    // Also verify get() reflects the updated values
    const s = get(viewport) as any;
    expect(s.width).toBe(390);
    expect(s.height).toBe(844);

    unsub();
  });

  it('syncViewport derived fields match writable after resize', () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, writable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true });

    syncViewport();

    // Derived store fields should reflect the compact mobile viewport
    const s = get(viewport) as any;
    expect(s.isCompact).toBe(true);
    expect(s.isMobile).toBe(true);
    expect(s.isLandscape).toBe(false);
    expect(s.isCompactLandscape).toBe(false); // height 844 > 740
    expect(s.isUltraCompactPortrait).toBe(true); // 390 <= 430 && 741 <= 844 <= 860
  });

  it('derived getters read directly from appState', () => {
    _viewportState.viewportWidth = 1024;
    _viewportState.viewportHeight = 768;
    _viewportState.viewportDpr = 2;
    _viewportState.viewportReducedMotion = true;
    _viewportState.viewportIsCompact = true;

    expect(viewportWidth()).toBe(1024);
    expect(viewportHeight()).toBe(768);
    expect(dpr()).toBe(2);
    expect(reducedMotion()).toBe(true);
    expect(isCompact()).toBe(true);
    expect(isMobile()).toBe(true);
    expect(isMobileViewport()).toBe(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(getDevicePixelRatio()).toBe(2);
    expect(isCompactFocusStage()).toBe(true);
    expect(getViewportSize()).toEqual({ width: 1024, height: 768 });
  });

  it('isLandscape returns true when width > height', () => {
    _viewportState.viewportWidth = 1024;
    _viewportState.viewportHeight = 768;
    expect(isLandscape()).toBe(true);
  });

  it('isLandscape returns false when width <= height', () => {
    _viewportState.viewportWidth = 375;
    _viewportState.viewportHeight = 812;
    expect(isLandscape()).toBe(false);
  });

  it('isCompactLandscape true only when compact + short height', () => {
    _viewportState.viewportIsCompact = true;
    _viewportState.viewportHeight = 700;
    expect(isCompactLandscape()).toBe(true);
    _viewportState.viewportHeight = 800;
    expect(isCompactLandscape()).toBe(false);
    _viewportState.viewportIsCompact = false;
    _viewportState.viewportHeight = 700;
    expect(isCompactLandscape()).toBe(false);
  });

  it('isUltraCompactPortrait detects narrow tall mobile', () => {
    _viewportState.viewportWidth = 375;
    _viewportState.viewportHeight = 780;
    expect(isUltraCompactPortrait()).toBe(true);

    _viewportState.viewportWidth = 390;
    _viewportState.viewportHeight = 820;
    expect(isUltraCompactPortrait()).toBe(true);

    _viewportState.viewportWidth = 450;
    expect(isUltraCompactPortrait()).toBe(false); // too wide

    _viewportState.viewportHeight = 700;
    expect(isUltraCompactPortrait()).toBe(false); // too short
  });
});
