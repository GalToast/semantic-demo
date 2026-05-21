/**
 * run-all-contracts.js
 *
 * Ordered QA contract runner with optional manifest-based group execution.
 *
 * Default (no flags): runs the pinned ordered list (38 contracts).
 *   node tests/run-all-contracts.js
 *
 * Group mode: --group=<name> reads from contracts.manifest.json
 *   node tests/run-all-contracts.js --group=core
 *   node tests/run-all-contracts.js --group=navigation
 *   node tests/run-all-contracts.js --group=scene
 *   node tests/run-all-contracts.js --group=smoke
 *   node tests/run-all-contracts.js --group=motion
 *   node tests/run-all-contracts.js --group=lifecycle
 *   node tests/run-all-contracts.js --group=browser
 *   node tests/run-all-contracts.js --group=browser-interaction
 *   node tests/run-all-contracts.js --group=render
 *   node tests/run-all-contracts.js --group=quality
 *   node tests/run-all-contracts.js --group=mobile-critical
 *   node tests/run-all-contracts.js --group=full
 *
 * List groups: --list shows all available groups with contract counts and descriptions.
 *   node tests/run-all-contracts.js --list
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
import http from 'node:http';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TESTS_DIR = __dirname;
const MANIFEST_PATH = join(__dirname, 'contracts.manifest.json');
const PROJECT_ROOT = join(TESTS_DIR, '..');
const SERVER_PORT = 8795;
const SERVER_START_TIMEOUT_MS = 10000;
const SERVER_POLL_INTERVAL_MS = 250;

// Groups that require the canonical local static server on port 8795.
// Alternate-port or environment-specific groups must manage their own setup.
const SERVER_GROUPS = new Set([
  'scene',
  'browser-interaction',
  'live-url',
  'extraction',
  'quality',
  'mobile-critical',
  '3d-engine',
  '3d-interaction-quality',
  '3d-pointer',
  '3d-focus-neighborhood',
  '3d-visual-quality',
  '3d-resilience',
  '3d-state-data',
  '3d-accessibility-fallback-performance',
  '3d-smoke',
  '3d-slow',
  '3d-full',
]);

/**
 * Check if a server is already running on SERVER_PORT by sending a light HTTP request.
 * Returns true if a response is received (server is up), false otherwise.
 */
function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 2000 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start a local static server from PROJECT_ROOT on SERVER_PORT.
 * Returns a handle with .kill() for shutdown.
 */
async function startStaticServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', '.'], {
      stdio: 'ignore',
      cwd: PROJECT_ROOT,
      detached: false,
    });
    let settled = false;
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Static server exited before readiness check completed (code=${code}, signal=${signal})`));
    });

    (async () => {
      const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (await isServerRunning(port)) {
          if (settled) return;
          settled = true;
          resolve({ kill: () => child.kill(), port });
          return;
        }
        await sleep(SERVER_POLL_INTERVAL_MS);
      }
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error(`Static server failed to respond on port ${port} within ${SERVER_START_TIMEOUT_MS}ms`));
      }
    })();
  });
}

function createServerLease(groupName) {
  if (!SERVER_GROUPS.has(groupName)) return null;
  let ownedServer = null;
  let borrowedLogged = false;
  const explicitBaseUrl = process.env.TEST_BASE_URL;

  return {
    async ensure() {
      if (explicitBaseUrl) {
        if (!borrowedLogged) {
          console.log(`  [server] using explicit TEST_BASE_URL=${explicitBaseUrl}`);
          borrowedLogged = true;
        }
        return;
      }

      if (await isServerRunning(SERVER_PORT)) {
        if (!ownedServer && !borrowedLogged) {
          console.log(`  [server] port ${SERVER_PORT} already in use — borrowing pre-warmed dev server`);
          borrowedLogged = true;
        }
        return;
      }

      console.log(`  [server] auto-starting static server on port ${SERVER_PORT}...`);
      ownedServer = await startStaticServer(SERVER_PORT);
      console.log(`  [server] static server running on port ${SERVER_PORT}`);
    },

    close() {
      if (!ownedServer) return;
      console.log(`  [server] shutting down static server on port ${SERVER_PORT}...`);
      ownedServer.kill();
      ownedServer = null;
      console.log(`  [server] closed`);
    },
  };
}

// Pinned ordered list: this is the authoritative default run.
const PINNED_FILES = [
  'semantic-dive-ui-surface-contract.mjs',
  'search-state-surface-contract.mjs',
  'lifecycle-composition-contract.mjs',
  'state-transition-contract.mjs',
  'state-transition-table-contract.mjs',
  'step-inside-state-sync-contract.mjs',
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
  'state-ownership-contract.mjs',
  'exploration-modes-contract.mjs',
  'scene-reveal-contract.mjs',
  'scene-atmosphere-contract.mjs',
  'motion-state-contract.mjs',
  'demo-state-sync-contract.mjs',
  'three-visual-polish-contract.mjs',
  'search-peek-expanded-render-contract.mjs',
  'semantic-guide-payload-contract.mjs',
  'connection-analysis-render-state-contract.mjs',
  'reduced-motion-interruption.spec.js',
  'gemma-fallback-error.spec.js',
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
 * Also discovers standalone Playwright interaction specs (*.spec.js) that are
 * not helper scripts — these are group-member candidates (e.g. canvas-hit-test,
 * live-reset-interaction) and must not be silently orphaned.
 */
function discoverUnlistedContracts() {
  const allMjs = readdirSync(TESTS_DIR).filter(f => f.endsWith('.mjs'));
  const selfTestHelpers = new Set(['utils-contract.mjs', 'surface-contract-check.mjs']);
  const contractPattern = /-contract\.mjs$/;
  const mjsContracts = allMjs.filter(f => contractPattern.test(f) && !selfTestHelpers.has(f));

  // Playwright *.spec.js files that are not helper utilities.
  // These use real browser automation and are discoverable contract entries.
  const allSpec = readdirSync(TESTS_DIR).filter(f => f.endsWith('.spec.js'));
  const specExclusions = new Set(['inspect_element.js']); // not a test suite
  const specContracts = allSpec.filter(f => !specExclusions.has(f));

  return { mjsContracts, specContracts };
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
  const { mjsContracts, specContracts } = discoverUnlistedContracts();
  const allUnlisted = [...mjsContracts, ...specContracts];
  const manifestFiles = Object.values(loadManifest()?.groups || {}).flatMap(g => g.contracts || []);
  const orphanFiles = allUnlisted.filter(f => !PINNED_FILES.includes(f) && !manifestFiles.includes(f));
  const orphanMjs = orphanFiles.filter(f => f.endsWith('.mjs'));
  const orphanSpec = orphanFiles.filter(f => f.endsWith('.spec.js'));
  if (orphanMjs.length > 0) {
    warnings.push(`ORPHAN_MJS_CONTRACTS: ${orphanMjs.length} .mjs contract file(s) not in PINNED_FILES or any manifest group: ${orphanMjs.join(', ')}`);
  }
  if (orphanSpec.length > 0) {
    warnings.push(`ORPHAN_SPEC_CONTRACTS: ${orphanSpec.length} .spec.js file(s) not in any manifest group: ${orphanSpec.join(', ')}`);
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
  const totalOrphans = orphanMjs.length + orphanSpec.length;
  console.log(`  Unlisted orphans: ${totalOrphans} file(s) (see warnings above)`);
  console.log('');

  process.exit(exitCode);
}

// Execute a single contract file

// Playwright test flags for browser-interaction specs.
const PLAYWRIGHT_CLI = join(PROJECT_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const PLAYWRIGHT_FLAGS = ['--browser=chromium', '--workers=1'];
const CONTRACT_TIMEOUT_MS = Number(process.env.CONTRACT_TIMEOUT_MS || 240000);

function isPlaywrightTestFile(filename, entry) {
  if (filename.endsWith('.spec.js')) return true;
  if (!filename.endsWith('.mjs')) return false;
  const source = readFileSync(entry, 'utf8');
  return /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"]@playwright\/test['"]/.test(source);
}

function runContract(filename) {
  return new Promise((resolve) => {
    const entry = join(TESTS_DIR, filename);
    const start = performance.now();
    let settled = false;

    // Playwright test suites may use .spec.js or explicit .mjs contract names.
    // Custom browser scripts that import `playwright` directly still run as Node.
    const isPlaywrightSpec = isPlaywrightTestFile(filename, entry);
    const exec = process.execPath;
    const execArgs = isPlaywrightSpec
      ? [PLAYWRIGHT_CLI, 'test', `tests/${filename}`, ...PLAYWRIGHT_FLAGS]
      : [entry];

    const child = spawn(exec, execArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: PROJECT_ROOT,
      env: { ...process.env, TEST_BASE_URL: process.env.TEST_BASE_URL || `http://127.0.0.1:${SERVER_PORT}` },
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      const duration = performance.now() - start;
      resolve({
        filename,
        duration,
        passed: false,
        code: -1,
        stdout,
        stderr: `${stderr}\nContract timed out after ${CONTRACT_TIMEOUT_MS}ms`.trim(),
      });
    }, CONTRACT_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const duration = performance.now() - start;
      const passed = code === 0 && !stdout.includes('FAIL') && !stdout.includes('[FAIL]');
      resolve({ filename, duration, passed, code, stdout, stderr });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const duration = performance.now() - start;
      resolve({ filename, duration, passed: false, code: -1, stdout: '', stderr: err.message });
    });
  });
}

// Main

async function main() {
  // Intercept --list before anything else.
  if (process.argv.includes('--list')) {
    const manifest = loadManifest();
    if (!manifest || !manifest.groups) {
      console.error('No manifest groups found.');
      process.exit(1);
    }
    console.log('\n=== Contract Groups ===\n');
    for (const [name, group] of Object.entries(manifest.groups)) {
      const count = Array.isArray(group.contracts) ? group.contracts.length : 0;
      const desc = group.description || '';
      console.log(`  ${name} (${count})  ${desc}`);
    }
    console.log('');
    return;
  }

  // Intercept --validate before anything else.
  if (process.argv.includes('--validate')) {
    runValidation();
    return; // never reached in practice; runValidation exits
  }

  const { files, mode } = resolveFiles();
  const groupName = mode.startsWith('group:') ? mode.slice(6) : null;
  console.log(`\n=== QA Contract Runner ===`);
  console.log(`Mode: ${mode}`);
  console.log(`Running ${files.length} contract file(s)\n`);

  const serverLease = groupName ? createServerLease(groupName) : null;

  const runContracts = async () => {
    const results = [];
    for (const file of files) {
      if (serverLease) await serverLease.ensure();
      console.log(`  [run] ${file}`);
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
  };

  try {
    await runContracts();
  } finally {
    if (serverLease) serverLease.close();
  }
}

main().catch((err) => {
  console.error('Runner error:', err);
  process.exit(1);
});
