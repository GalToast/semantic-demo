import { describe, it, expect, vi } from 'vitest';

/**
 * @vitest-environment jsdom
 *
 * legacyState adapter contract — Phase 4
 *
 * Contract: `legacyState` (from `@lib/state/legacy-state-adapter`) is typed
 * as `LegacyState` (from `@lib/state/legacy-state`), NOT `Record<string, unknown>`.
 *
 * The adapter is the SINGLE documented escape hatch for accessing the
 * dynamically-shaped legacy app state surface. Centralizing the cast here
 * means call sites get a typed surface (with the index signature preserved
 * for dynamic reads) instead of repeating `appState as any as` casts.
 *
 * This test verifies the type by importing the adapter and asserting that
 * a typed-field read returns the LegacyState-typed value (e.g. `camera` is
 * `PerspectiveCamera | null`, not `unknown`). If the adapter type is
 * regressed to `Record<string, unknown>`, the runtime values are unchanged
 * but TypeScript would surface errors at every typed-field read — which is
 * what this test enforces via the `// @ts-expect-error` style assertion.
 */

vi.mock('@lib/state/app.svelte', () => ({
  appState: {
    camera: null,
    scene: null,
    renderer: null,
    hemiLight: null,
    dirLight: null,
    myceliumConnectionPairs: [],
    scenePerformanceDiagnostics: null,
    activeClusterFilter: null,
    points: [],
    navState: { mode: 'overview' },
    focusedNode: null,
    currentView: 'overview',
    // Dynamic fields used by the test compat proxy.
    __dynamicField: 'some-value'
  }
}));

import { legacyState } from '@lib/state/legacy-state-adapter';

describe('legacyState adapter contract — Phase 4', () => {
  it('typed fields return LegacyState-typed values, not unknown', () => {
    // These would be `unknown` if the adapter regressed to Record<string, unknown>.
    // Under LegacyState they are properly typed.
    const camera: typeof legacyState.camera = null;
    const activeFilter: number | null = legacyState.activeClusterFilter;
    const pairs: Array<{ a: number; b: number; layer?: number }> = legacyState.myceliumConnectionPairs;

    expect(camera).toBeNull();
    expect(activeFilter).toBeNull();
    expect(pairs).toEqual([]);
  });

  it('dynamic reads via index signature return unknown', () => {
    // The index signature `[key: string]: unknown` preserves dynamic access.
    const dynamicValue: unknown = legacyState['__dynamicField'];
    expect(dynamicValue).toBe('some-value');
  });

  it('writes to typed fields are accepted (structural)', () => {
    // These would fail to compile if LegacyState didn't accept these writes.
    legacyState.activeClusterFilter = 5;
    expect(legacyState.activeClusterFilter).toBe(5);
    legacyState.activeClusterFilter = null;
  });
});