import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 */

// ── Mock appState (plain JS object — NO Svelte 5 $state runes) ─────────────────

const mockState = vi.hoisted(() => ({
  autoRotate: false,
  autoRotateSuspended: false,
  autoRotateResumeDueAt: 0,
  autoRotateSoftResumeStartedAt: 0,
}));

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    get autoRotate() { return mockState.autoRotate; },
    set autoRotate(v: boolean) { mockState.autoRotate = v; },
    get autoRotateSuspended() { return mockState.autoRotateSuspended; },
    set autoRotateSuspended(v: boolean) { mockState.autoRotateSuspended = v; },
    get autoRotateResumeDueAt() { return mockState.autoRotateResumeDueAt; },
    set autoRotateResumeDueAt(v: number) { mockState.autoRotateResumeDueAt = v; },
    get autoRotateSoftResumeStartedAt() { return mockState.autoRotateSoftResumeStartedAt; },
    set autoRotateSoftResumeStartedAt(v: number) { mockState.autoRotateSoftResumeStartedAt = v; },
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  cameraStore,
  setCameraPosition,
  setCameraTarget,
  setAutoRotate,
  suspendAutoRotate,
  resumeAutoRotate,
  toggleAutoRotate,
  resetCamera,
  cameraPosition,
  cameraTarget,
  autoRotate,
  autoRotateSuspended,
  isAutoRotating,
  CAMERA_CONFIG,
  OVERVIEW_CAMERA_POSE,
} from '@lib/stores/camera.svelte.ts';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('camera store — T4 writable + withCameraNotify migration', () => {
  beforeEach(() => {
    resetCamera();
    mockState.autoRotate = false;
    mockState.autoRotateSuspended = false;
    mockState.autoRotateResumeDueAt = 0;
    mockState.autoRotateSoftResumeStartedAt = 0;
  });

  it('cameraStore is readable and has property accessors', () => {
    const s = get(cameraStore);
    expect(s).toHaveProperty('position');
    expect(s).toHaveProperty('target');
    expect(s).toHaveProperty('autoRotate');
    expect(s).toHaveProperty('orbitSlack');
  });

  it('setCameraPosition mutates writable', () => {
    setCameraPosition([1, 2, 3]);
    expect(cameraPosition()).toEqual([1, 2, 3]);
    expect(get(cameraStore).position).toEqual([1, 2, 3]);
  });

  it('setCameraTarget mutates writable', () => {
    setCameraTarget([4, 5, 6]);
    expect(cameraTarget()).toEqual([4, 5, 6]);
  });

  it('setAutoRotate(true) updates writable AND appState.autoRotate', () => {
    setAutoRotate(true);
    expect(autoRotate()).toBe(true);
    expect(mockState.autoRotate).toBe(true);
  });

  it('setAutoRotate(false) clears both', () => {
    setAutoRotate(true);
    setAutoRotate(false);
    expect(autoRotate()).toBe(false);
    expect(mockState.autoRotate).toBe(false);
  });

  it('suspendAutoRotate sets suspended true', () => {
    setAutoRotate(true);
    suspendAutoRotate();
    expect(autoRotateSuspended()).toBe(true);
    expect(mockState.autoRotateSuspended).toBe(true);
    expect(isAutoRotating()).toBe(false);
  });

  it('resumeAutoRotate clears suspended', () => {
    setAutoRotate(true);
    suspendAutoRotate();
    resumeAutoRotate();
    expect(autoRotateSuspended()).toBe(false);
    expect(mockState.autoRotateSuspended).toBe(false);
    expect(isAutoRotating()).toBe(true);
  });

  it('toggleAutoRotate flips autoRotate', () => {
    expect(autoRotate()).toBe(false);
    toggleAutoRotate();
    expect(autoRotate()).toBe(true);
    expect(mockState.autoRotate).toBe(true);
    toggleAutoRotate();
    expect(autoRotate()).toBe(false);
    expect(mockState.autoRotate).toBe(false);
  });

  it('subscriber fires on setCameraPosition', () => {
    const cb = vi.fn();
    const unsub = cameraStore.subscribe(cb);
    setCameraPosition([9, 9, 9]);
    unsub();
    expect(cb.mock.calls[cb.mock.calls.length - 1][0].position).toEqual([9, 9, 9]);
  });

  it('subscriber fires on setAutoRotate via withCameraNotify', () => {
    const cb = vi.fn();
    const unsub = cameraStore.subscribe(cb);
    setAutoRotate(true);
    unsub();
    const last = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(last.autoRotate).toBe(true);
  });

  it('resetCamera restores position and target', () => {
    setCameraPosition([99, 99, 99]);
    setCameraTarget([88, 88, 88]);
    resetCamera();
    expect(cameraPosition()).toEqual([0, 0, 3]);
    expect(cameraTarget()).toEqual([0, 0, 0]);
  });

  it('resetCamera restores autoRotate appState', () => {
    setAutoRotate(true);
    suspendAutoRotate();
    resetCamera();
    expect(mockState.autoRotate).toBe(false);
    expect(mockState.autoRotateSuspended).toBe(false);
    expect(mockState.autoRotateResumeDueAt).toBe(0);
    expect(mockState.autoRotateSoftResumeStartedAt).toBe(0);
  });

  it('CAMERA_CONFIG exposes numeric constants', () => {
    expect(CAMERA_CONFIG.AUTO_ROTATE_BASE_SPEED).toBeGreaterThan(0);
    expect(CAMERA_CONFIG.ORBIT_MAX_DISTANCE_DEFAULT).toBeGreaterThan(0);
  });

  it('OVERVIEW_CAMERA_POSE has position and target arrays', () => {
    expect(OVERVIEW_CAMERA_POSE.position).toHaveLength(3);
    expect(OVERVIEW_CAMERA_POSE.target).toHaveLength(3);
  });
});
