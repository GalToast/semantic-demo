import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * @vitest-environment jsdom
 */

// ── Mutable mock navState ─────────────────────────────────────────────────────

const _navState = vi.hoisted(() => ({
  mode: 'overview' as string,
}));

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: { navState: _navState },
}));

vi.mock('@lib/stores/journey.svelte', () => ({
  journeyPhase: () => _navState.mode,
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  compassSteps,
  buildCompassStatus,
  JOURNEY_ACTIONS,
  type CompassStep,
  type CompassStatus,
  type CompassAction,
} from '@lib/stores/compass.svelte.ts';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('compass store — state-class appState regression', () => {
  beforeEach(() => {
    _navState.mode = 'overview';
  });

  it('compassSteps returns 5 steps with correct states', () => {
    _navState.mode = 'focus';
    const steps = compassSteps();
    expect(steps).toHaveLength(5);
    expect(steps[0]).toEqual({ phase: 'overview', state: 'done' });
    expect(steps[1]).toEqual({ phase: 'search', state: 'done' });
    expect(steps[2]).toEqual({ phase: 'focus', state: 'current' });
    expect(steps[3]).toEqual({ phase: 'inside', state: 'upcoming' });
    expect(steps[4]).toEqual({ phase: 'map', state: 'upcoming' });
  });

  it('compassSteps marks all done when mode is map', () => {
    _navState.mode = 'map';
    const steps = compassSteps();
    expect(steps[4].state).toBe('current');
    expect(steps.slice(0, 4).every(s => s.state === 'done')).toBe(true);
  });

  it('compassSteps marks all upcoming when mode is overview', () => {
    _navState.mode = 'overview';
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
      isSemanticDegraded: false
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
      nextPointName: null, idleNote: '', isDiscovery: false, isSemanticDegraded: false
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
      nextPointName: null, idleNote: '', isDiscovery: false, isSemanticDegraded: false
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
      nextPointName: 'XYZ Cafe', idleNote: '', isDiscovery: false, isSemanticDegraded: false
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
      nextPointName: null, idleNote: '', isDiscovery: false, isSemanticDegraded: false
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
