import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 *
 * Consolidated state-class-migration tests.
 * Pattern: one vi.mock() with hoisted mutable state per store.
 * Each store's helper file provides setup() + test blocks.
 * Run: npx vitest run tests/unit-active/state-class-migration.test.ts
 */

// ── Hoisted mock state (one per store) ───────────────────────────────────────
// vi.hoisted ensures these exist when vi.mock factories execute at import time.

const _compassState = vi.hoisted(() => ({
  mode: 'overview' as string,
}));

const _cameraState = vi.hoisted(() => ({
  autoRotate: false,
  autoRotateSuspended: false,
  autoRotateResumeDueAt: 0,
  autoRotateSoftResumeStartedAt: 0,
}));

// ── Mock factories ───────────────────────────────────────────────────────────
// vi.mock is hoisted to the top of this file. The factories read from the
// hoisted state objects above, which helpers reset in beforeEach.

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    // Compass mock shape
    get navState() { return { get mode() { return _compassState.mode; } }; },
    // Camera mock shape
    get autoRotate() { return _cameraState.autoRotate; },
    set autoRotate(v: boolean) { _cameraState.autoRotate = v; },
    get autoRotateSuspended() { return _cameraState.autoRotateSuspended; },
    set autoRotateSuspended(v: boolean) { _cameraState.autoRotateSuspended = v; },
    get autoRotateResumeDueAt() { return _cameraState.autoRotateResumeDueAt; },
    set autoRotateResumeDueAt(v: number) { _cameraState.autoRotateResumeDueAt = v; },
    get autoRotateSoftResumeStartedAt() { return _cameraState.autoRotateSoftResumeStartedAt; },
    set autoRotateSoftResumeStartedAt(v: number) { _cameraState.autoRotateSoftResumeStartedAt = v; },
    withMutation: (fn: () => unknown) => fn(),
  },
}));

vi.mock('@lib/stores/journey.svelte', () => ({
  journeyPhase: () => _compassState.mode,
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  compassSteps,
  buildCompassStatus,
  JOURNEY_ACTIONS,
} from '@lib/stores/compass.svelte.ts';

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

// ── Compass tests ────────────────────────────────────────────────────────────

describe('compass store — state-class appState regression', () => {
  beforeEach(() => { _compassState.mode = 'overview'; });

  it('compassSteps returns 5 steps with correct states', () => {
    _compassState.mode = 'focus';
    const steps = compassSteps();
    expect(steps).toHaveLength(5);
    expect(steps[0]).toEqual({ phase: 'overview', state: 'done' });
    expect(steps[1]).toEqual({ phase: 'search', state: 'done' });
    expect(steps[2]).toEqual({ phase: 'focus', state: 'current' });
    expect(steps[3]).toEqual({ phase: 'inside', state: 'upcoming' });
    expect(steps[4]).toEqual({ phase: 'map', state: 'upcoming' });
  });

  it('compassSteps marks all done when mode is map', () => {
    _compassState.mode = 'map';
    const steps = compassSteps();
    expect(steps[4].state).toBe('current');
    expect(steps.slice(0, 4).every(s => s.state === 'done')).toBe(true);
  });

  it('compassSteps marks all upcoming when mode is overview', () => {
    _compassState.mode = 'overview';
    const steps = compassSteps();
    expect(steps[0].state).toBe('current');
    expect(steps.slice(1).every(s => s.state === 'upcoming')).toBe(true);
  });

  it('buildCompassStatus returns overview when no search/focus/inside', () => {
    const status = buildCompassStatus({
      currentView: 'galaxy', focusedName: '', queryLabel: '', isSearching: false,
      isFocusing: false, hasSearch: false, hasFocus: false, insideActive: false,
      resultCount: 0, walkDepth: 0, isSearchFocus: false, isSearchAnchor: false,
      isTrailStop: false, hasAnchor: false, clusterName: '', routeCount: 0,
      nextPointName: null, idleNote: 'Explore the network', isDiscovery: false,
      isSemanticDegraded: false,
    });
    expect(status.phase).toBe('overview');
    expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.FOCUS_SEARCH);
  });

  it('buildCompassStatus returns search phase when hasSearch', () => {
    const status = buildCompassStatus({
      currentView: 'galaxy', focusedName: '', queryLabel: 'coffee', isSearching: false,
      isFocusing: false, hasSearch: true, hasFocus: false, insideActive: false,
      resultCount: 3, walkDepth: 0, isSearchFocus: false, isSearchAnchor: false,
      isTrailStop: false, hasAnchor: false, clusterName: '', routeCount: 0,
      nextPointName: null, idleNote: '', isDiscovery: false, isSemanticDegraded: false,
    });
    expect(status.phase).toBe('search');
    expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.FOCUS_SEARCH);
  });

  it('buildCompassStatus returns focus phase when hasFocus', () => {
    const status = buildCompassStatus({
      currentView: 'galaxy', focusedName: 'ABC Store', queryLabel: '', isSearching: false,
      isFocusing: true, hasSearch: false, hasFocus: true, insideActive: false,
      resultCount: 0, walkDepth: 1, isSearchFocus: false, isSearchAnchor: false,
      isTrailStop: false, hasAnchor: false, clusterName: 'Downtown', routeCount: 0,
      nextPointName: null, idleNote: '', isDiscovery: false, isSemanticDegraded: false,
    });
    expect(status.phase).toBe('focus');
    expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.ENTER_INSIDE);
  });

  it('buildCompassStatus returns inside phase when insideActive', () => {
    const status = buildCompassStatus({
      currentView: 'galaxy', focusedName: 'ABC Store', queryLabel: '', isSearching: false,
      isFocusing: false, hasSearch: false, hasFocus: true, insideActive: true,
      resultCount: 0, walkDepth: 1, isSearchFocus: false, isSearchAnchor: false,
      isTrailStop: false, hasAnchor: false, clusterName: 'Downtown', routeCount: 0,
      nextPointName: 'XYZ Cafe', idleNote: '', isDiscovery: false, isSemanticDegraded: false,
    });
    expect(status.phase).toBe('inside');
    expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.NEXT_STOP);
  });

  it('buildCompassStatus returns map phase when currentView is map', () => {
    const status = buildCompassStatus({
      currentView: 'map', focusedName: 'ABC Store', queryLabel: '', isSearching: false,
      isFocusing: false, hasSearch: false, hasFocus: true, insideActive: false,
      resultCount: 0, walkDepth: 0, isSearchFocus: false, isSearchAnchor: false,
      isTrailStop: false, hasAnchor: false, clusterName: '', routeCount: 2,
      nextPointName: null, idleNote: '', isDiscovery: false, isSemanticDegraded: false,
    });
    expect(status.phase).toBe('map');
    expect(status.primaryAction.action).toBe(JOURNEY_ACTIONS.OPEN_MYCELIUM);
  });

  it('JOURNEY_ACTIONS has all expected actions', () => {
    expect(JOURNEY_ACTIONS.FOCUS_SEARCH).toBe('focus-search');
    expect(JOURNEY_ACTIONS.OPEN_MAP).toBe('open-map');
    expect(JOURNEY_ACTIONS.ENTER_INSIDE).toBe('enter-inside');
    expect(JOURNEY_ACTIONS.NEXT_STOP).toBe('next-stop');
    expect(JOURNEY_ACTIONS.COUNTY_OVERVIEW).toBe('county-overview');
    expect(JOURNEY_ACTIONS.OPEN_MYCELIUM).toBe('open-mycelium');
    expect(JOURNEY_ACTIONS.CENTER_ANCHOR).toBe('center-anchor');
    expect(JOURNEY_ACTIONS.SHOW_TRAIL_PANEL).toBe('show-trail-panel');
  });
});

// ── Camera tests ─────────────────────────────────────────────────────────────

describe('camera store — T4 writable + withCameraNotify migration', () => {
  beforeEach(() => {
    resetCamera();
    _cameraState.autoRotate = false;
    _cameraState.autoRotateSuspended = false;
    _cameraState.autoRotateResumeDueAt = 0;
    _cameraState.autoRotateSoftResumeStartedAt = 0;
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
    expect(_cameraState.autoRotate).toBe(true);
  });

  it('setAutoRotate(false) clears both', () => {
    setAutoRotate(true);
    setAutoRotate(false);
    expect(autoRotate()).toBe(false);
    expect(_cameraState.autoRotate).toBe(false);
  });

  it('suspendAutoRotate sets suspended true', () => {
    setAutoRotate(true);
    suspendAutoRotate();
    expect(autoRotateSuspended()).toBe(true);
    expect(_cameraState.autoRotateSuspended).toBe(true);
    expect(isAutoRotating()).toBe(false);
  });

  it('resumeAutoRotate clears suspended', () => {
    setAutoRotate(true);
    suspendAutoRotate();
    resumeAutoRotate();
    expect(autoRotateSuspended()).toBe(false);
    expect(_cameraState.autoRotateSuspended).toBe(false);
    expect(isAutoRotating()).toBe(true);
  });

  it('toggleAutoRotate flips autoRotate', () => {
    expect(autoRotate()).toBe(false);
    toggleAutoRotate();
    expect(autoRotate()).toBe(true);
    expect(_cameraState.autoRotate).toBe(true);
    toggleAutoRotate();
    expect(autoRotate()).toBe(false);
    expect(_cameraState.autoRotate).toBe(false);
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
    expect(_cameraState.autoRotate).toBe(false);
    expect(_cameraState.autoRotateSuspended).toBe(false);
    expect(_cameraState.autoRotateResumeDueAt).toBe(0);
    expect(_cameraState.autoRotateSoftResumeStartedAt).toBe(0);
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
