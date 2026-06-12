// focus-anchor-indicator.ts
// TypeScript shadow of focus-anchor-indicator.js
// Focus anchor visual treatment: ring + pulse + size cues.

import * as THREE from 'three';
import { state } from '../state.ts';
import { prefersReducedMotion } from './environment.ts';

const RING_BASE_SCALE = 0.13;
const RING_OUTER_RADIUS = 0.085;
const RING_OUTER_THICKNESS = 0.0085;
const PULSE_FREQUENCY_HZ = 0.7;
const PULSE_AMPLITUDE = 0.12;
const OPACITY_CEIL = 0.95;
const FADE_RATE = 0.12;

let _initialized = false;

/**
 * Procedural soft radial glow — no external texture dependency.
 */
function createGlowTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0.0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

export function createFocusAnchorIndicator(): void {
    if (_initialized) return;
    if (!state.scene) return;
    _initialized = true;

    const group = new THREE.Group();
    group.name = 'focus-anchor-indicator';
    group.userData.isAnchor = true;
    group.userData.kind = 'focus-anchor-group';
    group.renderOrder = 4;
    group.visible = false;
    state.scene!.add(group);
    state.focusAnchorGroup = group;

    const ringGeo = new THREE.RingGeometry(
        RING_OUTER_RADIUS - RING_OUTER_THICKNESS,
        RING_OUTER_RADIUS,
        64
    );
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfff4ba,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.name = 'focus-anchor-ring-mesh';
    ringMesh.userData.isAnchor = true;
    ringMesh.userData.kind = 'focus-anchor-ring-static';
    ringMesh.renderOrder = 4;
    group.add(ringMesh);
    state.focusAnchorRingMesh = ringMesh;

    const glowTexture = createGlowTexture();
    const spriteMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x8ff8ed,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
    const haloSprite = new THREE.Sprite(spriteMat);
    haloSprite.name = 'focus-anchor-halo-sprite';
    haloSprite.userData.isAnchor = true;
    haloSprite.userData.kind = 'focus-anchor-halo-pulse';
    haloSprite.scale.set(RING_BASE_SCALE, RING_BASE_SCALE, 1);
    haloSprite.renderOrder = 5;
    group.add(haloSprite);
    state.focusAnchorHaloSprite = haloSprite;
}

/**
 * Updates the focus anchor indicator for the current frame.
 */
export function updateFocusAnchorIndicator(now: number, focusedNode: number | null): boolean {
    if (!_initialized) return false;
    const group = state.focusAnchorGroup as THREE.Group | null;
    const ringMesh = state.focusAnchorRingMesh as THREE.Mesh | null;
    const haloSprite = state.focusAnchorHaloSprite as THREE.Sprite | null;
    if (!group || !ringMesh || !haloSprite) return false;

    const hasFocus = Number.isFinite(focusedNode)
        && focusedNode! >= 0
        && state.nodePositions?.[focusedNode!];

    if (!hasFocus) {
        const currentOpacity = (haloSprite.material as THREE.SpriteMaterial).opacity;
        const nextOpacity = currentOpacity - FADE_RATE;
        if (nextOpacity <= 0.01) {
            (haloSprite.material as THREE.SpriteMaterial).opacity = 0;
            (ringMesh.material as THREE.MeshBasicMaterial).opacity = 0;
            group.visible = false;
            return false;
        }
        (haloSprite.material as THREE.SpriteMaterial).opacity = nextOpacity;
        (ringMesh.material as THREE.MeshBasicMaterial).opacity = nextOpacity * 0.85;
        return true;
    }

    const focusedIndex = focusedNode!;
    const pos = state.nodePositions[focusedIndex];
    if (!pos) return false;
    const worldPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    if (state.pointsMesh?.localToWorld) {
        state.pointsMesh.localToWorld(worldPos);
    }
    group.position.copy(worldPos);
    if (state.camera) {
        group.lookAt(new THREE.Vector3().copy(state.camera.position as THREE.Vector3));
    }
    group.visible = true;

    const reducedMotion = prefersReducedMotion();
    const time = now / 1000;

    const fadeTarget = OPACITY_CEIL;
    (haloSprite.material as THREE.SpriteMaterial).opacity += (fadeTarget - (haloSprite.material as THREE.SpriteMaterial).opacity) * FADE_RATE;
    let spriteScale = RING_BASE_SCALE;
    if (!reducedMotion) {
        const pulse = Math.sin(time * Math.PI * 2 * PULSE_FREQUENCY_HZ);
        spriteScale = RING_BASE_SCALE * (1.0 + pulse * PULSE_AMPLITUDE);
    }
    haloSprite.scale.set(spriteScale, spriteScale, 1);

    let ringScale = 1.0;
    const ringOpacity = 0.78;
    if (!reducedMotion) {
        const slowPulse = Math.sin(time * Math.PI * 2 * PULSE_FREQUENCY_HZ * 0.5 + 0.7);
        ringScale = 1.0 + slowPulse * 0.05;
    }
    ringMesh.scale.set(ringScale, ringScale, 1);
    (ringMesh.material as THREE.MeshBasicMaterial).opacity = ringOpacity;
    return true;
}

/**
 * Tear down the focus anchor indicator.
 */
export function disposeFocusAnchorIndicator(): void {
    if (!_initialized) return;
    if (state.focusAnchorGroup && state.scene) {
        state.scene.remove(state.focusAnchorGroup);
    }
    if (state.focusAnchorRingMesh) {
        const ringMesh = state.focusAnchorRingMesh as THREE.Mesh;
        const material = ringMesh.material as THREE.Material | THREE.Material[] | undefined;
        ringMesh.geometry?.dispose();
        if (material && !Array.isArray(material)) material.dispose();
    }
    if (state.focusAnchorHaloSprite) {
        const haloMat = (state.focusAnchorHaloSprite as THREE.Sprite).material as THREE.SpriteMaterial;
        if (haloMat.map) {
            haloMat.map.dispose();
            haloMat.map = null;
        }
        haloMat.dispose();
    }
    state.focusAnchorGroup = null;
    state.focusAnchorRingMesh = null;
    state.focusAnchorHaloSprite = null;
    _initialized = false;
}
