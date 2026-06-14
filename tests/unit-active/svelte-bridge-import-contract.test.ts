/**
 * svelte-bridge-import-contract.test.ts — Enforce the Svelte-bridge import contract
 *
 * The contract: only `src/lib/engine/*` may import from `js/`. All other
 * `src/lib/<other>/*` files must go through the engine bridge to consume
 * engine kernel functionality.
 *
 * See: docs/svelte-bridge-import-contract.md
 *
 * This test scans the source tree for direct imports from `js/` outside the
 * engine bridge. It:
 *   1. Counts the current anti-pattern imports (allowlist-based)
 *   2. Fails the build if a NEW anti-pattern import is added
 *   3. Provides a baseline to track migration progress
 *
 * Anti-patterns are ALLOWED at the current approved count, so workers
 * aren't blocked. But new anti-patterns fail the test. Migration tickets
 * reduce the count over time.
 */
import { describe, it, expect, beforeAll } from 'vitest';
// @ts-expect-error repo test tsconfig omits Node ambient types; Vitest runtime provides these modules
import { readFileSync, readdirSync, statSync } from 'fs';
// @ts-expect-error repo test tsconfig omits Node ambient types; Vitest runtime provides these modules
import { dirname, join, relative, resolve } from 'path';
// @ts-expect-error repo test tsconfig omits Node ambient types; Vitest runtime provides these modules
import { fileURLToPath } from 'url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIR, '../..');
const SRC_DIR = join(PROJECT_ROOT, 'src');

/** Directories allowed to import from js/ (the bridge) */
const BRIDGE_ALLOWLIST = new Set([
  'src/lib/engine',
]);

/** Current anti-pattern import count — workers SHOULD reduce this over time */
const APPROVED_ANTIPATTERN_COUNT = 51;

interface ImportViolation {
  file: string;
  importPath: string;
  relativePath: string;
}

/** Recursively walk a directory, returning .ts / .svelte files. */
function walkSrc(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkSrc(full));
    } else if (/\.(ts|svelte)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function findJsImports(file: string): string[] {
  const source = readFileSync(file, 'utf-8');
  const matches = source.match(/from\s+['"](?:\.\.\/)+js(?:\/[^'"]*)?['"]/g) ?? [];
  return matches.map((m: string) => m.replace(/^from\s+['"]/, '').replace(/['"]$/, ''));
}

function isInAllowlist(file: string): boolean {
  const rel = relative(PROJECT_ROOT, file).split(/[\\/]/).join('/');
  const relDir = rel.split('/').slice(0, -1).join('/');
  return Array.from(BRIDGE_ALLOWLIST).some(
    (allowed) => relDir === allowed || relDir.startsWith(allowed + '/')
  );
}

// Excluded paths: the test infrastructure itself + archived reference
function isExcluded(file: string): boolean {
  const rel = relative(PROJECT_ROOT, file);
  return rel.startsWith('tests/') || rel.startsWith('legacy-reference/');
}

describe('Svelte-bridge import contract (S7)', () => {
  let allFiles: string[];
  let violations: ImportViolation[];

  beforeAll(() => {
    // Walk all of src/ so the contract covers components + lib + scripts
    allFiles = walkSrc(SRC_DIR);
    violations = [];

    for (const file of allFiles) {
      if (isExcluded(file)) continue;
      if (isInAllowlist(file)) continue;
      const imports = findJsImports(file);
      for (const importPath of imports) {
        violations.push({
          file: relative(PROJECT_ROOT, file),
          importPath,
          relativePath: relative(PROJECT_ROOT, file),
        });
      }
    }
  });

  it('src/lib/<engine>/* is the only sanctioned bridge to js/', () => {
    // Sanity: the engine dir should be in the allowlist
    expect(BRIDGE_ALLOWLIST.has('src/lib/engine')).toBe(true);
  });

  it('finds anti-pattern direct imports outside the bridge', () => {
    // The test should find at least the known anti-patterns
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.length).toBeLessThanOrEqual(APPROVED_ANTIPATTERN_COUNT);
  });

  it('anti-pattern count matches the approved baseline (workers MUST NOT add new ones)', () => {
    // If a worker added a new anti-pattern import, this fails.
    // Migration tickets reduce the count; update APPROVED_ANTIPATTERN_COUNT
    // in lockstep with the migration commit.
    // Baseline established 2026-06-14 and reduced by adapter waves.
    // 52 are anti-pattern after re-measuring the full src/ tree on 2026-06-14
    // after migrating src/lib/orchestration/window-actions.ts behind
    // @lib/engine/window-actions-bridge. Earlier 20/23 counts were
    // stale/incomplete relative to the test's actual scan scope. Batch 5
    // restored the missing focus-pocket bridge file without reducing this
    // broader baseline.
    expect(violations.length).toBe(APPROVED_ANTIPATTERN_COUNT);
  });

  it('lists the specific anti-pattern files (informational, not enforcing)', () => {
    // This is documentation — prints the violations so failures show
    // exactly which file added a new direct import.
    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.file}  →  ${v.importPath}`)
        .join('\n');
      // eslint-disable-next-line no-console
      console.log(
        `\n${violations.length} anti-pattern imports from src/lib/<non-engine> → js/:\n${summary}\n` +
          `To add a new direct import: add a bridge in src/lib/engine/* first, then import from there.\n` +
          `To migrate an existing one: add it to the bridge, rewrite the import, and update APPROVED_ANTIPATTERN_COUNT.\n` +
          `See docs/svelte-bridge-import-contract.md for the full contract.`
      );
    }
    expect(violations.length).toBe(APPROVED_ANTIPATTERN_COUNT);
  });
});
