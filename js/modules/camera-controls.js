// =============================================================================
// camera-controls.js (Facade)
// -----------------------------------------------------------------------------
// This module has been decomposed into:
//   - camera-controls-core.js         (Focus transition & assist, route state)
//   - camera-controls-restore.js      (Auto-rotate and overview restore)
//   - camera-controls-choreography.js (Animation primitives)
// =============================================================================

import * as core from './camera-controls-core.js';
import * as restore from './camera-controls-restore.js';
import * as choreography from './camera-controls-choreography.js';

export const OVERVIEW_CAMERA_POSE = restore.OVERVIEW_CAMERA_POSE;

export function animateCameraToNode(index, options = {}) {
    return choreography.animateCameraToNode(index, options);
}

export function focusOnNode(index, options = {}) {
    return choreography.focusOnNode(index, options);
}

export function animateCameraToSearchCorridor(anchorIndex, resultIndices = [], options = {}) {
    return choreography.animateCameraToSearchCorridor(anchorIndex, resultIndices, options);
}

export function animateCameraToTerrainPrelude(options = {}) {
    return choreography.animateCameraToTerrainPrelude(options);
}

export function applySemanticCentroidCamera(now = performance.now()) {
    return choreography.applySemanticCentroidCamera(now);
}

export function zoomCamera(multiplier) {
    return choreography.zoomCamera(multiplier);
}

export function clearInsideCentroid() {
    return choreography.clearInsideCentroid();
}

export function settleCameraToOverviewPose() {
    return restore.settleCameraToOverviewPose();
}

export function isCameraIdleOrbitAllowed() {
    return restore.isCameraIdleOrbitAllowed();
}

export function syncOrbitAutoRotate() {
    return restore.syncOrbitAutoRotate();
}

export function setAutoRotateSuspended(suspended) {
    return restore.setAutoRotateSuspended(suspended);
}

export function clearAutoRotateResumeTimer() {
    return restore.clearAutoRotateResumeTimer();
}

export function scheduleAutoRotateResume(delay) {
    return restore.scheduleAutoRotateResume(delay);
}

export function noteSceneInteraction(delay) {
    return restore.noteSceneInteraction(delay);
}

export function updateAutoRotateSoftResume(now = performance.now()) {
    return restore.updateAutoRotateSoftResume(now);
}

export function toggleAutoRotate() {
    return restore.toggleAutoRotate();
}

export function setFocusTransitionMode(mode, options = {}) {
    return core.setFocusTransitionMode(mode, options);
}

export function getFocusTransitionProgress(duration = 640) {
    return core.getFocusTransitionProgress(duration);
}

export function startFocusCameraAssist(duration = 900, reason = 'focus') {
    return core.startFocusCameraAssist(duration, reason);
}

export function releaseFocusCameraAssist(reason = 'manual') {
    return core.releaseFocusCameraAssist(reason);
}

export function focusCameraAssistIsActive(now = performance.now()) {
    return core.focusCameraAssistIsActive(now);
}

export function syncCameraAssistDataset() {
    return core.syncCameraAssistDataset();
}

export function setCameraAssistChoreography(phase = 'free', reason = 'view-handoff') {
    return core.setCameraAssistChoreography(phase, reason);
}

export function setRouteExplorationState(phase = 'idle', reason = '') {
    return core.setRouteExplorationState(phase, reason);
}

export function clearRouteExploration(reason = 'clear') {
    return core.clearRouteExploration(reason);
}

export function markRouteExploration(reason = 'user-control') {
    return core.markRouteExploration(reason);
}

export function shouldMarkRouteExploration(reason = '') {
    return core.shouldMarkRouteExploration(reason);
}

export function getRouteLayerOrigin() {
    return core.getRouteLayerOrigin();
}
