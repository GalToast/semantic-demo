/**
 * run-all-contracts.js
 *
 * Ordered QA contract runner with optional manifest-based group execution.
 *
 * Default (no flags): runs the pinned ordered list (38 contracts).
 *   node tests/run-all-contracts.js
 *
 * Group mode: --group=<name> reads from contracts.manifest.json
 *   node tests/run-all-contracts.js --group=smoke
 *   node tests/run-all-contracts.js --group=motion
 *   node tests/run-all-contracts.js --group=mobile-critical
 *   node tests/run-all-contracts.js --group=lifecycle
 *   node tests/run-all-contracts.js --group=full
 *
 * Validation self-test (no contracts executed):
 *   node tests/run-all-contracts.js --validate
 *
 * Pass detection:
 *   - Exit code 0
 *   - No "FAIL" token in stdout
 *   - No "[FAIL]" failure marker in stdout
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TESTS_DIR = __dirname;
const MANIFEST_PATH = join(__dirname, 'contracts.manifest.json');

// Pinned ordered list: this is the authoritative default run.
const PINNED_FILES = [
  'semantic-dive-ui-surface-contract.mjs',
  'search-state-surface-contract.mjs',
  'lifecycle-composition-contract.mjs',
  'state-transition-contract.mjs',
  'focus-semantic-state-boundary-contract.mjs',
  'journey-compass-state-contract.mjs',
  'semantic-lane-contract.mjs',
  'connection-analysis-contract.mjs',
  'camera-controls-motion-contract.mjs',
  'focus-pocket-motion-contract.mjs',
  'focus-pocket-composition-contract.mjs',
  'journey-event-bindings-contract.mjs',
  'micro-demo-contract.mjs',
  'demo-init-seam-contract.mjs',
  'reset-callsite-routing-contract.mjs',
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
  'semantic-guide-payload-contract.mjs',
  'connection-analysis-render-state-contract.mjs',
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

/**
 * Discover all *-contract.mjs files in tests/ that are not self-test helpers.
 * Excludes: utils-contract.mjs, surface-contract-check.mjs (multi-surface runners).
 */
function discoverUnlistedContracts() {
  const all = readdirSync(TESTS_DIR).filter(f => f.endsWith('.mjs'));
  const selfTestHelpers = new Set(['utils-contract.mjs', 'surface-contract-check.mjs']);
  const contractPattern = /-contract\.mjs$/;
  return all.filter(f => contractPattern.test(f) && !selfTestHelpers.has(f));
}

function resolveFiles() {
  const args = process.argv.slice(2);
  const groupArg = args.find(a => a.startsWith('--group='));

  if (!groupArg) {
    // Default: use pinned ordered list; no manifest discovery, no regression.
    return { files: PINNED_FILES, mode: 'pinned' };
  }

  const groupName = groupArg.split('=')[1];
  const group = getGroupFromManifest(groupName);

  if (!group) {
    process.exit(1);
  }

  return { files: group.contracts, mode: `group:${groupName}` };
}

// Validation

/**
 * Full validation pass; no contracts executed.
 * Exits 0 if all checks pass, nonzero otherwise.
 */
function runValidation() {
  let exitCode = 0;
  const errors = [];
  const warnings = [];

  // 1. Every pinned file must exist on disk.
  for (const file of PINNED_FILES) {
    const path = join(TESTS_DIR, file);
    if (!existsSync(path)) {
      errors.push(`PINNED_MISSING: '${file}' is listed in PINNED_FILES but does not exist on disk`);
      exitCode = 1;
    }
  }

  // 2. Manifest file must exist.
  if (!existsSync(MANIFEST_PATH)) {
    errors.push(`MANIFEST_MISSING: '${MANIFEST_PATH}' does not exist`);
    exitCode = 1;
  } else {
    const manifest = loadManifest();
    if (!manifest || !manifest.groups) {
      errors.push(`MANIFEST_INVALID: contracts.manifest.json is valid JSON but missing 'groups' key`);
      exitCode = 1;
    } else {
      // 3. Every group must have a non-empty contracts array.
      for (const [groupName, group] of Object.entries(manifest.groups)) {
        if (!Array.isArray(group.contracts) || group.contracts.length === 0) {
          errors.push(`GROUP_EMPTY: group '${groupName}' has no contracts`);
          exitCode = 1;
        }
        // 4. Every file listed in a group must exist on disk.
        if (Array.isArray(group.contracts)) {
          for (const file of group.contracts) {
            const path = join(TESTS_DIR, file);
            if (!existsSync(path)) {
              errors.push(`GROUP_FILE_MISSING: group '${groupName}' lists '${file}' which does not exist`);
              exitCode = 1;
            }
          }
        }
      }

      // 5. The 'full' group must exactly match PINNED_FILES.
      const fullGroup = manifest.groups['full'];
      if (fullGroup && Array.isArray(fullGroup.contracts)) {
        if (fullGroup.contracts.length !== PINNED_FILES.length) {
          errors.push(`FULL_GROUP_COUNT_MISMATCH: full group has ${fullGroup.contracts.length} files, pinned list has ${PINNED_FILES.length}`);
          exitCode = 1;
        } else {
          for (let i = 0; i < PINNED_FILES.length; i++) {
            if (fullGroup.contracts[i] !== PINNED_FILES[i]) {
              errors.push(`FULL_GROUP_ORDER_MISMATCH: full group[${i}]='${fullGroup.contracts[i]}' != PINNED_FILES[${i}]='${PINNED_FILES[i]}'`);
              exitCode = 1;
            }
          }
        }
      } else if (!fullGroup) {
        errors.push(`FULL_GROUP_MISSING: manifest is missing the 'full' group`);
        exitCode = 1;
      }
    }
  }

  // 6. Report unlisted contract files (warn only; they may be intentionally excluded).
  const unlisted = discoverUnlistedContracts().filter(f => !PINNED_FILES.includes(f));
  const manifestFiles = Object.values(loadManifest()?.groups || {}).flatMap(g => g.contracts || []);
  const orphanFiles = unlisted.filter(f => !manifestFiles.includes(f));
  if (orphanFiles.length > 0) {
    warnings.push(`ORPHAN_CONTRACT_FILES: ${orphanFiles.length} contract file(s) exist but are not in PINNED_FILES or any manifest group: ${orphanFiles.join(', ')}`);
  }

  // Output
  console.log('\n=== Runner Validation ===\n');
  if (errors.length > 0) {
    console.log('ERRORS:');
    for (const e of errors) console.log(`  [ERROR] ${e}`);
  }
  if (warnings.length > 0) {
    console.log('WARNINGS:');
    for (const w of warnings) console.log(`  [WARN] ${w}`);
  }
  if (errors.length === 0 && warnings.length === 0) {
    console.log('  All validations passed.');
  }
  console.log(`\n  Pinned list:      ${PINNED_FILES.length} files`);
  console.log(`  Unlisted orphans: ${orphanFiles.length} file(s) (see warnings above)`);
  console.log('');

  process.exit(exitCode);
}

// Execute a single contract file

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
      const passed = code === 0 && !stdout.includes('FAIL') && !stdout.includes('[FAIL]');
      resolve({ filename, duration, passed, code, stdout, stderr });
    });

    child.on('error', (err) => {
      const duration = performance.now() - start;
      resolve({ filename, duration, passed: false, code: -1, stdout: '', stderr: err.message });
    });
  });
}

// Main

async function main() {
  // Intercept --validate before anything else.
  if (process.argv.includes('--validate')) {
    runValidation();
    return; // never reached in practice; runValidation exits
  }

  const { files, mode } = resolveFiles();
  console.log(`\n=== QA Contract Runner ===`);
  console.log(`Mode: ${mode}`);
  console.log(`Running ${files.length} contract file(s)\n`);

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
      const failureLine = (r.stdout + r.stderr).split('\n').find(l => l.includes('[FAIL]') || l.includes('Error') || l.includes('FAIL'));
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
