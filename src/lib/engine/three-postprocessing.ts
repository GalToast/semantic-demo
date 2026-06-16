/**
 * three-postprocessing.ts — EffectComposer wrapper for Semantic Explorer.
 *
 * Wraps the existing Three.js renderer with postprocessing library v6 effects:
 *   - VignetteEffect (subtle dark edges, always on in premium mode)
 *   - ChromaticAberrationEffect (subtle RGB channel offset, always on in premium)
 *   - BloomEffect (atmospheric glow on bright elements, opt-in via params)
 *   - DepthOfFieldEffect (depth-of-field, opt-in even within premium mode)
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
    VignetteEffect,
    ChromaticAberrationEffect,
    Effect,
} from 'postprocessing';
import { debugWarn } from '../utils/diagnostic-adapter';

// ── Custom Effects ──────────────────────────────────────────────────────────

/**
 * Custom DitherEffect to disperse visual gradient color banding in dark indigo regions.
 */
class DitherEffect extends Effect {
    constructor() {
        super('DitherEffect', `
            void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
                // High-performance, high-quality triangle dithering
                // Adds a tiny fraction of an 8-bit color-step in pseudo-random noise to blend boundaries
                float rand = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                float noise = (rand - 0.5) / 255.0;
                outputColor = vec4(inputColor.rgb + vec3(noise), inputColor.a);
            }
        `);
    }
}

// ── Module-scoped state ──────────────────────────────────────────────────────

let _composer: EffectComposer | null = null;
let _bloomEffect: BloomEffect | null = null;
let _dofEffect: DepthOfFieldEffect | null = null;
let _vignetteEffect: VignetteEffect | null = null;
let _chromaticAberrationEffect: ChromaticAberrationEffect | null = null;
let _ditherEffect: DitherEffect | null = null;
let _renderPass: RenderPass | null = null;
let _initialized = false;
let _premiumMode = false;

// ── Default effect parameters ────────────────────────────────────────────────

/** Vignette: darken edges subtly, with smooth falloff. Offset 0.5, darkness 0.6. */
const VIGNETTE_DEFAULTS = {
    offset: 0.5,
    darkness: 0.6,
};

/** ChromaticAberration: subtle RGB channel offset (lens distortion feel). */
const CHROMATIC_ABERRATION_DEFAULTS = {
    offset: new THREE.Vector2(0.0015, 0.0015),
};

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

        // VignetteEffect — soft dark edges, always on in premium mode
        _vignetteEffect = new VignetteEffect({
            offset: VIGNETTE_DEFAULTS.offset,
            darkness: VIGNETTE_DEFAULTS.darkness,
        });
        const vignettePass = new EffectPass(camera, _vignetteEffect);
        vignettePass.enabled = _premiumMode;
        _composer.addPass(vignettePass);

        // ChromaticAberrationEffect — subtle RGB channel offset
        _chromaticAberrationEffect = new ChromaticAberrationEffect({
            offset: CHROMATIC_ABERRATION_DEFAULTS.offset,
            radialModulation: false,
            modulationOffset: 0,
        });
        const chromaticAberrationPass = new EffectPass(camera, _chromaticAberrationEffect);
        chromaticAberrationPass.enabled = _premiumMode;
        _composer.addPass(chromaticAberrationPass);

        // BloomEffect — atmospheric glow (only fires on bright elements)
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

        // DitherEffect — high-performance noise to eliminate banding
        _ditherEffect = new DitherEffect();
        const ditherPass = new EffectPass(camera, _ditherEffect);
        ditherPass.enabled = _premiumMode;
        _composer.addPass(ditherPass);

        _initialized = true;

        // Expose API on window for DevGui bridge
        if (typeof window !== 'undefined') {
            (window as any).__semanticPostprocessing = {
                setPremiumMode,
                updateBloomParams,
                updateVignetteParams,
                updateChromaticAberrationParams,
                setDofEnabled,
                isPremiumMode,
            };
        }

        // Sync body attribute if premium mode was set before init
        if (_premiumMode && typeof document !== 'undefined' && document.body) {
            document.body.dataset.premiumMode = 'true';
        }

        console.debug('[postprocessing] initialized — vignette + CA + bloom + DOF ready');
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
        for (const pass of _composer.passes) {
            if (typeof (pass as any).dispose === 'function') {
                (pass as any).dispose();
            }
        }
        _composer = null;
    }
    _bloomEffect = null;
    _dofEffect = null;
    _vignetteEffect = null;
    _chromaticAberrationEffect = null;
    _ditherEffect = null;
    _renderPass = null;
    _initialized = false;
}

/**
 * Update vignette parameters at runtime (for DevGui sliders).
 */
export function updateVignetteParams(params: {
    offset?: number;
    darkness?: number;
}): void {
    if (!_vignetteEffect) return;
    const vignetteAny = _vignetteEffect as any;
    if (params.offset !== undefined && 'offset' in vignetteAny) {
        vignetteAny.offset = params.offset;
    }
    if (params.darkness !== undefined && 'darkness' in vignetteAny) {
        vignetteAny.darkness = params.darkness;
    }
}

/**
 * Update chromatic aberration offset at runtime (for DevGui sliders).
 */
export function updateChromaticAberrationParams(params: {
    offset?: THREE.Vector2;
}): void {
    if (!_chromaticAberrationEffect || !params.offset) return;
    const aberrationAny = _chromaticAberrationEffect as any;
    if ('offset' in aberrationAny) {
        aberrationAny.offset = params.offset;
    }
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
        if (params.intensity !== undefined) {
            _bloomEffect.intensity = params.intensity;
        }
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
    const dofPass = _composer.passes[4];
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
