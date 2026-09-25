/**
 * semantic-thread-relationship-role-contract.mjs
 *
 * Data and code-level ratchet for Focus Constellation relationship roles.
 * The production Svelte path must preserve the directional role vocabulary in
 * semantic_threads_ui.dat instead of collapsing it to an unclassified fallback.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  getRelationshipRoleCopy,
  normalizeRelationshipRole,
  UNCLASSIFIED_RELATIONSHIP_ROLE,
} from '../src/lib/utils/relationship-roles.ts';

const ROOT = process.cwd();
const THREAD_UI_PATH = path.join(ROOT, 'semantic_threads_ui.dat');

const VALID_ROLES = new Set([
  'core_peer',
  'upstream',
  'downstream',
  'complement',
  'same_market',
  'geo_echo',
  'bridge',
]);

const CODE_PROPAGATION_FILES = [
  'js/workers/data-worker.ts',
  'src/lib/data-loader.ts',
  'src/lib/semantic-threads.ts',
  'src/lib/journey/thread-model.ts',
  'src/lib/focus/pocket.ts',
  'src/lib/focus/geometry.ts',
];

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const payload = readJson(THREAD_UI_PATH);
const metaRoles = payload?.meta?.relationship_roles || [];
for (const role of VALID_ROLES) {
  assert(metaRoles.includes(role), `semantic_threads_ui.dat meta.relationship_roles is missing ${role}`);
  assert(normalizeRelationshipRole(role) === role, `normalizeRelationshipRole() must preserve artifact role ${role}`);
  assert(getRelationshipRoleCopy(normalizeRelationshipRole(role)).title, `relationship role ${role} needs UI copy`);
}

assert(
  normalizeRelationshipRole('not-a-real-role') === UNCLASSIFIED_RELATIONSHIP_ROLE,
  'unknown relationship roles must normalize to unclassified, not bridge'
);

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
  const source = read(relativePath);
  assert(source.includes('relationshipRole'), `${relativePath} must propagate camelCase relationshipRole`);
}

const relationshipRoleSource = read('src/lib/utils/relationship-roles.ts');
assert(!/return\s+['"]bridge['"]/.test(relationshipRoleSource),
  'relationship role normalization must not silently coerce missing/unknown roles to bridge');
assert(relationshipRoleSource.includes(`${UNCLASSIFIED_RELATIONSHIP_ROLE}:`),
  'relationship role owner must define explicit unclassified UI fallback copy');

const semanticThreadsSource = read('src/lib/semantic-threads.ts');
assert(
  /function _normalizeSemanticNeighborEntries\s*\(/.test(semanticThreadsSource),
  'semantic-threads.ts must normalize worker-loaded neighbor entries through the relationship role owner'
);
assert(
  /relationshipRole:\s*normalizeRelationshipRole\([\s\S]*neighbor\?\.relationship_role/.test(semanticThreadsSource),
  'semantic-threads.ts must normalize snake_case artifact relationship_role values'
);
assert(
  /async function _guardSemanticSpaceLayout\s*\(/.test(semanticThreadsSource) &&
    /semantic_space_layout_status/.test(semanticThreadsSource),
  'semantic-threads.ts must guard ready semantic traversal with the semantic space layout manifest'
);

const journeyThreadModelSource = read('src/lib/journey/thread-model.ts');
assert(
  /normalizeRelationshipRole/.test(journeyThreadModelSource) &&
    /relationshipRole:\s*normalizeRelationshipRole\(n\.relationshipRole\)/.test(journeyThreadModelSource),
  'journey thread model must own semantic candidate relationship role normalization'
);
assert(
  /const selfCity\s*=\s*normalizeCityForFilter\(points\[index\]\?\.city\)/.test(journeyThreadModelSource),
  'journey thread model geometric fallback must compare normalized city values'
);

const dataLoaderSource = read('src/lib/data-loader.ts');
assert(
  /relationshipRole:\s*normalizeRelationshipRole\(cleanOptional\(n\?\.relationship_role\)\)/.test(dataLoaderSource),
  'data-loader.ts must propagate relationship_role through the shared relationship role normalizer'
);

const workerSource = read('js/workers/data-worker.ts');
assert(
  !/relationshipRole:\s*String\(neighbor\?\.relationship_role\s*\|\|\s*['"]bridge['"]/.test(workerSource),
  'data-worker.ts must not own relationship-role fallback classification'
);

console.log(JSON.stringify({ edgeCount, activeRoleCount, counts }, null, 2));
console.log('Semantic thread relationship role contract passed.');
