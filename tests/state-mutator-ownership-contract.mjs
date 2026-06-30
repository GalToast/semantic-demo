import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_LIB_DIR = path.join(ROOT, 'src', 'lib');

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
const mutatorSrc = read('src/lib/state/mutators.ts');
const withStateMutationSrc = read('src/lib/state/with-state-mutation.ts');

const combinedStateSrc = appStateSrc + '\n' + withStateMutationSrc;

assert(
  /export\s+function\s+withStateMutation(?:<[^>]+>)?\s*\(/.test(combinedStateSrc) ||
  /export\s*\{[\s\S]*\bwithStateMutation\b[\s\S]*\}/.test(combinedStateSrc),
  'canonical state modules must export withStateMutation()'
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
  /import\s+\{\s*appState\s*\}\s+from\s+['"]\.\/app\.svelte['"]/.test(mutatorSrc) &&
    /import\s+\{\s*withStateMutation\s*\}\s+from\s+['"]\.\/with-state-mutation['"]/.test(mutatorSrc),
  'state-mutators.ts must import appState and withStateMutation from canonical state modules'
);

const offenders = [];
const directWritePattern = new RegExp(
  `\\bstate\\.(${OWNED_FIELDS.join('|')})\\s*=(?!=)`,
  'g'
);

const ALLOWED_DIRECT_WRITE_FILES = new Set([
  'src/lib/state/mutators.ts',
  'src/lib/state/app.svelte.ts',
]);

const ALLOWED_GUARDED_LOCAL_WRITERS = new Set([
  'src/lib/engine/semantic-threads.ts',
  'src/lib/orchestration/semantic-lane.ts',
]);

for (const file of collectJsFiles(SRC_LIB_DIR)) {
  const relative = path.relative(ROOT, file).replace(/\\/g, '/');
  if (ALLOWED_DIRECT_WRITE_FILES.has(relative)) continue;
  const src = fs.readFileSync(file, 'utf8');
  if (ALLOWED_GUARDED_LOCAL_WRITERS.has(relative) && src.includes('withStateMutation')) continue;
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
