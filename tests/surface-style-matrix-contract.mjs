/**
 * surface-style-matrix-contract.mjs
 *
 * Fast static guard for docs/semantic-demo-surface-style-matrix.md. The matrix
 * must track every composed visual state captured by tests/visual-state-audit.mjs
 * so design-token policy stays connected to real app surfaces.
 */

import fs from 'node:fs';
import path from 'node:path';
import { VISUAL_STATE_IDS } from './visual-state-registry.mjs';

const root = process.cwd();
const visualAuditPath = 'tests/visual-state-audit.mjs';
const matrixPath = 'docs/semantic-demo-surface-style-matrix.md';
const packagePath = 'package.json';
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

function matrixVisualStateIds(sourceText) {
  const matrixSection = sourceText.split('## Contract-Only Surface Gaps')[0] || sourceText;
  return [...new Set([...matrixSection.matchAll(/\|\s*`(\d{2}-(?:mobile|desktop)-[A-Za-z0-9-]+)`\s*\|/g)]
    .map((match) => match[1]))]
    .sort((a, b) => a.localeCompare(b));
}

function packageVisualStateIds(sourceText) {
  return [...new Set([...sourceText.matchAll(/--states=([0-9A-Za-z, -]+)/g)]
    .flatMap((match) => match[1].split(','))
    .map((stateId) => stateId.trim())
    .filter((stateId) => /^\d{2}-(?:mobile|desktop)-[A-Za-z0-9-]+$/.test(stateId)))]
    .sort((a, b) => a.localeCompare(b));
}

const visualAudit = read(visualAuditPath);
const matrix = read(matrixPath);
const packageJson = read(packagePath);
const stateIds = visualStateIds(visualAudit);
const registryStateIds = [...VISUAL_STATE_IDS].sort((a, b) => a.localeCompare(b));
const matrixStateIds = matrixVisualStateIds(matrix);
const packageStateIds = packageVisualStateIds(packageJson);
const duplicateRegistryIds = registryStateIds.filter((stateId, index) => registryStateIds.indexOf(stateId) !== index);
const unregisteredAuditIds = stateIds.filter((stateId) => !registryStateIds.includes(stateId));
const unusedRegistryIds = registryStateIds.filter((stateId) => !stateIds.includes(stateId));
const missing = registryStateIds.filter((stateId) => !matrix.includes(`\`${stateId}\``));
const staleMatrixIds = matrixStateIds.filter((stateId) => !registryStateIds.includes(stateId));
const stalePackageIds = packageStateIds.filter((stateId) => !registryStateIds.includes(stateId));

if (!matrix.includes('docs/semantic-demo-design-tokens.md')) {
  failures.push(`${matrixPath} must reference the design token sheet`);
}

if (!matrix.includes('tests/visual-state-audit.mjs')) {
  failures.push(`${matrixPath} must identify tests/visual-state-audit.mjs as the visual state source`);
}

if (!matrix.includes('Bottom') && !matrix.includes('bottom')) {
  failures.push(`${matrixPath} must document bottom/safe-area anchoring policy`);
}

if (duplicateRegistryIds.length) {
  failures.push(`tests/visual-state-registry.mjs includes duplicate visual state id(s): ${duplicateRegistryIds.join(', ')}`);
}

if (unregisteredAuditIds.length) {
  failures.push(`${visualAuditPath} uses ${unregisteredAuditIds.length} unregistered visual state id(s): ${unregisteredAuditIds.join(', ')}`);
}

if (unusedRegistryIds.length) {
  failures.push(`tests/visual-state-registry.mjs includes ${unusedRegistryIds.length} unused visual state id(s): ${unusedRegistryIds.join(', ')}`);
}

if (missing.length) {
  failures.push(`${matrixPath} is missing ${missing.length} visual state id(s): ${missing.join(', ')}`);
}

if (staleMatrixIds.length) {
  failures.push(`${matrixPath} includes ${staleMatrixIds.length} stale visual state id(s): ${staleMatrixIds.join(', ')}`);
}

if (stalePackageIds.length) {
  failures.push(`${packagePath} includes ${stalePackageIds.length} stale qa:surface state id(s): ${stalePackageIds.join(', ')}`);
}

if (failures.length) {
  console.error('Surface style matrix contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Surface style matrix contract passed: ${registryStateIds.length} visual states covered.`);
