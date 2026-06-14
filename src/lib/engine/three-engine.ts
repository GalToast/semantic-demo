/**
 * @lib/engine/three-engine.ts — Three.js engine orchestration
 *
 * Port of js/modules/three-engine.ts.
 *
 * Preserves the exact public API of the legacy module:
 *   initThreeJS, deinit, animate, onWindowResize, cancelAnimate,
 *   getSceneRenderableDiagnostics, updateCameraViewportOffset,
 *   plus re-exported helpers from legacy modules.
 *
 * Legacy module dependencies are lazy-loaded at module init time via
 * _ensureModules(). Exported functions are synchronous with defensive guards.
 */

// ── Static @lib/* imports ────────────────────────────────────────────────────

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

if (typeof window !== 'undefined') {
  (window as any).THREE = THREE;
}

import { webglContext, getLiveResourceCounts } from '@lib/engine/webgl-context';
import { CONFIG } from '@lib/engine/config';
import { disposeObject3D } from '@lib/engine/resource-tracker';
import {
  compilePointMaterialForReadiness as compilePointMaterialForReadinessPort,
  createPoints as createPointsPort,
  disposeNodeVisuals as disposeNodeVisualsPort,
  MYCELIUM_FIELD_SCALE as PORT_MYCELIUM_FIELD_SCALE,
  SCENE_ATMOSPHERE as PORT_SCENE_ATMOSPHERE,
  setNodeSporeInstanceMatrix as setNodeSporeInstanceMatrixPort,
} from '@lib/engine/node-manager';
import {
  createMycelium as createMyceliumPort,
  getMyceliumPresentationProfile as getMyceliumPresentationProfilePort,

  getThreadPulseOpacity as getThreadPulseOpacityPort,
  shouldRenderBridgeThreads as shouldRenderBridgeThreadsPort,
  shouldRenderThreads as shouldRenderThreadsPort,
} from '@lib/engine/thread-manager';
import {
  initPostProcessing as _initPostProcessing,
  renderPostProcessing as _renderPostProcessing,
  disposePostProcessing as _disposePostProcessing,
  resizePostProcessing as _resizePostProcessing,
} from '@lib/engine/three-postprocessing';
import { easeInOutCubic, easeOutQuint } from '@lib/utils/math-easing';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

// ── Static ../../../js/* imports (COLD — init-only, consumed by ensureModules) ──
import * as viewControllerMod from '../../../js/modules/view-controller';
import * as mapStateMod from '../../../js/modules/map-state';
import * as uiFeedbackMod from '../../../js/modules/ui-feedback';
import * as mapFlatteningMod from '../../../js/modules/map-flattening-layout';
import * as webglRestoreMod from '@lib/utils/webgl-restore-adapter';
import * as focusAnchorMod from '../../../js/modules/focus-anchor-indicator';
import * as audioScapeMod from '../../../js/modules/audio-scape';
import * as eventBindingsMod from '../../../js/modules/event-bindings';
import * as loadingUiMod from '../../../js/modules/loading-ui';

// ── Static ../../../js/* imports (HOT — render-loop, consumed by ensureModules) ──
import * as stateMod from '../../../js/state';
import * as clusterLabelsMod from '../../../js/modules/cluster-labels';
import * as focusPocketMod from '../../../js/modules/focus-pocket';
import * as sceneRevealMod from '../../../js/modules/scene-reveal';
import * as cameraControlsMod from '../../../js/modules/camera-controls';
import * as myceliumEngineMod from '../../../js/modules/mycelium-engine';
import * as inspectedStrandMod from '../../../js/modules/inspected-strand-overlay-adapter';
import * as routeArrivalMod from '../../../js/modules/route-arrival-overlay-adapter';
import * as threeSearchAnimationsMod from '../../../js/modules/three-search-animations';
import * as threeInteractionVisualsMod from '../../../js/modules/three-interaction-visuals';

// ── Legacy Module Type Contracts ──────────────────────────────────────────────

interface LegacyState {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: any;
  pointsMesh: any;
  pointsMaterial: any;
  nodeSporeMesh: any;
  nodeSporeHitMesh: any;
  nodeSporeMaterial: any;
  myceliumGroup: any;
  myceliumCoreLines: any;
  myceliumWispyLines: any;
  myceliumBridgeLines: any;
  myceliumConnectionPairs: any;
  hemiLight: any;
  dirLight: any;
  autoRotate: boolean;
  autoRotateSuspended: boolean;
  currentView: string;
  forceAnimate: boolean;
  focusedNode: number | null;
  trailDepth: number;
  nodePositions: any[];
  targetPositions: any[];
  nodesAreSettling: boolean;
  focusPocketMotionByIndex: any[];
  hoverHighlightIndex: number;
  pulsePhase: number;
  weather: { wind_speed_10m?: number };
  myceliumDirty: boolean;
  selectedPoint: any;
  sceneRevealActive: boolean;
  sceneRevealCameraStart: THREE.Vector3 | null;
  sceneRevealCameraEnd: THREE.Vector3 | null;
  inspectedStrandGroup: any;
  scenePerformanceDiagnostics: any;
  navState: any;
  points: any[];
  [key: string]: unknown;
}

interface WithStateMutationFn {
  (fn: () => void): void;
}

interface ViewControllerModule {
  switchView(view: string, options?: any): void;
}

interface ClusterLabelsModule {
  updateClusterLabels(): void;
}

interface FocusPocketModule {
  applyFocusPocketBreathing(now: number, positions: any[]): boolean;
}

interface SceneRevealModule {
  getSceneRevealProgress(now: number): number;
  setSceneRevealDataset(active: boolean): void;
}

interface CameraControlsModule {
  releaseFocusCameraAssist(reason?: string): void;
  focusCameraAssistIsActive(now?: number): void;
  noteSceneInteraction(delay: number): void;
  scheduleAutoRotateResume(delay: number): void;
  updateAutoRotateSoftResume(now?: number): void;
  applySemanticCentroidCamera(now?: number): void;
  cancelFocusCameraAnimation(): void;
}

interface MapStateModule {
  initMap(): void;
}

interface MyceliumEngineModule {
  updateMyceliumThreads(): void;
}

interface UiFeedbackModule {
  showExperienceToast(title: string, message: string): void;
}

interface MapFlatteningModule {
  applyMapFlatteningLayout(): void;
}

interface WebGLRestoreModule {
  restoreWebGLContext(): Promise<void>;
}

interface InspectedStrandModule {
  updateInspectedStrandOverlayFrame(now: number): void;
}

interface FocusAnchorModule {
  disposeFocusAnchorIndicator(): void;
}

interface RouteArrivalModule {
  updateArrivalHandoffOverlayFrame(now: number): void;
  updateRouteTraceOverlayFrame(now: number): void;
}

interface ThreeSearchAnimationsModule {
  triggerSearchHeroMoment(): void;
  triggerCorridorNodeGlow(now: number): void;
  updateCorridorNodeGlow(now: number): void;
  triggerSearchCorridorAnimation(now: number): void;
  updateSearchCorridorAnimation(now: number): void;
  disposeSearchCorridorAnimation(): void;
  disposeHeroAnimation(): void;
}

interface AudioScapeModule {
  disposeAudio(): void;
}

interface EventBindingsModule {
  disposeEventListeners(): void;
}

interface LoadingUiModule {
  cancelLoadingHide(): void;
}

interface ThreeInteractionVisualsModule {
  updateInteractionVisuals(now: number, hoveredNode: number, focusedNode: number | null): void;
  disposeInteractionVisuals(): void;
  initSemanticLens(): void;
  initSemanticManifold(): void;
}

// ── Lazy Module Cache ────────────────────────────────────────────────────────

let _state: LegacyState | null = null;
let _withStateMutation: WithStateMutationFn | null = null;
let _viewController: ViewControllerModule | null = null;
let _clusterLabels: ClusterLabelsModule | null = null;
let _focusPocket: FocusPocketModule | null = null;
let _sceneReveal: SceneRevealModule | null = null;
let _cameraControls: CameraControlsModule | null = null;
let _mapState: MapStateModule | null = null;
let _myceliumEngine: MyceliumEngineModule | null = null;
let _uiFeedback: UiFeedbackModule | null = null;
let _mapFlattening: MapFlatteningModule | null = null;
let _webglRestore: WebGLRestoreModule | null = null;
let _inspectedStrand: InspectedStrandModule | null = null;
let _focusAnchor: FocusAnchorModule | null = null;
let _routeArrival: RouteArrivalModule | null = null;
let _threeSearchAnimations: ThreeSearchAnimationsModule | null = null;
let _audioScape: AudioScapeModule | null = null;
let _eventBindings: EventBindingsModule | null = null;
let _loadingUi: LoadingUiModule | null = null;
let _threeInteractionVisuals: ThreeInteractionVisualsModule | null = null;

let _loaded = false;

function _ensureModules(): void {
  if (_loaded) return;
  try {
    _state = stateMod.state as unknown as LegacyState;
    _withStateMutation = stateMod.withStateMutation as unknown as WithStateMutationFn;
    _viewController = viewControllerMod as unknown as ViewControllerModule;
    _clusterLabels = clusterLabelsMod as unknown as ClusterLabelsModule;
    _focusPocket = focusPocketMod as unknown as FocusPocketModule;
    _sceneReveal = sceneRevealMod as unknown as SceneRevealModule;
    _cameraControls = cameraControlsMod as unknown as CameraControlsModule;
    _mapState = mapStateMod as unknown as MapStateModule;
    _myceliumEngine = myceliumEngineMod as unknown as MyceliumEngineModule;
    _uiFeedback = uiFeedbackMod as unknown as UiFeedbackModule;
    _mapFlattening = mapFlatteningMod as unknown as MapFlatteningModule;
    _webglRestore = webglRestoreMod as unknown as WebGLRestoreModule;
    _inspectedStrand = inspectedStrandMod as unknown as InspectedStrandModule;
    _focusAnchor = focusAnchorMod as unknown as FocusAnchorModule;
    _routeArrival = routeArrivalMod as unknown as RouteArrivalModule;
    _threeSearchAnimations = threeSearchAnimationsMod as unknown as ThreeSearchAnimationsModule;
    _audioScape = audioScapeMod as unknown as AudioScapeModule;
    _eventBindings = eventBindingsMod as unknown as EventBindingsModule;
    _loadingUi = loadingUiMod as unknown as LoadingUiModule;
    _threeInteractionVisuals = threeInteractionVisualsMod as unknown as ThreeInteractionVisualsModule;
    _loaded = true;
  } catch (err) {
    console.error('[three-engine] Failed to load legacy modules:', err);
  }
}

void _ensureModules();

// ── Re-exported legacy helpers (delegation wrappers) ─────────────────────────

export function updateMyceliumThreads(): void {
  _myceliumEngine?.updateMyceliumThreads();
}

export function applyMapFlatteningLayout(): void {
  _mapFlattening?.applyMapFlatteningLayout();
}

export function triggerSearchHeroMoment(): void {
  _threeSearchAnimations?.triggerSearchHeroMoment();
}

export function triggerCorridorNodeGlow(now: number): void {
  _threeSearchAnimations?.triggerCorridorNodeGlow(now);
}

export function updateCorridorNodeGlow(now: number): void {
  _threeSearchAnimations?.updateCorridorNodeGlow(now);
}

export function triggerSearchCorridorAnimation(now: number): void {
  _threeSearchAnimations?.triggerSearchCorridorAnimation(now);
}

export function updateSearchCorridorAnimation(now: number): void {
  _threeSearchAnimations?.updateSearchCorridorAnimation(now);
}

export function disposeSearchCorridorAnimation(): void {
  _threeSearchAnimations?.disposeSearchCorridorAnimation();
}

export function updateInteractionVisuals(now: number, hoveredNode: number, focusedNode: number | null): void {
  _threeInteractionVisuals?.updateInteractionVisuals(now, hoveredNode, focusedNode);
}

export function disposeInteractionVisuals(): void {
  _threeInteractionVisuals?.disposeInteractionVisuals();
}

export function initSemanticLens(): void {
  _threeInteractionVisuals?.initSemanticLens();
}

export function initSemanticManifold(): void {
  _threeInteractionVisuals?.initSemanticManifold();
}

export function shouldRenderThreads(): boolean {
  return shouldRenderThreadsPort();
}

export function shouldRenderBridgeThreads(): boolean {
  return shouldRenderBridgeThreadsPort();
}

export function createPoints(): void {
  createPointsPort();
}

export function createMycelium(): void {
  createMyceliumPort();
}

export const SCENE_ATMOSPHERE: Record<string, any> = {};
export const MYCELIUM_FIELD_SCALE = { x: 3.2, y: 2.6, z: 3.7 };

Object.assign(SCENE_ATMOSPHERE, PORT_SCENE_ATMOSPHERE);
Object.assign(MYCELIUM_FIELD_SCALE, PORT_MYCELIUM_FIELD_SCALE);

// ── Module-level Mutable State ───────────────────────────────────────────────

let _rafId: number | null = null;
let _webglContextLost = false;
let _circuitBreakerTripped = false;
let _webglRestoreTimer: number | null = null;
let _lastHoveredNode: number | null = null;
let _hoverEmissiveFlash = 0;

const SCENE_PERF_EMA_DECAY = 0.992;

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectWebGLSupport() {
  if (typeof document === 'undefined') return { supported: false, reason: 'document-unavailable' };
  const canvas = document.createElement('canvas');
  const contextAttributes = { alpha: true, antialias: true };
  try {
    const context = (canvas.getContext('webgl2', contextAttributes)
      || canvas.getContext('webgl', contextAttributes)
      || canvas.getContext('experimental-webgl', contextAttributes)) as WebGLRenderingContext | null;
    if (!context) return { supported: false, reason: 'context-unavailable' };
    const debugInfo = context.getExtension?.('WEBGL_debug_renderer_info');
    return {
      supported: true,
      reason: 'available',
      renderer: debugInfo ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
      vendor: debugInfo ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
    };
  } catch (error) {
    return { supported: false, reason: (error as Error)?.message || 'context-probe-threw' };
  }
}

function showWebGLFallback(container: HTMLElement, detail: { supported?: boolean; reason?: string } = {}) {
  if (!container) return;
  document.body.dataset.graphicsMode = 'fallback';
  _withStateMutation?.(() => {
    if (!_state) return;
    _state.scenePerformanceDiagnostics.active = false;
    _state.scenePerformanceDiagnostics.reason = detail.reason || 'webgl-unavailable';
  });
  if (_state) {
    _state.scene = null;
    _state.camera = null;
    _state.renderer = null;
    _state.controls = null;
  }

  container.querySelectorAll('canvas').forEach((c) => c.remove());
  const existingNotice = container.querySelector('.webgl-fallback-notice');
  if (existingNotice) existingNotice.remove();

  const notice = document.createElement('section');
  notice.className = 'webgl-fallback-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  const kicker = document.createElement('div');
  kicker.className = 'webgl-fallback-kicker';
  kicker.textContent = 'Graphics fallback';
  const heading = document.createElement('h2');
  heading.textContent = '3D view is unavailable on this device.';
  const body = document.createElement('p');
  body.textContent = 'The county records still load. Use the map view while graphics acceleration is blocked or unavailable.';
  const mapButton = document.createElement('button');
  mapButton.type = 'button';
  mapButton.className = 'webgl-fallback-map';
  mapButton.setAttribute('data-webgl-fallback-map', '');
  mapButton.textContent = 'Open map view';
  notice.append(kicker, heading, body, mapButton);
  container.appendChild(notice);

  mapButton.addEventListener('click', () => {
    if (_viewController?.switchView) {
      _viewController.switchView('map');
      return;
    }
    document.getElementById('map-container')?.classList.add('active');
    container.classList.add('hidden');
    _mapState?.initMap?.();
  });

  _uiFeedback?.showExperienceToast('Graphics fallback active', 'Map view remains available while 3D graphics are unavailable.');
}

function smoothDiagnosticValue(current: number, next: number, sampleCount: number): number {
  const divisor = Math.max(1, Math.min(sampleCount, 120));
  return (current * (divisor - 1) + next) / divisor;
}

// ── Exported Functions ───────────────────────────────────────────────────────

export function getSceneRenderableDiagnostics() {
  const perf = _state?.scenePerformanceDiagnostics;
  const resources = getLiveResourceCounts();
  return {
    active: perf?.active ?? false,
    fps: Math.round(1000 / Math.max(1, perf?.avgFrameMs || 0)),
    drawCalls: perf?.drawCalls ?? 0,
    triangles: perf?.triangles ?? 0,
    points: _state?.points?.length || 0,
    myceliumCoreSegments: perf?.myceliumCoreSegments ?? 0,
    myceliumWispySegments: perf?.myceliumWispySegments ?? 0,
    myceliumBridgeSegments: perf?.myceliumBridgeSegments ?? 0,
    memory: resources,
  };
}

interface ScenePerformanceTimings {
  controlsMs?: number;
  nodeMotionMs?: number;
  threadUpdateMs?: number;
  glowMs?: number;
  lensMs?: number;
  updateMs?: number;
  renderMs?: number;
  overlayUpdateMs?: number;
}

function sampleScenePerformance(frameMs: number, timings: ScenePerformanceTimings = {}) {
  if (!_state) return;
  _withStateMutation?.(() => {
    if (!_state) return;
    const diagnostics = _state.scenePerformanceDiagnostics;
    diagnostics.active = !!(
      _state.renderer && _state.scene && _state.camera && _state.currentView === 'galaxy'
    );
    diagnostics.reason = diagnostics.active ? 'sampling' : 'inactive-view';
    diagnostics.sampleCount = Math.min(600, (diagnostics.sampleCount || 0) + 1);
    diagnostics.avgFrameMs = smoothDiagnosticValue(diagnostics.avgFrameMs || 0, frameMs, diagnostics.sampleCount);
    diagnostics.maxFrameMs = Math.max(frameMs, (diagnostics.maxFrameMs || 0) * SCENE_PERF_EMA_DECAY);
    diagnostics.avgControlsMs = smoothDiagnosticValue(diagnostics.avgControlsMs || 0, timings.controlsMs || 0, diagnostics.sampleCount);
    diagnostics.avgNodeMotionMs = smoothDiagnosticValue(diagnostics.avgNodeMotionMs || 0, timings.nodeMotionMs || 0, diagnostics.sampleCount);
    diagnostics.avgThreadUpdateMs = smoothDiagnosticValue(diagnostics.avgThreadUpdateMs || 0, timings.threadUpdateMs || 0, diagnostics.sampleCount);
    diagnostics.avgGlowMs = smoothDiagnosticValue(diagnostics.avgGlowMs || 0, timings.glowMs || 0, diagnostics.sampleCount);
    diagnostics.avgLensMs = smoothDiagnosticValue(diagnostics.avgLensMs || 0, timings.lensMs || 0, diagnostics.sampleCount);
    diagnostics.avgUpdateMs = smoothDiagnosticValue(diagnostics.avgUpdateMs || 0, timings.updateMs || 0, diagnostics.sampleCount);
    diagnostics.maxUpdateMs = Math.max(timings.updateMs || 0, (diagnostics.maxUpdateMs || 0) * SCENE_PERF_EMA_DECAY);
    diagnostics.avgRenderMs = smoothDiagnosticValue(diagnostics.avgRenderMs || 0, timings.renderMs || 0, diagnostics.sampleCount);
    diagnostics.maxRenderMs = Math.max(timings.renderMs || 0, (diagnostics.maxRenderMs || 0) * SCENE_PERF_EMA_DECAY);
    diagnostics.renderables = getSceneRenderableDiagnostics();
  });
}

export function updateCameraViewportOffset() {
  const camera = webglContext.camera || _state?.camera;
  if (!camera) return;
  const panel = document.querySelector('.info-panel');
  const width = window.innerWidth;
  const height = window.innerHeight;

  if (panel && panel.classList.contains('active') && width > 768) {
    const rect = panel.getBoundingClientRect();
    const offset = rect.right / 2;
    camera.setViewOffset(width, height, -offset, 0, width, height);
  } else {
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
}

export function initThreeJS() {
  cancelAnimate();

  const container = document.getElementById('canvas-container');
  if (!container) throw new Error('initThreeJS: #canvas-container element not found in DOM');

  const support = detectWebGLSupport();
  if (!support.supported) {
    showWebGLFallback(container, { reason: support.reason });
    return false;
  }

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(
    (SCENE_ATMOSPHERE as any).fogColor ?? 0x0d2024,
    (SCENE_ATMOSPHERE as any).fogDensity ?? 0.62,
  );
  webglContext.scene = scene;
  if (_state) _state.scene = scene;

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(2.05, 1.55, 2.75);
  camera.lookAt(0, 0, 0);
  webglContext.camera = camera;
  if (_state) _state.camera = camera;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    console.error('WebGL renderer creation failed; using semantic demo graphics fallback.', error);
    showWebGLFallback(container, { reason: (error as Error)?.message || 'renderer-create-failed' });
    return false;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  // Keep the canvas slightly translucent so the subtle radial gradient behind
  // #canvas-container can bleed through without changing scene fog/lighting.
  renderer.setClearColor(
    (SCENE_ATMOSPHERE as any).fogColor ?? 0x0d2024,
    (SCENE_ATMOSPHERE as any).clearAlpha ?? 0.96,
  );
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = (SCENE_ATMOSPHERE as any).toneExposure ?? 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.querySelectorAll('canvas').forEach((c) => {
    if (c !== renderer.domElement) c.remove();
  });
  renderer.domElement.setAttribute('aria-label', 'Semantic business visualization of Montgomery County businesses. Use arrow keys to navigate.');
  renderer.domElement.setAttribute('tabindex', '0');
  renderer.domElement.setAttribute('role', 'application');
  container.appendChild(renderer.domElement);
  webglContext.renderer = renderer;
  if (_state) _state.renderer = renderer;

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    _webglContextLost = true;
    cancelAnimate();
    _uiFeedback?.showExperienceToast('Graphics connection lost', 'Re-establishing 3D scene...');
  }, false);

  renderer.domElement.addEventListener('webglcontextrestored', () => {
    _webglContextLost = false;
    _webglRestoreTimer = window.setTimeout(() => {
      _webglRestore?.restoreWebGLContext().catch((err) => {
        console.error('Failed to restore WebGL context:', err);
      });
    }, 1000);
  }, false);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.minDistance = CONFIG.ORBIT_MIN_DISTANCE_DEFAULT;
  controls.maxDistance = CONFIG.ORBIT_MAX_DISTANCE_DEFAULT;
  controls.enablePan = true;
  controls.panSpeed = CONFIG.ORBIT_PAN_SPEED_DEFAULT;
  webglContext.controls = controls;
  if (_state) _state.controls = controls;

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    if (_state) _state.autoRotate = false;
    const rotateBtn = document.getElementById('btn-rotate');
    if (rotateBtn) rotateBtn.setAttribute('aria-pressed', 'false');
  }

  controls.autoRotate = !!(_state?.autoRotate && !_state?.autoRotateSuspended);
  controls.autoRotateSpeed = CONFIG.AUTO_ROTATE_BASE_SPEED;
  controls.addEventListener('start', () => {
    _cameraControls?.releaseFocusCameraAssist('user-control');
    _cameraControls?.noteSceneInteraction(CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS);
  });
  controls.addEventListener('end', () => {
    _cameraControls?.scheduleAutoRotateResume(CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS);
  });

  const hemiLight = new THREE.HemisphereLight(0xe8f4ff, 0x080820, 0);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);
  webglContext.hemiLight = hemiLight;
  if (_state) _state.hemiLight = hemiLight;

  const dirLight = new THREE.DirectionalLight(0xffffff, 0);
  dirLight.position.set(5, 5, 5);
  scene.add(dirLight);
  webglContext.dirLight = dirLight;
  if (_state) _state.dirLight = dirLight;

  _withStateMutation?.(() => {
    if (!_state) return;
    _state.scenePerformanceDiagnostics.active = true;
    _state.scenePerformanceDiagnostics.renderer = support.renderer;
    _state.scenePerformanceDiagnostics.vendor = support.vendor;
  });

  const glowGeo = new THREE.SphereGeometry(3.15, 32, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x0d2024,
    transparent: true,
    opacity: 0.026,
    side: THREE.BackSide,
  });
  const glowSphere = new THREE.Mesh(glowGeo, glowMat);
  glowSphere.scale.set(1.16, 0.9, 1.34);
  glowSphere.name = 'semantic-depth-atmosphere';
  scene.add(glowSphere);

  const refGeo = new THREE.SphereGeometry(2.35, 48, 24);
  const refMat = new THREE.MeshBasicMaterial({
    color: 0x4ecdc4,
    wireframe: true,
    transparent: true,
    opacity: 0.0045,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const refSphere = new THREE.Mesh(refGeo, refMat);
  refSphere.scale.set(1.12, 0.86, 1.28);
  refSphere.name = 'county-depth-reference';
  scene.add(refSphere);

  createPoints();
  if (_state) {
    _state.pointsMesh = webglContext.pointsMesh;
    _state.pointsMaterial = webglContext.pointsMaterial;
    _state.nodeSporeMesh = webglContext.nodeSporeMesh;
    _state.nodeSporeHitMesh = webglContext.nodeSporeHitMesh;
    _state.nodeSporeMaterial = webglContext.nodeSporeMaterial;
  }
  createMycelium();
  if (_state) {
    _state.myceliumGroup = webglContext.myceliumGroup;
    _state.myceliumCoreLines = webglContext.myceliumCoreLines;
    _state.myceliumWispyLines = webglContext.myceliumWispyLines;
    _state.myceliumBridgeLines = webglContext.myceliumBridgeLines;
    _state.myceliumConnectionPairs = webglContext.myceliumConnectionPairs;
  }
  compilePointMaterialForReadinessPort();
  initSemanticLens();
  initSemanticManifold();
  document.body.dataset.graphicsMode = 'webgl';
  updateCameraViewportOffset();

  // Postprocessing composer: wraps renderer/scene/camera in an EffectComposer
  // (vignette + chromatic aberration + bloom + DOF). Effects stay disabled
  // until premium mode is toggled on via the body data-attribute. The
  // composer's render path is invoked from the animate loop below; if
  // premium mode is off, the loop falls through to vanilla renderer.render().
  try {
    _initPostProcessing(renderer, scene, camera);
  } catch (ppErr) {
    debugWarn('[three-engine] postprocessing init failed, vanilla render will be used:', ppErr);
  }

  // Dev-only: expose engine handle for the Spector.js frame-capture bridge.
  // Lets SpectorInspector force a render call before captureContext() so
  // Spector's frame-finder always sees an in-flight draw. Tree-shaken from
  // production by the import.meta.env.DEV guard (Vite dead-code-eliminates
  // the false branch during the production build).
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as { __semanticEngine?: unknown }).__semanticEngine = {
      get renderer() {
        return webglContext.renderer;
      },
      get scene() {
        return webglContext.scene;
      },
      get camera() {
        return webglContext.camera;
      },
      get canvas() {
        return webglContext.renderer?.domElement ?? null;
      },
      renderOnce: () => {
        if (webglContext.renderer && webglContext.scene && webglContext.camera) {
          webglContext.renderer.render(webglContext.scene, webglContext.camera);
        }
      },
    };
  }

  return true;
}

export function onWindowResize() {
  const container = document.getElementById('canvas-container');
  const camera = webglContext.camera || _state?.camera;
  const renderer = webglContext.renderer || _state?.renderer;
  if (!container || !camera || !renderer) return;

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  _resizePostProcessing(width, height);
}

export function cancelAnimate() {
  if (_rafId !== null) {
    window.cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  if (_webglRestoreTimer) {
    window.clearTimeout(_webglRestoreTimer);
    _webglRestoreTimer = null;
  }
  const contextWasLost = _webglContextLost;
  _webglContextLost = false;
  const renderer = _state?.renderer;
  const scene = _state?.scene;
  const camera = _state?.camera;
  if (!contextWasLost && renderer && scene && camera) {
    try { renderer.render(scene, camera); } catch (_) { /* context already gone */ }
  }
  if (_state?.controls && typeof _state.controls.dispose === 'function') {
    _state.controls.dispose();
  }
  if (_state) {
    _state.scene = null;
    _state.camera = null;
    _state.controls = null;
  }
  disposeObject3D(scene as any);
  _focusAnchor?.disposeFocusAnchorIndicator();
  // Dispose postprocessing composer BEFORE renderer.dispose() so the
  // composer's GL framebuffer/texture resources release cleanly while the
  // underlying WebGL context is still valid.
  try {
    _disposePostProcessing();
  } catch (ppErr) {
    debugWarn('[three-engine] postprocessing dispose failed:', ppErr);
  }
  if (renderer) {
    renderer.dispose();
    const canvas = renderer.domElement;
    if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
  }
  if (_state) {
    _state.renderer = null;
    _state.pointsMesh = null;
    _state.pointsMaterial = null;
    _state.nodeSporeMesh = null;
    _state.nodeSporeHitMesh = null;
    _state.nodeSporeMaterial = null;
  }
  webglContext.scene = null;
  webglContext.camera = null;
  webglContext.renderer = null;
  webglContext.controls = null;
  webglContext.pointsMesh = null;
  webglContext.pointsMaterial = null;
  webglContext.nodeSporeMesh = null;
  webglContext.nodeSporeHitMesh = null;
  webglContext.nodeSporeMaterial = null;
  _lastHoveredNode = null;
  _hoverEmissiveFlash = 0;
}

export function deinit() {
  cancelAnimate();
  _cameraControls?.cancelFocusCameraAnimation();
  _loadingUi?.cancelLoadingHide();
  _threeSearchAnimations?.disposeHeroAnimation();
  if (_state) {
    _state.sceneRevealActive = false;
    _state.sceneRevealCameraStart = null;
    _state.sceneRevealCameraEnd = null;
    if (_state.inspectedStrandGroup) {
      _state.inspectedStrandGroup = null;
    }
  }
  disposeNodeVisualsPort();
  _threeInteractionVisuals?.disposeInteractionVisuals();
  _audioScape?.disposeAudio();
  _eventBindings?.disposeEventListeners();
}

export function animate() {
  if (_circuitBreakerTripped) {
    _rafId = null;
    return;
  }
  if (_webglContextLost) {
    _rafId = null;
    return;
  }
  if (!webglContext.renderer || !webglContext.scene || !webglContext.camera) {
    _rafId = null;
    return;
  }
  if (_state?.currentView !== 'galaxy' && !_state?.forceAnimate) {
    _rafId = null;
    return;
  }

  _rafId = requestAnimationFrame(animate);
  try {

  const frameStart = performance.now();
  const frameNow = frameStart;
  const sceneFrameMs = _state?.scenePerformanceDiagnostics?.lastFrameAt
    ? Math.min(250, Math.max(0, frameNow - _state.scenePerformanceDiagnostics.lastFrameAt))
    : 0;
  _withStateMutation?.(() => {
    if (_state) _state.scenePerformanceDiagnostics.lastFrameAt = frameNow;
  });

  _cameraControls?.updateAutoRotateSoftResume(frameNow);
  _cameraControls?.focusCameraAssistIsActive(frameNow);
  if (webglContext.controls) {
    webglContext.controls.update();
  }

  const updateStart = performance.now();
  const revealProgress = _sceneReveal?.getSceneRevealProgress(frameNow) ?? 0;
  const pointsRevealProgress = easeOutQuint(Math.min(1, Math.max(0, revealProgress / 0.7)));
  const cameraRevealProgress = easeInOutCubic(Math.min(1, Math.max(0, revealProgress)));

  let anyNodeMoved = false;
  if (_state?.nodePositions && _state?.targetPositions) {
    const lerpFactor = _state.nodesAreSettling ? 0.14 : 0.08;
    _state.nodePositions.forEach((pos: any, i: number) => {
      const target = _state!.targetPositions[i];
      if (!target) return;
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dz = target.z - pos.z;
      if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001 || Math.abs(dz) > 0.0001) {
        pos.x += dx * lerpFactor;
        pos.y += dy * lerpFactor;
        pos.z += dz * lerpFactor;
        setNodeSporeInstanceMatrixPort(i);
        anyNodeMoved = true;
      }
    });

    if (_focusPocket?.applyFocusPocketBreathing(frameNow, _state.nodePositions)) {
      _state.focusPocketMotionByIndex.forEach((_: any, idx: number) => {
        setNodeSporeInstanceMatrixPort(idx);
        if (webglContext.nodeSporeHitMesh && _state!.navState.focusPocketIndices?.includes(idx)) {
          setNodeSporeInstanceMatrixPort(idx, webglContext.nodeSporeHitMesh);
        }
      });
      anyNodeMoved = true;
    }

    if (anyNodeMoved) {
      if (webglContext.nodeSporeMesh) webglContext.nodeSporeMesh.instanceMatrix.needsUpdate = true;
      if (webglContext.nodeSporeHitMesh) webglContext.nodeSporeHitMesh.instanceMatrix.needsUpdate = true;
      if (_state) _state.myceliumDirty = true;
    }
  }

  if (_state?.sceneRevealActive && _state?.sceneRevealCameraStart && _state?.sceneRevealCameraEnd && _state?.focusedNode === null) {
    webglContext.camera.position.lerpVectors(_state.sceneRevealCameraStart, _state.sceneRevealCameraEnd, cameraRevealProgress);
    if (webglContext.controls) {
      webglContext.controls.target.set(0, 0, 0);
    }
    if (revealProgress >= 1) {
      _withStateMutation?.(() => {
        if (!_state) return;
        _state.sceneRevealActive = false;
        _state.sceneRevealCameraStart = null;
        _state.sceneRevealCameraEnd = null;
      });
      _sceneReveal?.setSceneRevealDataset(false);
      _cameraControls?.scheduleAutoRotateResume(1200);
    }
  }

  if (webglContext.pointsMaterial) {
    const isFocused = Number.isFinite(_state?.focusedNode);
    const isSemanticDive = (_state?.trailDepth ?? 0) >= 2;
    const pointsOpacityScale = isFocused ? (isSemanticDive ? 0.16 : 0.46) : 1.0;
    const pointsSizeScale = isFocused ? (isSemanticDive ? 0.52 : 0.8) : 1.0;
    webglContext.pointsMaterial.opacity = 0.32 * (SCENE_ATMOSPHERE.pointOpacityScale ?? 1) * pointsRevealProgress * pointsOpacityScale;
    webglContext.pointsMaterial.size = CONFIG.POINTS_MATERIAL_BASE_SIZE * (1.06 + pointsRevealProgress * 0.46) * pointsSizeScale;
    if (webglContext.pointsMaterial.userData.shader) {
      webglContext.pointsMaterial.userData.shader.uniforms.uRevealProgress.value = pointsRevealProgress;
    }
  }

  if (webglContext.scene.fog && 'density' in webglContext.scene.fog) {
    (webglContext.scene.fog as THREE.FogExp2).density = (SCENE_ATMOSPHERE.fogDensity ?? 0.62) * pointsRevealProgress;
  }
  if (webglContext.nodeSporeMaterial) {
    const focusBoost = Number.isFinite(_state?.focusedNode) ? ((_state?.trailDepth ?? 0) >= 2 ? 0.72 : 1.0) : 1.0;
    const targetSporeOpacity = (SCENE_ATMOSPHERE.sporeOpacity ?? 0.5) * pointsRevealProgress * focusBoost;
    webglContext.nodeSporeMaterial.opacity += (targetSporeOpacity - webglContext.nodeSporeMaterial.opacity) * 0.12;
  }

  const hoveredNode = _state?.hoverHighlightIndex ?? -1;
  const focusedNode = _state?.focusedNode ?? null;

  // ── Hover emissive flash (spore material) ───────────────────────────────
  const hasHover = Number.isFinite(hoveredNode) && hoveredNode >= 0;
  const lastHadHover = _lastHoveredNode !== null && Number.isFinite(_lastHoveredNode) && _lastHoveredNode >= 0;
  if (hasHover !== lastHadHover || (hasHover && hoveredNode !== _lastHoveredNode)) {
    _hoverEmissiveFlash = 1.0;
  }
  _lastHoveredNode = hoveredNode;
  if (_hoverEmissiveFlash > 0.001 && webglContext.nodeSporeMaterial) {
    const baseIntensity = 0.34;
    const flashPeak = 1.8;
    const targetIntensity = baseIntensity + (flashPeak - baseIntensity) * _hoverEmissiveFlash;
    (webglContext.nodeSporeMaterial as THREE.MeshPhongMaterial).emissiveIntensity = targetIntensity;
    _hoverEmissiveFlash *= 0.92;
    if (_hoverEmissiveFlash < 0.005) {
      _hoverEmissiveFlash = 0;
      (webglContext.nodeSporeMaterial as THREE.MeshPhongMaterial).emissiveIntensity = baseIntensity;
    }
  }

  const threadsVisible = shouldRenderThreads();
  if (webglContext.myceliumGroup) {
    webglContext.myceliumGroup.visible = threadsVisible;
  }
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const basePulseSpeed = prefersReduced ? 0.0 : 0.015;
  const windSpeed = _state?.weather?.wind_speed_10m ?? 8.0;
  const pulseIncrement = basePulseSpeed * (0.6 + (windSpeed / 15.0));
  if (_state) _state.pulsePhase = (_state.pulsePhase + pulseIncrement) % (Math.PI * 2);

  const threadRevealProgress = easeOutQuint(Math.min(1.0, Math.max(0.0, (pointsRevealProgress - 0.25) / 0.5)));
  const graphProfile = getMyceliumPresentationProfilePort();
  if (threadsVisible) {
    if (webglContext.myceliumCoreLines) (webglContext.myceliumCoreLines.material as THREE.Material).opacity = getThreadPulseOpacityPort((graphProfile as any).core, Math.sin(_state?.pulsePhase ?? 0), (graphProfile as any).pulse, threadRevealProgress) ?? 0;
    if (webglContext.myceliumWispyLines) (webglContext.myceliumWispyLines.material as THREE.Material).opacity = getThreadPulseOpacityPort((graphProfile as any).wispy, Math.sin((_state?.pulsePhase ?? 0) * 0.7), (graphProfile as any).pulse * 0.36, threadRevealProgress) ?? 0;
    if (webglContext.myceliumBridgeLines) (webglContext.myceliumBridgeLines.material as THREE.Material).opacity = getThreadPulseOpacityPort((graphProfile as any).bridge, Math.sin((_state?.pulsePhase ?? 0) * 0.45), (graphProfile as any).pulse * 0.28, threadRevealProgress) ?? 0;
  } else {
    if (webglContext.myceliumCoreLines) (webglContext.myceliumCoreLines.material as THREE.Material).opacity = 0;
    if (webglContext.myceliumWispyLines) (webglContext.myceliumWispyLines.material as THREE.Material).opacity = 0;
    if (webglContext.myceliumBridgeLines) (webglContext.myceliumBridgeLines.material as THREE.Material).opacity = 0;
  }

  if (webglContext.pointsMaterial?.userData?.shader) {
    const shader = webglContext.pointsMaterial.userData.shader;
    const hasHover = Number.isFinite(hoveredNode) && hoveredNode >= 0;
    const targetBoost = hasHover ? 1.5 : 1.0;
    shader.uniforms.uHoverBoost.value += (targetBoost - shader.uniforms.uHoverBoost.value) * 0.2;
    if (hasHover && _state?.nodePositions[hoveredNode]) {
      const hoverPos = _state.nodePositions[hoveredNode];
      shader.uniforms.uHoverNodePos.value.set(hoverPos.x, hoverPos.y, hoverPos.z);
    }
  }

  updateInteractionVisuals(frameNow, hoveredNode, focusedNode);
  updateCorridorNodeGlow(frameNow);
  updateSearchCorridorAnimation(frameNow);

  try {
    _inspectedStrand?.updateInspectedStrandOverlayFrame(frameNow);
    _routeArrival?.updateRouteTraceOverlayFrame(frameNow);
    _routeArrival?.updateArrivalHandoffOverlayFrame(frameNow);
  } catch (overlayErr) {
    debugWarn('overlay update threw:', overlayErr);
  }

  _focusPocket?.applyFocusPocketBreathing(frameNow, _state?.nodePositions);

  if (shouldRenderThreads()) {
    updateMyceliumThreads();
  }
  _cameraControls?.applySemanticCentroidCamera(frameNow);
  _clusterLabels?.updateClusterLabels();

  const updateEnd = performance.now();
  const renderStart = performance.now();

  if (webglContext.renderer && webglContext.scene && webglContext.camera) {
    // Premium mode: render through EffectComposer. When premium mode is off
    // (or composer is not yet initialized), renderPostProcessing() returns
    // false and we fall through to the vanilla renderer.render() path.
    const renderedViaComposer = _renderPostProcessing();
    if (!renderedViaComposer) {
      webglContext.renderer.render(webglContext.scene, webglContext.camera);
    }

    _withStateMutation?.(() => {
      if (!_state) return;
      _state.scenePerformanceDiagnostics.drawCalls = webglContext.renderer!.info.render.calls;
      _state.scenePerformanceDiagnostics.triangles = webglContext.renderer!.info.render.triangles;
    });
  }

  const renderEnd = performance.now();

  sampleScenePerformance(sceneFrameMs, {
    updateMs: updateEnd - updateStart,
    renderMs: renderEnd - renderStart,
  });
  } catch (err) {
    console.error('[three-engine] Unhandled exception in animate loop:', err);
    _circuitBreakerTripped = true;
  }
}
