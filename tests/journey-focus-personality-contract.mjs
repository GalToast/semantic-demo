'use strict';

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FOCUS_POCKET_PATH = path.join(__dirname, '..', 'src', 'lib', 'journey', 'focus-pocket.ts')

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

const { state } = await import('./helpers/canonical-state.mjs');
const { getNeighborhoodPersonality } = await import('../src/lib/journey/focus-pocket.ts');

const original = {
  points: state.points,
  semanticNeighborMapByLeadId: state.semanticNeighborMapByLeadId,
  pointIndexByLeadId: state.pointIndexByLeadId,
  recentArrangements: state.recentArrangements,
  trailDepth: state.trailDepth,
};

function seedSemanticNeighbors(count, score = 0.9) {
  const points = Array.from({ length: count + 1 }, (_, index) => ({
    index,
    lead_id: `lead-${index}`,
    name: `Business ${index}`,
    cluster: index % 5,
    city: index % 2 === 0 ? 'Conroe' : 'Magnolia',
  }));
  const pointIndexByLeadId = new Map(points.map((point, index) => [point.lead_id, index]));
  const semanticNeighborMapByLeadId = new Map();
  semanticNeighborMapByLeadId.set('lead-0', {
    neighbors: points.slice(1).map((point, offset) => ({
      leadId: point.lead_id,
      score,
      semanticScore: score,
      sameCity: point.city === points[0].city,
      sameStatus: true,
      bridgeScore: offset % 2 === 0 ? 0.8 : 0.3,
      signalScore: score,
      threadType: 'fixture_semantic_neighbor',
      reason: 'fixture semantic neighbor',
    })),
  });

  state.points = points;
  state.pointIndexByLeadId = pointIndexByLeadId;
  state.semanticNeighborMapByLeadId = semanticNeighborMapByLeadId;
}

try {
  seedSemanticNeighbors(9, 0.9);
  state.trailDepth = 0;
  state.recentArrangements = [];
  const dense = getNeighborhoodPersonality(0);
  assert(dense.type === 'DENSE_HUB', `dense semantic neighborhood should select DENSE_HUB, got ${dense.type}`);
  assert(dense.cameraArc === 'wide', 'DENSE_HUB should use wide camera arc');
  assert(dense.compressionMult === 0.82, 'DENSE_HUB compression multiplier should be stable');
  // getNeighborhoodPersonality is pure: recording recent arrangements is owned
  // by applyLocalNeighborhoodFocus (focus-pocket.ts), which sets
  // navState.currentPersonality and pushes to appState.recentArrangements.
  assert(
    state.recentArrangements.length === 0,
    'getNeighborhoodPersonality must not record — recording is owned by applyLocalNeighborhoodFocus'
  );

  seedSemanticNeighbors(9, 0.9);
  state.trailDepth = 0;
  state.recentArrangements = ['DENSE_HUB', 'DENSE_HUB', 'DENSE_HUB'];
  const guarded = getNeighborhoodPersonality(0);
  assert(guarded.type === 'BRIDGE_NODE', `repetition guard should skip repeated DENSE_HUB, got ${guarded.type}`);
  assert(guarded.motifOverride === 'lattice', 'BRIDGE_NODE motif override should stay lattice');
  assert(
    state.recentArrangements.length === 3,
    'getNeighborhoodPersonality must not record — repetition history is read-only input'
  );

  seedSemanticNeighbors(2, 0.72);
  state.trailDepth = 0;
  state.recentArrangements = [];
  const edge = getNeighborhoodPersonality(0);
  assert(edge.type === 'EDGE_NODE', `low-degree semantic neighborhood should select EDGE_NODE, got ${edge.type}`);
  assert(edge.motifOverride === 'delta', 'EDGE_NODE motif override should stay delta');

  seedSemanticNeighbors(9, 0.9);
  state.trailDepth = 2;
  state.recentArrangements = ['BRIDGE_NODE'];
  const beforeLength = state.recentArrangements.length;
  const deepDive = getNeighborhoodPersonality(0);
  assert(deepDive.type === 'DEEP_DIVE', `trailDepth=2 should force DEEP_DIVE, got ${deepDive.type}`);
  assert(deepDive.motifOverride === 'rosette', 'DEEP_DIVE motif override should stay rosette');
  assert(deepDive.easing === 'easeOutBack', 'DEEP_DIVE easing should stay easeOutBack');
  assert(state.recentArrangements.length === beforeLength, 'DEEP_DIVE early return should not mutate recent arrangements');
} finally {
  state.points = original.points;
  state.semanticNeighborMapByLeadId = original.semanticNeighborMapByLeadId;
  state.pointIndexByLeadId = original.pointIndexByLeadId;
  state.recentArrangements = original.recentArrangements;
  state.trailDepth = original.trailDepth;
}

// Recording ownership: getNeighborhoodPersonality is pure — the selection
// recording invariant lives in applyLocalNeighborhoodFocus (focus-pocket.ts),
// which sets navState.currentPersonality and pushes into recentArrangements.
// Source-scan guards the split so the invariant stays covered even though the
// pure function under test no longer records.
{
  const focusPocketSrc = fs.readFileSync(FOCUS_POCKET_PATH, 'utf8')
  const applyFocusMatch = focusPocketSrc.match(/export function applyLocalNeighborhoodFocus[\s\S]*?\n}/)
  assert(applyFocusMatch, 'applyLocalNeighborhoodFocus body found in focus-pocket.ts')
  const applyBody = applyFocusMatch[0]
  // cad28e3b: currentPersonality stores the full NeighborhoodPersonality OBJECT
  // (consumers cast it as an object — routes.ts, focus.ts, focus-pocket-geometry.ts),
  // not just .type. The (?!\.type) guard fails a regression back to the string write.
  assert(
    /navState\.currentPersonality = personality(?!\.type)/.test(applyBody),
    'applyLocalNeighborhoodFocus must set navState.currentPersonality to the selected personality object (not just .type)'
  )
  assert(
    /recentArrangements[\s\S]*?\.push\(personality\.type\)/.test(applyBody),
    'applyLocalNeighborhoodFocus must record the selected personality into recentArrangements'
  )
}

console.log('PASS journey-focus-personality-contract');
