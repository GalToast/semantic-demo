/**
 * run-all-contracts.js
 *
 * Ordered QA contract runner with optional manifest-based group execution.
 *
 * Default (no flags): runs the pinned ordered list (33 contracts).
 *   node tests/run-all-contracts.js
 *
 * Group mode: --group=<name> reads from contracts.manifest.json
 *   node tests/run-all-contracts.js --group=smoke
 *   node tests/run-all-contracts.js --group=motion
 *   node tests/run-all-contracts.js --group=mobile-critical
 *   node tests/run-all-contracts.js --group=lifecycle
 *   node tests/run-all-contracts.js --group=full
 *
 * Pass detection:
 *   - Exit code 0
 *   - No "FAIL" token in stdout
 *   - No "✗" failure marker in stdout
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TESTS_DIR = __dirname;
const MANIFEST_PATH = join(__dirname, 'contracts.manifest.json');

// Pinned ordered list — this is the authoritative default run.
const PINNED_FILES = [
  'semantic-dive-ui-surface-contract.mjs',
  'search-state-surface-contract.mjs',
  'lifecycle-composition-contract.mjs',
  'journey-compass-state-contract.mjs',
  'semantic-lane-contract.mjs',
  'connection-analysis-contract.mjs',
  'camera-controls-motion-contract.mjs',
  'focus-pocket-motion-contract.mjs',
  'focus-pocket-composition-contract.mjs',
  'journey-event-bindings-contract.mjs',
  'micro-demo-contract.mjs',
  'demo-init-seam-contract.mjs',
  'demo-camera-retirement-contract.mjs',
  'cluster-labels-contract.mjs',
  'journey-thread-inspector-contract.mjs',
  'trail-review-focus-contract.mjs',
  'share-view-clipboard-contract.mjs',
  'keyboard-help-aria-contract.mjs',
  'pathfinding-contract.mjs',
  'weather-lifecycle-contract.mjs',
  'weather-surface-ownership-contract.mjs',
  'camera-auto-rotate-settle-contract.mjs',
  'semantic-dive-reverse-contract.mjs',
  'journey-window-surface-contract.mjs',
  'window-bridge-gaps-contract.mjs',
  'loading-ui-contract.mjs',
  'exploration-modes-contract.mjs',
  'scene-reveal-contract.mjs',
  'scene-atmosphere-contract.mjs',
  'motion-state-contract.mjs',
  'demo-state-sync-contract.mjs',
  'three-visual-polish-contract.mjs',
  'search-peek-expanded-render-contract.mjs',
];

function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function getGroupFromManifest(groupName) {
  const manifest = loadManifest();
  if (!manifest) {
    console.error(`  Error: contracts.manifest.json not found at ${MANIFEST_PATH}`);
    return null;
  }
  const group = manifest.groups?.[groupName];
  if (!group) {
    console.error(`  Error: unknown group '${groupName}'. Available: ${Object.keys(manifest.groups || {}).join(', ')}`);
    return null;
  }
  return group;
}

function resolveFiles() {
  const args = process.argv.slice(2);
  const groupArg = args.find(a => a.startsWith('--group='));

  if (!groupArg) {
    // Default: use pinned ordered list — no manifest discovery, no regression.
    return { files: PINNED_FILES, mode: 'pinned' };
  }

  const groupName = groupArg.split('=')[1];
  const group = getGroupFromManifest(groupName);

  if (!group) {
    process.exit(1);
  }

  return { files: group.contracts, mode: `group:${groupName}` };
}

// ── Execute a single contract file ───────────────────────────────────────────

function runContract(filename) {
  return new Promise((resolve) => {
    const entry = join(TESTS_DIR, filename);
    const start = performance.now();

    const child = spawn(process.execPath, [entry], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      const duration = performance.now() - start;
      const passed = code === 0 && !stdout.includes('FAIL') && !stdout.includes('✗');
      resolve({ filename, duration, passed, code, stdout, stderr });
    });

    child.on('error', (err) => {
      const duration = performance.now() - start;
      resolve({ filename, duration, passed: false, code: -1, stdout: '', stderr: err.message });
    });
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const { files, mode } = resolveFiles();
  console.log(`\n=== QA Contract Runner ===`);
  console.log(`Mode: ${mode}`);
  console.log(`Running ${files.length} contract file(s): ${files.join(', ')}\n`);

  const results = [];
  for (const file of files) {
    results.push(await runContract(file));
  }

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  console.log('--- Results ---\n');

  for (const r of results) {
    const ms = r.duration < 1000
      ? `${r.duration.toFixed(0)}ms`
      : `${(r.duration / 1000).toFixed(2)}s`;
    const mark = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${r.filename} (${ms})`);
    if (!r.passed) {
      if (r.code !== 0) console.log(`         exit code: ${r.code}`);
      // Surface first failure line if present
      const failureLine = (r.stdout + r.stderr).split('\n').find(l => l.includes('✗') || l.includes('Error') || l.includes('FAIL'));
      if (failureLine) console.log(`         ${failureLine.trim()}`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`  ${passed.length}/${results.length} passed`);

  if (failed.length > 0) {
    console.log(`\n  Failed: ${failed.map(f => f.filename).join(', ')}`);
    process.exit(1);
  }

  console.log('\n  All contracts passed.\n');
}

main().catch((err) => {
  console.error('Runner error:', err);
  process.exit(1);
});
