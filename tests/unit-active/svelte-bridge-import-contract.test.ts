/**
 * svelte-bridge-import-contract.test.ts — Enforce the Svelte-bridge import contract
 *
 * The contract (reframed 2026-06-14 per the strategic correction):
 *   1. No file outside src/lib/engine/* should import directly from js/ — they
 *      must go through the engine bridge.
 *   2. Every src/lib/engine/*-bridge.ts that exists must have ≥1 consumer.
 *   3. Bridges that point at legacy (js/modules/*) are the work-to-do for
 *      W11-T9/T10 (kernel port + render loop). They are NOT anti-patterns —
 *      they're the migration seam.
 *
 * The previous "APPROVED_ANTIPATTERN_COUNT" assertion is intentionally
 * removed. The W11 end state has many direct legacy imports in non-engine
 * files because consumers reach through the bridge indirection to the
 * kernel. Counting them is a moving target by design.
 *
 * The real contract is "no dead bridges" + "no direct js/ imports outside
 * the engine" + informational progress on bridges that still point at
 * legacy.
 *
 * See: docs/wave-11-engine-port-plan-2026-06-14.md (Strategic clarification
 * + The 3-step retirement path sections).
 */
import { describe, it, expect, beforeAll } from 'vitest';
// @ts-expect-error repo test tsconfig omits Node ambient types; Vitest runtime provides these modules
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
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
const APPROVED_ANTIPATTERN_COUNT = 0;

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

  it('no direct js/ imports in non-engine files (the contract)', () => {
    // Every direct js/ import outside src/lib/engine/* is a contract
    // violation. The bridge indirection is mandatory. APPROVED_ANTIPATTERN_COUNT
    // is preserved as a soft cap (no new anti-patterns beyond the current
    // baseline) but the hard requirement is that the count not exceed it.
    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.file}  →  ${v.importPath}`)
        .join('\n');
      // eslint-disable-next-line no-console
      console.log(
        `\n${violations.length} direct js/ imports from src/lib/<non-engine>:\n${summary}\n` +
          `To add a new direct import: import through the matching bridge in src/lib/engine/* instead of js/ directly.\n` +
          `See docs/wave-11-engine-port-plan-2026-06-14.md (Strategic clarification + The 3-step retirement path).`
      );
    }
    expect(violations.length).toBeLessThanOrEqual(APPROVED_ANTIPATTERN_COUNT);
  });

  it('anti-pattern count is within the approved baseline (workers MUST NOT add new ones)', () => {
    // Soft contract: violations should not grow beyond the current approved
    // baseline. Migration tickets reduce the count; update
    // APPROVED_ANTIPATTERN_COUNT in lockstep with the migration commit.
    // Baseline 58→0 on 2026-06-14 by restoring all sanctioned bridges in
    // src/lib/engine/* and rewiring every consumer file (journey, demo,
    // keyboard, orchestration, ui) to consume through them. Zero
    // anti-patterns remain; any new direct js/ import outside engine is a
    // regression and must be rejected.
    // The hard contract is the upper-bound assertion above; this test
    // just makes sure the count matches what was approved at last commit.
    expect(violations.length).toBeLessThanOrEqual(APPROVED_ANTIPATTERN_COUNT);
  });
});

describe('Bridge health (W11 retirement progress)', () => {
  interface BridgeHealth {
    path: string;
    consumerCount: number;
    targetType: 'legacy' | 'svelte5' | 'mixed' | 'other';
    isDead: boolean;
  }

  function listBridgeFiles(): string[] {
    const out: string[] = [];
    const engineDir = join(SRC_DIR, 'lib/engine');
    if (!existsSync(engineDir)) return out;
    for (const entry of readdirSync(engineDir)) {
      const full = join(engineDir, entry);
      try {
        if (statSync(full).isFile() && entry.endsWith('-bridge.ts') && !entry.endsWith('.d.ts')) {
          out.push(full);
        }
      } catch {
        // skip unreadable
      }
    }
    return out;
  }

  function classifyBridge(bridge: string): BridgeHealth['targetType'] {
    let source: string;
    try {
      source = readFileSync(bridge, 'utf-8');
    } catch {
      return 'other';
    }
    const reExports = source.match(/export\s+(?:{[^}]+}|\*)\s+from\s+['"]([^'"]+)['"]/g) ?? [];
    let hasLegacy = false;
    let hasSvelte5 = false;
    for (const re of reExports) {
      const target = re.replace(/^export\s+(?:{[^}]+}|\*)\s+from\s+['"]/, '').replace(/['"]$/, '');
      if (target.includes('js/modules') || target.includes('js/state') || target.includes('../../../js')) {
        hasLegacy = true;
      } else if (target.includes('@lib/') || target.startsWith('./') || target.startsWith('../')) {
        hasSvelte5 = true;
      }
    }
    if (hasLegacy && hasSvelte5) return 'mixed';
    if (hasLegacy) return 'legacy';
    if (hasSvelte5) return 'svelte5';
    return 'other';
  }

  function countConsumers(bridge: string): number {
    // Walk src/ and find files that import this bridge by its basename
    const base = bridge.replace(/\\/g, '/').split('/').pop()!.replace(/\.ts$/, '');
    const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const importRegex = new RegExp(`from\\s+['"][^'"]*${escapedBase}['"]`);
    const allFiles = walkSrc(SRC_DIR);
    let count = 0;
    for (const file of allFiles) {
      if (file === bridge) continue;
      try {
        const source = readFileSync(file, 'utf-8');
        if (importRegex.test(source)) count++;
      } catch {
        // skip unreadable
      }
    }
    return count;
  }

  let bridges: BridgeHealth[];

  beforeAll(() => {
    bridges = listBridgeFiles().map((b) => {
      const consumerCount = countConsumers(b);
      return {
        path: relative(PROJECT_ROOT, b),
        consumerCount,
        targetType: classifyBridge(b),
        isDead: consumerCount === 0
      };
    });
  });

  it('no bridge is dead (zero consumers = cleanup candidate)', () => {
    const dead = bridges.filter((b) => b.isDead);
    if (dead.length > 0) {
      const summary = dead.map((b) => `  ${b.path}`).join('\n');
      // eslint-disable-next-line no-console
      console.log(
        `\n${dead.length} dead bridges (zero consumers — safe to delete in a follow-up):\n${summary}\n` +
          `Use \`git rm <bridge>\` once verified.\n`
      );
    }
    expect(dead.length).toBe(0);
  });

  it('reports bridges still pointing at legacy (W11-T9/T10 work-to-do)', () => {
    const legacyBridges = bridges.filter((b) => b.targetType === 'legacy');
    const svelte5Bridges = bridges.filter((b) => b.targetType === 'svelte5');
    const mixedBridges = bridges.filter((b) => b.targetType === 'mixed');
    // eslint-disable-next-line no-console
    console.log(
      `\nBridge retirement progress: ${svelte5Bridges.length}/${bridges.length} flipped to Svelte 5 ports.\n` +
        `Bridges still pointing at legacy (T9/T10 work): ${legacyBridges.length}\n` +
        `Bridges partially flipped (mixed): ${mixedBridges.length}\n` +
        (legacyBridges.length > 0
          ? `Legacy bridges:\n${legacyBridges.map((b) => `  ${b.path}`).join('\n')}\n`
          : '')
    );
    // Informational only — do not fail.
    expect(true).toBe(true);
  });
});
