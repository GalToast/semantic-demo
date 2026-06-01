/**
 * semantic-space-audit.mjs
 *
 * Data-level contract for the semantic explorer's core promise:
 * semantic neighbors should be visibly close in the 3D coordinate space.
 *
 * Run:
 *   node tests/semantic-space-audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, 'data.dat');
const THREAD_PATH = path.join(ROOT, 'semantic_threads_ui.dat');
const MANIFEST_PATH = path.join(ROOT, 'semantic_space_layout_manifest.json');
const NEAREST_K = 48;

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function artifactBasename(value) {
  return String(value || '').replaceAll('\\', '/').split('/').pop() || '';
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
}

function distance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function nearestIndices(positions, sourceIndex, limit) {
  const best = [];
  let maxDistance = Infinity;
  let maxSlot = -1;

  for (let i = 0; i < positions.length; i += 1) {
    if (i === sourceIndex) continue;
    const d = distance(positions[sourceIndex], positions[i]);
    if (best.length < limit) {
      best.push({ index: i, distance: d });
      if (d > maxDistance || maxSlot < 0) {
        maxDistance = d;
        maxSlot = best.length - 1;
      }
      if (best.length === limit) {
        maxSlot = 0;
        maxDistance = best[0].distance;
        for (let slot = 1; slot < best.length; slot += 1) {
          if (best[slot].distance > maxDistance) {
            maxDistance = best[slot].distance;
            maxSlot = slot;
          }
        }
      }
      continue;
    }

    if (d >= maxDistance) continue;
    best[maxSlot] = { index: i, distance: d };
    maxSlot = 0;
    maxDistance = best[0].distance;
    for (let slot = 1; slot < best.length; slot += 1) {
      if (best[slot].distance > maxDistance) {
        maxDistance = best[slot].distance;
        maxSlot = slot;
      }
    }
  }

  return new Set(best.map((entry) => entry.index));
}

const dataRows = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const threadBundle = JSON.parse(fs.readFileSync(THREAD_PATH, 'utf8'));
const layoutManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const nodes = threadBundle.nodes || {};
const positions = dataRows.map((row) => [Number(row[0]), Number(row[1]), Number(row[2])]);
const leadToIndex = new Map(dataRows.map((row, index) => [String(row[7]), index]));

let missingRefs = 0;
let totalRefs = 0;
const edgeDistances = [];
const top3Distances = [];
const semanticNeighborIndicesBySource = [];

for (const [fallbackLeadId, node] of Object.entries(nodes)) {
  const leadId = String(node?.lead_id ?? fallbackLeadId);
  const sourceIndex = leadToIndex.get(leadId);
  if (sourceIndex === undefined) continue;

  const neighborIndices = [];
  for (const [rank, neighbor] of (node.neighbors || []).entries()) {
    const targetIndex = leadToIndex.get(String(neighbor.lead_id));
    totalRefs += 1;
    if (targetIndex === undefined) {
      missingRefs += 1;
      continue;
    }
    neighborIndices.push(targetIndex);
    const d = distance(positions[sourceIndex], positions[targetIndex]);
    edgeDistances.push(d);
    if (rank < 3) top3Distances.push(d);
  }
  semanticNeighborIndicesBySource[sourceIndex] = neighborIndices;
}

const recall = {
  hits: 0,
  total: 0,
  anyAt24: 0,
  sources: 0,
};

for (let sourceIndex = 0; sourceIndex < positions.length; sourceIndex += 1) {
  const semanticNeighbors = semanticNeighborIndicesBySource[sourceIndex];
  if (!semanticNeighbors?.length) continue;
  const nearest48 = nearestIndices(positions, sourceIndex, NEAREST_K);
  const nearest24 = nearestIndices(positions, sourceIndex, 24);
  let hits48 = 0;
  let hits24 = 0;

  for (const neighborIndex of semanticNeighbors) {
    if (nearest48.has(neighborIndex)) hits48 += 1;
    if (nearest24.has(neighborIndex)) hits24 += 1;
  }

  recall.hits += hits48;
  recall.total += semanticNeighbors.length;
  recall.anyAt24 += hits24 > 0 ? 1 : 0;
  recall.sources += 1;
}

const summary = {
  dataRows: dataRows.length,
  threadNodes: Object.keys(nodes).length,
  threadGeneratedAt: threadBundle.generated_at || null,
  layoutManifest: {
    generatedAt: layoutManifest.generated_at || null,
    method: layoutManifest.method || null,
    rows: Number(layoutManifest.rows),
    edges: Number(layoutManifest.edges),
    dataPath: artifactBasename(layoutManifest.data_path),
    threadPath: artifactBasename(layoutManifest.thread_path),
  },
  totalRefs,
  missingRefs,
  edgeDistance: {
    mean: Number((edgeDistances.reduce((sum, value) => sum + value, 0) / edgeDistances.length).toFixed(4)),
    p90: Number(quantile(edgeDistances, 0.9).toFixed(4)),
    p95: Number(quantile(edgeDistances, 0.95).toFixed(4)),
  },
  top3Distance: {
    p90: Number(quantile(top3Distances, 0.9).toFixed(4)),
    p95: Number(quantile(top3Distances, 0.95).toFixed(4)),
  },
  neighborhoodPreservation: {
    recallAt48: Number((recall.hits / Math.max(1, recall.total)).toFixed(4)),
    anyAt24: Number((recall.anyAt24 / Math.max(1, recall.sources)).toFixed(4)),
  },
};

console.log(JSON.stringify(summary, null, 2));

assert(dataRows.length === Object.keys(nodes).length, 'data.dat and semantic_threads_ui.dat node counts must match');
assert(summary.layoutManifest.rows === dataRows.length, `semantic_space_layout_manifest rows must match data.dat rows: ${summary.layoutManifest.rows} != ${dataRows.length}`);
assert(summary.layoutManifest.rows === Object.keys(nodes).length, `semantic_space_layout_manifest rows must match thread nodes: ${summary.layoutManifest.rows} != ${Object.keys(nodes).length}`);
assert(summary.layoutManifest.edges === totalRefs, `semantic_space_layout_manifest edges must match semantic thread refs: ${summary.layoutManifest.edges} != ${totalRefs}`);
assert(summary.layoutManifest.dataPath === 'data.dat', `semantic_space_layout_manifest data_path must reference data.dat, got ${summary.layoutManifest.dataPath}`);
assert(summary.layoutManifest.threadPath === 'semantic_threads_ui.dat', `semantic_space_layout_manifest thread_path must reference semantic_threads_ui.dat, got ${summary.layoutManifest.threadPath}`);
assert(missingRefs === 0, 'semantic_threads_ui.dat must not reference missing data.dat lead ids');
assert(summary.edgeDistance.p90 <= 0.3, `semantic edge p90 distance too high: ${summary.edgeDistance.p90}`);
assert(summary.edgeDistance.p95 <= 0.38, `semantic edge p95 distance too high: ${summary.edgeDistance.p95}`);
assert(summary.top3Distance.p90 <= 0.24, `top-3 semantic edge p90 distance too high: ${summary.top3Distance.p90}`);
assert(summary.neighborhoodPreservation.recallAt48 >= 0.14, `semantic recall@48 too low: ${summary.neighborhoodPreservation.recallAt48}`);
assert(summary.neighborhoodPreservation.anyAt24 >= 0.5, `semantic any@24 too low: ${summary.neighborhoodPreservation.anyAt24}`);

console.log('Semantic space audit passed.');
