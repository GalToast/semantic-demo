import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, 'js', 'modules');

const OWNED_FIELDS = [
  'currentView',
  'semanticLaneState',
  'loadingPhaseKey',
  'semanticThreadsStatus',
];

const EXPECTED_EXPORTS = [
  'setCurrentView',
  'updateSemanticLaneState',
  'updateLoadingPhaseKey',
  'updateSemanticThreadsStatus',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function collectJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const appStateSrc = read('src/lib/state/app.svelte.ts');
const stateBridgeSrc = read('src/lib/engine/state-bridge.ts');
const mutatorSrc = read('js/modules/state-mutators.ts');
const withStateMutationSrc = read('src/lib/state/with-state-mutation.ts');

const combinedStateSrc = appStateSrc + '\n' + stateBridgeSrc + '\n' + withStateMutationSrc;

assert(
  /export\s+function\s+withStateMutation\s*\(/.test(combinedStateSrc) ||
  /export\s*\{[\s\S]*\bwithStateMutation\b[\s\S]*\}/.test(combinedStateSrc),
  'canonical state bridge must export withStateMutation()'
);
assert(
  /export\s+const\s+state\s*=\s*appState/.test(stateBridgeSrc),
  'state bridge must expose appState as the compatibility state export'
);

for (const field of OWNED_FIELDS) {
  assert(combinedStateSrc.includes(`'${field}'`), `mutation critical-key set should include ${field}`);
}

for (const exportName of EXPECTED_EXPORTS) {
  assert(
    new RegExp(`export\\s+function\\s+${exportName}\\s*\\(`).test(mutatorSrc),
    `state-mutators.js must export ${exportName}()`
  );
}

assert(
  /import\s+\{[^}]*\bstate\b[^}]*\bwithStateMutation\b[^}]*\}\s+from\s+['"]@lib\/engine\/state-bridge['"]/.test(mutatorSrc),
  'state-mutators.ts must import state and withStateMutation from the canonical state bridge'
);

const offenders = [];
const directWritePattern = new RegExp(
  `\\bstate\\.(${OWNED_FIELDS.join('|')})\\s*=(?!=)`,
  'g'
);

for (const file of collectJsFiles(MODULES_DIR)) {
  const relative = path.relative(ROOT, file).replace(/\\/g, '/');
  if (relative === 'js/modules/state-mutators.ts') continue;
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (directWritePattern.test(line)) {
      offenders.push(`${relative}:${index + 1}: ${line.trim()}`);
    }
    directWritePattern.lastIndex = 0;
  });
}

assert(
  offenders.length === 0,
  `critical state fields must be written through state-mutators.js:\n${offenders.join('\n')}`
);

console.log('state-mutator-ownership-contract OK');
