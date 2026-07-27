// Self-ID: probe-mst-mistral-7b (model=mistral/open-mistral-7b, route=pi:router-mistral), dispatched 2026-07-26.
import { describe, it, expect, vi } from 'vitest';

// @ts-ignore
import { getViewHandoffModel } from '@lib/orchestration/view-controller.ts';

vi.mock('@lib/stores/navigation.svelte.ts', () => {
  return {
    navStore: { get: vi.fn() },
    updateNavState: vi.fn(),
  };
});

vi.mock('@lib/engine/camera-controls', () => {
  return {
    animateCameraToTerrainPrelude: vi.fn(),
  };
});

vi.mock('@lib/utils/map-flattening-layout', () => {
  return {
    applyMapFlatteningLayout: vi.fn(),
  };
});

describe('getViewHandoffModel', () => {
  it('map returns icon === map', () => {
    expect(getViewHandoffModel('map').icon).toBe('map');
  });

  it('map returns kicker === Switching views', () => {
    expect(getViewHandoffModel('map').kicker).toBe('Switching views');
  });

  it('map returns title === Entering map view', () => {
    expect(getViewHandoffModel('map').title).toBe('Entering map view');
  });

  it('map returns note === Geographic terrain is loading.', () => {
    expect(getViewHandoffModel('map').note).toBe('Geographic terrain is loading.');
  });

  it('galaxy returns icon === mycelium', () => {
    expect(getViewHandoffModel('galaxy').icon).toBe('mycelium');
  });

  it('galaxy returns title === Returning to the Network', () => {
    expect(getViewHandoffModel('galaxy').title).toBe('Returning to the Network');
  });

  it('galaxy returns note === Network view is restoring.', () => {
    expect(getViewHandoffModel('galaxy').note).toBe('Network view is restoring.');
  });
});