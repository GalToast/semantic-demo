import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 */

// ── Mock appState (plain JS object — NO Svelte 5 $state runes) ─────────────────

const mockState = vi.hoisted(() => ({
  filterVersion: 0,
  filterColorVersion: 0,
  activeClusterFilter: null as number | null,
  activeFilters: {
    status: 'all',
    city: '',
    website: false,
    email: false,
    geocoded: false,
  },
}));

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    get filterVersion() { return mockState.filterVersion; },
    set filterVersion(v: number) { mockState.filterVersion = v; },
    get filterColorVersion() { return mockState.filterColorVersion; },
    set filterColorVersion(v: number) { mockState.filterColorVersion = v; },
    get activeClusterFilter() { return mockState.activeClusterFilter; },
    set activeClusterFilter(v: number | null) { mockState.activeClusterFilter = v; },
    get activeFilters() { return mockState.activeFilters; },
    set activeFilters(v: any) { mockState.activeFilters = v; },
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  filterState,
  activeClusterFilter,
  hasActiveFilters,
  activeFilterCount,
  statusFilter,
  cityFilter,
  contactFilters,
  toggleFilter,
  overwriteActiveFilters,
  setFilter,
  resetFilters,
  getFilterState,
  pointMatchesActiveFilters,
  setClusterFilter,
} from '@lib/stores/filter.svelte.ts';

import type { ActiveFilters } from '@lib/stores/filter.svelte.ts';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('filter store — T4 writable + withFilterStateNotify migration', () => {
  beforeEach(() => {
    resetFilters();
    mockState.filterVersion = 0;
    mockState.filterColorVersion = 0;
  });

  it('filterState.set() updates writable AND appState.activeFilters', () => {
    const next: ActiveFilters = { status: 'active', city: 'Conroe', website: true, email: false, geocoded: false };
    filterState.set(next);
    expect(get(filterState)).toEqual(next);
    expect(mockState.activeFilters).toEqual(next);
  });

  it('filterState.update() transforms state and syncs appState', () => {
    filterState.update((f) => ({ ...f, city: 'Willis' }));
    const s = get(filterState);
    expect(s.city).toBe('Willis');
    expect(mockState.activeFilters.city).toBe('Willis');
  });

  it('subscriber fires on filterState.set()', () => {
    const cb = vi.fn();
    const unsub = filterState.subscribe(cb);
    filterState.set({ status: 'active', city: '', website: false, email: false, geocoded: false });
    unsub();
    expect(cb.mock.calls[cb.mock.calls.length - 1][0].status).toBe('active');
  });

  it('toggleFilter(status, value) activates status', () => {
    toggleFilter('status', 'active');
    expect(get(filterState).status).toBe('active');
  });

  it('toggleFilter(status, same value) toggles back to all', () => {
    toggleFilter('status', 'active');
    toggleFilter('status', 'active');
    expect(get(filterState).status).toBe('all');
  });

  it('toggleFilter(website, true) sets boolean flag', () => {
    toggleFilter('website', true);
    expect(get(filterState).website).toBe(true);
  });

  it('overwriteActiveFilters replaces all fields', () => {
    overwriteActiveFilters({ status: 'pending', city: 'The Woodlands', website: true, email: true, geocoded: true });
    const s = get(filterState);
    expect(s.status).toBe('pending');
    expect(s.city).toBe('The Woodlands');
    expect(s.website).toBe(true);
    expect(s.email).toBe(true);
    expect(s.geocoded).toBe(true);
  });

  it('resetFilters restores defaults and clears cluster', () => {
    filterState.set({ status: 'active', city: 'Conroe', website: true, email: true, geocoded: true });
    setClusterFilter('42');
    resetFilters();
    expect(get(filterState)).toEqual({ status: 'all', city: '', website: false, email: false, geocoded: false });
    expect(get(activeClusterFilter)).toBeNull();
  });

  it('hasActiveFilters is false when all filters are default', () => {
    resetFilters();
    expect(get(hasActiveFilters)).toBe(false);
  });

  it('hasActiveFilters is true when any filter is non-default', () => {
    toggleFilter('status', 'active');
    expect(get(hasActiveFilters)).toBe(true);
  });

  it('activeFilterCount reflects number of active filters', () => {
    resetFilters();
    expect(get(activeFilterCount)).toBe(0);
    toggleFilter('status', 'active');
    toggleFilter('website', true);
    expect(get(activeFilterCount)).toBe(2);
  });

  it('statusFilter derived reads status', () => {
    toggleFilter('status', 'pending');
    expect(get(statusFilter)).toBe('pending');
  });

  it('cityFilter derived reads city', () => {
    toggleFilter('city', 'Conroe');
    expect(get(cityFilter)).toBe('Conroe');
  });

  it('contactFilters derived exposes flags', () => {
    toggleFilter('website', true);
    toggleFilter('email', true);
    const cf = get(contactFilters);
    expect(cf.website).toBe(true);
    expect(cf.email).toBe(true);
    expect(cf.geocoded).toBe(false);
  });

  it('getFilterState returns current writable snapshot', () => {
    toggleFilter('status', 'active');
    expect(getFilterState().status).toBe('active');
  });

  it('pointMatchesActiveFilters respects status filter', () => {
    toggleFilter('status', 'active');
    expect(pointMatchesActiveFilters({ status: 'active' })).toBe(true);
    expect(pointMatchesActiveFilters({ status: 'pending' })).toBe(false);
  });

  it('pointMatchesActiveFilters respects city filter (normalized)', () => {
    toggleFilter('city', 'Conroe');
    expect(pointMatchesActiveFilters({ city: 'Conroe, TX' })).toBe(true);
    expect(pointMatchesActiveFilters({ city: 'Houston' })).toBe(false);
  });

  it('activeClusterFilter.set syncs to appState as number', () => {
    activeClusterFilter.set('3');
    expect(get(activeClusterFilter)).toBe('3');
    expect(mockState.activeClusterFilter).toBe(3);
  });

  it('activeClusterFilter.set(null) clears appState', () => {
    activeClusterFilter.set('5');
    activeClusterFilter.set(null);
    expect(get(activeClusterFilter)).toBeNull();
    expect(mockState.activeClusterFilter).toBeNull();
  });
});
