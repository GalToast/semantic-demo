// js/modules/focus-anchor-indicator.js
//
// Focus anchor visual treatment.
//
// Why this module exists:
//   The product premise is "see the network around this business" — but the
//   focused anchor itself was lost in the dense cloud.  Other Three.js
//   collections (state.focusCore / state.focusHalo / focusPetals) are
//   referenced from three-interaction-visuals but never instantiated, so
//   focusing a node produced no visual indicator of which business the user
//   had actually selected.
//
// Cues chosen (3, combined so a single cue cannot get lost in the cloud):
//   1. SIZE   — the focused spore instance scales up to ~2.4× its neighbors
//               (see bump in three-node-manager.getNodeSporeScale).
//   2. RING   — a dedicated ring sprite + a static ring mesh that sits
//               slightly above the focused node's world position so the
//               halo is always above neighboring dots.
//   3. PULSE  — gentle 1.0 → 1.12× scale + 0.6 → 0.95 opacity breathing on
//               the ring sprite, with frequency 0.7 Hz.  Disabled (the
//               ring just sits at full opacity, no breathing) when
//               prefers-reduced-motion: reduce is on — size + ring alone
//               remain.
//
// Why a Three.js Group, not a DOM overlay:
//   CSS classes / DOM transforms can't reach a Three.js mesh; the
//   "is-anchor" tag is therefore stored on userData.isAnchor so it acts as
//   a class for any consumer that needs to query the indicator.

import * as THREE from 'three';
import { state } from '../state.js';
import { prefersReducedMotion } from './environment.js';

const RING_BASE_SCALE = 0.13;          // ring sprite world-space scale
const RING_OUTER_RADIUS = 0.085;        // static ring mesh radius
const RING_OUTER_THICKNESS = 0.0085;    // line thickness proxy
const PULSE_FREQUENCY_HZ = 0.7;         // full inhale / exhale per ~1.4s
const PULSE_AMPLITUDE = 0.12;           // 1.0 -> 1.12
const OPACITY_CEIL = 0.95;
const FADE_RATE = 0.12;                 // exponential approach per frame

let _initialized = false;

export function createFocusAnchorIndicator() {
    if (_initialized) return;
    if (!state.scene) return;
    _initialized = true;

    const group = new THREE.Group();
    group.name = 'focus-anchor-indicator';
    group.userData.isAnchor = true;
    group.userData.kind = 'focus-anchor-group';
    group.renderOrder = 4;
    group.visible = false;
    state.scene.add(group);
    state.focusAnchorGroup = group;

    // 1. Static ring mesh (always at full opacity when visible) — a clear
    //    geometric halo that won't disappear if the pulse is disabled.
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

    // 2. Soft sprite halo using the existing focusRingTexture.  Carries
    //    the pulse animation.  This is the secondary cue that breathes.
    const spriteMat = new THREE.SpriteMaterial({
        map: state.focusRingTexture || state.focusBeaconTexture || null,
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
 *
 * @param {number} now   performance.now() in ms
 * @param {number|null} focusedNode   index in state.points, or null
 * @returns {boolean} true when the indicator is currently visible
 */
export function updateFocusAnchorIndicator(now, focusedNode) {
    if (!_initialized) return false;
    const group = state.focusAnchorGroup;
    const ringMesh = state.focusAnchorRingMesh;
    const haloSprite = state.focusAnchorHaloSprite;
    if (!group || !ringMesh || !haloSprite) return false;

    const hasFocus = Number.isFinite(focusedNode)
        && focusedNode >= 0
        && state.nodePositions?.[focusedNode];

    if (!hasFocus) {
        // Fade out, then hide once invisible.
        const currentOpacity = haloSprite.material.opacity;
        const nextOpacity = currentOpacity - FADE_RATE;
        if (nextOpacity <= 0.01) {
            haloSprite.material.opacity = 0;
            ringMesh.material.opacity = 0;
            group.visible = false;
            return false;
        }
        haloSprite.material.opacity = nextOpacity;
        ringMesh.material.opacity = nextOpacity * 0.85;
        return true;
    }

    // Position the indicator at the focused node's world location.
    const pos = state.nodePositions[focusedNode];
    const worldPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    if (state.pointsMesh?.localToWorld) {
        state.pointsMesh.localToWorld(worldPos);
    }
    group.position.copy(worldPos);
    // Sit the ring on the plane facing the camera (sprite handles facing,
    // but the mesh needs to billboard too).
    if (state.camera) {
        group.lookAt(state.camera.position);
    }
    group.visible = true;

    const reducedMotion = prefersReducedMotion();
    const time = now / 1000;

    // Halo sprite: opacity eases in, then breathes if motion is allowed.
    const fadeTarget = OPACITY_CEIL;
    haloSprite.material.opacity += (fadeTarget - haloSprite.material.opacity) * FADE_RATE;
    let spriteScale = RING_BASE_SCALE;
    if (!reducedMotion) {
        const pulse = Math.sin(time * Math.PI * 2 * PULSE_FREQUENCY_HZ);
        spriteScale = RING_BASE_SCALE * (1.0 + pulse * PULSE_AMPLITUDE);
    }
    haloSprite.scale.set(spriteScale, spriteScale, 1);

    // Static ring: counter-pulse subtly so the two cues don't move in
    // lockstep (motion appears more organic).  Hold full opacity in
    // reduced-motion mode.
    let ringScale = 1.0;
    let ringOpacity = 0.78;
    if (!reducedMotion) {
        const slowPulse = Math.sin(time * Math.PI * 2 * PULSE_FREQUENCY_HZ * 0.5 + 0.7);
        ringScale = 1.0 + slowPulse * 0.05;
    }
    ringMesh.scale.set(ringScale, ringScale, 1);
    ringMesh.material.opacity = ringOpacity;
    return true;
}

/**
 * Tear down the focus anchor indicator.  Called from the engine deinit
 * so re-init starts from a clean slate.
 */
export function disposeFocusAnchorIndicator() {
    if (!_initialized) return;
    if (state.focusAnchorGroup && state.scene) {
        state.scene.remove(state.focusAnchorGroup);
    }
    if (state.focusAnchorRingMesh) {
        state.focusAnchorRingMesh.geometry?.dispose?.();
        state.focusAnchorRingMesh.material?.dispose?.();
    }
    if (state.focusAnchorHaloSprite) {
        state.focusAnchorHaloSprite.material?.dispose?.();
    }
    state.focusAnchorGroup = null;
    state.focusAnchorRingMesh = null;
    state.focusAnchorHaloSprite = null;
    _initialized = false;
}
