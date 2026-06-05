import { webglContext } from './webgl-context.js';
import * as THREE from 'three';
import { state as _state } from '../state.js';
const state = _state as any;
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { disposeObject3D } from './resource-tracker.js';
import { triggerCorridorBloom } from './audio-scape.js';

// ── Constants ───────────────────────────────────────────────────────────────

const CORRIDOR_NODE_BOOST = 1.18;
const CORRIDOR_NODE_REDUCED_BOOST = 1.06;
const CORRIDOR_NODE_FADE_DELAY = 480;
const CORRIDOR_NODE_FADE_DURATION = 900;
const CORRIDOR_NODE_REDUCED_FADE_DELAY = 0;
const CORRIDOR_NODE_REDUCED_FADE_DURATION = 260;

const CORRIDOR_SOFT_DRAW_DURATION = 950;
const CORRIDOR_SOFT_TOTAL_DURATION = 2800;

// ── Private State ───────────────────────────────────────────────────────────

let _corridorGlowToken = 0;
type CorridorGlowNodeState = {
    startedAt: number;
    fadeStartDelay: number;
    fadeDuration: number;
    targetBoost: number;
};
const _corridorGlowNodes: Record<number, CorridorGlowNodeState | number | null> = {};

let _corridorAnimState: any = null;
let _corridorAnimStartTime: any = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a bezier-approximated corridor path from anchor to a target point.
 * Returns an array of Vector3 positions along the curve.
 */
function getCorridorPathPoints(anchorPos: any, targetPos: any, segments = 20) {
    const points: any[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Slight arch upward in Y for the corridor feel
        const x = anchorPos.x + (targetPos.x - anchorPos.x) * t;
        const y = anchorPos.y + (targetPos.y - anchorPos.y) * t + Math.sin(t * Math.PI) * 0.04;
        const z = anchorPos.z + (targetPos.z - anchorPos.z) * t;
        points.push(new THREE.Vector3(x, y, z));
    }
    return points;
}

/**
 * Builds corridor line geometry using LineGeometry for thick strands.
 * Each segment carries a progress value used by the shader to clip un-drawn parts.
 */
function buildCorridorLineGeometry(anchorIndex: number, routeIndices: number[]) {
    const anchorPos = state.nodePositions[anchorIndex];
    if (!anchorPos) return null;

    const targetIndices = (routeIndices || [])
        .filter((i: number) => Number.isFinite(i) && i !== anchorIndex)
        .slice(0, 12);

    if (targetIndices.length === 0) return null;

    const SEGMENTS = 24;
    const positions: any[] = [];
    const colors: any[] = [];

    targetIndices.forEach((targetIdx: number) => {
        const targetPos = state.nodePositions[targetIdx];
        if (!targetPos) return;
        const pathPoints = getCorridorPathPoints(anchorPos, targetPos, SEGMENTS);

        // Build continuous path for LineGeometry
        for (let s = 0; s <= SEGMENTS; s++) {
            const p = pathPoints[s];
            const t = s / SEGMENTS;
            positions.push(p.x, p.y, p.z);
            colors.push(0.42 + (0.74 - 0.42) * t, 0.92 + (0.86 - 0.92) * t, 0.88 + (0.68 - 0.88) * t);
        }
    });

    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);

    const segmentCount = targetIndices.length * SEGMENTS;
    const progressArr = new Float32Array(segmentCount);
    for (let i = 0; i < targetIndices.length; i++) {
        for (let s = 0; s < SEGMENTS; s++) {
            progressArr[i * SEGMENTS + s] = s / SEGMENTS;
        }
    }
    geometry.setAttribute('instanceProgress', new THREE.InstancedBufferAttribute(progressArr, 1));

    return geometry;
}

/**
 * Builds the particle trail geometry — sparse particles that flow along each corridor path.
 */
function buildCorridorParticleTrail(anchorIndex: number, routeIndices: number[]) {
    const anchorPos = state.nodePositions[anchorIndex];
    if (!anchorPos) return null;

    const targetIndices = (routeIndices || [])
        .filter((i: number) => Number.isFinite(i) && i !== anchorIndex)
        .slice(0, 12);

    if (targetIndices.length === 0) return null;

    const PARTICLE_COUNT = 36;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const progressValues = new Float32Array(PARTICLE_COUNT);
    const lifetimes = new Float32Array(PARTICLE_COUNT);
    const segmentOffsets = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);

    let pIdx = 0;
    targetIndices.forEach((targetIdx: number) => {
        const targetPos = state.nodePositions[targetIdx];
        if (!targetPos) return;
        const pathPoints = getCorridorPathPoints(anchorPos, targetPos, 24);
        const particlesForPath = Math.floor(PARTICLE_COUNT / Math.max(targetIndices.length, 1));

        for (let p = 0; p < particlesForPath && pIdx < PARTICLE_COUNT; p++, pIdx++) {
            const baseProgress = (p / particlesForPath);
            const offset = (Math.random() - 0.5) * 0.08;
            const segIdx = Math.min(Math.floor(baseProgress * (pathPoints.length - 1)), pathPoints.length - 1);
            const pt = pathPoints[segIdx];

            positions[pIdx * 3] = pt.x + offset;
            positions[pIdx * 3 + 1] = pt.y + offset * 0.5;
            positions[pIdx * 3 + 2] = pt.z + offset;

            progressValues[pIdx] = baseProgress;
            lifetimes[pIdx] = 0.5 + Math.random() * 0.5;
            segmentOffsets[pIdx] = offset;
            speeds[pIdx] = 0.3 + Math.random() * 0.7;
        }
    });

    for (let i = pIdx; i < PARTICLE_COUNT; i++) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = -9999;
        positions[i * 3 + 2] = 0;
        progressValues[i] = 1.0;
        lifetimes[i] = 0;
        segmentOffsets[i] = 0;
        speeds[i] = 1.0;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('aProgress', new THREE.BufferAttribute(progressValues, 1));
    particleGeometry.setAttribute('aLifetime', new THREE.BufferAttribute(lifetimes, 1));
    particleGeometry.setAttribute('aOffset', new THREE.BufferAttribute(segmentOffsets, 1));
    particleGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    const particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uDrawProgress: { value: 0 },
            uFadeOpacity: { value: 1.0 }
        },
        vertexShader: `
            attribute float aProgress;
            attribute float aLifetime;
            attribute float aOffset;
            attribute float aSpeed;
            uniform float uTime;
            uniform float uDrawProgress;
            uniform float uFadeOpacity;
            varying float vAlpha;
            varying float vProgress;

            void main() {
                float particleT = clamp((uDrawProgress - aProgress * 0.5) / max(aLifetime, 0.001), 0.0, 1.0);
                vProgress = particleT;
                vAlpha = smoothstep(0.0, 0.15, particleT) * smoothstep(1.0, 0.7, particleT);

                vec3 pos = position;
                pos.x += sin(uTime * 3.0 + aOffset * 20.0) * 0.006;
                pos.y += cos(uTime * 2.5 + aOffset * 15.0) * 0.004;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = (1.4 + aSpeed * 0.9) * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vAlpha;
            varying float vProgress;
            uniform float uFadeOpacity;

            void main() {
                vec2 gl_PointCoord_centered = gl_PointCoord - 0.5;
                float dist = length(gl_PointCoord_centered);
                if (dist > 0.5) discard;
                float alpha = (1.0 - dist * 2.0) * vAlpha * 0.34 * uFadeOpacity;
                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 ember = vec3(0.74, 0.86, 0.68);
                vec3 color = mix(teal, ember, vProgress);
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.frustumCulled = false;
    return particles;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function triggerSearchHeroMoment(anchorIndex: any) {
    if (!webglContext.pointsMaterial || !webglContext.pointsMaterial.userData.shader || !state.nodePositions) return;
    const shader = webglContext.pointsMaterial.userData.shader;

    if (Number.isFinite(anchorIndex) && state.nodePositions[anchorIndex]) {
        const pos = state.nodePositions[anchorIndex];
        shader.uniforms.uRippleCenter.value.set(pos.x, pos.y, pos.z);
    } else {
        shader.uniforms.uRippleCenter.value.set(0, 0, 0);
    }

    shader.uniforms.uRippleTime.value = 0.0;

    const duration = 2400;
    const startTime = performance.now();

    function animateHero(now: any) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1.0);

        if (webglContext.pointsMaterial && webglContext.pointsMaterial.userData.shader) {
            const currentShader = webglContext.pointsMaterial.userData.shader;
            currentShader.uniforms.uRippleTime.value = progress * 15.0;

            const bloom = Math.sin(progress * Math.PI);
            currentShader.uniforms.uGlowIntensity.value = bloom * 3.0;
        }

        if (progress < 1.0) {
            requestAnimationFrame(animateHero);
        } else if (webglContext.pointsMaterial && webglContext.pointsMaterial.userData.shader) {
            webglContext.pointsMaterial.userData.shader.uniforms.uGlowIntensity.value = 0.0;
            webglContext.pointsMaterial.userData.shader.uniforms.uRippleTime.value = -1000.0;
        }
    }

    requestAnimationFrame(animateHero);
}

export function triggerCorridorNodeGlow(anchorIndex: any, routeIndices: number[] = []) {
    if (!webglContext.pointsMaterial?.userData?.shader || !state.nodePositions) return;
    const shader = webglContext.pointsMaterial.userData.shader;
    
    // Clear any in-progress glow from a previous call
    for (const k of Object.keys(_corridorGlowNodes)) { delete _corridorGlowNodes[Number(k)]; }
    
    const allIndices = [...new Set([anchorIndex, ...(routeIndices || [])])].filter((i: any): i is number => Number.isFinite(i));
    const reduceMotion = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    const targetBoost = reduceMotion ? CORRIDOR_NODE_REDUCED_BOOST : CORRIDOR_NODE_BOOST;
    const fadeStartDelay = reduceMotion ? CORRIDOR_NODE_REDUCED_FADE_DELAY : CORRIDOR_NODE_FADE_DELAY;
    const fadeDuration = reduceMotion ? CORRIDOR_NODE_REDUCED_FADE_DURATION : CORRIDOR_NODE_FADE_DURATION;
    const token = ++_corridorGlowToken;

    allIndices.forEach((idx: number, order: number) => {
        const delay = idx === anchorIndex ? 0 : 80 + order * 40;
        setTimeout(() => {
            if (token !== _corridorGlowToken) return;
            if (!state.nodePositions[idx]) return;

            const pos = state.nodePositions[idx];
            shader.uniforms.uHoverNodePos.value.set(pos.x, pos.y, pos.z);
            
            _corridorGlowNodes[idx] = {
                startedAt: performance.now(),
                fadeStartDelay,
                fadeDuration,
                targetBoost
            };
            shader.uniforms.uHoverBoost.value = targetBoost;

            setTimeout(() => {
                if (token !== _corridorGlowToken) return;
                _corridorGlowNodes[idx] = null;
            }, fadeStartDelay + fadeDuration);
        }, delay);
    });
}

export function updateCorridorNodeGlow(frameNow: any) {
    if (!webglContext.pointsMaterial?.userData?.shader) return false;
    const shader = webglContext.pointsMaterial.userData.shader;
    let anyActive = false;
    for (const idx of Object.keys(_corridorGlowNodes)) {
        const key = Number(idx);
        const glowState = _corridorGlowNodes[key];
        if (!glowState) continue;
        const startedAt = typeof glowState === 'number' ? glowState : glowState.startedAt;
        const fadeStartDelay = typeof glowState === 'number' ? CORRIDOR_NODE_FADE_DELAY : glowState.fadeStartDelay;
        const fadeDuration = typeof glowState === 'number' ? CORRIDOR_NODE_FADE_DURATION : glowState.fadeDuration;
        const targetBoost = typeof glowState === 'number' ? CORRIDOR_NODE_BOOST : glowState.targetBoost;
        const elapsed = frameNow - startedAt;
        if (elapsed > fadeStartDelay) {
            const fadeProgress = Math.min((elapsed - fadeStartDelay) / fadeDuration, 1);
            const boost = 1.0 + (targetBoost - 1.0) * (1.0 - fadeProgress);
            shader.uniforms.uHoverBoost.value = boost;
            if (fadeProgress >= 1.0) {
                _corridorGlowNodes[key] = null;
            } else {
                anyActive = true;
            }
        } else {
            anyActive = true;
        }
    }
    return anyActive;
}

export function triggerSearchCorridorAnimation(anchorIndex: any, routeIndices: number[] = []) {
    disposeSearchCorridorAnimation();
    const reduceMotion = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    triggerCorridorBloom();
    if (!webglContext.scene) return;

    const lineGeometry = buildCorridorLineGeometry(anchorIndex, routeIndices);
    if (!lineGeometry) return;

    const lineMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uDrawProgress: { value: 0.0 },
            uFadeOpacity: { value: 1.0 },
            uTime: { value: 0 }
        },
        vertexShader: `
            attribute float progress;
            varying float vProgress;
            varying vec3 vColor;
            uniform float uDrawProgress;
            uniform float uTime;

            void main() {
                vProgress = progress;
                vColor = color;

                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                if (progress > uDrawProgress) {
                    mvPosition.xy = vec2(99999.0, 99999.0);
                }
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vProgress;
            varying vec3 vColor;
            uniform float uFadeOpacity;
            uniform float uTime;

            void main() {
                float tipFade = smoothstep(vProgress - 0.08, vProgress + 0.02, vProgress);
                float alpha = tipFade * 0.38 * uFadeOpacity;
                float pulse = 0.72 + sin(uTime * 1.8 + vProgress * 8.0) * 0.055;
                vec3 finalColor = vColor * pulse;
                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true
    });

    const corridorLine = new THREE.LineSegments(lineGeometry, lineMaterial);
    const particles = buildCorridorParticleTrail(anchorIndex, routeIndices);

    const corridorGroup = new THREE.Group();
    corridorGroup.name = 'search-corridor-hero';
    corridorGroup.add(corridorLine);
    if (particles) corridorGroup.add(particles);

    webglContext.scene.add(corridorGroup);
    state.searchCorridorGroup = corridorGroup;

    _corridorAnimStartTime = performance.now();
    _corridorAnimState = {
        anchorIndex,
        routeIndices,
        line: corridorLine,
        particles,
        material: lineMaterial,
        done: false
    };
}

export function updateSearchCorridorAnimation(frameNow: any) {
    if (!_corridorAnimState || !_corridorAnimState.line) return false;
    const st = _corridorAnimState;
    const elapsed = frameNow - _corridorAnimStartTime;

    const drawProgress = Math.min(elapsed / CORRIDOR_SOFT_DRAW_DURATION, 1.0);

    if (st.material?.uniforms) {
        st.material.uniforms.uDrawProgress.value = drawProgress;
        st.material.uniforms.uTime.value = frameNow / 1000;
    }

    if (st.particles?.material?.uniforms) {
        st.particles.material.uniforms.uDrawProgress.value = drawProgress;
        st.particles.material.uniforms.uTime.value = frameNow / 1000;
    }

    if (elapsed > CORRIDOR_SOFT_DRAW_DURATION) {
        const fadeProgress = Math.min(
            (elapsed - CORRIDOR_SOFT_DRAW_DURATION) / (CORRIDOR_SOFT_TOTAL_DURATION - CORRIDOR_SOFT_DRAW_DURATION),
            1.0
        );
        const lineOpacity = 1.0 - fadeProgress;
        if (st.material?.uniforms?.uFadeOpacity) st.material.uniforms.uFadeOpacity.value = lineOpacity;
        if (st.material) st.material.opacity = lineOpacity;
        if (st.particles?.material?.uniforms?.uFadeOpacity) st.particles.material.uniforms.uFadeOpacity.value = lineOpacity;
        if (st.particles?.material) st.particles.material.opacity = lineOpacity;
    }

    if (elapsed >= CORRIDOR_SOFT_TOTAL_DURATION) {
        disposeSearchCorridorAnimation();
        return false;
    }
    return true;
}

export function disposeSearchCorridorAnimation() {
    if (state.searchCorridorGroup) {
        if (webglContext.scene) webglContext.scene.remove(state.searchCorridorGroup);
        disposeObject3D(state.searchCorridorGroup);
        state.searchCorridorGroup = null;
    }
    _corridorAnimState = null;
    _corridorAnimStartTime = null;
}
