/**
 * design-tokens.ts
 *
 * JS-facing visual tokens.
 *
 * CSS root tokens remain owned by css/base.css. This module only centralizes
 * values needed by JavaScript/WebGL so refactors do not silently change color.
 */

export const SCENE_PALETTE = Object.freeze({
    fog: 0x070a12,
    sporeLift: 0xbffdf4,
    threadTint: 0x4ecdc4
});

export const CORRIDOR_TRAIL_SHADER_COLORS = Object.freeze({
    teal: '0.43, 1.0, 0.91',
    ember: '0.74, 0.86, 0.68'
});

export const ROUTE_TRACE_COLORS = Object.freeze({
    route: 0x4ecdc4,
    cue: 0xffdf6e
});

export const FOCUS_SEMANTIC_COLORS = Object.freeze({
    focusLerp: 0xffd66b,
    cue: 0xffe27a,
    candidate: 0x56d8d1
});

export const CLUSTER_COLORS = Object.freeze([
    '#4ecdc4', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8c42', '#a66cff', '#ff6b9d',
    '#45b7d1', '#96ceb4', '#ffeaa7', '#74b9ff', '#fd79a8', '#00b894', '#e17055', '#a29bfe',
    '#fdcb6e', '#e84393', '#00cec9', '#6c5ce7', '#fab1a0', '#81ecec', '#55efc4', '#ffeaa7',
    '#dfe6e9', '#ff7675', '#fd79a8', '#00b894', '#e17055'
]);
