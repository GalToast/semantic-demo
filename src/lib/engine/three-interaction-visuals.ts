import {
    Material,
    Vector3,
    CircleGeometry,
    ShaderMaterial,
    DoubleSide,
    NormalBlending,
    Mesh,
    SphereGeometry,
    BufferGeometry,
    BufferAttribute,
    LineSegments,
    IcosahedronGeometry,
    AdditiveBlending,
    BackSide,
    PointLight,
    Color,
    Group
} from 'three';
import { appState as _state } from '@lib/state/app.svelte'
const state = _state as any;
import { triggerSearchHeroMoment, disposeHeroAnimation } from './three-search-animations';
import { calculateSignalScore } from '@lib/utils/geo-data';
import {
    createFocusAnchorIndicator,
    updateFocusAnchorIndicator,
    disposeFocusAnchorIndicator
} from '@lib/journey/focus-anchor-indicator';
import { disposeObject3D } from '@lib/engine/resource-tracker';

// ── Three.js material narrowing helpers ───────────────────────────────────────
// All focus/mote/petal/halo objects in this codebase are constructed with a single
// Material. These helpers narrow the union type at the Three.js interop boundary.

/** Narrow a single-material object's material to a single Material instance. */
function asSingleMaterial(mat: Material | Material[]): Material {
    if (!Array.isArray(mat)) return mat;
    const first = mat[0];
    if (!first) throw new Error('Expected a single material, received an empty material array.');
    return first;
}

/** Narrow material to ShaderMaterial when possible. Returns null for non-shader materials. */
function asShaderMaterial(mat: Material | Material[]): ShaderMaterial | null {
    const m = asSingleMaterial(mat);
    return m instanceof ShaderMaterial ? m : null;
}

function asColorMaterial(mat: Material | Material[]): (Material & { color: Color }) | null {
    const m = asSingleMaterial(mat);
    return 'color' in m && m.color instanceof Color ? (m as Material & { color: Color }) : null;
}

function isSemanticDiveActive() {
    return state.semanticDiveMode === true || state.trailDepth === 2;
}

// ── Local Types ───────────────────────────────────────────────────────────────

interface SpriteUserData {
    phase?: number;
    speed?: number;
    radius?: number;
    drift?: number;
    lift?: number;
    tilt?: number;
    scale?: number;
    length?: number;
    thickness?: number;
    [key: string]: unknown;
}

interface SpriteLike {
    material: Material & { opacity: number; rotation?: number };
    position: Vector3;
    scale: Vector3;
    visible: boolean;
    userData: SpriteUserData;
}

// ── Constants ───────────────────────────────────────────────────────────────

const FOCUS_WISP_COUNT = 18;
const FOCUS_WISP_SEGMENTS = 18;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getSemanticLensNeighborIndices(focusedNode: any) {
    const point = state.points?.[focusedNode];
    const leadId = point?.lead_id === null || point?.lead_id === undefined ? '' : String(point.lead_id);
    if (!leadId) return [];
    const semanticNode = state.semanticNeighborMapByLeadId ? state.semanticNeighborMapByLeadId.get(leadId) : null;
    if (!semanticNode?.neighbors?.length || !state.pointIndexByLeadId?.size) return [];
    return semanticNode.neighbors
        .map((neighbor: { leadId: string | number }) => state.pointIndexByLeadId.get(String(neighbor.leadId)))
        .filter(
            (index: number | undefined): index is number =>
                Number.isFinite(index) && index !== focusedNode && Boolean(state.nodePositions?.[index as number])
        )
        .slice(0, 12);
}

function updateSelectedNodeMotes(worldPos: any, time: any, isInside: any) {
    if (!state.focusMoteGroup || !Array.isArray(state.focusMotes)) return;
    const hasFocus = Boolean(worldPos);
    const targetOpacity = hasFocus ? (isInside ? 0.4 : 0.82) : 0;
    state.focusMoteGroup.visible =
        hasFocus || state.focusMotes.some((mote: SpriteLike) => mote.material.opacity > 0.01);
    if (hasFocus) {
        state.focusMoteGroup.position.copy(worldPos);
        state.focusMoteGroup.rotation.set(
            Math.sin(time * 0.19) * 0.14,
            Math.sin(time * 0.13 + 0.7) * 0.18,
            Math.sin(time * 0.17 + 1.4) * 0.1
        );
    }

    state.focusMotes.forEach((mote: SpriteLike, index: number) => {
        const data = mote.userData || {};
        mote.material.opacity += (targetOpacity - mote.material.opacity) * 0.08;
        mote.visible = mote.material.opacity > 0.01;
        if (!hasFocus) return;

        const phase = (data.phase || 0) + time * (data.speed || 0.45);
        const radius = data.radius || 0.028;
        const breath = 0.82 + Math.sin(time * 0.92 + index * 0.61) * 0.16 + Math.sin(time * 0.31 + index) * 0.07;
        const curl = phase + Math.sin(time * 0.42 + index) * 0.62 + Math.sin(time * 0.17 + index * 1.7) * 0.28;
        const wander = data.drift || 0.6;
        const verticalDrift = Math.sin(phase * 0.61) * radius * 0.46 + Math.sin(time * 0.58 + index) * 0.009 * wander;
        mote.position.set(
            Math.cos(curl) * radius * breath + Math.sin(time * 0.33 + index * 2.1) * 0.004 * wander,
            (data.lift || 0) + verticalDrift,
            Math.sin(curl) * radius * (data.tilt || 0.72) * breath +
                Math.cos(time * 0.29 + index * 1.6) * 0.004 * wander
        );
        const moteScale =
            (data.scale || 0.0084) *
            (1.0 + Math.sin(time * 1.08 + index * 0.7) * 0.24 + Math.sin(time * 0.41 + index) * 0.09);
        mote.scale.set(moteScale, moteScale, 1);
    });
}

function updateSelectedNodePetals(worldPos: any, time: any, isInside: any) {
    if (!state.focusPetalGroup || !Array.isArray(state.focusPetals)) return;
    const hasFocus = Boolean(worldPos);
    const targetOpacity = hasFocus ? (isInside ? 0.24 : 0.65) : 0;
    state.focusPetalGroup.visible =
        hasFocus || state.focusPetals.some((petal: any) => asSingleMaterial(petal.material).opacity > 0.01);
    if (hasFocus) {
        state.focusPetalGroup.position.copy(worldPos);
        state.focusPetalGroup.rotation.set(
            Math.sin(time * 0.12 + 0.3) * 0.1,
            Math.sin(time * 0.16 + 1.1) * 0.16,
            Math.sin(time * 0.1 + 2.1) * 0.08
        );
    }

    state.focusPetals.forEach((petal: any, index: number) => {
        const data = petal.userData || {};
        const mat = asSingleMaterial(petal.material);
        mat.opacity += (targetOpacity - mat.opacity) * 0.1;
        petal.visible = mat.opacity > 0.01;
        if (!hasFocus) return;

        const phase = (data.phase || 0) + time * (data.speed || 0.28);
        const radius = data.radius || 0.026;
        const sway = Math.sin(time * 0.38 + index * 0.77) * 0.38 + Math.sin(time * 0.16 + index * 1.43) * 0.18;
        const angle = phase + sway;
        const breath = 0.82 + Math.sin(time * 0.64 + index) * 0.18 + Math.sin(time * 0.23 + index * 1.8) * 0.07;
        petal.position.set(
            Math.cos(angle) * radius * breath,
            (data.lift || 0) + Math.sin(phase * 0.61) * radius * 0.34,
            Math.sin(angle) * radius * (data.tilt || 0.72) * breath
        );
        (mat as Material & { rotation?: number }).rotation =
            angle + Math.PI * 0.5 + Math.sin(time * 0.46 + index) * 0.44;
        const length = (data.length || 0.042) * (1.0 + Math.sin(time * 0.72 + index * 0.9) * 0.18);
        const thickness = data.thickness || 0.008;
        petal.scale.set(length, thickness, 1);
    });
}

function updateSelectedNodeFilaments(worldPos: any, time: any, isInside: any) {
    if (!state.focusFilaments?.geometry?.attributes?.position) return;
    const positions = state.focusFilaments.geometry.attributes.position.array;
    const hasFocus = Boolean(worldPos);
    const targetOpacity = hasFocus ? (isInside ? 0.22 : 0.5) : 0;
    const filMat = asSingleMaterial(state.focusFilaments.material);
    filMat.opacity += (targetOpacity - filMat.opacity) * 0.1;
    state.focusFilaments.visible = filMat.opacity > 0.01;
    if (!hasFocus) {
        positions.fill(0);
        state.focusFilaments.geometry.attributes.position.needsUpdate = true;
        return;
    }

    let offset = 0;
    for (let i = 0; i < FOCUS_WISP_COUNT; i += 1) {
        const seed = i * 1.713;
        const phase = time * (0.2 + i * 0.008) + seed;
        const rootOrbit = 0.004 + (i % 7) * 0.0011;
        const length = 0.017 + (i % 8) * 0.0024 + Math.sin(time * 0.34 + seed) * 0.002;
        const curlStrength = 0.0045 + (i % 6) * 0.0017;
        const lean = Math.sin(seed * 1.37) * (0.0022 + (i % 5) * 0.0009);
        const shell = 0.66 + (i % 4) * 0.11;
        const root = {
            x: worldPos.x + Math.cos(seed + time * 0.06) * rootOrbit,
            y: worldPos.y - 0.007 + Math.sin(seed * 0.7 + time * 0.09) * 0.0035,
            z: worldPos.z + Math.sin(seed + time * 0.055) * rootOrbit * 0.78
        };
        let prev = null;
        for (let s = 0; s <= FOCUS_WISP_SEGMENTS; s += 1) {
            const t = s / FOCUS_WISP_SEGMENTS;
            const taper = Math.sin(t * Math.PI);
            const ease = t * t * (3 - 2 * t);
            const curl =
                phase +
                ease * (2.25 + i * 0.055) +
                Math.sin(time * 0.34 + seed + t * 5.6) * 0.72 +
                Math.sin(time * 0.12 + seed * 2.1 + t * 9.2) * 0.3;
            const drift = Math.sin(time * 0.48 + seed + t * 6.8) * taper;
            const lateral = curlStrength * ease * (0.62 + taper * shell);
            const float = Math.sin(time * 0.28 + seed * 0.8 + t * 3.7) * taper * 0.0075;
            const point = {
                x: root.x + Math.cos(curl) * lateral + Math.sin(phase * 1.1 + t * 4.6) * taper * 0.0032 + lean * ease,
                y: root.y + Math.sin(t * Math.PI * 0.74) * length * 0.24 + ease * length * 0.07 + float,
                z: root.z + Math.sin(curl) * lateral * 0.9 + drift * 0.0048
            };
            if (prev) {
                positions[offset++] = prev.x;
                positions[offset++] = prev.y;
                positions[offset++] = prev.z;
                positions[offset++] = point.x;
                positions[offset++] = point.y;
                positions[offset++] = point.z;
            }
            prev = point;
        }
    }
    while (offset < positions.length) positions[offset++] = 0;
    state.focusFilaments.geometry.attributes.position.needsUpdate = true;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function disposeInteractionVisuals() {
    disposeSemanticLens();
    disposeFocusAnchorIndicator();
    disposeHeroAnimation();

    // Remove micro-demo event listeners to prevent handler leaks
    if (typeof document !== 'undefined' && document && document.removeEventListener) {
        if (_onDemoNodeHighlight) {
            document.removeEventListener('micro-demo-node-highlight', _onDemoNodeHighlight as EventListener);
            _onDemoNodeHighlight = null;
        }
        if (_onDemoNamePulse) {
            document.removeEventListener('micro-demo-name-pulse', _onDemoNamePulse as EventListener);
            _onDemoNamePulse = null;
        }
    }
}

export function disposeSemanticLens() {
    if (state.anchorBloomLight) {
        state.scene?.remove(state.anchorBloomLight);
        state.anchorBloomLight.dispose?.();
        state.anchorBloomLight = null;
    }
    if (state.semanticManifold) {
        disposeObject3D(state.semanticManifold);
        state.semanticManifold = null;
    }
    if (state.semanticLensGroup) {
        disposeObject3D(state.semanticLensGroup);
        state.semanticLensGroup = null;
    }
    if (state.focusLens) {
        disposeObject3D(state.focusLens);
        state.focusLens = null;
    }
    if (state.semanticLensGlow) {
        disposeObject3D(state.semanticLensGlow);
        state.semanticLensGlow = null;
    }
    if (state.semanticLensSpokes) {
        disposeObject3D(state.semanticLensSpokes);
        state.semanticLensSpokes = null;
    }
}

export function initSemanticManifold() {
    if (!state.scene) {
        if (import.meta.env.DEV) console.warn('[three-interaction-visuals] initSemanticManifold: state.scene is null, skipping manifold init');
        return;
    }
    const manifoldGeo = new CircleGeometry(4, 64);
    const manifoldMat = new ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uRippleTime: { value: -1000.0 },
            uRippleCenter: { value: new Vector3(0, 0, 0) },
            uColor: { value: new Color(0x4ecdc4) }
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
                if (distToCenter > 1.0) discard;

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
    });
    state.semanticManifold = new Mesh(manifoldGeo, manifoldMat);
    state.semanticManifold.rotation.x = -Math.PI / 2;
    state.semanticManifold.position.y = -0.8;
    state.scene.add(state.semanticManifold);
}

export function initSemanticLens() {
    if (!state.scene) {
        if (import.meta.env.DEV) console.warn('[three-interaction-visuals] initSemanticLens: state.scene is null, skipping lens init');
        return;
    }
    disposeSemanticLens();
    state.semanticLensGroup = new Group();
    state.semanticLensGroup.visible = false;
    state.scene.add(state.semanticLensGroup);

    const glowGeo = new SphereGeometry(0.12, 32, 32);
    const glowMat = new ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new Color(0x4ecdc4) },
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
    });
    state.semanticLensGlow = new Mesh(glowGeo, glowMat);
    state.semanticLensGlow.renderOrder = -1;
    state.semanticLensGroup.add(state.semanticLensGlow);

    const spokeGeo = new BufferGeometry();
    const spokePos = new Float32Array(12 * 2 * 3);
    const spokeAlpha = new Float32Array(12 * 2);
    spokeGeo.setAttribute('position', new BufferAttribute(spokePos, 3));
    spokeGeo.setAttribute('alpha', new BufferAttribute(spokeAlpha, 1));

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
    });
    const spokes = new LineSegments(spokeGeo, spokeMat);
    state.semanticLensSpokes = spokes;
    state.semanticLensGroup.add(spokes);

    const focusLensGeo = new IcosahedronGeometry(0.08, 3);
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
    });
    state.focusLens = new Mesh(focusLensGeo, focusLensMat);
    state.focusLens.visible = false;
    state.scene.add(state.focusLens);

    // Step Inside bloom: warm point light at anchor node when trailDepth === 2
    if (state.anchorBloomLight) {
        state.scene.remove(state.anchorBloomLight);
        state.anchorBloomLight.dispose?.();
        state.anchorBloomLight = null;
    }
    const anchorBloomLight = new PointLight(0xfff4ba, 0, 0.6);
    anchorBloomLight.name = 'anchorBloomLight';
    state.scene.add(anchorBloomLight);
    state.anchorBloomLight = anchorBloomLight;

    // Size + ring + pulse focus anchor indicator (see focus-anchor-indicator.js
    // for the cues chosen and the rationale).  Lives in the 3D scene — CSS
    // class treatment would not reach a Three.js mesh.
    createFocusAnchorIndicator();
}

export function updateInteractionVisuals(now: any, hoveredNode: any, focusedNode: any) {
    if (!state.pointsMesh) return;
    const time = now / 1000;

    const activeNode =
        Number.isFinite(focusedNode) && focusedNode >= 0
            ? focusedNode
            : Number.isFinite(hoveredNode) && hoveredNode >= 0
              ? hoveredNode
              : null;
    const isFocused = activeNode === focusedNode;

    if (state.hoverHalo) {
        asSingleMaterial(state.hoverHalo.material).opacity = 0;
        state.hoverHalo.visible = false;
    }

    if (state.focusCore) {
        const focusIdx = focusedNode;
        const hasFocus = Number.isFinite(focusIdx) && focusIdx >= 0;
        const isInside = isSemanticDiveActive();
        const isActive = hasFocus && isFocused;
        const auraTargetOpacity = hasFocus ? (isInside ? 0.065 : 0.135) : 0.0;
        const coreTargetOpacity = hasFocus ? (isInside ? 0.26 : 0.74) : 0.0;
        const baseScale = isActive ? (isInside ? 0.021 : 0.036) : isInside ? 0.021 : 0.032;

        if (state.focusHalo) {
            state.focusHalo.material.color.setHex(isActive ? 0x8ff8ed : 0x7ce7dd);
            state.focusHalo.material.opacity += (auraTargetOpacity - state.focusHalo.material.opacity) * 0.1;
            state.focusHalo.visible = state.focusHalo.material.opacity > 0.01;
        }

        const coreColorMat = asColorMaterial(state.focusCore.material);
        if (isActive) {
            coreColorMat?.color.setHex(0xeafffb);
            const corePulse = 1.0 + Math.sin(time * 1.2) * 0.09;
            state.focusCore.scale.set(baseScale * corePulse, baseScale * corePulse, 1);
        } else if (hasFocus) {
            coreColorMat?.color.setHex(0xcffcf4);
            const corePulse = isInside ? 1.0 + Math.sin(time * 1.25) * 0.09 : 1.0 + Math.sin(time * 2.4) * 0.045;
            state.focusCore.scale.set(baseScale * corePulse, baseScale * corePulse, 1);
        }

        const coreMat = asSingleMaterial(state.focusCore.material);
        coreMat.opacity += (coreTargetOpacity - coreMat.opacity) * 0.15;
        state.focusCore.visible = coreMat.opacity > 0.01;

        if (hasFocus && state.nodePositions[focusIdx]) {
            const pos = state.nodePositions[focusIdx];
            const worldPos = new Vector3(pos.x, pos.y, pos.z);
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(worldPos);

            if (state.focusHalo) {
                const auraPulse = 1.0 + Math.sin(time * 0.82) * 0.09 + Math.sin(time * 0.31 + 1.4) * 0.035;
                state.focusHalo.position.copy(worldPos);
                const auraScale = isInside ? 0.044 : 0.082;
                state.focusHalo.scale.set(auraScale * auraPulse, auraScale * auraPulse, 1);
            }
            state.focusCore.position.copy(worldPos);
            updateSelectedNodeMotes(worldPos, time, isInside);
            updateSelectedNodePetals(worldPos, time, isInside);
            updateSelectedNodeFilaments(worldPos, time, isInside);
        } else {
            updateSelectedNodeMotes(null, time, false);
            updateSelectedNodePetals(null, time, false);
            updateSelectedNodeFilaments(null, time, false);
        }
    } else {
        updateSelectedNodeMotes(null, time, false);
        updateSelectedNodePetals(null, time, false);
        updateSelectedNodeFilaments(null, time, false);
    }

    if (state.semanticLensGroup && state.semanticLensGlow && state.semanticLensSpokes) {
        const focusIdx = focusedNode;
        const focusPos = Number.isFinite(focusIdx) && focusIdx >= 0 ? state.nodePositions?.[focusIdx] : null;
        const hasFocus = Boolean(focusPos);
        const isInside = isSemanticDiveActive();
        const group = state.semanticLensGroup;
        const glowMat = state.semanticLensGlow.material ? asShaderMaterial(state.semanticLensGlow.material) : null;
        const glowUniforms = glowMat?.uniforms;
        const spokes = state.semanticLensSpokes;
        const opacityUniform = glowUniforms?.uOpacity;

        if (!hasFocus || !focusPos || !glowUniforms || !opacityUniform) {
            if (opacityUniform) opacityUniform.value += (0 - opacityUniform.value) * 0.12;
            group.visible = Boolean(opacityUniform?.value > 0.01);
            spokes.visible = false;
        } else {
            const worldPos = new Vector3(focusPos.x, focusPos.y, focusPos.z);
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(worldPos);
            group.position.copy(worldPos);
            group.visible = true;
            if (!isInside) {
                spokes.visible = false;
            }
            const targetOpacity = isInside ? 0.2 : 0.11;
            opacityUniform.value += (targetOpacity - opacityUniform.value) * 0.12;

            if (glowUniforms.uSignalScore) {
                const targetSignal =
                    typeof calculateSignalScore === 'function' ? calculateSignalScore(state.points?.[focusIdx]) : 0;
                glowUniforms.uSignalScore.value += (targetSignal - glowUniforms.uSignalScore.value) * 0.12;
            }

            const positionAttr = spokes.geometry.attributes.position;
            const alphaAttr = spokes.geometry.attributes.alpha;
            if (!positionAttr || !alphaAttr) {
                spokes.visible = false;
            } else {
                const positions = positionAttr.array;
                const alphas = alphaAttr.array;
                positions.fill(0);
                alphas.fill(0);

                if (isInside) {
                    const maxSpokeLength = 0.12;
                    let positionOffset = 0;
                    let alphaOffset = 0;
                    getSemanticLensNeighborIndices(focusIdx).forEach((neighborIndex: number) => {
                        const neighborPos = state.nodePositions[neighborIndex];
                        if (!neighborPos) return;
                        const neighborWorld = new Vector3(neighborPos.x, neighborPos.y, neighborPos.z);
                        if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(neighborWorld);
                        neighborWorld.sub(worldPos);
                        const distance = neighborWorld.length();
                        if (distance <= 0.0001) return;
                        neighborWorld.normalize().multiplyScalar(Math.min(distance, maxSpokeLength));
                        positions[positionOffset++] = 0;
                        positions[positionOffset++] = 0;
                        positions[positionOffset++] = 0;
                        positions[positionOffset++] = neighborWorld.x;
                        positions[positionOffset++] = neighborWorld.y;
                        positions[positionOffset++] = neighborWorld.z;
                        alphas[alphaOffset++] = 0.025;
                        alphas[alphaOffset++] = 0.18;
                    });
                    spokes.visible = positionOffset > 0;
                }
                positionAttr.needsUpdate = true;
                alphaAttr.needsUpdate = true;
            }
        }
    }

    if (state.focusLens) {
        const focusIdx = focusedNode;
        const hasFocus = Number.isFinite(focusIdx) && focusIdx >= 0;
        const isDiving = hasFocus && state.semanticDiveMode;

        const targetOpacity = hasFocus ? (isDiving ? 0.36 : 0.24) : 0.0;
        const lerpSpeed = isDiving ? 0.15 : 0.09;

        const lensMat = asShaderMaterial(state.focusLens.material);
        const lensUniforms = lensMat?.uniforms;
        const opacityUniform = lensUniforms?.opacity;
        const timeUniform = lensUniforms?.time;
        const colorUniform = lensUniforms?.color;
        if (opacityUniform && timeUniform && colorUniform) {
            opacityUniform.value += (targetOpacity - opacityUniform.value) * lerpSpeed;
            timeUniform.value = time;
            colorUniform.value.setHex(isDiving ? 0xd8fff8 : 0x9fffee);
        }
        state.focusLens.visible = (opacityUniform?.value ?? 0) > 0.01;

        if (state.focusLens.visible && hasFocus && state.nodePositions[focusIdx]) {
            const pos = state.nodePositions[focusIdx];
            const worldPos = new Vector3(pos.x, pos.y, pos.z);
            if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(worldPos);
            state.focusLens.position.copy(worldPos);

            const rotationSpeed = isDiving ? 0.02 : 0.008;
            const pulseFreq = isDiving ? 1.35 : 0.82;
            const pulseAmp = isDiving ? 0.17 : 0.09;
            const baseScale = isDiving ? 1.55 : 1.28;
            const pulse = baseScale + Math.sin(time * pulseFreq) * pulseAmp + Math.sin(time * 0.37 + 1.7) * 0.04;

            state.focusLens.rotation.y += rotationSpeed;
            state.focusLens.rotation.z += rotationSpeed * 0.5;
            state.focusLens.scale.set(pulse, pulse, pulse);
        }
    }

    // 4. Step Inside anchor bloom light
    if (state.anchorBloomLight) {
        const focusIdx = focusedNode;
        const hasFocus = Number.isFinite(focusIdx) && focusIdx >= 0;
        const isInside = isSemanticDiveActive();
        const targetIntensity = hasFocus ? (isInside ? 0.14 : 0.24) : 0.0;
        state.anchorBloomLight.intensity += (targetIntensity - state.anchorBloomLight.intensity) * 0.08;
        if (hasFocus && state.nodePositions[focusIdx]) {
            const pos = state.nodePositions[focusIdx];
            state.anchorBloomLight.position.set(pos.x, pos.y, pos.z);
            if (state.pointsMesh) state.anchorBloomLight.position.applyMatrix4(state.pointsMesh.matrixWorld);
        }
        state.anchorBloomLight.visible = state.anchorBloomLight.intensity > 0.01;
    }

    // 5. Focus anchor indicator (size + ring + pulse).  Honors
    //    prefers-reduced-motion inside the module — the pulse is dropped
    //    and the ring + size alone carry the cue for reduced-motion users.
    updateFocusAnchorIndicator(now, focusedNode);
}

// ── Micro-demo Visual Bridge ────────────────────────────────────────────────

let _demoHighlightNode = null;
let _demoHighlightBoost = 1.0;

// Module-level handler references for micro-demo listeners so they can be
// removed during disposal (Bug #2 – previously leaked at module scope).
let _onDemoNodeHighlight: ((e: Event) => void) | null = null;
let _onDemoNamePulse: (() => void) | null = null;

if (typeof document !== 'undefined' && document && document.addEventListener) {
    _onDemoNodeHighlight = (e: Event) => {
        const detail = (e as CustomEvent).detail as { index: number; phase: string };
        const { index, phase } = detail;
        if (!state.pointsMaterial?.userData?.shader) return;
        const shader = state.pointsMaterial.userData.shader;

        if (phase === 'glow' || phase === 'gliding') {
            _demoHighlightNode = index;
            _demoHighlightBoost = phase === 'gliding' ? 1.55 : 1.35;
            const pos = state.nodePositions[index];
            if (pos) {
                shader.uniforms.uHoverNodePos.value.set(pos.x, pos.y, pos.z);
                shader.uniforms.uHoverBoost.value = _demoHighlightBoost;
                shader.uniforms.uHoverRadius.value = 0.12;
            }
        } else if (phase === 'arrived') {
            _demoHighlightNode = index;
            _demoHighlightBoost = 1.65;
            if (typeof triggerSearchHeroMoment === 'function') {
                triggerSearchHeroMoment(index);
            }
        } else if (phase === 'cleanup' || phase === 'wide_view') {
            _demoHighlightNode = null;
            _demoHighlightBoost = 1.0;
            shader.uniforms.uHoverBoost.value = 1.0;
        }
    };

    _onDemoNamePulse = () => {
        const nameEl = document.querySelector('#info-panel h2') as HTMLElement | null;
        if (nameEl) {
            nameEl.style.transition = 'text-shadow 0.4s ease, color 0.4s ease';
            nameEl.style.color = '#fff';
            nameEl.style.textShadow = '0 0 12px rgba(78, 205, 196, 0.8)';
            setTimeout(() => {
                nameEl.style.color = '';
                nameEl.style.textShadow = '';
            }, 600);
        }
    };

    document.addEventListener('micro-demo-node-highlight', _onDemoNodeHighlight as EventListener);
    document.addEventListener('micro-demo-name-pulse', _onDemoNamePulse as EventListener);
}
