'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

globalThis.document = {
  body: { dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } } },
  createElement() { return { dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } }, style: {} }; },
  querySelector() { return null; },
  getElementById() { return null; },
};

globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  __DEBUG_PROBES__: false,
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  performance: { now: () => 0 },
};
globalThis.performance = globalThis.window.performance;
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;

const { getFocusConstellationViewportProfile } = await import('../js/modules/focus-pocket.js');

function profileFor(width, height) {
  globalThis.window.innerWidth = width;
  globalThis.window.innerHeight = height;
  return getFocusConstellationViewportProfile();
}

function assertProfileShape(profile, label) {
  [
    'primaryLimit',
    'supportLimit',
    'haloLimit',
    'primaryRadiusScale',
    'supportRadiusScale',
    'haloRadiusScale',
    'primarySpreadScale',
    'supportSpreadScale',
    'haloSpreadScale',
    'zScale',
    'beaconLimit',
    'overlayLimit',
    'supportSeedLimit',
    'supportNeighborLimit',
  ].forEach((key) => assert(Number.isFinite(profile[key]) && profile[key] > 0, `${label}: ${key} must be positive`));
}

const roomy = profileFor(1440, 900);
const compact = profileFor(390, 844);
const condensed = profileFor(390, 520);

assert(roomy.key === 'roomy', `desktop viewport should be roomy, got ${roomy.key}`);
assert(compact.key === 'compact', `tall mobile viewport should be compact, got ${compact.key}`);
assert(condensed.key === 'condensed', `short mobile viewport should be condensed, got ${condensed.key}`);

assertProfileShape(roomy, 'roomy');
assertProfileShape(compact, 'compact');
assertProfileShape(condensed, 'condensed');

assert(roomy.primaryLimit > compact.primaryLimit, 'roomy should allow more primary nodes than compact');
assert(compact.primaryLimit > condensed.primaryLimit, 'compact should allow more primary nodes than condensed');
assert(roomy.haloLimit > compact.haloLimit, 'roomy should allow more halo nodes than compact');
assert(compact.haloLimit > condensed.haloLimit, 'compact should allow more halo nodes than condensed');
assert(condensed.cameraDistanceMax < compact.cameraDistanceMax, 'condensed camera distance should be tighter than compact');
assert(condensed.targetOffsetLimit <= compact.targetOffsetLimit, 'condensed target offset should not exceed compact');

console.log('PASS journey-focus-constellation-viewport-contract');
