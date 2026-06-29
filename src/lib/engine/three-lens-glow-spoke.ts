/**
 * three-lens-glow-spoke.ts — Init for semantic lens glow sphere + spoke line segments
 *
 * Extracted from three-interaction-visuals.ts initSemanticLens() (L3, L4 ~69 LOC)
 * as part of the decomposition plan at docs/three-interaction-visuals-decomposition-plan.md
 * (Phase 3 — Init concern extractions).
 *
 * Creates:
 *   - semanticLensGlow: SphereGeometry + ShaderMaterial (BackSide glow)
 *   - semanticLensSpokes: BufferGeometry + LineSegments with wave-animated shader
 */
import {
    Mesh,
    SphereGeometry,
    ShaderMaterial,
    BufferGeometry,
    BufferAttribute,
    LineSegments,
    Color,
    BackSide,
    NormalBlending
} from 'three'
import type { Group as GroupType } from 'three'
import type { appState } from '@lib/state/app.svelte'
import { SCENE_PALETTE } from '@lib/utils/design-tokens'

type AppState = typeof appState

/**
 * Create the lens glow sphere and spoke line segments, attach them to the
 * semantic lens group, and write them to state.
 *
 * @param state — The app state object (writes semanticLensGlow, semanticLensSpokes)
 * @param semanticLensGroup — The Group to add the glow and spokes into
 */
export function initLensGlowSpoke(state: AppState, semanticLensGroup: GroupType): void {
    const glowGeo = new SphereGeometry(0.12, 32, 32)
    const glowMat = new ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new Color(SCENE_PALETTE.threadTint) },
            uOpacity: { value: 0 },
            uSignalScore: { value: 0 }
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uSignalScore;
            varying vec3 vNormal;
            void main() {
                float intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 3.0);
                float signalLift = 0.76 + clamp(uSignalScore, 0.0, 1.0) * 0.34;
                float pulse = 0.82 + sin(uTime * 2.4) * 0.18;
                gl_FragColor = vec4(uColor * signalLift, intensity * uOpacity * pulse);
            }
        `,
        transparent: true,
        side: BackSide,
        blending: NormalBlending,
        depthWrite: false
    })
    state.semanticLensGlow = new Mesh(glowGeo, glowMat)
    state.semanticLensGlow.renderOrder = -1
    semanticLensGroup.add(state.semanticLensGlow)

    const spokeGeo = new BufferGeometry()
    const spokePos = new Float32Array(12 * 2 * 3)
    const spokeAlpha = new Float32Array(12 * 2)
    spokeGeo.setAttribute('position', new BufferAttribute(spokePos, 3))
    spokeGeo.setAttribute('alpha', new BufferAttribute(spokeAlpha, 1))

    const spokeMat = new ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new Color(0xfff4ba) }
        },
        vertexShader: `
            attribute float alpha;
            varying float vAlpha;
            void main() {
                vAlpha = alpha;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
                float wave = 0.72 + sin(uTime * 4.0 + vAlpha * 10.0) * 0.28;
                gl_FragColor = vec4(uColor, vAlpha * (0.4 + wave * 0.6));
            }
        `,
        transparent: true,
        blending: NormalBlending,
        depthWrite: false
    })
    const spokes = new LineSegments(spokeGeo, spokeMat)
    state.semanticLensSpokes = spokes
    semanticLensGroup.add(spokes)
}
