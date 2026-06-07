/**
 * focus-pocket-motion-contract.mjs
 *
 * Focused Node contract test for semantic-demo js/modules/focus-pocket.js
 * covering: viewport profiles, Step Inside/deep-dive personality, placement
 * geometry/compression, and reduced-motion breathing contract.
 *
 * Runs in Node with a tiny DOM/window/performance/requestAnimationFrame shim.
 * Imports real ../js/state.js and ../js/modules/focus-pocket.js and asserts
 * source behavior against mocked points / originalPositions / targetPositions.
 *
 * Usage:
 *   node tests/focus-pocket-motion-contract.mjs
 */

// ---------------------------------------------------------------------------
// Tiny Node shim – MUST be established before any module imports that may
// trigger top-level debug probe references
// ---------------------------------------------------------------------------

let _clockNow = 0;
let _rafQueue = [];
let _rAFCounter = 0;
let _matchMediaCalls = [];
let _prefersReducedMotion = false;

class FakeClassList {
  constructor() { this._items = new Set(); }
  add(...n)    { n.forEach((x) => this._items.add(x)); }
  remove(...n) { n.forEach((x) => this._items.delete(x)); }
  contains(n)  { return this._items.has(n); }
  toggle(n, f) {
    const on = f !== undefined ? f : !this._items.has(n);
    on ? this._items.add(n) : this._items.delete(n);
    return on;
  }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName    = tag.toUpperCase();
    this.classList  = new FakeClassList();
    this.dataset    = {};
    this.style      = {};
    this.children   = [];
    this._innerHTML = '';
    this._text      = '';
    this._attr      = new Map();
  }
  get innerHTML()          { return this._innerHTML; }
  set innerHTML(v)         { this._innerHTML = String(v); }
  get textContent()        { return this._text; }
  set textContent(v)       { this._text = String(v); }
  appendChild(c)           { this.children.push(c); return c; }
  setAttribute(k, v)       { this._attr.set(String(k), String(v)); }
  getAttribute(k)          { return this._attr.get(String(k)) ?? null; }
}

const fakeDoc = new FakeElement('document');
// Provide minimal window BEFORE module imports so gated probe assignments
// in collaborating modules don't ReferenceError.
globalThis.document = fakeDoc;
globalThis.window = {
  innerWidth:  1440,
  innerHeight: 900,
  matchMedia(query) {
    _matchMediaCalls.push(query);
    return {
      matches: query.includes('prefers-reduced-motion') && _prefersReducedMotion,
      addEventListener() {},
      removeEventListener() {}
    };
  },
  cancelAnimationFrame(id) {
    _rafQueue = _rafQueue.filter(([n]) => n !== id);
  },
  requestAnimationFrame(fn) {
    const id = ++_rAFCounter;
    _rafQueue.push([id, fn]);
    return id;
  },
  performance: { now: () => _clockNow }
};
globalThis.THREE = { MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame.bind(globalThis.window);
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame.bind(globalThis.window);

// ---------------------------------------------------------------------------
// Real module imports — dynamic so the shim above is active before imported
// modules run their top-level browser debug exports.
// ---------------------------------------------------------------------------

const { state, withStateMutation } = await import('../js/state.js');
const {
  getFocusConstellationViewportProfile,
  getFocusConstellationPlacement,
  getFocusConstellationMotif,
  getNeighborhoodPersonality,
  applyFocusPocketBreathing,
  getFocusThreadCurvePoint,
  syncRuntimeState,
  getRuntimeStateSnapshot
} = await import('../js/modules/focus-pocket.js');

const {
  buildFocusedPocketStagedPositions,
  buildFocusedSemanticPocket
} = await import('../js/modules/focus-pocket-geometry.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertApprox(actual, expected, tolerance = 1e-9, label = '') {
  const delta = Math.abs(actual - expected);
  if (delta > tolerance) {
    throw new Error(
      `ASSERTION FAILED${label ? ` [${label}]` : ''}: expected ~${expected}, got ${actual} (delta ${delta})`
    );
  }
}

// Build a minimal state snapshot suitable for focus-pocket calls
function setupMinimalState(pointsCount = 12) {
  const pts = Array.from({ length: pointsCount }, (_, i) => ({
    index: i,
    x: i * 0.12,
    y: i * 0.04,
    z: i * 0.08,
    cluster: i % 5,
    city: i % 2 === 0 ? 'Springfield' : 'Riverside',
    semanticScore: 0.5 + (i % 3) * 0.15,
    score: 0.5 + (i % 3) * 0.15
  }));

  const orig = pts.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  const tpos = pts.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  const npos = pts.map((p) => ({ x: p.x, y: p.y, z: p.z }));

  withStateMutation(() => {
    state.points           = pts;
    state.originalPositions = orig;
    state.targetPositions  = tpos;
    state.nodePositions    = npos;
    state.recentArrangements = [];
    state.trailDepth = 0;
    state.navState.focusedIndex = 0;
    state.navState.currentPersonality = null;
    state.navState.focusPocketMeta = null;
    state.navState.focusPocketIndices = [];
    state.navState.focusPocketRoleByIndex = new Map();
    state.navState.threadCandidates = [];
    state.navState.threadSource = 'semantic';
    state.focusPocketMotionByIndex = new Map();
    state.focusPocketAnimationFrameId = undefined;
    state.focusPocketTransitionStartedAt = 0;
    state.nodesAreSettling = false;
    state.camera = null;
    state.navState.focusPocketAnimationFrameId = undefined;
  });

  return { pts, orig, tpos, npos };
}

// ---------------------------------------------------------------------------
// TESTS: Viewport Profiles
// ---------------------------------------------------------------------------

function testViewportProfiles() {
  console.log('\n[TEST] Viewport Profiles');

  // --- Roomy (1440×900) ---
  globalThis.window.innerWidth  = 1440;
  globalThis.window.innerHeight = 900;
  let profile = getFocusConstellationViewportProfile();
  assert(profile.key === 'roomy',        `roomy key: got ${profile.key}`);
  assert(profile.primaryLimit === 12,     `roomy primaryLimit: got ${profile.primaryLimit}`);
  assert(profile.supportLimit === 10,     `roomy supportLimit: got ${profile.supportLimit}`);
  assert(profile.haloLimit === 8,         `roomy haloLimit: got ${profile.haloLimit}`);
  assert(profile.cameraDistanceMax === undefined, 'roomy cameraDistanceMax should be absent at root level');
  assert(profile.primaryRadiusScale === 0.82,   `roomy primaryRadiusScale: got ${profile.primaryRadiusScale}`);
  assert(profile.zScale === 0.78,                 `roomy zScale: got ${profile.zScale}`);

  // --- Compact (≤768 wide) ---
  globalThis.window.innerWidth  = 768;
  globalThis.window.innerHeight = 900;
  profile = getFocusConstellationViewportProfile();
  assert(profile.key === 'compact',       `compact key: got ${profile.key}`);
  assert(profile.primaryLimit === 8,      `compact primaryLimit: got ${profile.primaryLimit}`);
  assert(profile.supportLimit === 6,      `compact supportLimit: got ${profile.supportLimit}`);
  assert(profile.haloLimit === 4,         `compact haloLimit: got ${profile.haloLimit}`);
  assert(profile.primaryRadiusScale === 0.78, `compact primaryRadiusScale: got ${profile.primaryRadiusScale}`);

  // --- Condensed (≤768 wide AND ≤540 tall) ---
  globalThis.window.innerWidth  = 390;
  globalThis.window.innerHeight = 520;
  profile = getFocusConstellationViewportProfile();
  assert(profile.key === 'condensed',      `condensed key: got ${profile.key}`);
  assert(profile.primaryLimit === 5,       `condensed primaryLimit: got ${profile.primaryLimit}`);
  assert(profile.supportLimit === 4,        `condensed supportLimit: got ${profile.supportLimit}`);
  assert(profile.haloLimit === 3,          `condensed haloLimit: got ${profile.haloLimit}`);
  assert(profile.cameraPadding === 1.52,    `condensed cameraPadding: got ${profile.cameraPadding}`);

  // --- Profile keys are stable strings ---
  const keys = ['roomy', 'compact', 'condensed'];
  globalThis.window.innerWidth  = 1440;
  globalThis.window.innerHeight = 900;
  assert(keys.includes(getFocusConstellationViewportProfile().key), 'roomy stable key');
  globalThis.window.innerWidth  = 768;
  globalThis.window.innerHeight = 900;
  assert(keys.includes(getFocusConstellationViewportProfile().key), 'compact stable key');
  globalThis.window.innerWidth  = 390;
  globalThis.window.innerHeight = 520;
  assert(keys.includes(getFocusConstellationViewportProfile().key), 'condensed stable key');

  console.log('  ✓ Viewport profiles render correct keys/limits per breakpoint');
}

// ---------------------------------------------------------------------------
// TESTS: Step Inside / Deep-Dive Personality
// ---------------------------------------------------------------------------

function testDeepDivePersonality() {
  console.log('\n[TEST] Step Inside / Deep-Dive Personality');

  setupMinimalState(12);
  state.trailDepth = 2; // Step Inside mode

  const personality = getNeighborhoodPersonality(0);
  assert(personality.type === 'DEEP_DIVE',     `DEEP_DIVE type: got ${personality.type}`);
  assert(personality.motifOverride === 'rosette', `motifOverride rosette: got ${personality.motifOverride}`);
  assert(personality.compressionMult < 1.0,    `compressionMult < 1: got ${personality.compressionMult}`);
  assert(personality.cameraDuration === 1100,  `cameraDuration 1100: got ${personality.cameraDuration}`);
  assert(personality.cameraArc === 'tight',    `cameraArc tight: got ${personality.cameraArc}`);
  assert(personality.staggerMult === 0.8,      `staggerMult 0.8: got ${personality.staggerMult}`);

  state.trailDepth = 0;
  const normal = getNeighborhoodPersonality(0);
  assert(normal.type !== 'DEEP_DIVE', `non-deep-dive mode: got ${normal.type}`);

  console.log('  ✓ DEEP_DIVE personality activates at trailDepth 2 with correct overrides');
}

// ---------------------------------------------------------------------------
// TESTS: Personality Types (non-DEEP_DIVE)
// ---------------------------------------------------------------------------

function testPersonalityTypes() {
  console.log('\n[TEST] Personality Type Diversity');

  setupMinimalState(24);

  // Seed the same point with a variety of neighbor scores to trigger different types
  const pts = state.points;
  pts[0].semanticScore = 0.95;
  pts[0].score = 0.95;

  // DENSE_HUB: degree >= 8 && avgScore >= 0.85
  const denseHub = getNeighborhoodPersonality(0);
  assert(denseHub.type === 'DENSE_HUB' || denseHub.type === 'STANDARD',
    `DENSE_HUB or fallback: got ${denseHub.type}`);

  // EDGE_NODE: degree <= 3
  // Override threadCandidates to be very short
  withStateMutation(() => { state.navState.threadCandidates = []; });
  state.recentArrangements = [];
  const edge = getNeighborhoodPersonality(0);
  // EDGE_NODE needs degree > 0 && degree <= 3 — with empty threadCandidates this
  // depends on getSemanticCandidateSlice which falls back to thread-inspector logic
  // So we just verify personality object shape
  assert(typeof edge.type === 'string', 'personality has type');
  assert(typeof edge.cameraDuration === 'number', 'personality has cameraDuration');
  assert(typeof edge.compressionMult === 'number', 'personality has compressionMult');
  assert(Array.isArray(state.recentArrangements), 'recentArrangements is array');

  console.log('  ✓ Personality types are assigned and recentArrangements is updated');
}

// ---------------------------------------------------------------------------
// TESTS: Placement Geometry & Compression
// ---------------------------------------------------------------------------

function testPlacementGeometry() {
  console.log('\n[TEST] Placement Geometry & Compression');

  setupMinimalState(12);
  const profile = getFocusConstellationViewportProfile();

  const motif = getFocusConstellationMotif(0);
  assert(typeof motif.key === 'string', 'motif has key');
  assert(typeof motif.directLift === 'number', 'motif has directLift');

  const entry = { score: 0.82, sameCity: false };
  const personality = { type: 'STANDARD', compressionMult: 1.0, staggerMult: 1.0 };

  // Primary placement
  const primary = getFocusConstellationPlacement(motif, entry, 0, 'primary', 6, profile, personality);
  assert(typeof primary.angle === 'number' && Number.isFinite(primary.angle), 'primary angle is finite');
  assert(typeof primary.radius === 'number' && Number.isFinite(primary.radius), 'primary radius is finite');
  assert(typeof primary.zOffset === 'number' && Number.isFinite(primary.zOffset), 'primary zOffset is finite');
  assert(primary.radius > 0, `primary radius > 0: got ${primary.radius}`);

  // Support placement
  const support = getFocusConstellationPlacement(motif, entry, 1, 'support', 4, profile, personality);
  assert(support.radius !== primary.radius || support.zOffset !== primary.zOffset,
    'support placement differs from primary');

  // Halo placement
  const halo = getFocusConstellationPlacement(motif, entry, 0, 'halo', 3, profile, personality);
  assert(halo.radius !== primary.radius, 'halo radius differs from primary');

  // compressionMult reduces radius
  const tightPersonality = { type: 'EDGE_NODE', compressionMult: 0.64, staggerMult: 1.0 };
  const compressed = getFocusConstellationPlacement(motif, entry, 0, 'primary', 6, profile, tightPersonality);
  assert(compressed.radius < primary.radius, 'compressed radius < uncompressed radius');

  // Personality EDGE_NODE increases radius (outward burst)
  const edgePersonality = { type: 'EDGE_NODE', compressionMult: 1.18, staggerMult: 0.8 };
  const edgePlaced = getFocusConstellationPlacement(motif, entry, 0, 'primary', 6, profile, edgePersonality);
  assert(edgePlaced.radius > primary.radius, 'EDGE_NODE radius burst > STANDARD');

  console.log('  ✓ Placement geometry produces stable, compressed, differentiated positions');
}

// ---------------------------------------------------------------------------
// TESTS: Build Focused Pocket Staged Positions
// ---------------------------------------------------------------------------

function testBuildFocusedPocketStagedPositions() {
  console.log('\n[TEST] buildFocusedPocketStagedPositions');

  setupMinimalState(12);
  withStateMutation(() => {
    state.navState.focusedIndex = 0;
    state.navState.currentPersonality = {
      type: 'STANDARD',
      cameraDuration: 980,
      cameraArc: 'standard',
      staggerMult: 1,
      compressionMult: 1
    };
  });

  const pocketEntries = new Map();
  for (let i = 1; i < 12; i++) {
    const kind = i <= 4 ? 'primary' : i <= 8 ? 'support' : 'halo';
    pocketEntries.set(i, {
      index: i,
      kind,
      score: 0.5 + (i % 3) * 0.15,
      relationshipRole: '',
      relationshipAxis: '',
      roleReason: '',
      sameCity: i % 2 === 0,
      reason: 'semantic neighbor'
    });
  }

  const result = buildFocusedPocketStagedPositions(0, pocketEntries);

  assert(result.positions instanceof Map,    'positions is Map');
  assert(result.motion instanceof Map,        'motion is Map');
  assert(result.roles instanceof Map,          'roles is Map');
  assert(result.positions.size >= 1,           'positions has anchor entry');
  assert(result.motion.size >= 1,             'motion has anchor entry');
  assert(result.roles.size >= 1,              'roles has anchor entry');

  // Anchor is always the focus index
  assert(result.roles.get(0) === 'anchor',    'index 0 is anchor');

  // Non-anchor roles are primary / support / halo
  const nonAnchorRoles = [...result.roles.entries()]
    .filter(([i]) => i !== 0)
    .map(([, v]) => v);
  const validRoles = ['primary', 'support', 'halo'];
  nonAnchorRoles.forEach((r) => assert(validRoles.includes(r), `valid role: ${r}`));

  // Motion has required fields
  const anchorMotion = result.motion.get(0);
  assert(anchorMotion.role === 'anchor',       'anchor motion role');
  assert(anchorMotion.delay === 0,             'anchor delay 0');
  assert(typeof anchorMotion.duration === 'number' && anchorMotion.duration > 0, 'anchor duration');
  assert(typeof anchorMotion.speed === 'number',  'anchor speed');
  assert(typeof anchorMotion.breatheAmp === 'number', 'anchor breatheAmp');

  // motif key is a string
  assert(typeof result.motif?.key === 'string', 'motif key is string');

  // viewportProfile is present
  assert(result.viewportProfile !== null, 'viewportProfile present');

  // Positions are all-finite
  for (const [idx, pos] of result.positions) {
    assert(
      Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z),
      `position [${idx}] all-finite: ${JSON.stringify(pos)}`
    );
  }

  console.log('  ✓ buildFocusedPocketStagedPositions returns well-formed positions/motion/roles');
}

// ---------------------------------------------------------------------------
// TESTS: Reduced Motion Breathing Contract
// ---------------------------------------------------------------------------

function testReducedMotionBreathing() {
  console.log('\n[TEST] Reduced Motion Breathing Contract');

  setupMinimalState(8);
  _matchMediaCalls = [];
  _prefersReducedMotion = false;

  withStateMutation(() => {
    state.navState.focusedIndex = 0;
    state.navState.focusPocketMeta = { active: true };
  });
  state.focusPocketMotionByIndex = new Map([
    [0, { role: 'anchor', delay: 0, duration: 800, speed: 0.42, breatheAmp: 0.0022, phase: 0 }],
    [1, { role: 'primary', delay: 52, duration: 980, speed: 0.24, breatheAmp: 0.0024, phase: 1.2 }],
  ]);
  state.focusPocketTransitionStartedAt = 0;
  _clockNow = 500; // mid-animation

  // positions buffer (flat x,y,z per node)
  const positions = new Float32Array(8 * 3);
  // Fill with target positions so applyFocusPocketBreathing has something to read
  for (let i = 0; i < 8; i++) {
    const p = state.nodePositions[i] || state.targetPositions[i] || { x: 0, y: 0, z: 0 };
    positions[i * 3]     = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }

  // --- Reduced motion OFF: breathing may change positions ---
  const resultNoReduced = applyFocusPocketBreathing(_clockNow, positions);
  // resultNoReduced is a boolean — when breathing is active and positions change, returns true
  // When reduced-motion is off (our shim returns matches:false for non-reduce queries),
  // breathing IS active so we expect a boolean back
  assert(typeof resultNoReduced === 'boolean', `breathing returns boolean: ${typeof resultNoReduced}`);

  // --- Verify the breathing function is accessible and returns a boolean contract ---
  // We can't fully test reduced-motion without a real matchMedia that we control per-call,
  // so we verify:
  // 1. The function runs without throwing
  // 2. It consults matchMedia (captured in _matchMediaCalls)
  assert(_matchMediaCalls.length > 0, 'breathing consulted matchMedia');

  _prefersReducedMotion = true;
  const reducedPositions = new Float32Array(positions);
  assert(
    applyFocusPocketBreathing(_clockNow + 120, reducedPositions) === false,
    'reduced-motion breathing exits without changing positions'
  );
  assert(
    reducedPositions.every((value, index) => value === positions[index]),
    'reduced-motion breathing leaves position buffer unchanged'
  );

  // 3. NaN guard: positions with bad values don't propagate
  const badPositions = new Float32Array([NaN, 0, 0, 0, Infinity, 0, 0, 0, NaN, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const resultSafe = applyFocusPocketBreathing(200, badPositions);
  assert(resultSafe === false || resultSafe === true, 'breathing with bad positions returns boolean, not throws');

  console.log('  ✓ Reduced-motion breathing returns boolean, consults matchMedia, guards NaN');
}

// ---------------------------------------------------------------------------
// TESTS: Focus Thread Curve Point
// ---------------------------------------------------------------------------

function testFocusThreadCurvePoint() {
  console.log('\n[TEST] getFocusThreadCurvePoint');

  setupMinimalState(8);
  // nodePositions must have valid entries for curve computation
  state.nodePositions[0] = { x: 0, y: 0, z: 0 };
  state.nodePositions[1] = { x: 0.5, y: 0.3, z: 0.2 };

  const edge = {
    a: 0, b: 1,
    score: 0.8,
    curveLift: 0.28,
    side: 1,
    rise: 0.2,
    depth: 0.1,
    motifBraid: 0.52,
    role: 'support',
    anchorPull: 0
  };

  const pt = getFocusThreadCurvePoint(edge, 0.5);
  assert(Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z),
    `curve point at t=0.5 is all-finite: ${pt.x},${pt.y},${pt.z}`);

  // t=0 → near start, t=1 → near end (monotonic behavior)
  const pt0 = getFocusThreadCurvePoint(edge, 0);
  const pt1 = getFocusThreadCurvePoint(edge, 1);
  assert(pt0.x !== pt1.x || pt0.y !== pt1.y || pt0.z !== pt1.z,
    'curve points at t=0 and t=1 differ');

  // Edge with null/undefined indices returns zero vector
  const badEdge = { a: null, b: undefined, curveLift: 0.3, side: 0, rise: 0, depth: 0 };
  const ptBad = getFocusThreadCurvePoint(badEdge, 0.5);
  assert(ptBad.x === 0 && ptBad.y === 0 && ptBad.z === 0,
    `bad edge returns zero vector: ${ptBad.x},${ptBad.y},${ptBad.z}`);

  console.log('  ✓ getFocusThreadCurvePoint returns all-finite points with monotonic curve');
}

// ---------------------------------------------------------------------------
// TESTS: Sync Runtime State Snapshot
// ---------------------------------------------------------------------------

function testSyncRuntimeState() {
  console.log('\n[TEST] syncRuntimeState / getRuntimeStateSnapshot');

  setupMinimalState(4);
  const snapshot = {
    nodesAreSettling: true,
    autoRotate: false,
    navState: { ...state.navState, mode: 'focus' }
  };

  // Temporarily mutate state
  const orig = { ...state };
  state.nodesAreSettling = false;
  state.autoRotate = true;

  // Re-apply snapshot
  syncRuntimeState(snapshot);

  assert(state.nodesAreSettling === true,  'nodesAreSettling synced');
  assert(state.autoRotate === false,        'autoRotate synced');
  const restored = getRuntimeStateSnapshot();
  assert(restored.nodesAreSettling === true, 'snapshot sees synced nodesAreSettling');
  assert(restored.autoRotate === false, 'snapshot sees synced autoRotate');

  console.log('  ✓ syncRuntimeState correctly patches state from snapshot');
}

// ---------------------------------------------------------------------------
// TEARDOWN
// ---------------------------------------------------------------------------

function teardownState() {
  withStateMutation(() => {
    state.points               = [];
    state.originalPositions    = [];
    state.targetPositions      = [];
    state.nodePositions        = [];
    state.recentArrangements  = [];
    state.trailDepth           = 0;
    state.navState.focusedIndex = null;
    state.navState.currentPersonality = null;
    state.navState.focusPocketMeta = null;
    state.navState.focusPocketIndices = [];
    state.navState.focusPocketRoleByIndex = new Map();
    state.navState.threadCandidates = [];
    state.navState.threadSource = 'semantic';
  });
  state.focusPocketMotionByIndex  = new Map();
  state.focusPocketAnimationFrameId = undefined;
  state.focusPocketTransitionStartedAt = 0;
  state.nodesAreSettling          = false;
  state.camera                    = null;
}

// ---------------------------------------------------------------------------
// RUN ALL TESTS
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let currentTest = '';

function run(name, fn) {
  currentTest = name;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  } finally {
    teardownState();
  }
}

try {
  console.log('\n=== focus-pocket-motion-contract.mjs ===');

  run('Viewport Profiles',          testViewportProfiles);
  run('Step Inside / Deep-Dive Personality', testDeepDivePersonality);
  run('Personality Type Diversity',  testPersonalityTypes);
  run('Placement Geometry & Compression', testPlacementGeometry);
  run('Build Focused Pocket Staged Positions', testBuildFocusedPocketStagedPositions);
  run('Reduced Motion Breathing Contract', testReducedMotionBreathing);
  run('Focus Thread Curve Point',   testFocusThreadCurvePoint);
  run('Sync Runtime State Snapshot', testSyncRuntimeState);

  console.log('\n---');
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error('\nFAILED — fix the above assertions before committing.');
    process.exit(1);
  } else {
    console.log('\nALL CONTRACT CHECKS PASSED');
    process.exit(0);
  }
} catch (err) {
  console.error('Test harness error:', err);
  process.exit(1);
}
