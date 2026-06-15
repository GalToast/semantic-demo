/**
 * @lib/engine/camera-controls-core-bridge.ts - Bridge adapter for legacy camera-controls-core.
 *
 * Keep direct legacy imports behind the engine boundary while Svelte-track
 * consumers migrate.
 */

export { setFocusTransitionMode, startFocusCameraAssist } from '../../../js/modules/camera-controls-core';
