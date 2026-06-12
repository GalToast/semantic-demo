/**
 * three-postprocessing.ts — EffectComposer wrapper for Semantic Explorer.
 *
 * Wraps the existing Three.js renderer with postprocessing library v6 effects:
 *   - BloomEffect (atmospheric glow on focus pocket / bright elements)
 *   - DepthOfFieldEffect (depth-of-field, gated behind premium mode toggle)
 *
 * All effects are opt-in via `data-premium-mode` on <body>. When premium mode
 * is OFF the render loop falls back to plain `renderer.render()` with zero
 * behavior change.
 *
 * Pattern: follows three-interaction-visuals.ts module style — module-scoped
 * state, public init/dispose/render functions, no class export.
 */

import * as THREE from 'three';
import {
    EffectComposer,
    RenderPass,
    EffectPass,
    BloomEffect,
    DepthOfFieldEffect,
} from 'postprocessing';
import { debugWarn } from './diagnostic-adapter.ts';

// ── Module-scoped state ──────────────────────────────────────────────────────

let _composer: EffectComposer | null = null;
let _bloomEffect: BloomEffect | null = null;
let _dofEffect: DepthOfFieldEffect | null = null;
let _renderPass: RenderPass | null = null;
let _initialized = false;
let _premiumMode = false;

// ── Default effect parameters ────────────────────────────────────────────────

/** Conservative atmospheric glow — subtle on the focus pocket, not Las Vegas. */
const BLOOM_DEFAULTS = {
    luminanceThreshold: 0.6,
    intensity: 0.5,
    radius: 0.6,
    mipmapBlur: true,
};

/** Depth-of-field defaults (disabled by default, bokehScale controls blur). */
const DOF_DEFAULTS = {
    focusDistance: 3.0,
    focusRange: 2.0,
    bokehScale: 1.0,
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns whether premium postprocessing mode is currently active.
 */
export function isPremiumMode(): boolean {
    return _premiumMode;
}

/**
 * Toggle premium postprocessing on or off.
 * Updates the body data-attribute and enables/disables all passes.
 */
export function setPremiumMode(enabled: boolean): void {
    if (_premiumMode === enabled) return;
    _premiumMode = enabled;

    if (typeof document !== 'undefined' && document.body) {
        if (enabled) {
            document.body.dataset.premiumMode = 'true';
        } else {
            delete document.body.dataset.premiumMode;
        }
    }

    // Enable/disable all passes in the composer
    if (_composer) {
        for (const pass of _composer.passes) {
            if ('enabled' in pass) {
                (pass as any).enabled = enabled;
            }
        }
    }

    debugWarn(`[postprocessing] premium mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Initialize the EffectComposer wrapping an existing renderer.
 *
 * Call once after the renderer is created in initThreeJS().
 * Safe to call multiple times — disposes previous state first.
 */
export function initPostProcessing(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
): void {
    disposePostProcessing();

    try {
        _composer = new EffectComposer(renderer);

        // RenderPass — renders the scene into the composer buffer
        _renderPass = new RenderPass(scene, camera);
        _renderPass.enabled = _premiumMode;
        _composer.addPass(_renderPass);

        // BloomEffect — atmospheric glow
        _bloomEffect = new BloomEffect({
            luminanceThreshold: BLOOM_DEFAULTS.luminanceThreshold,
            intensity: BLOOM_DEFAULTS.intensity,
            radius: BLOOM_DEFAULTS.radius,
            mipmapBlur: BLOOM_DEFAULTS.mipmapBlur,
        });
        const bloomPass = new EffectPass(camera, _bloomEffect);
        bloomPass.enabled = _premiumMode;
        _composer.addPass(bloomPass);

        // DepthOfFieldEffect — depth-of-field (disabled even in premium mode initially)
        _dofEffect = new DepthOfFieldEffect(camera, {
            focusDistance: DOF_DEFAULTS.focusDistance,
            focusRange: DOF_DEFAULTS.focusRange,
            bokehScale: DOF_DEFAULTS.bokehScale,
        });
        const dofPass = new EffectPass(camera, _dofEffect);
        dofPass.enabled = false; // opt-in even within premium mode
        _composer.addPass(dofPass);

        _initialized = true;

        // Expose API on window for DevGui bridge
        if (typeof window !== 'undefined') {
            (window as any).__semanticPostprocessing = {
                setPremiumMode,
                updateBloomParams,
                setDofEnabled,
                isPremiumMode,
            };
        }

        // Sync body attribute if premium mode was set before init
        if (_premiumMode && typeof document !== 'undefined' && document.body) {
            document.body.dataset.premiumMode = 'true';
        }

        debugWarn('[postprocessing] initialized — bloom + DOF ready');
    } catch (err) {
        console.error('[postprocessing] init failed, falling back to vanilla renderer:', err);
        disposePostProcessing();
    }
}

/**
 * Render through the EffectComposer instead of the raw renderer.
 * Only call when premium mode is active and composer is initialized.
 * Returns true if the composer handled the frame, false to fall back.
 */
export function renderPostProcessing(): boolean {
    if (!_composer || !_premiumMode || !_initialized) return false;
    try {
        _composer.render();
        return true;
    } catch (err) {
        debugWarn('[postprocessing] render failed, will retry next frame:', err);
        return false;
    }
}

/**
 * Resize the composer and its passes to match new dimensions.
 */
export function resizePostProcessing(width: number, height: number): void {
    if (!_composer) return;
    _composer.setSize(width, height);
}

/**
 * Dispose all postprocessing resources.
 */
export function disposePostProcessing(): void {
    if (_composer) {
        // Dispose each pass individually
        for (const pass of _composer.passes) {
            if (typeof (pass as any).dispose === 'function') {
                (pass as any).dispose();
            }
        }
        _composer = null;
    }
    _bloomEffect = null;
    _dofEffect = null;
    _renderPass = null;
    _initialized = false;
}

/**
 * Update bloom parameters at runtime (for DevGui sliders).
 */
export function updateBloomParams(params: {
    luminanceThreshold?: number;
    intensity?: number;
    radius?: number;
}): void {
    if (_bloomEffect) {
        // intensity has an official getter/setter on BloomEffect
        if (params.intensity !== undefined) {
            _bloomEffect.intensity = params.intensity;
        }
        // luminanceThreshold and radius are constructor-only in the type
        // definitions but exist as writable fields at runtime.
        const bloomAny = _bloomEffect as any;
        if (params.luminanceThreshold !== undefined && 'luminanceThreshold' in bloomAny) {
            bloomAny.luminanceThreshold = params.luminanceThreshold;
        }
        if (params.radius !== undefined && 'radius' in bloomAny) {
            bloomAny.radius = params.radius;
        }
    }
}

/**
 * Get current bloom parameters (for DevGui display).
 */
export function getBloomParams(): typeof BLOOM_DEFAULTS {
    return { ...BLOOM_DEFAULTS };
}

/**
 * Enable/disable the Depth-of-Field effect (only active when premium mode is ON).
 */
export function setDofEnabled(enabled: boolean): void {
    if (!_composer || !_premiumMode) return;
    // The DOF pass is the last EffectPass in the chain (index 2)
    const dofPass = _composer.passes[2];
    if (dofPass && 'enabled' in dofPass) {
        (dofPass as any).enabled = enabled;
    }
}

/**
 * Check if postprocessing is initialized and available.
 */
export function isPostProcessingAvailable(): boolean {
    return _initialized && _composer !== null;
}
