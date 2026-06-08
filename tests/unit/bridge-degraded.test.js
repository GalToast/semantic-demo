import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted ensures values exist BEFORE vi.mock factories are evaluated.
// Without this, the mock factories would reference undefined variables.
const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { writable } = require('svelte/store');
  return {
    ensureFn: vi.fn(),
    removeFn: vi.fn(),
    stores: {
      isDataReady: writable(true),
      businessRecords: writable([]),
      positionBuffer: writable(null),
      clustersBuffer: writable(null),
      leadEnrichment: writable(null),
      pointIndexByLeadId: writable(new Map()),
    },
  };
});

// ── Mock legacy engine modules ──────────────────────────────────────────────
// Paths are relative to the test file (tests/unit/) and resolve to the same
// module specifiers that bridge.ts uses via dynamic import.

vi.mock('../../js/modules/three-engine.js', () => ({
  initThreeJS: vi.fn(() => true),
  deinit: vi.fn(),
  onWindowResize: vi.fn(),
  updateCameraViewportOffset: vi.fn(),
  cancelAnimate: vi.fn(),
  animate: vi.fn(),
  getSceneRenderableDiagnostics: vi.fn(() => ({
    active: true, fps: 60, drawCalls: 10, triangles: 100,
    points: 1000, myceliumCoreSegments: 0, myceliumWispySegments: 0,
    myceliumBridgeSegments: 0, memory: {},
  })),
}));

vi.mock('../../js/modules/camera-controls.js', () => ({
  focusOnNode: vi.fn(),
  animateCameraToSearchCorridor: vi.fn(),
  settleCameraToOverviewPose: vi.fn(),
  zoomCamera: vi.fn(),
  setAutoRotateSuspended: vi.fn(),
  syncOrbitAutoRotate: vi.fn(),
}));

vi.mock('../../js/modules/three-node-manager.js', () => ({
  createPoints: vi.fn(),
  setNodeSporeInstanceMatrix: vi.fn(),
  compilePointMaterialForReadiness: vi.fn(),
  disposeNodeVisuals: vi.fn(),
}));

vi.mock('../../js/modules/three-thread-manager.js', () => ({
  createMycelium: vi.fn(),
  disposeMycelium: vi.fn(),
  shouldRenderThreads: vi.fn(() => false),
  shouldRenderBridgeThreads: vi.fn(() => false),
  getThreadPulseOpacity: vi.fn(() => 1),
  getThreadOpacityEnvelope: vi.fn(() => ({})),
  getMyceliumPresentationProfile: vi.fn(() => ({ core: 1, wispy: 1, bridge: 1, pulse: 1 })),
  getGroupLineSegmentCount: vi.fn(() => 0),
}));

vi.mock('../../js/modules/view-controller.js', () => ({
  switchView: vi.fn(),
}));

vi.mock('../../js/modules/filter-state.js', () => ({
  overwriteActiveFilters: vi.fn(),
  getActiveFilters: vi.fn(() => ({})),
  incrementFilterVersion: vi.fn(() => 1),
}));

vi.mock('../../js/state.js', () => ({
  state: {
    points: [{ x: 0, y: 0, z: 0, cluster: 0 }],
    nodePositions: [{ x: 0, y: 0, z: 0 }],
    rawPositionsBuffer: new Float32Array([0, 0, 0]),
    rawClustersBuffer: new Uint16Array([0]),
    camera: { aspect: 1, updateProjectionMatrix: vi.fn() },
    renderer: { setSize: vi.fn(), domElement: { style: {} } },
    controls: null,
    focusedNode: null,
    hoverHighlightIndex: -1,
    searchGlowIndices: new Set(),
    searchGlowTopIndex: null,
    searchGlowActive: false,
    inspectedThreadIndex: null,
    threadInspectorPointerInside: false,
    currentView: 'galaxy',
    activeFilters: null,
    filterVersion: 0,
    filterColorVersion: 0,
    myceliumDirty: false,
    myceliumCoreLines: null,
    myceliumWispyLines: null,
    myceliumBridgeLines: null,
    scenePerformanceDiagnostics: {
      active: true, avgFrameMs: 16, drawCalls: 10, triangles: 100,
      myceliumCoreSegments: 0, myceliumWispySegments: 0,
      myceliumBridgeSegments: 0, lastFrameAt: Date.now(),
    },
    trailDepth: 3,
    semanticDiveMode: false,
    currentSearchSummary: null,
    leadEnrichment: null,
    pointIndexByLeadId: null,
  },
}));

vi.mock('../../js/modules/event-bus.js', () => ({
  subscribe: vi.fn(() => vi.fn()),
  EVENTS: {
    CAMERA_NODE_FOCUSED: 'CAMERA_NODE_FOCUSED',
    TRANSITION_PHASE_CHANGED: 'TRANSITION_PHASE_CHANGED',
    VIEW_CHANGED: 'VIEW_CHANGED',
  },
}));

// journey-canvas-interaction: delegates to hoisted mock functions
vi.mock('@legacy/modules/journey-canvas-interaction.js', () => ({
  ensureCanvasNodeInteractionBindings: (...args) => mocks.ensureFn(...args),
  removeCanvasNodeInteractionBindings: (...args) => mocks.removeFn(...args),
}));

vi.mock('../../js/modules/journey-canvas-interaction.js', () => ({
  ensureCanvasNodeInteractionBindings: (...args) => mocks.ensureFn(...args),
  removeCanvasNodeInteractionBindings: (...args) => mocks.removeFn(...args),
}));

vi.mock('@lib/stores/search', () => ({
  setSearchGlow: vi.fn(),
  clearSearchGlow: vi.fn(),
}));

vi.mock('@lib/data-store', () => ({
  isDataReady: mocks.stores.isDataReady,
  businessRecords: mocks.stores.businessRecords,
  positionBuffer: mocks.stores.positionBuffer,
  clustersBuffer: mocks.stores.clustersBuffer,
  leadEnrichment: mocks.stores.leadEnrichment,
  pointIndexByLeadId: mocks.stores.pointIndexByLeadId,
}));

// ── Tests ─────────────────────────────────────────────────────────────────

describe('EngineBridge — degraded status on canvas interaction failure', () => {
  let canvas;

  beforeEach(() => {
    mocks.ensureFn.mockReset();
    mocks.removeFn.mockReset();
    mocks.stores.isDataReady.set(true);

    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
  });

  afterEach(() => {
    document.body.querySelectorAll('canvas').forEach((c) => c.remove());
  });

  it('should set status to "degraded" and fire fallback when ensureCanvasNodeInteractionBindings throws', async () => {
    mocks.ensureFn.mockImplementation(() => {
      throw new Error('DOM binding failed: canvas element not in DOM');
    });

    const { createEngineBridge } = await import('../../src/lib/engine/bridge.ts');

    const onGraphicsStateChange = vi.fn();
    const bridge = createEngineBridge({ onGraphicsStateChange });

    await bridge.init(canvas);

    // Should be degraded, not ready
    expect(bridge.status).toBe('degraded');
    expect(bridge.isReady()).toBe(false);

    // Fallback callback should have been triggered
    expect(onGraphicsStateChange).toHaveBeenCalledWith('fallback');

    // The binding function should have been called (and thrown)
    expect(mocks.ensureFn).toHaveBeenCalledTimes(1);

    bridge.destroy();
  });

  it('should set status to "ready" when ensureCanvasNodeInteractionBindings succeeds', async () => {
    mocks.ensureFn.mockImplementation(() => { /* no-op success */ });

    const { createEngineBridge } = await import('../../src/lib/engine/bridge.ts');

    const onGraphicsStateChange = vi.fn();
    const bridge = createEngineBridge({ onGraphicsStateChange });

    await bridge.init(canvas);

    // Should be ready
    expect(bridge.status).toBe('ready');
    expect(bridge.isReady()).toBe(true);

    // Fallback should NOT have been triggered
    expect(onGraphicsStateChange).not.toHaveBeenCalledWith('fallback');

    // Binding should have been called successfully
    expect(mocks.ensureFn).toHaveBeenCalledTimes(1);

    bridge.destroy();
  });

  it('should preserve status "degraded" — not promote to "ready" after interaction failure', async () => {
    mocks.ensureFn.mockImplementation(() => {
      throw new Error('Canvas not attached');
    });

    const { createEngineBridge } = await import('../../src/lib/engine/bridge.ts');

    const onGraphicsStateChange = vi.fn();
    const bridge = createEngineBridge({ onGraphicsStateChange });

    await bridge.init(canvas);

    // Verify status stays degraded even after a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(bridge.status).toBe('degraded');
    expect(bridge.isReady()).toBe(false);

    bridge.destroy();
  });
});
