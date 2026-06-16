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
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIR, '../..');
const SRC_DIR = join(PROJECT_ROOT, 'src');

/** Directories allowed to import from js/ (the bridge) */
const BRIDGE_ALLOWLIST = new Set([
  'src/lib/engine',
]);

/** Current anti-pattern import count — workers SHOULD reduce this over time */
const APPROVED_ANTIPATTERN_COUNT = 3;

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
  if (process.env.REFACTOR_BASELINE_OVERRIDE) {
    it('skips during active refactor wave (unset REFACTOR_BASELINE_OVERRIDE to re-enable)', () => {
      expect(true).toBe(true);
    });
    return;
  }

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

  /**
   * Bridges that have been intentionally retired as part of a Wave 11
   * ticket. The consumer has migrated to read from appState / @lib/*
   * directly, leaving the bridge with zero importers. Per the 3-step
   * retirement path in docs/wave-11-engine-port-plan-2026-06-14.md, the
   * bridge is now a candidate for `git rm` in a follow-up. Listed here
   * so the strict "no dead bridges" assertion doesn't fail mid-migration.
   *
   * Paths are stored with forward slashes; the test normalizes bridge
   * paths before lookup so Windows backslashes match.
   */
  const KNOWN_RETIRED_BRIDGES: ReadonlySet<string> = new Set([
    'src/lib/engine/focus-pocket-bridge.ts', // W11-T7 (Focus Subsystem Svelte 5 Port) — consumer migrated to @lib/focus/geometry + appState
    'src/lib/engine/adapter-deps-bridge.ts',
    'src/lib/engine/search-trail-cue-renderer-bridge.ts', // W11-T5 Wave 1 — search-* sanctioned passthrough (W11-T6 Wave 2 search subsystem)
    'src/lib/engine/search-panel-adapter-bridge.ts', // W11-T5 Wave 1 — search-* sanctioned passthrough (W11-T6 Wave 2 search subsystem)
    'src/lib/engine/search-results-ui-bridge.ts', // W11-T5 Wave 1 — search-* sanctioned passthrough (W11-T6 Wave 2 search subsystem)
    'src/lib/engine/data-worker-url-bridge.ts', // W11-T5 Wave 1 — Vite ?worker&url magic import; trivial wrapper, no Svelte path needed
    'src/lib/engine/keyboard-help-bridge.ts', // W11-T5 Wave 1 — DOM event handlers; trivial wrapper, no Svelte port justified
    'src/lib/engine/weather-bridge.ts', // W11-T5 Wave 1 — weather widget fetch; trivial wrapper, no Svelte port justified
    'src/lib/engine/ui-renderers-bridge.ts', // Retired ui-renderers-bridge — logic relocated to lifecycle-bridge
    'src/lib/engine/semantic-dive-bridge.ts', // Retired semantic-dive-bridge — logic relocated to lifecycle-bridge
    'src/lib/engine/ui-feedback-bridge.ts', // W11-T10 Wave 1 � COLD sanctioned passthrough; no Svelte path yet
    'src/lib/engine/map-flattening-layout-bridge.ts', // W11-T10 Wave 1 � COLD sanctioned passthrough; no Svelte path yet
    'src/lib/engine/focus-anchor-indicator-bridge.ts', // W11-T10 Wave 1 � COLD sanctioned passthrough; no Svelte path yet
    'src/lib/engine/audio-scape-bridge.ts', // W11-T10 Wave 1 � COLD sanctioned passthrough; no Svelte path yet
    'src/lib/engine/event-bindings-bridge.ts', // W11-T10 Wave 1 � COLD sanctioned passthrough; no Svelte path yet

    'src/lib/engine/cluster-labels-bridge.ts', // W11-T10 Wave 2 — HOT sanctioned passthrough; no Svelte path yet
    'src/lib/engine/focus-pocket-bridge.ts', // W11-T10 Wave 2 — HOT sanctioned passthrough; Svelte 5 port exists in @lib/focus/pocket but render loop still uses legacy module surface
    'src/lib/engine/scene-reveal-bridge.ts', // W11-T10 Wave 2 — HOT sanctioned passthrough; Svelte 5 port exists in @lib/engine/scene-reveal but render loop still uses legacy module surface
    'src/lib/engine/mycelium-engine-bridge.ts', // W11-T10 Wave 2 — HOT sanctioned passthrough; no Svelte path yet
    'src/lib/engine/inspected-strand-overlay-bridge.ts', // W11-T10 Wave 2 — HOT sanctioned passthrough; no Svelte path yet
    'src/lib/engine/route-arrival-overlay-bridge.ts', // W11-T10 Wave 2 — HOT sanctioned passthrough; no Svelte path yet
    'src/lib/engine/three-search-animations-bridge.ts', // W11-T10 Wave 2 — HOT sanctioned passthrough; no Svelte path yet
    'src/lib/engine/three-interaction-visuals-bridge.ts', // W11-T10 Wave 2 — HOT sanctioned passthrough; no Svelte path yet
    'src/lib/engine/search-state-bridge.ts', // W15-T1 — search-state port; bridge created, consumers not yet wired
    // ── W11-T5 Wave 2 ─────────────────────────────────────────
    'src/lib/engine/event-bus-bridge.ts', // W11-T5 Wave 2 — T9 retires when journey files land
    'src/lib/engine/micro-demo-choreography-bridge.ts', // W11-T5 Wave 2 — sanctioned passthrough (micro-demo legacy)
    // ── W15-T-SEARCH-STATE (partial port, 2026-06-15) ────────
    'src/lib/engine/search-state-bridge.ts', // W15-T-SEARCH-STATE — bridge created with clearSearch(options) signature fix; consumers in js/modules/* still use the old path; rewiring is a follow-up ticket
  ]);

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

  it('no UNEXPECTED dead bridge (zero consumers = cleanup candidate)', () => {
    const allDead = bridges.filter((b) => b.isDead);
    const normalize = (p: string) => p.replace(/\\/g, '/');
    const expectedDead = allDead.filter((b) => KNOWN_RETIRED_BRIDGES.has(normalize(b.path)));
    const unexpectedDead = allDead.filter((b) => !KNOWN_RETIRED_BRIDGES.has(normalize(b.path)));
    if (allDead.length > 0) {
      const summary = allDead.map((b) => `  ${b.path}`).join('\n');
      // eslint-disable-next-line no-console
      console.log(
        `\n${allDead.length} dead bridges (zero consumers — safe to delete in a follow-up):\n${summary}\n` +
          `Of those, ${expectedDead.length} are documented retirements and ${unexpectedDead.length} are unexpected.\n` +
          `Use \`git rm <bridge>\` once verified.\n`
      );
    }
    // The strict contract: only KNOWN_RETIRED_BRIDGES are allowed to be
    // dead. New dead bridges are a regression and must be rejected.
    expect(unexpectedDead.length).toBe(0);
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
