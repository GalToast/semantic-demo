// js/state/selectors/diagnostics.js
// Read-only selectors for performance metrics, thread diagnostics, route diagnostics.
import { state } from '../../state.js';

export const getScenePerformanceDiagnostics = () => state.scenePerformanceDiagnostics;
export const getFocusFrameDiagnostics = () => state.focusFrameDiagnostics;
export const getFocusThreadDiagnostics = () => state.focusThreadDiagnostics;
export const getInspectedStrandDiagnostics = () => state.inspectedStrandDiagnostics;
export const getRouteTraceDiagnostics = () => state.routeTraceDiagnostics;
export const getArrivalHandoffDiagnostics = () => state.arrivalHandoffDiagnostics;
export const getSemanticSearchCacheDiagnostics = () => state.semanticSearchCacheDiagnostics;
