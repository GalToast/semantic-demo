/**
 * three-lens-focus-geo.ts — Init for focus lens (icosahedron fresnel shell)
 *
 * Extracted from three-interaction-visuals.ts initSemanticLens() (L5, ~43 LOC)
 * as part of the decomposition plan at docs/three-interaction-visuals-decomposition-plan.md
 * (Phase 3 — Init concern extractions).
 *
 * Creates:
 *   - focusLens: IcosahedronGeometry + ShaderMaterial (fresnel pulse, AdditiveBlending)
 *
 * Note: unlike most lens objects, the focus lens is added directly to the scene
 * (not the semanticLensGroup) because it positions itself at the focused node's
 * world position and rotates/pulses independently.
 */
import { Mesh, IcosahedronGeometry, ShaderMaterial, Color, AdditiveBlending, Scene as SceneType } from 'three'
import { appState } from '@lib/state/app.svelte'

type AppState = typeof appState

/**
 * Create the focus lens fresnel icosahedron mesh and attach it directly to
 * state.scene. Writes state.focusLens.
 *
 * @param state — The app state object (writes focusLens)
 * @param scene — The Three.js scene (target for scene.add)
 */
export function initFocusLens(state: AppState, scene: SceneType): void {
    const focusLensGeo = new IcosahedronGeometry(0.08, 3)
    const focusLensMat = new ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new Color(0x7ce7dd) },
            opacity: { value: 0.0 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color;
            uniform float opacity;
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vec3 viewDir = normalize(-vPosition);
                float fresnel = pow(1.0 - dot(viewDir, vNormal), 3.0);
                float pulse = sin(time * 2.5) * 0.15 + 0.85;
                gl_FragColor = vec4(color * pulse, (fresnel * 0.6 + 0.05) * opacity);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending
    })
    state.focusLens = new Mesh(focusLensGeo, focusLensMat)
    state.focusLens.visible = false
    scene.add(state.focusLens)
}
