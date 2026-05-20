import { state } from '../state.js';

/**
 * Phase 3: Generative Audio Scape (Reactive)
 * Uses Web Audio API to create a low-amplitude 'data hum' 
 * that reacts to camera velocity and local mycelium density.
 */

let audioCtx = null;
let mainOsc = null;
let gainNode = null;
let filterNode = null;

let lastCameraPos = null;
let currentVelocity = 0;
let smoothVelocity = 0;

export function initAudio() {
    if (audioCtx) return;
    if (navigator.webdriver) return;

    // Start context on user interaction
    const startEvents = ['mousedown', 'keydown', 'touchstart'];
    startEvents.forEach(evt => {
        document.addEventListener(evt, startAudioContext, { once: true });
    });
}

function startAudioContext() {
    if (audioCtx) return;

    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        mainOsc = audioCtx.createOscillator();
        mainOsc.type = 'sine';
        mainOsc.frequency.setValueAtTime(55, audioCtx.currentTime); // Low A

        gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);

        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(200, audioCtx.currentTime);

        mainOsc.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        mainOsc.start();

        console.warn('[audio] Reactive scape initialized.');
        requestAnimationFrame(updateAudio);
    } catch (e) {
        console.warn('[audio] Web Audio API initialization failed.', e);
    }
}

function updateAudio() {
    if (!audioCtx || audioCtx.state === 'closed') return;
    if (!state.camera) {
        requestAnimationFrame(updateAudio);
        return;
    }

    // 1. Calculate Camera Velocity
    const currentPos = state.camera.position.clone();
    if (lastCameraPos) {
        const dist = currentPos.distanceTo(lastCameraPos);
        currentVelocity = Number.isFinite(dist) ? dist * 60 : 0; // Normalize to approx units/sec
    }
    lastCameraPos = currentPos;

    // Smooth velocity to avoid audio pops
    // Guard: ensure smoothVelocity never becomes NaN/Infinity
    if (!Number.isFinite(smoothVelocity)) smoothVelocity = 0;
    smoothVelocity += (currentVelocity - smoothVelocity) * 0.1;
    if (!Number.isFinite(smoothVelocity)) smoothVelocity = 0;

    // 2. Base Density & Path Proximity
    let density = 0.3;
    let pathProximity = 0; // 0 (far) to 1 (near)
    let clusterFreqOffset = 0;

    if (state.navState?.focusedIndex !== null) {
        density = 0.7;
        if (state.semanticDiveMode) density = 0.9;
        
        // Audio Symphony: Cluster-based frequency shift (Phase 3 refinement)
        const point = state.points[state.navState.focusedIndex];
        if (point && typeof point.cluster === 'number') {
            clusterFreqOffset = (point.cluster % 12) * 12;
        }
    }

    // Path Proximity (Phase 3)
    if (state.navState?.activeRoutePath?.length > 0 && state.pointIndexByLeadId) {
        let minDist = Infinity;
        state.navState.activeRoutePath.forEach(id => {
            const idx = state.pointIndexByLeadId.get(String(id));
            if (idx !== undefined && state.points[idx]) {
                const p = state.points[idx];
                const d = currentPos.distanceTo({ x: p.x, y: p.y, z: p.z });
                if (d < minDist) minDist = d;
            }
        });
        pathProximity = Math.max(0, 1 - (minDist / 2.0));
    }

    // 3. Map to Audio Parameters
    const baseFreq = 55 + clusterFreqOffset;
    const freqMod = (smoothVelocity * 50) + (density * 20) + (pathProximity * 110);
    const rawTargetFreq = baseFreq + freqMod;
    const targetFreq = Number.isFinite(rawTargetFreq) ? rawTargetFreq : 55;

    const baseGain = 0.005;
    const gainMod = (smoothVelocity * 0.02) + (density * 0.01) + (pathProximity * 0.03);
    const rawTargetGain = Math.min(0.06, baseGain + gainMod);
    const targetGain = Number.isFinite(rawTargetGain) ? rawTargetGain : 0.005;

    const rawTargetFilter = 150 + (density * 400) + (smoothVelocity * 200) + (pathProximity * 800);
    const targetFilter = Number.isFinite(rawTargetFilter) ? rawTargetFilter : 200;

    mainOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);
    gainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.1);
    filterNode.frequency.setTargetAtTime(targetFilter, audioCtx.currentTime, 0.1);

    requestAnimationFrame(updateAudio);
}

export function setAudioMuted(muted) {
    if (!gainNode || !audioCtx) return;
    gainNode.gain.setTargetAtTime(muted ? 0 : 0.01, audioCtx.currentTime, 0.2);
}

/**
 * 10/10 Polish: High-frequency 'shimmer' sound for corridor animations.
 */
export function triggerCorridorBloom() {
    if (!audioCtx || audioCtx.state === 'suspended') return;

    try {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();

        osc.type = 'sine';
        const freqWithRandom = 880 + Math.random() * 440;
        osc.frequency.setValueAtTime(freqWithRandom, audioCtx.currentTime);
        const endFreqWithRandom = 1760 + Math.random() * 880;
        osc.frequency.exponentialRampToValueAtTime(endFreqWithRandom, audioCtx.currentTime + 0.4);

        g.gain.setValueAtTime(0, audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0.012, audioCtx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8);

        osc.connect(g);
        g.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.8);
    } catch {
        // Silent fail for transient audio
    }
}

/**
 * Trigger a named sound effect.
 * @param {string} name - The name of the sound effect to trigger.
 */
export function trigger(name) {
    if (name === 'corridor-bloom') {
        triggerCorridorBloom();
    }
}

export const play = trigger;

window.triggerCorridorBloom = triggerCorridorBloom;
window.triggerAudio = trigger;
window.playAudio = play;
