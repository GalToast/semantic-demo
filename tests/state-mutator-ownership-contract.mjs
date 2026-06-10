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

const stateSrc = read('js/state.ts');
const stateShimSrc = read('js/state.ts');
const mutatorSrc = read('js/modules/state-mutators.ts');
const withStateMutationSrc = read('src/lib/state/with-state-mutation.ts');

const combinedStateSrc = stateSrc + '\n' + stateShimSrc + '\n' + withStateMutationSrc;

assert(
  /export\s+function\s+withStateMutation\s*\(/.test(combinedStateSrc) ||
  /export\s*\{\s*withStateMutation,/.test(combinedStateSrc),
  'state.js must export withStateMutation()'
);
assert(/export\s+const\s+state(?:\s*:\s*[^=]+)?\s*=\s*new\s+Proxy\s*\(/.test(combinedStateSrc), 'state.js must expose state through a proxy');

for (const field of OWNED_FIELDS) {
  assert(combinedStateSrc.includes(`'${field}'`), `state.js critical-key set should include ${field}`);
}

for (const exportName of EXPECTED_EXPORTS) {
  assert(
    new RegExp(`export\\s+function\\s+${exportName}\\s*\\(`).test(mutatorSrc),
    `state-mutators.js must export ${exportName}()`
  );
}

assert(
  /import\s+\{[^}]*\bstate\b[^}]*\bwithStateMutation\b[^}]*\}\s+from\s+['"]\.\.\/state\.(?:js|ts)['"]/.test(mutatorSrc),
  'state-mutators.js must be the module boundary that imports withStateMutation()'
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
