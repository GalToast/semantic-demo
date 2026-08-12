/**
 * @lib/engine/three-interaction-manifold.ts — the ground-plane semantic manifold
 *
 * Extracted from three-interaction-visuals.ts (IA-1 of the three-star split,
 * plan §2.4 / §3.2 — see tmp/three-star-split-PLAN.md). The manifold is the
 * translucent horizon disc under the point cloud: a `CircleGeometry` lying flat
 * at y = -0.8 with a shader that paints breathing contour mist plus a ripple
 * pulse driven from the search/click path (`uRippleTime` / `uRippleCenter`).
 *
 * Why its own module (cohesion, not line count):
 *   - It has NO per-frame updater in this file. Its `uTime` / ripple uniforms are
 *     written by the main loop (three-engine-frame-updates.ts), so it never
 *     participates in the lens/focus update family that stayed behind.
 *   - It owns NO module-level state — the mesh handle lives on
 *     `state.semanticManifold`, so init + dispose are the whole lifecycle.
 *   - Zero coupling to the lens cluster: it uses none of the material-narrowing
 *     helpers and none of the focus-index cache.
 *
 * Public API:
 *   - initSemanticManifold()    — build the mesh + shader and add it to the scene
 *   - disposeSemanticManifold() — remove + dispose the mesh, null the handle
 *
 * Both are re-exported by three-interaction-visuals.ts (the hub) so existing
 * importers — `engineState.threeInteractionVisuals?.initSemanticManifold()` in
 * three-engine-init.ts / three-engine-search.ts, plus the engine barrels — keep
 * working without a repoint.
 *
 * Atmosphere contract: the manifold must stay `NormalBlending` (never additive)
 * or it washes the scene white. Pinned by tests/scene-atmosphere-contract.mjs
 * ("semantic manifold is atmospheric, not additive").
 */
import { Vector3, CircleGeometry, ShaderMaterial, DoubleSide, NormalBlending, Mesh, Color } from 'three'
import { appState as _state } from '@lib/state/app.svelte'
const state = _state
import { disposeObject3D } from '@lib/engine/resource-tracker'
import { SCENE_PALETTE } from '@lib/utils/design-tokens'
import { debugWarn } from '@lib/utils/debug'

export function initSemanticManifold() {
    if (!state.scene) {
        debugWarn('[three-interaction-manifold] initSemanticManifold: state.scene is null, skipping manifold init')
        return
    }
    const manifoldGeo = new CircleGeometry(4, 64)
    const manifoldMat = new ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uRippleTime: { value: -1000.0 },
            uRippleCenter: { value: new Vector3(0, 0, 0) },
            uColor: { value: new Color(SCENE_PALETTE.threadTint) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vUv = uv;
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uRippleTime;
            uniform vec3 uRippleCenter;
            uniform vec3 uColor;
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vec2 centeredUv = vUv - 0.5;
                float distToCenter = length(centeredUv) * 2.0;

                // Ripple interaction
                float d = distance(vWorldPosition, uRippleCenter);
                float rippleWave = (uRippleTime - d * 2.0);
                float rippleActive = (rippleWave > 0.0 && rippleWave < 1.0) ? (1.0 - rippleWave) : 0.0;

                float horizonFade = smoothstep(1.0, 0.0, distToCenter);
                float innerFade = smoothstep(0.08, 0.36, distToCenter);
                float breathingMist = 0.5 + sin(uTime * 0.45 + distToCenter * 7.0) * 0.5;
                float contourA = 1.0 - smoothstep(0.0, 0.016, abs(sin(distToCenter * 31.0 + uTime * 0.08)));
                float contourB = 1.0 - smoothstep(0.0, 0.012, abs(sin((vWorldPosition.x * 0.85 + vWorldPosition.z * 0.42) * 7.0)));
                float contours = contourA * 0.18 + contourB * 0.055;

                float opacity = (0.012 + contours + breathingMist * 0.005) * horizonFade * innerFade;
                vec3 finalColor = mix(vec3(0.1, 0.2, 0.2), uColor, 0.54 + breathingMist * 0.16);
                if (rippleActive > 0.0) {
                    opacity += rippleActive * 0.065;
                    finalColor = mix(finalColor, vec3(1.0, 0.88, 0.48), rippleActive);
                }

                gl_FragColor = vec4(finalColor, opacity);
            }
        `,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        blending: NormalBlending
    })
    state.semanticManifold = new Mesh(manifoldGeo, manifoldMat)
    state.semanticManifold.rotation.x = -Math.PI / 2
    state.semanticManifold.position.y = -0.8
    state.scene.add(state.semanticManifold)
}

/** Remove the manifold from the scene, dispose its geometry/material, null the handle.
 *
 * Extracted from `disposeSemanticLens` (IA-1, plan §2.4 "manifold dispose path")
 * so the mesh's create and destroy sides live in one module. Still called from
 * `disposeSemanticLens` in the hub, so lens-exit teardown behavior is unchanged.
 * Idempotent: a second call is a no-op because the handle is nulled.
 */
export function disposeSemanticManifold() {
    if (state.semanticManifold) {
        state.scene?.remove(state.semanticManifold)
        disposeObject3D(state.semanticManifold)
        state.semanticManifold = null
    }
}
