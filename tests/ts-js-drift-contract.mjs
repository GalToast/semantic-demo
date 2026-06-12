/**
 * ts-js-drift-contract.mjs
 *
 * Enforces the native TypeScript runtime boundary in js/modules/. Older
 * checkpoints used a dual-source pattern where .ts shadows and .js runtime
 * files coexisted. The runtime build now enters through app.ts; any remaining
 * TS/JS siblings are treated as drift until the JS shadow is retired.
 *
 * Modes:
 *   --check (default) : Compare current drift against KNOWN_BASELINE.
 *                        Exit 0 if drift is unchanged or improved.
 *                        Exit 1 if NEW drift appeared (regression).
 *   --strict          : Exit 1 on ANY drift, even if it matches the baseline.
 *   --update          : Print the current drift state as a JS object literal
 *                        suitable for pasting into KNOWN_BASELINE.
 *   --progress        : Print migration progress scorecard (TS coverage, entry
 *                        readiness, next steps) and exit.
 *
 * Exit code 0 = no regression, 1 = regression or strict failure.
 */

import fs from 'node:fs';
import path from 'node:path';

const MODULES_DIR = path.resolve('js/modules');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const updateMode = args.includes('--update');
const progressMode = args.includes('--progress');

// No tolerated TS/JS drift remains. All JS shadow files in js/modules/ have
// been retired. This contract now enforces a strict native-TS boundary.
const KNOWN_BASELINE = {};

// Helpers

/**
 * Extract exported identifier names from source text.
 */
function extractExports(source) {
  const names = new Set();

  for (const m of source.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?function\s+(\w+)/g,
  )) {
    names.add(m[1]);
  }

  for (const m of source.matchAll(
    /export\s+(?:const|let|var)\s+(\w+)/g,
  )) {
    names.add(m[1]);
  }

  for (const m of source.matchAll(
    /export\s+(?:abstract\s+)?class\s+(\w+)/g,
  )) {
    names.add(m[1]);
  }

  for (const m of source.matchAll(
    /export\s+enum\s+(\w+)/g,
  )) {
    names.add(m[1]);
  }

  for (const m of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const entry of m[1].split(',')) {
      const name = entry.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    }
  }

  if (/export\s+default\b/.test(source)) {
    names.add('default');
  }

  return [...names].sort();
}

/**
 * Extract import paths that reference sibling modules (./foo.js patterns).
 */
function extractSiblingImports(source, ownerBase = null) {
  const deps = new Set();
  const runtimeSource = source.replace(/^\s*import\s+type\b[^\r\n;]*(?:;)?\r?$/gm, '');
  const importPatterns = [
    /from\s+['"]\.\/([\w/-]+)(?:\.js)?['"]/g,
    /import\s+['"]\.\/([\w/-]+)(?:\.js)?['"]/g,
  ];
  for (const pattern of importPatterns) {
    for (const m of runtimeSource.matchAll(pattern)) {
      if (m[1] !== ownerBase) deps.add(m[1]);
    }
  }
  // Also match .ts extension imports. Self-reexports from the TS sibling are
  // compatibility wrappers, not meaningful dependency drift.
  const tsImportPattern = /from\s+['"]\.\/([\w/-]+)\.ts['"]/g;
  for (const m of runtimeSource.matchAll(tsImportPattern)) {
    if (m[1] !== ownerBase) deps.add(m[1]);
  }
  return [...deps].sort();
}

function isRetiredShadowStub(base, source) {
  const uncommented = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trim();
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^export\\s*\\{[\\s\\S]*?\\}\\s*from\\s+['"]\\./${escapedBase}\\.ts['"];?\\s*$`,
  ).test(uncommented);
}

/**
 * Compute the drift object for all TS/JS pairs.
 * Returns { [base]: { tsOnly, jsOnly, tsOnlyImports, jsOnlyImports } }
 * Only includes entries where drift exists.
 */
function computeDrift() {
  const tsFiles = fs.readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter(f => f.isFile() && f.name.endsWith('.ts') && !f.name.endsWith('.d.ts'))
    .map(f => f.name);

  const drift = {};
  const inspected = [];

  for (const tsFile of tsFiles.sort()) {
    const base = tsFile.replace(/\.ts$/, '');
    const jsFile = base + '.ts';
    const tsPath = path.join(MODULES_DIR, tsFile);
    const jsPath = path.join(MODULES_DIR, jsFile);

    inspected.push(tsFile);

    if (!fs.existsSync(jsPath)) continue;

    const tsSource = fs.readFileSync(tsPath, 'utf8');
    const jsSource = fs.readFileSync(jsPath, 'utf8');

    const tsExports = extractExports(tsSource);
    const jsExports = extractExports(jsSource);

    const tsOnly = tsExports.filter(n => !jsExports.includes(n));
    const jsOnly = jsExports.filter(n => !tsExports.includes(n));

    const retiredShadowStub = isRetiredShadowStub(base, jsSource);
    const tsImports = retiredShadowStub ? [] : extractSiblingImports(tsSource, base);
    const jsImports = retiredShadowStub ? [] : extractSiblingImports(jsSource, base);

    const tsOnlyImports = tsImports.filter(d => !jsImports.includes(d));
    const jsOnlyImports = jsImports.filter(d => !tsImports.includes(d));

    if (tsOnly.length || jsOnly.length || tsOnlyImports.length || jsOnlyImports.length) {
      drift[base] = { tsOnly, jsOnly, tsOnlyImports, jsOnlyImports };
    }
  }

  return { drift, inspected };
}

function driftEquals(a, b) {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.join(',') !== keysB.join(',')) return false;
  return keysA.every(k => {
    const da = a[k], db = b[k];
    return (
      da.tsOnly.join(',') === db.tsOnly.join(',') &&
      da.jsOnly.join(',') === db.jsOnly.join(',') &&
      da.tsOnlyImports.join(',') === db.tsOnlyImports.join(',') &&
      da.jsOnlyImports.join(',') === db.jsOnlyImports.join(',')
    );
  });
}

function driftIsSubsetOf(current, baseline) {
  // Current drift must be a subset (or equal) of the baseline.
  // No new keys, no new exports in tsOnly/jsOnly.
  for (const key of Object.keys(current)) {
    if (!baseline[key]) return false;
    const c = current[key], b = baseline[key];
    if (c.tsOnly.some(n => !b.tsOnly.includes(n))) return false;
    if (c.jsOnly.some(n => !b.jsOnly.includes(n))) return false;
    if (c.tsOnlyImports.some(n => !b.tsOnlyImports.includes(n))) return false;
    if (c.jsOnlyImports.some(n => !b.jsOnlyImports.includes(n))) return false;
  }
  return true;
}

// Update mode

if (updateMode) {
  const { drift } = computeDrift();
  console.log('// Paste into KNOWN_BASELINE in ts-js-drift-contract.mjs');
  console.log('// Generated:', new Date().toISOString());
  console.log('const KNOWN_BASELINE = ' + JSON.stringify(drift, null, 2) + ';');
  process.exit(0);
}

// ── Progress mode ──────────────────────────────────────────────────────────
// Scans ALL js/modules/ subdirectories for a comprehensive migration picture.
// Unlike computeDrift() which only looks at root-level .ts files, this scans
// recursively to show the full TS/JS landscape.

if (progressMode) {
  const root = path.resolve('js/modules');

  /**
   * Recursively scan dir for .ts and .js files.
   * @param {string} dir
   * @returns {{ tsOnly: string[], dual: string[], jsOnly: string[] }}
   */
  function scanAll(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const tsOnly = [], dual = [], jsOnly = [];

    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'components') continue;
        const sub = scanAll(path.join(dir, e.name));
        tsOnly.push(...sub.tsOnly);
        dual.push(...sub.dual);
        jsOnly.push(...sub.jsOnly);
        continue;
      }
      if (e.name.endsWith('.d.ts')) continue;

      if (e.name.endsWith('.ts')) {
        const base = e.name.slice(0, -3);
        const hasJs = fs.existsSync(path.join(dir, base + '.js'));
        if (hasJs) dual.push(base);
        else tsOnly.push(base);
      } else if (e.name.endsWith('.ts')) {
        const base = e.name.slice(0, -3);
        const hasTs = fs.existsSync(path.join(dir, base + '.ts'));
        if (!hasTs) jsOnly.push(base);
      }
    }
    return { tsOnly, dual, jsOnly };
  }

  const all = scanAll(root);
  const totalModules = all.tsOnly.length + all.dual.length + all.jsOnly.length;
  const tsCoverage = totalModules > 0
    ? (((all.tsOnly.length + all.dual.length) / totalModules) * 100).toFixed(1)
    : '0.0';

  // Entry readiness: check the active native-TS build entry.
  const appJsPath = path.join(root, 'app.js');
  const appTsPath = path.join(root, 'app.ts');
  const buildScriptPath = path.resolve('scripts/build-app.mjs');
  const buildScriptSource = fs.existsSync(buildScriptPath) ? fs.readFileSync(buildScriptPath, 'utf8') : '';
  const buildUsesAppTs = /entryPoints:\s*\[\s*['"]js\/modules\/app\.ts['"]\s*\]/.test(buildScriptSource);
  const appTsExists = fs.existsSync(appTsPath);
  const appJsExists = fs.existsSync(appJsPath);
  const appSource = fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, 'utf8') : '';
  const entryImports = [];
  const seenImports = new Set();
  const importPatterns = [
    /from\s+['"]\.\/([\w/-]+)(?:\.js)?['"]/g,
    /import\s+['"]\.\/([\w/-]+)(?:\.js)?['"]/g,
  ];
  for (const importRe of importPatterns) {
    let m;
    while ((m = importRe.exec(appSource)) !== null) {
      if (m[1] && !seenImports.has(m[1])) {
        seenImports.add(m[1]);
        entryImports.push(m[1]);
      }
    }
  }
  const entryReadyCount = entryImports.filter(n => {
    return fs.existsSync(path.join(root, ...n.split('/')) + '.ts');
  }).length;
  const entryBlocked = entryImports.filter(n => !fs.existsSync(path.join(root, ...n.split('/')) + '.ts'));
  const nativeEntryReady = buildUsesAppTs && appTsExists && !appJsExists;

  // Drift state
  const { drift } = computeDrift();
  const driftCount = Object.keys(drift).length;

  console.log('\n── TS/JS Migration Progress ──\n');
  console.log(`  Total runtime modules:  ${totalModules}`);
  console.log(`  TS-only (native):       ${all.tsOnly.length}`);
  console.log(`  Dual (TS+JS shadow):    ${all.dual.length}`);
  console.log(`  JS-only (unconverted):  ${all.jsOnly.length}`);
  console.log(`  TS coverage:            ${tsCoverage}%`);
  console.log('');
  console.log(`  TS/JS drift pairs:      ${driftCount}`);
  if (driftCount > 0) {
    for (const [base, d] of Object.entries(drift)) {
      const parts = [];
      if (d.tsOnly.length) parts.push(`TS-only: ${d.tsOnly.join(', ')}`);
      if (d.jsOnly.length) parts.push(`JS-only: ${d.jsOnly.join(', ')}`);
      if (d.tsOnlyImports.length) parts.push(`TS-only imports: ${d.tsOnlyImports.join(', ')}`);
      if (d.jsOnlyImports.length) parts.push(`JS-only imports: ${d.jsOnlyImports.join(', ')}`);
      console.log(`    ${base}: ${parts.join(' | ')}`);
    }
  }
  console.log('');
  console.log(`  Legacy bundle entry:    ${buildUsesAppTs ? 'js/modules/app.ts' : 'not js/modules/app.ts'}`);
  console.log(`  app.ts present:         ${appTsExists ? 'YES' : 'NO'}`);
  console.log(`  app.js retired:         ${appJsExists ? 'NO' : 'YES'}`);
  if (appJsExists) {
    console.log(`  app.js entry imports:   ${entryReadyCount}/${entryImports.length} have TS siblings`);
    if (entryBlocked.length > 0) {
      console.log(`  Blocked (no .ts yet):   ${entryBlocked.join(', ')}`);
    }
  }
  console.log(`  Legacy TS entry ready:  ${nativeEntryReady ? 'YES' : 'NO'}`);
  console.log('');
  console.log('  Legacy bundle entry status:');
  if (!buildUsesAppTs) {
    console.log('    1. Update scripts/build-app.mjs to use js/modules/app.ts as entryPoints[0]');
  } else if (!appTsExists) {
    console.log('    1. Restore js/modules/app.ts before declaring the native TS runtime ready');
  } else if (appJsExists && entryBlocked.length > 0) {
    console.log(`    1. Convert ${entryBlocked.length} blocked modules to .ts:`);
    for (const name of entryBlocked.sort()) {
       console.log(`       - js/modules/${name}.js → .ts`);
    }
  } else {
    console.log('    ✓ build-app.mjs uses app.ts as the legacy bundle entry');
    console.log('    ✓ app.ts owns the legacy runtime init body');
    console.log(`    ${appJsExists ? '• app.js compatibility wrapper still exists' : '✓ app.js compatibility wrapper retired'}`);
    console.log('    Note: production remains the Svelte/Vite shell; this is the rollback/reference bundle lane');
  }
  console.log('');
  process.exit(0);
}

// Check mode

const { drift: currentDrift, inspected } = computeDrift();
const currentKeys = Object.keys(currentDrift).sort();
const baselineKeys = Object.keys(KNOWN_BASELINE).sort();

const newDriftKeys = currentKeys.filter(k => !baselineKeys.includes(k));
const fixedKeys = baselineKeys.filter(k => !currentKeys.includes(k));

// Check if any existing drift has worsened
const worsened = [];
for (const key of currentKeys) {
  if (!KNOWN_BASELINE[key]) continue; // new key, handled above
  const cur = currentDrift[key];
  const base = KNOWN_BASELINE[key];
  const newTsExports = cur.tsOnly.filter(n => !base.tsOnly.includes(n));
  const newJsExports = cur.jsOnly.filter(n => !base.jsOnly.includes(n));
  const newTsImports = cur.tsOnlyImports.filter(n => !base.tsOnlyImports.includes(n));
  const newJsImports = cur.jsOnlyImports.filter(n => !base.jsOnlyImports.includes(n));
  if (newTsExports.length || newJsExports.length || newTsImports.length || newJsImports.length) {
    worsened.push({ key, newTsExports, newJsExports, newTsImports, newJsImports });
  }
}

const hasRegression = newDriftKeys.length > 0 || worsened.length > 0;
const hasImprovement = fixedKeys.length > 0;

// Report

if (strict && currentKeys.length > 0) {
  console.error('\n[tier:fail] --strict mode: any TS/JS drift is a failure.\n');
  for (const key of currentKeys) {
    const d = currentDrift[key];
    const parts = [`  ${key}:`];
    if (d.tsOnly.length) parts.push(`    TS-only exports: ${d.tsOnly.join(', ')}`);
    if (d.jsOnly.length) parts.push(`    JS-only exports: ${d.jsOnly.join(', ')}`);
    if (d.tsOnlyImports.length) parts.push(`    TS-only imports: ${d.tsOnlyImports.join(', ')}`);
    if (d.jsOnlyImports.length) parts.push(`    JS-only imports: ${d.jsOnlyImports.join(', ')}`);
    console.error(parts.join('\n'));
  }
  console.error(`\nDrift contract: ${inspected.length} .ts file(s) inspected, ${currentKeys.length} with drift.`);
  process.exit(1);
}

if (hasRegression) {
  console.error('\n[tier:fail] NEW TS/JS drift detected (regression beyond baseline):\n');
  if (newDriftKeys.length) {
    console.error('  New drifted modules (not in baseline):');
    for (const key of newDriftKeys) {
      const d = currentDrift[key];
      const parts = [`    ${key}:`];
      if (d.tsOnly.length) parts.push(`      TS-only exports: ${d.tsOnly.join(', ')}`);
      if (d.jsOnly.length) parts.push(`      JS-only exports: ${d.jsOnly.join(', ')}`);
      if (d.tsOnlyImports.length) parts.push(`      TS-only imports: ${d.tsOnlyImports.join(', ')}`);
      if (d.jsOnlyImports.length) parts.push(`      JS-only imports: ${d.jsOnlyImports.join(', ')}`);
      console.error(parts.join('\n'));
    }
  }
  if (worsened.length) {
    console.error('  Existing modules with new drift:');
    for (const w of worsened) {
      const parts = [`    ${w.key}:`];
      if (w.newTsExports.length) parts.push(`      new TS-only exports: ${w.newTsExports.join(', ')}`);
      if (w.newJsExports.length) parts.push(`      new JS-only exports: ${w.newJsExports.join(', ')}`);
      if (w.newTsImports.length) parts.push(`      new TS-only imports: ${w.newTsImports.join(', ')}`);
      if (w.newJsImports.length) parts.push(`      new JS-only imports: ${w.newJsImports.join(', ')}`);
      console.error(parts.join('\n'));
    }
  }
  console.error(
    `\nDrift contract: ${inspected.length} .ts file(s) inspected.\n` +
    `Update the JS sibling to match the TS surface, or update KNOWN_BASELINE.`,
  );
  process.exit(1);
}

// ── Semantic pattern guard ──────────────────────────────────────────────────
// Retired: Previously checked for critical runtime patterns that drifted 
// between TS and JS. With all JS shadows removed, these are now managed 
// exclusively through TypeScript type safety and unit tests.
const SEMANTIC_RULES = [];

let semanticFailures = [];
for (const rule of SEMANTIC_RULES) {
  const jsPath = path.join(MODULES_DIR, rule.jsFile);
  if (!fs.existsSync(jsPath)) continue;
  const src = fs.readFileSync(jsPath, 'utf8');
  if (!rule.pass(src)) {
    semanticFailures.push(rule);
  }
}

if (semanticFailures.length > 0) {
  console.error('\n[tier:fail] Semantic pattern guard FAILED:\n');
  for (const rule of semanticFailures) {
    console.error(`  ${rule.name}: ${rule.fail}`);
  }
  console.error(
    '\nThese patterns indicate TS/JS semantic drift that could cause runtime bugs.\n' +
    'Fix the JS file to match the TS implementation, or update SEMANTIC_RULES if the TS changed.',
  );
  process.exit(1);
}

// No regression
if (hasImprovement) {
  console.log(`\n[tier:info] Drift improvement detected: fixed modules: ${fixedKeys.join(', ')}`);
  console.log('  Consider removing these entries from KNOWN_BASELINE.\n');
}

if (currentKeys.length > 0) {
  console.warn(
    `\n[tier:warn] Known drift unchanged (${currentKeys.length} module(s): ${currentKeys.join(', ')}).\n` +
    '  Run with --update to refresh KNOWN_BASELINE after fixing JS siblings.',
  );
}

console.log(
  `ts-js-drift-contract OK: ${inspected.length} .ts file(s) inspected, ` +
  `no regression beyond baseline.`,
);
