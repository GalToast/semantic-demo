/**
 * @lib/journey/thread-inspector-webgl.ts
 *
 * Ported from:
 * WebGL line geometry and shader setup for the thread inspector.
 *
 * Type-safety notes (W46-era tightening; current state 2026-06-30):
 *   - `state` is a plain alias for `appState` (no module-level cast).
 *     Engine-bridge fields (Scene/Group/Vector3[]) are loosely typed at
 *     the appState level, so each local selector below narrows the
 *     return type at the boundary so callers don't repeat the cast.
 *   - Three.js objects are typed via the actual classes (LineSegments,
 *     Sprite, Group, Object3D) rather than `as any`.
 *   - Duck-type checks on Three.js child objects are replaced with
 *     `instanceof` so the typechecker enforces exhaustiveness.
 *
 * Local selectors replace the 12 imports from js/state/selectors/index.ts.
 * Each selector is a thin getter that reads from canonical appState, matching
 * the original selector contract.
 */

import {
    Vector3,
    ShaderMaterial,
    BufferGeometry,
    Float32BufferAttribute,
    LineSegments,
    Group,
    Object3D,
    Scene,
    SpriteMaterial,
    Texture,
    Sprite,
    AdditiveBlending
} from 'three'
import { CONFIG, FOCUS_CONSTELLATION_MOTIFS } from '@lib/engine/config'
import { appState } from '@lib/state/app.svelte'
import type { NodePosition, ConstellationMotifName, ConstellationMotif } from '@lib/state/state-types'
const state = appState
import { withStateMutation } from '@lib/state/with-state-mutation'

// ── Local selectors (replacing js/state/selectors/index.ts imports) ─────────
//
// `state` is a plain alias for `appState` (no cast at the alias site).
// Each getter below narrows the return type at the boundary so callers
// don't need to repeat the cast at use sites.

const getNavState = () => state.navState
// Local record alias uses the already-exported types from state-types.ts
// (avoids expanding config.ts's public-API surface just for typing).
type LocalConstellationMotifs = Record<ConstellationMotifName, ConstellationMotif>
const getFocusConstellationMotifs = (): LocalConstellationMotifs => FOCUS_CONSTELLATION_MOTIFS as unknown as LocalConstellationMotifs
const getFocusThreadSegments = (): number => CONFIG.FOCUS_THREAD_SEGMENTS
const getInspectedStrandGroup = (): Group | null => state.inspectedStrandGroup as Group | null
const setInspectedStrandGroup = (g: Group | null): void => {
    state.inspectedStrandGroup = g
}
const getNodePositions = (): NodePosition[] => state.nodePositions as NodePosition[] 
const getCurrentView = () => state.currentView
const getScene = (): Scene | null => state.scene as Scene | null
const getFocusRingTexture = () => state.focusRingTexture
const getFocusNextCueTexture = () => state.focusNextCueTexture
const getFocusBeaconTexture = () => state.focusBeaconTexture
const getPinnedThreadIndex = () => state.focusState.pinnedThreadIndex
const getPulsePhase = () => state.pulsePhase

// ── Direct import (was adapter bridge; moved here to keep focus/geometry.ts
//     out of the main bundle — it imports Three.js) ─────────────────────
import { getFocusThreadCurvePoint, type ThreadEdge } from '@lib/journey/focus-pocket-geometry'

// ── Types ──────────────────────────────────────────────────────────────────

export interface InspectedStrandEdge {
    a: number
    b: number
    curveLift: number
    side: number
    rise: number
    depth: number
    cue: number
    motifBraid: number
    anchorPull: number
    priority: number
    role: string
}

/** Mirror of the runtime inspection-state shape on appState. */
export interface InspectionState {
    active: boolean
    index: number
    focusedIndex: number
}

// ── Core functions ─────────────────────────────────────────────────────────

export function getInspectedStrandEdge(index: number, lane: number = 0): InspectedStrandEdge | null {
    const focusIndex = Number.isFinite(getNavState()?.focusedIndex) ? getNavState()?.focusedIndex : null
    if (focusIndex === null || !Number.isFinite(index) || index === focusIndex) return null
    const motifKey = ((getNavState()?.focusPocketMeta as Record<string, unknown>)?.motif || 'market') as ConstellationMotifName
    const motifs = getFocusConstellationMotifs()
    const motifConfig = { ...(motifs[motifKey] || FOCUS_CONSTELLATION_MOTIFS.market || {}) }
    const directLift = Number.isFinite(motifConfig.directLift) ? motifConfig.directLift : 0.6
    const braid = Number.isFinite(motifConfig.braid) ? motifConfig.braid : 0.3
    const side = (focusIndex * 31 + index * 17) % 2 === 0 ? 1 : -1
    const rawRise = (((focusIndex + index) % 5) - 2) / 2
    const rise = Number.isFinite(rawRise) ? rawRise : 0.45
    return {
        a: focusIndex,
        b: index,
        curveLift: Math.max(0.48, directLift * (1.08 + Math.abs(lane) * 0.1)),
        side: side + lane * 0.16,
        rise: rise + lane * 0.18,
        depth: 1.02 + Math.abs(lane) * 0.12,
        cue: 1,
        motifBraid: Math.min(0.92, braid + 0.16),
        anchorPull: Math.min(0.34, 0.16 + braid * 0.18),
        priority: 1,
        role: 'inspection'
    }
}

export function writeInspectedStrandPositions(lineObject: LineSegments): void {
    const targetIndex = lineObject?.userData?.targetIndex
    if (!Number.isFinite(targetIndex) || !lineObject.geometry?.attributes?.position) return
    const positionAttr = lineObject.geometry.attributes.position
    const positions = positionAttr.array
    const lanes = lineObject.userData?.lanes || [0]
    let offset = 0
    lanes.forEach((lane: number) => {
        const edge = getInspectedStrandEdge(targetIndex, lane)
        if (!edge) return
        const focusThreadSegments = getFocusThreadSegments()
        for (let segment = 0; segment < focusThreadSegments; segment += 1) {
            const t0 = segment / focusThreadSegments
            const t1 = (segment + 1) / focusThreadSegments
            // InspectedStrandEdge has every field ThreadEdge requires (a, b,
            // curveLift, side, rise, depth, motifBraid, anchorPull, role) plus
            // a couple of extras (cue, priority) that ThreadEdge tolerates via
            // its `[key: string]: unknown` index signature.
            const p0 = getFocusThreadCurvePoint(edge as unknown as ThreadEdge, t0) || new Vector3()
            const p1 = getFocusThreadCurvePoint(edge as unknown as ThreadEdge, t1) || new Vector3()
            positions[offset] = Number.isFinite(p0.x) ? p0.x : 0
            positions[offset + 1] = Number.isFinite(p0.y) ? p0.y : 0
            positions[offset + 2] = Number.isFinite(p0.z) ? p0.z : 0
            positions[offset + 3] = Number.isFinite(p1.x) ? p1.x : 0
            positions[offset + 4] = Number.isFinite(p1.y) ? p1.y : 0
            positions[offset + 5] = Number.isFinite(p1.z) ? p1.z : 0
            offset += 6
        }
    })
    positionAttr.needsUpdate = true
}

export function createInspectedStrandMaterial({ aura = false } = {}): ShaderMaterial {
    return new ShaderMaterial({
        uniforms: {
            time: { value: performance.now() / 1000 },
            opacity: { value: aura ? 0.42 : 0.92 },
            semanticScore: { value: 0.5 }
        },
        vertexShader: `
            attribute float progress;
            attribute float lane;
            varying float vProgress;
            varying float vLane;
            void main() {
                vProgress = progress;
                vLane = lane;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float opacity;
            uniform float semanticScore;
            varying float vProgress;
            varying float vLane;
            void main() {
                float pulseFreq = 0.52 + (semanticScore * 1.6);
                float flow = fract(vProgress - time * pulseFreq + abs(vLane) * 0.08);
                float sporeSize = 1.8 + (semanticScore * 3.2);
                float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123);
                float spore = pow(1.0 - abs(flow - 0.58) * 2.0, sporeSize);
                spore *= (0.85 + noise * 0.3);
                float breath = 0.78 + sin(time * 2.4 + vLane * 2.2) * 0.16;
                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 gold = vec3(1.0, 0.85, 0.38);
                vec3 pearl = vec3(0.92, 1.0, 0.96);
                vec3 color = mix(teal, gold, smoothstep(0.18, 0.92, vProgress));
                color = mix(color, pearl, spore * 0.62);
                float alpha = opacity * breath * (0.52 + spore * 0.88 + (semanticScore * 0.28));
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending
    })
}

export function createInspectedStrandLine(targetIndex: number, lanes: number[], aura: boolean = false): LineSegments {
    const positions: number[] = []
    const progress: number[] = []
    const laneValues: number[] = []
    const focusThreadSegments = getFocusThreadSegments()
    for (let i = 0; i < lanes.length * focusThreadSegments * 2; i++) {
        positions.push(0, 0, 0)
    }
    lanes.forEach((lane) => {
        for (let segment = 0; segment < focusThreadSegments; segment += 1) {
            progress.push(segment / focusThreadSegments, (segment + 1) / focusThreadSegments)
            laneValues.push(lane, lane)
        }
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('progress', new Float32BufferAttribute(progress, 1))
    geometry.setAttribute('lane', new Float32BufferAttribute(laneValues, 1))
    const line = new LineSegments(geometry, createInspectedStrandMaterial({ aura }))
    line.userData = { targetIndex, lanes, aura }
    writeInspectedStrandPositions(line)
    return line
}

export function updateInspectedStrandEndpointSprites(): void {
    const strandGroup = getInspectedStrandGroup()
    if (!strandGroup) return
    const nodePos = getNodePositions()
    strandGroup.children.forEach((child: Object3D) => {
        const endpointIndex = (child.userData as { endpointIndex?: number } | undefined)?.endpointIndex
        if (!Number.isFinite(endpointIndex)) return
        const pos = nodePos[endpointIndex as number]
        if (!pos) return
        child.position.set(
            Number.isFinite(pos.x) ? pos.x : 0,
            Number.isFinite(pos.y) ? pos.y : 0,
            Number.isFinite(pos.z) ? pos.z : 0
        )
    })
}

export function syncInspectedStrandOverlay(
    inspectionState: InspectionState | null,
    options: { surface?: string } = {}
): void {
    const currentView = getCurrentView()
    const scene = getScene()
    const nodePos = getNodePositions()
    if (
        !inspectionState?.active ||
        currentView !== 'galaxy' ||
        !scene ||
        !Number.isFinite(inspectionState.index) ||
        !Number.isFinite(inspectionState.focusedIndex) ||
        inspectionState.index < 0 ||
        inspectionState.index >= nodePos.length ||
        inspectionState.focusedIndex < 0 ||
        inspectionState.focusedIndex >= nodePos.length
    ) {
        disposeInspectedStrandOverlay()
        return
    }
    const existingStrandGroup = getInspectedStrandGroup()
    const needsRebuild =
        !existingStrandGroup ||
        existingStrandGroup.userData?.targetIndex !== inspectionState.index ||
        existingStrandGroup.userData?.focusedIndex !== inspectionState.focusedIndex
    if (needsRebuild) {
        disposeInspectedStrandOverlay()
        const strandGroup = new Group()
        strandGroup.name = 'inspected-semantic-strand'
        strandGroup.userData = {
            targetIndex: inspectionState.index,
            focusedIndex: inspectionState.focusedIndex,
            source: options.surface || 'rail',
            enteredAt: performance.now()
        }
        strandGroup.add(createInspectedStrandLine(inspectionState.index, [-1, 0, 1], true))
        strandGroup.add(createInspectedStrandLine(inspectionState.index, [0], false))
        ;[inspectionState.focusedIndex, inspectionState.index].forEach((endpointIndex: number, order: number) => {
            const endpointMaterial = new SpriteMaterial({
                map: (getFocusRingTexture() || getFocusNextCueTexture() || getFocusBeaconTexture()) as Texture,
                color: order === 0 ? 0xffe27a : 0x7ce7dd,
                transparent: true,
                opacity: order === 0 ? 0.42 : 0.58,
                depthWrite: false,
                depthTest: false,
                blending: AdditiveBlending
            })
            const sprite = new Sprite(endpointMaterial)
            sprite.userData = {
                endpointIndex,
                baseScale: order === 0 ? 0.052 : 0.06,
                baseOpacity: order === 0 ? 0.42 : 0.58,
                pulseRate: order === 0 ? 1.1 : 1.34
            }
            strandGroup.add(sprite)
        })
        setInspectedStrandGroup(strandGroup)
        scene.add(strandGroup)
    }
    const strandGroup2 = getInspectedStrandGroup()
    if (strandGroup2) {
        strandGroup2.userData.source = options.surface || strandGroup2.userData.source || 'rail'
        strandGroup2.children.forEach((child: Object3D) => {
            if (child instanceof LineSegments) {
                writeInspectedStrandPositions(child)
            }
        })
    }
    updateInspectedStrandEndpointSprites()
    withStateMutation(() => {
        state.focusState.inspectedStrandDiagnostics = {
            active: true,
            source:
                getPinnedThreadIndex() === inspectionState.index
                    ? 'pinned'
                    : getInspectedStrandGroup()?.userData.source || 'rail',
            index: inspectionState.index,
            focusedIndex: inspectionState.focusedIndex,
            segmentCount: getFocusThreadSegments() * 4,
            braidCount: 4,
            endpointCount: 2,
            pinned: getPinnedThreadIndex() === inspectionState.index
        }
    })
}

export function updateInspectedStrandOverlay(now: number = performance.now()): void {
    const strandGroup = getInspectedStrandGroup()
    if (!strandGroup) return
    const nodePos = getNodePositions()
    strandGroup.children.forEach((child: Object3D) => {
        if (child instanceof LineSegments) {
            writeInspectedStrandPositions(child)
            const mat = child.material as ShaderMaterial | undefined
            if (mat?.uniforms?.time) mat.uniforms.time.value = now / 1000
        } else if (child instanceof Sprite) {
            const userData = (child.userData ?? {}) as {
                endpointIndex?: number
                pulseRate?: number
                baseScale?: number
            }
            const endpointIndex = userData.endpointIndex
            const pos = Number.isFinite(endpointIndex) ? nodePos[endpointIndex as number] : null
            if (!pos) return
            child.position.set(
                Number.isFinite(pos.x) ? pos.x : 0,
                Number.isFinite(pos.y) ? pos.y : 0,
                Number.isFinite(pos.z) ? pos.z : 0
            )
            const pulse =
                1 + Math.sin(getPulsePhase() * (userData.pulseRate || 1.2) + (endpointIndex as number) * 0.19) * 0.14
            const scale = (userData.baseScale || 0.052) * pulse
            child.scale.set(scale, scale, 1)
        }
    })
}

export function disposeInspectedStrandOverlay(): void {
    const strandGroup = getInspectedStrandGroup()
    if (!strandGroup) {
        withStateMutation(() => {
            state.focusState.inspectedStrandDiagnostics = {
                active: false,
                source: 'none',
                index: null,
                focusedIndex: null,
                segmentCount: 0,
                braidCount: 0,
                endpointCount: 0
            }
        })
        return
    }
    const scene = getScene()
    if (scene) scene.remove(strandGroup)
    strandGroup.traverse((child: Object3D) => {
        const obj = child as Object3D & {
            geometry?: { dispose: () => void }
            material?: { dispose: () => void }
        }
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) obj.material.dispose()
    })
    setInspectedStrandGroup(null)
    withStateMutation(() => {
        state.focusState.inspectedStrandDiagnostics = {
            active: false,
            source: 'none',
            index: null,
            focusedIndex: null,
            segmentCount: 0,
            braidCount: 0,
            endpointCount: 0
        }
    })
}
