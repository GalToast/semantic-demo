/**
 * three-lens-halos.ts — Init for focus halos (glowing ring around focused node)
 *
 * Extracted from three-interaction-visuals.ts initSemanticHalos() (L5, ~43 LOC)
 * as part of the decomposition plan at docs/three-interaction-visuals-decomposition-plan.md
 * (Phase 3 — Init concern extractions).
 *
 * Creates:
 *   - focusHalo: RingGeometry + ShaderMaterial (glow pulse, AdditiveBlending)
 *
 * Note: unlike most lens objects, the focus halos are added directly to the scene
 * (not the semanticLensGroup) because they position themselves at the focused node's
 * world position and pulse independently.
 */
import { Mesh, RingGeometry, ShaderMaterial, Color, AdditiveBlending, Scene, Vector3 } from 'three'
import { appState as _state } from '@lib/state/app.svelte'
const state = _state

import { SCENE_PALETTE } from '@lib/utils/design-tokens'

// ── Init ─────────────────────────────────────────────────────────────────────

/**
 * Create the focus halo meshes with pre-allocated geometry.
 * Writes state.focusHalo.
 *
 * @param scene — The Three.js scene (target for scene.add)
 */
export function initHalos(scene: Scene): void {
    const haloGeo = new RingGeometry(0.3, 0.5, 32)
    const haloMat = new ShaderMaterial({
        uniforms: {
            uColor: { value: new Color(SCENE_PALETTE.threadTint) },
            uTime: { value: 0 },
            uOpacity: { value: 0.35 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uTime;
            uniform float uOpacity;
            varying vec2 vUv;
            void main() {
                float dist = distance(vUv, vec2(0.5));
                float glow = smoothstep(0.5, 0.0, dist);
                float pulse = 0.8 + 0.2 * sin(uTime * 2.0);
                gl_FragColor = vec4(uColor, uOpacity * glow * pulse);
            }
        `,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: 2 // DoubleSide
    })

    const halo = new Mesh(haloGeo, haloMat)
    halo.name = 'focusHalo'
    halo.frustumCulled = false
    halo.visible = false
    scene.add(halo)
    state.focusHalo = halo
}

// ── Update ───────────────────────────────────────────────────────────────────

/**
 * Update focus halo position and pulse each frame.
 * Mirrors the per-frame logic from three-interaction-visuals.ts.
 *
 * @param anchorPos — world position of the focused node
 * @param time — elapsed time in seconds
 */
export function updateHalos(anchorPos: Vector3, time: number): void {
    const halos = state.focusHalo
    if (!halos || !halos.visible) return
    halos.position.copy(anchorPos)
    const mat = halos.material as ShaderMaterial
    if (mat.uniforms?.uTime) {
        mat.uniforms.uTime.value = time
    }
}

// ── Dispose ──────────────────────────────────────────────────────────────────

/** Remove focus halos from the scene and clear state. */
export function disposeHalos(): void {
    const halos = state.focusHalo
    if (!halos) return
    const parent = halos.parent
    if (parent) {
        parent.remove(halos)
    }
    halos.geometry.dispose()
    const mat = halos.material as ShaderMaterial
    mat.dispose()
    state.focusHalo = null
}
