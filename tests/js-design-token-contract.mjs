// Native TS source of truth (src/lib/engine/design-tokens.ts) — the legacy
// js/modules design-token owner was retired during the Svelte cutover. This
// contract verifies that the native-TS tokens preserve all legacy visual
// values (frozen, color hex codes, vec3 shader strings, 29-entry cluster
// palette) so a future refactor cannot silently change product visuals.
import {
  CLUSTER_COLORS,
  CORRIDOR_TRAIL_SHADER_COLORS,
  FOCUS_SEMANTIC_COLORS,
  ROUTE_TRACE_COLORS,
  SCENE_PALETTE
} from '../src/lib/engine/design-tokens.ts';
import * as tokens from '../src/lib/engine/design-tokens.ts';

const legacyClusterColors = [
  '#4ecdc4', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8c42', '#a66cff', '#ff6b9d',
  '#45b7d1', '#96ceb4', '#ffeaa7', '#74b9ff', '#fd79a8', '#00b894', '#e17055', '#a29bfe',
  '#fdcb6e', '#e84393', '#00cec9', '#6c5ce7', '#fab1a0', '#81ecec', '#55efc4', '#ffeaa7',
  '#dfe6e9', '#ff7675', '#fd79a8', '#00b894', '#e17055'
];

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(!('injectDesignTokens' in tokens), 'JS tokens must not inject or mutate CSS custom properties');
assert(!('PALETTE' in tokens), 'Avoid broad PALETTE export; use explicit token groups to prevent accidental visual drift');

assert(Object.isFrozen(SCENE_PALETTE), 'SCENE_PALETTE must be frozen');
assert(SCENE_PALETTE.fog === 0x070a12, 'scene fog token must preserve existing fog color');
assert(SCENE_PALETTE.sporeLift === 0xbffdf4, 'spore lift token must preserve existing color');
assert(SCENE_PALETTE.threadTint === 0x4ecdc4, 'thread tint token must preserve existing color');

assert(Object.isFrozen(CORRIDOR_TRAIL_SHADER_COLORS), 'CORRIDOR_TRAIL_SHADER_COLORS must be frozen');
assert(CORRIDOR_TRAIL_SHADER_COLORS.teal === '0.43, 1.0, 0.91', 'corridor teal shader token must preserve existing vec3');
assert(CORRIDOR_TRAIL_SHADER_COLORS.ember === '0.74, 0.86, 0.68', 'corridor ember shader token must preserve existing vec3');

assert(Object.isFrozen(ROUTE_TRACE_COLORS), 'ROUTE_TRACE_COLORS must be frozen');
assert(ROUTE_TRACE_COLORS.route === 0x4ecdc4, 'route trace color token must preserve existing route color');
assert(ROUTE_TRACE_COLORS.cue === 0xffdf6e, 'route trace cue token must preserve existing cue color');

assert(Object.isFrozen(FOCUS_SEMANTIC_COLORS), 'FOCUS_SEMANTIC_COLORS must be frozen');
assert(FOCUS_SEMANTIC_COLORS.focusLerp === 0xffd66b, 'focus semantic lerp token must preserve existing focus color');
assert(FOCUS_SEMANTIC_COLORS.cue === 0xffe27a, 'focus semantic cue token must preserve existing cue color');
assert(FOCUS_SEMANTIC_COLORS.candidate === 0x56d8d1, 'focus semantic candidate token must preserve existing candidate color');

assert(Object.isFrozen(CLUSTER_COLORS), 'CLUSTER_COLORS must be frozen');
assert(CLUSTER_COLORS.length === legacyClusterColors.length, `cluster color count changed: ${CLUSTER_COLORS.length}`);
legacyClusterColors.forEach((expected, index) => {
  assert(CLUSTER_COLORS[index] === expected, `cluster color ${index} changed: expected ${expected}, got ${CLUSTER_COLORS[index]}`);
});

if (failures.length) {
  console.error('js-design-token-contract FAIL');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('js-design-token-contract OK: JS/WebGL tokens preserve existing visual values');
