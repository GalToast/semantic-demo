/**
 * semantic-thread-relationship-role-contract.mjs
 *
 * Data and code-level ratchet for Focus Constellation relationship roles.
 * The thread artifacts should carry directional business-ecosystem roles
 * through to the browser so focus neighborhoods can be organized as a local
 * constellation instead of a flat nearest-neighbor ring.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const THREAD_UI_PATH = path.join(ROOT, 'semantic_threads_ui.dat');

const VALID_ROLES = new Set([
  'core_peer',
  'upstream',
  'downstream',
  'complement',
  'same_market',
  'geo_echo',
  'bridge'
]);

const UI_FALLBACK_ROLE = 'unclassified';

const CODE_PROPAGATION_FILES = [
  'js/workers/data-worker.js',
  'js/modules/semantic-threads.ts',
  'js/modules/thread-inspector.ts',
  'js/modules/focus-pocket.ts',
  'js/modules/journey-focus-ui.ts',
  'js/modules/journey-thread-settler.ts'
];

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const payload = readJson(THREAD_UI_PATH);
const metaRoles = payload?.meta?.relationship_roles || [];
for (const role of VALID_ROLES) {
  assert(metaRoles.includes(role), `semantic_threads_ui.dat meta.relationship_roles is missing ${role}`);
}

const counts = Object.fromEntries([...VALID_ROLES].map((role) => [role, 0]));
let edgeCount = 0;
let missingAxis = 0;
let missingReason = 0;

for (const [leadId, node] of Object.entries(payload.nodes || {})) {
  assert(Array.isArray(node.neighbors), `node ${leadId} must expose neighbors`);
  for (const neighbor of node.neighbors) {
    edgeCount += 1;
    const role = String(neighbor.relationship_role || '');
    assert(VALID_ROLES.has(role), `node ${leadId} has invalid relationship_role: ${role || '<empty>'}`);
    counts[role] += 1;
    if (!String(neighbor.relationship_axis || '').trim()) missingAxis += 1;
    if (!String(neighbor.role_reason || '').trim()) missingReason += 1;
  }
}

const activeRoleCount = Object.values(counts).filter((count) => count > 0).length;
const nonBridgeEdges = edgeCount - counts.bridge;

assert(edgeCount > 0, 'semantic_threads_ui.dat must include relationship edges');
assert(activeRoleCount >= 4, `expected at least four active relationship roles, got ${activeRoleCount}`);
assert(nonBridgeEdges / edgeCount >= 0.25, `expected at least 25% non-bridge roles, got ${nonBridgeEdges}/${edgeCount}`);
assert(missingAxis === 0, `all relationship edges need relationship_axis, missing ${missingAxis}`);
assert(missingReason === 0, `all relationship edges need role_reason, missing ${missingReason}`);

for (const relativePath of CODE_PROPAGATION_FILES) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  assert(source.includes('relationshipRole'), `${relativePath} must propagate camelCase relationshipRole`);
}

const focusStageCss = fs.readFileSync(path.join(ROOT, 'css/journey_steps.css'), 'utf8');
const roleCopySource = fs.readFileSync(path.join(ROOT, 'js/modules/relationship-roles.ts'), 'utf8');
for (const role of VALID_ROLES) {
  assert(roleCopySource.includes(`${role}:`), `relationship-roles.js must define UI copy for ${role}`);
  assert(
    focusStageCss.includes(`data-relationship-role="${role}"`) ||
      focusStageCss.includes(`data-relationship-role='${role}'`),
    `css/journey_steps.css must define a visual role treatment for ${role}`
  );
}

assert(roleCopySource.includes(`${UI_FALLBACK_ROLE}:`) || roleCopySource.includes(`[UNCLASSIFIED_RELATIONSHIP_ROLE]`),
  'relationship-roles.js must define explicit unclassified UI fallback copy');
assert(focusStageCss.includes(`data-relationship-role="${UI_FALLBACK_ROLE}"`) ||
  focusStageCss.includes(`data-relationship-role='${UI_FALLBACK_ROLE}'`),
  'css/journey_steps.css must style unclassified role fallback distinctly');
assert(!/return\s+['"]bridge['"]/.test(roleCopySource),
  'relationship role normalization must not silently coerce missing/unknown roles to bridge');

const bridgeFallbackSearchFiles = [
  'js/workers/data-worker.js',
  'js/modules/semantic-threads.ts',
  'js/modules/thread-inspector.ts',
  'js/modules/focus-pocket.ts',
  'js/modules/journey-focus-ui.ts',
  'js/modules/journey-thread-settler.ts',
  'js/modules/journey-thread-model.ts'
];

for (const relativePath of bridgeFallbackSearchFiles) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  assert(!/relationshipRole\s*\|\|\s*['"]bridge['"]/.test(source),
    `${relativePath} must not mask missing relationshipRole as bridge`);
}

const semanticThreadsSource = fs.readFileSync(path.join(ROOT, 'js/modules/semantic-threads.ts'), 'utf8');
assert(
  /function _normalizeSemanticNeighborEntries\s*\(/.test(semanticThreadsSource),
  'semantic-threads.js must normalize worker-loaded neighbor entries through the relationship role owner'
);
assert(
  /relationshipRole:\s*normalizeRelationshipRole\(neighbor\?\.relationshipRole\)/.test(semanticThreadsSource),
  'semantic-threads.js worker path must normalize camelCase relationshipRole values'
);
assert(
  /async function _guardSemanticSpaceLayout\s*\(/.test(semanticThreadsSource) &&
    /semantic_space_layout_status/.test(semanticThreadsSource),
  'semantic-threads.js must guard ready semantic traversal with the semantic space layout manifest'
);

const journeyThreadModelSource = fs.readFileSync(path.join(ROOT, 'js/modules/journey-thread-model.ts'), 'utf8');
assert(
  /import\s+\{\s*normalizeRelationshipRole\s*\}\s+from\s+['"]\.\/relationship-roles\.js['"]/.test(journeyThreadModelSource) &&
    /relationshipRole:\s*normalizeRelationshipRole\(neighbor\.relationshipRole\)/.test(journeyThreadModelSource),
  'journey-thread-model.js must own semantic candidate relationship role normalization'
);
assert(
  /const selfCity\s*=\s*normalizeCityForFilter\(.*state\.points\[index\]/.test(journeyThreadModelSource),
  'journey-thread-model.ts geometric fallback must compare normalized city values'
);

const threadInspectorSource = fs.readFileSync(path.join(ROOT, 'js/modules/thread-inspector.ts'), 'utf8');
assert(
  /from\s+['"]\.\/journey-thread-model\.ts['"]/.test(threadInspectorSource) &&
    /getSemanticThreadCandidates/.test(threadInspectorSource) &&
    /getGeometricThreadCandidates/.test(threadInspectorSource) &&
    /getThreadCandidatesForIndex/.test(threadInspectorSource),
  'thread-inspector.js must consume thread candidates from journey-thread-model.ts'
);
assert(
  !/export\s+function\s+getSemanticThreadCandidates\s*\(/.test(threadInspectorSource) &&
    !/export\s+function\s+getGeometricThreadCandidates\s*\(/.test(threadInspectorSource) &&
    !/export\s+function\s+getThreadCandidatesForIndex\s*\(/.test(threadInspectorSource),
  'thread-inspector.js must not duplicate semantic/geometric candidate derivation'
);

const workerSource = fs.readFileSync(path.join(ROOT, 'js/workers/data-worker.js'), 'utf8');
assert(
  !/relationshipRole:\s*String\(neighbor\?\.relationship_role\s*\|\|\s*['"]bridge['"]/.test(workerSource),
  'data-worker.js must not own relationship-role fallback classification'
);

console.log(JSON.stringify({ edgeCount, activeRoleCount, counts }, null, 2));
console.log('Semantic thread relationship role contract passed.');
