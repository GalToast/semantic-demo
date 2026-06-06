/**
 * src/lib/stores/test-compat.ts
 *
 * Test compatibility store - allows contract tests to inject state
 * for components that need to render specific states for testing.
 */

import { writable } from 'svelte/store';

export interface TestCompatState {
  panelSurface: string | null;
  focusedNode: number | null;
  activeView: string | null;
  graphContext: string | null;
  panelSurfaceMode: string | null;
  mapContext: string | null;
  routeExploration: string | null;
  journeyCompassPhase: string | null;
  navMode: string | null;
  focusedNodeId: string | null;
  navSurface: string | null;
  demoPhase: string | null;
  journeyPhase: string | null;
  reducedMotion: string | null;
  mode: string | null;
  compact: string | null;
  filtersActive: string | null;
  semanticTrailCue: string | null;
  loadingPhase: string | null;
  loadingOverlay: string | null;
  sceneReady: string | null;
  viewHandoffActive: string | null;
  cameraAssist: string | null;
  graphicsMode: string | null;
}

const initialTestState: TestCompatState = {
  panelSurface: null,
  focusedNode: null,
  activeView: null,
  graphContext: null,
  panelSurfaceMode: null,
  mapContext: null,
  routeExploration: null,
  journeyCompassPhase: null,
  navMode: null,
  focusedNodeId: null,
  navSurface: null,
  demoPhase: null,
  journeyPhase: null,
  reducedMotion: null,
  mode: null,
  compact: null,
  filtersActive: null,
  semanticTrailCue: null,
  loadingPhase: null,
  loadingOverlay: null,
  sceneReady: null,
  viewHandoffActive: null,
  cameraAssist: null,
  graphicsMode: null,
};

export const testCompatStore = writable<TestCompatState>({ ...initialTestState });

/** Update test state from body dataset (called by test setup) */
export function syncTestStateFromBody(): void {
  if (typeof document === 'undefined' || !document.body) return;
  
  const body = document.body;
  testCompatStore.update((state) => ({
    ...state,
    panelSurface: body.dataset.panelSurface || null,
    focusedNode: body.dataset.focusedNode ? Number(body.dataset.focusedNode) : null,
    activeView: body.dataset.activeView || body.dataset.viewMode || null,
    graphContext: body.dataset.graphContext || null,
    panelSurfaceMode: body.dataset.panelSurface || body.dataset.navSurface || null,
    mapContext: body.dataset.mapContext || null,
    routeExploration: body.dataset.routeExploration || null,
    journeyCompassPhase: body.dataset.journeyCompassPhase || null,
    navMode: body.dataset.navMode || null,
    focusedNodeId: body.dataset.focusedNode || null,
    navSurface: body.dataset.navSurface || null,
    demoPhase: body.dataset.demoPhase || null,
    journeyPhase: body.dataset.journeyPhase || null,
    reducedMotion: body.dataset.reducedMotion || null,
    mode: body.dataset.mode || null,
    compact: body.dataset.compact || null,
    filtersActive: body.dataset.filtersActive || null,
    semanticTrailCue: body.dataset.semanticTrailCue || null,
    loadingPhase: body.dataset.loadingPhase || null,
    loadingOverlay: body.dataset.loadingOverlay || null,
    sceneReady: body.dataset.sceneReady || null,
    viewHandoffActive: body.dataset.viewHandoffActive || null,
    cameraAssist: body.dataset.cameraAssist || null,
    graphicsMode: body.dataset.graphicsMode || null,
  }));
}

/** Sync body dataset from test store (for components that write to body) */
export function syncBodyFromTestState(): void {
  if (typeof document === 'undefined' || !document.body) return;
  
  let currentState: TestCompatState = initialTestState;
  const unsubscribe = testCompatStore.subscribe((s) => { currentState = s; });
  unsubscribe();
  
  const body = document.body;
  Object.entries(currentState).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      // Convert camelCase to kebab-case for data attributes
      const attr = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      body.dataset[attr] = String(value);
    }
  });
}

/** Reset test state to initial */
export function resetTestState(): void {
  testCompatStore.set({ ...initialTestState });
}