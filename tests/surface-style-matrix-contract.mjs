/**
 * surface-style-matrix-contract.mjs
 *
 * Fast static guard for docs/semantic-demo-surface-style-matrix.md. The matrix
 * must track every composed visual state captured by tests/visual-state-audit.mjs
 * so design-token policy stays connected to real app surfaces.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const visualAuditPath = 'tests/visual-state-audit.mjs';
const matrixPath = 'docs/semantic-demo-surface-style-matrix.md';
const failures = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${relativePath} is missing`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function visualStateIds(sourceText) {
  return [...new Set([...sourceText.matchAll(/['"`](\d{2}-(?:mobile|desktop)-[A-Za-z0-9-]+)['"`]/g)]
    .map((match) => match[1]))]
    .sort((a, b) => a.localeCompare(b));
}

const visualAudit = read(visualAuditPath);
const matrix = read(matrixPath);
const stateIds = visualStateIds(visualAudit);
const missing = stateIds.filter((stateId) => !matrix.includes(`\`${stateId}\``));

if (!matrix.includes('docs/semantic-demo-design-tokens.md')) {
  failures.push(`${matrixPath} must reference the design token sheet`);
}

if (!matrix.includes('tests/visual-state-audit.mjs')) {
  failures.push(`${matrixPath} must identify tests/visual-state-audit.mjs as the visual state source`);
}

if (!matrix.includes('Bottom') && !matrix.includes('bottom')) {
  failures.push(`${matrixPath} must document bottom/safe-area anchoring policy`);
}

if (missing.length) {
  failures.push(`${matrixPath} is missing ${missing.length} visual state id(s): ${missing.join(', ')}`);
}

if (failures.length) {
  console.error('Surface style matrix contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Surface style matrix contract passed: ${stateIds.length} visual states covered.`);
