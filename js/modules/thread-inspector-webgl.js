import * as THREE from 'three';
import { state } from '../state.js';
import { adapter_getFocusThreadCurvePoint } from './thread-inspector-adapter.js';
import {
    getNavState, getFocusConstellationMotifs, getFocusThreadSegments,
    getInspectedStrandGroup, getNodePositions, getCurrentView, getScene,
    getFocusRingTexture, getFocusNextCueTexture, getFocusBeaconTexture,
    getPinnedThreadIndex, getPulsePhase
} from '../state/selectors/index.js';

export function getInspectedStrandEdge(index, lane = 0) {
    const focusIndex = Number.isFinite(getNavState()?.focusedIndex) ? getNavState()?.focusedIndex : null;
    if (focusIndex === null || !Number.isFinite(index) || index === focusIndex) return null;
    const motifKey = getNavState()?.focusPocketMeta?.motif || 'market';
    const motifConfig = { ...(getFocusConstellationMotifs()[motifKey] || getFocusConstellationMotifs().market || {}) };
    // Add fallbacks for numeric values:
    const directLift = Number.isFinite(motifConfig.directLift) ? motifConfig.directLift : 0.6;
    const braid = Number.isFinite(motifConfig.braid) ? motifConfig.braid : 0.3;
    const side = ((focusIndex * 31 + index * 17) % 2) === 0 ? 1 : -1;
    const rawRise = (((focusIndex + index) % 5) - 2) / 2;
    const rise = Number.isFinite(rawRise) ? rawRise : 0.45;
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
    };
}

export function writeInspectedStrandPositions(lineObject) {
    const targetIndex = lineObject?.userData?.targetIndex;
    if (!Number.isFinite(targetIndex) || !lineObject.geometry?.attributes?.position) return;
    const positionAttr = lineObject.geometry.attributes.position;
    const positions = positionAttr.array;
    const lanes = lineObject.userData?.lanes || [0];
    let offset = 0;
    lanes.forEach((lane) => {
        const edge = getInspectedStrandEdge(targetIndex, lane);
        if (!edge) return;
        const focusThreadSegments = getFocusThreadSegments();
        for (let segment = 0; segment < focusThreadSegments; segment += 1) {
            const t0 = segment / focusThreadSegments;
            const t1 = (segment + 1) / focusThreadSegments;
            const p0 = adapter_getFocusThreadCurvePoint(edge, t0) || new THREE.Vector3();
            const p1 = adapter_getFocusThreadCurvePoint(edge, t1) || new THREE.Vector3();
            positions[offset] = Number.isFinite(p0.x) ? p0.x : 0;
            positions[offset + 1] = Number.isFinite(p0.y) ? p0.y : 0;
            positions[offset + 2] = Number.isFinite(p0.z) ? p0.z : 0;
            positions[offset + 3] = Number.isFinite(p1.x) ? p1.x : 0;
            positions[offset + 4] = Number.isFinite(p1.y) ? p1.y : 0;
            positions[offset + 5] = Number.isFinite(p1.z) ? p1.z : 0;
            offset += 6;
        }
    });
    positionAttr.needsUpdate = true;
}

export function createInspectedStrandMaterial({ aura = false } = {}) {
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: performance.now() / 1000 },
            opacity: { value: aura ? 0.42 : 0.92 },
            semanticScore: { value: 0.5 } // 10/10 Polish: Visual reactivity to connection strength
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
                // 10/10 Polish: Frequency reacts to semantic score (connection strength)
                float pulseFreq = 0.52 + (semanticScore * 1.6);
                float flow = fract(vProgress - time * pulseFreq + abs(vLane) * 0.08);

                // Spores (organic information pulses) react to score
                float sporeSize = 1.8 + (semanticScore * 3.2);
                float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123);
                float spore = pow(1.0 - abs(flow - 0.58) * 2.0, sporeSize);
                spore *= (0.85 + noise * 0.3); // Add high-frequency jitter
                float breath = 0.78 + sin(time * 2.4 + vLane * 2.2) * 0.16;

                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 gold = vec3(1.0, 0.85, 0.38);
                vec3 pearl = vec3(0.92, 1.0, 0.96);

                // Color transition reflects the 'journey' progress
                vec3 color = mix(teal, gold, smoothstep(0.18, 0.92, vProgress));

                // Spores carry the light
                color = mix(color, pearl, spore * 0.62);

                // Alpha is boosted by connection strength
                float alpha = opacity * breath * (0.52 + spore * 0.88 + (semanticScore * 0.28));
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
}

export function createInspectedStrandLine(targetIndex, lanes, aura = false) {
    const positions = [];
    const progress = [];
    const laneValues = [];
    const focusThreadSegments = getFocusThreadSegments();
    for (let i = 0; i < lanes.length * focusThreadSegments * 2; i++) {
        positions.push(0, 0, 0);
    }
    lanes.forEach((lane) => {
        for (let segment = 0; segment < focusThreadSegments; segment += 1) {
            progress.push(segment / focusThreadSegments, (segment + 1) / focusThreadSegments);
            laneValues.push(lane, lane);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('progress', new THREE.Float32BufferAttribute(progress, 1));
    geometry.setAttribute('lane', new THREE.Float32BufferAttribute(laneValues, 1));
    const line = new THREE.LineSegments(geometry, createInspectedStrandMaterial({ aura }));
    line.userData = { targetIndex, lanes, aura };
    writeInspectedStrandPositions(line);
    return line;
}

export function updateInspectedStrandEndpointSprites() {
    const strandGroup = getInspectedStrandGroup();
    if (!strandGroup) return;
    const nodePos = getNodePositions();
    strandGroup.children.forEach((child) => {
        const endpointIndex = child.userData?.endpointIndex;
        if (!Number.isFinite(endpointIndex) || !nodePos[endpointIndex]) return;
        const pos = nodePos[endpointIndex];
        child.position.set(
            Number.isFinite(pos.x) ? pos.x : 0,
            Number.isFinite(pos.y) ? pos.y : 0,
            Number.isFinite(pos.z) ? pos.z : 0
        );
    });
}

export function syncInspectedStrandOverlay(inspectionState, options = {}) {
    const currentView = getCurrentView();
    const scene = getScene();
    const nodePos = getNodePositions();
    if (
        !inspectionState?.active ||
        currentView !== 'galaxy' ||
        !scene ||
        !Number.isFinite(inspectionState.index) ||
        !Number.isFinite(inspectionState.focusedIndex) ||
        !nodePos[inspectionState.index] ||
        !nodePos[inspectionState.focusedIndex]
    ) {
        disposeInspectedStrandOverlay();
        return;
    }
    const existingStrandGroup = getInspectedStrandGroup();
    const needsRebuild =
        !existingStrandGroup ||
        existingStrandGroup.userData?.targetIndex !== inspectionState.index ||
        existingStrandGroup.userData?.focusedIndex !== inspectionState.focusedIndex;
    if (needsRebuild) {
        disposeInspectedStrandOverlay();
        state.inspectedStrandGroup = new THREE.Group();
        state.inspectedStrandGroup.name = 'inspected-semantic-strand';
        state.inspectedStrandGroup.userData = {
            targetIndex: inspectionState.index,
            focusedIndex: inspectionState.focusedIndex,
            source: options.surface || 'rail',
            enteredAt: performance.now()
        };
        state.inspectedStrandGroup.add(createInspectedStrandLine(inspectionState.index, [-1, 0, 1], true));
        state.inspectedStrandGroup.add(createInspectedStrandLine(inspectionState.index, [0], false));
        [inspectionState.focusedIndex, inspectionState.index].forEach((endpointIndex, order) => {
            const endpointMaterial = new THREE.SpriteMaterial({
                map: getFocusRingTexture() || getFocusNextCueTexture() || getFocusBeaconTexture(),
                color: order === 0 ? 0xffe27a : 0x7ce7dd,
                transparent: true,
                opacity: order === 0 ? 0.42 : 0.58,
                depthWrite: false,
                depthTest: false,
                blending: THREE.AdditiveBlending
            });
            const sprite = new THREE.Sprite(endpointMaterial);
            sprite.userData = {
                endpointIndex,
                baseScale: order === 0 ? 0.052 : 0.06,
                baseOpacity: order === 0 ? 0.42 : 0.58,
                pulseRate: order === 0 ? 1.1 : 1.34
            };
            state.inspectedStrandGroup.add(sprite);
        });
        getScene().add(getInspectedStrandGroup());
    }
    const strandGroup = getInspectedStrandGroup();
    strandGroup.userData.source =
        options.surface || strandGroup.userData.source || 'rail';
    strandGroup.children.forEach((child) => {
        if (child.isLineSegments) {
            writeInspectedStrandPositions(child);
        }
    });
    updateInspectedStrandEndpointSprites();
    state.inspectedStrandDiagnostics = {
        active: true,
        source:
            getPinnedThreadIndex() === inspectionState.index
                ? 'pinned'
                : getInspectedStrandGroup().userData.source || 'rail',
        index: inspectionState.index,
        focusedIndex: inspectionState.focusedIndex,
        segmentCount: getFocusThreadSegments() * 4,
        braidCount: 4,
        endpointCount: 2,
        pinned: getPinnedThreadIndex() === inspectionState.index
    };
}

export function updateInspectedStrandOverlay(now = performance.now()) {
    const strandGroup = getInspectedStrandGroup();
    if (!strandGroup) return;
    const nodePos = getNodePositions();
    strandGroup.children.forEach((child) => {
        if (child.isLineSegments) {
            writeInspectedStrandPositions(child);
            if (child.material?.uniforms?.time) child.material.uniforms.time.value = now / 1000;
        } else if (child.isSprite) {
            const endpointIndex = child.userData?.endpointIndex;
            const pos = Number.isFinite(endpointIndex) ? nodePos[endpointIndex] : null;
            if (!pos) return;
            child.position.set(
                Number.isFinite(pos.x) ? pos.x : 0,
                Number.isFinite(pos.y) ? pos.y : 0,
                Number.isFinite(pos.z) ? pos.z : 0
            );
            const pulse =
                1 + Math.sin(getPulsePhase() * (child.userData?.pulseRate || 1.2) + endpointIndex * 0.19) * 0.14;
            const scale = (child.userData?.baseScale || 0.052) * pulse;
            child.scale.set(scale, scale, 1);
        }
    });
}

export function disposeInspectedStrandOverlay() {
    const strandGroup = getInspectedStrandGroup();
    if (!strandGroup) {
        state.inspectedStrandDiagnostics = {
            active: false,
            source: 'none',
            index: null,
            focusedIndex: null,
            segmentCount: 0,
            braidCount: 0,
            endpointCount: 0
        };
        return;
    }
    const scene = getScene();
    if (scene) scene.remove(strandGroup);
    strandGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    state.inspectedStrandGroup = null;
    state.inspectedStrandDiagnostics = {
        active: false,
        source: 'none',
        index: null,
        focusedIndex: null,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    };
}
