/**
 * both-bridge-shape-invariant.test.ts — Regression detector for BOTH-bridge retirement (Ticket 9D-Option-B)
 *
 * Scans src/, vite.config.ts, and vitest.config.js for any remaining
 * @legacy or @legacy-js references. After Ticket 9D-Option-B, NO file
 * in src/ should reference either alias. The alias entries were removed
 * from vite.config.ts and vitest.config.js, and all static imports were
 * rewritten as relative paths.
 *
 * This test locks in the retirement so a future accidental re-introduction
 * is caught immediately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// ── Config ───────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const SRC_DIR = join(PROJECT_ROOT, 'src');
const VITE_CONFIG = join(PROJECT_ROOT, 'vite.config.ts');
const VITEST_CONFIG = join(PROJECT_ROOT, 'vitest.config.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively collect all .ts, .js, .svelte, and .json files under a directory,
 * skipping node_modules, dist, and .git.
 */
function collectFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'tmp') {
        continue;
      }
      collectFiles(fullPath, files);
    } else if (/\.(ts|js|svelte|json|mjs|mts)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('both-bridge retirement invariant', () => {
  it('vite.config.ts has no @legacy or @legacy-js alias entries', () => {
    const content = readFileSync(VITE_CONFIG, 'utf-8');
    // Check for alias definition lines
    const aliasLines = content.split('\n').filter(
      line => /['"]@legacy(?:-js)?['"]/.test(line) && /alias/.test(line)
    );
    expect(aliasLines).toHaveLength(0);
  });

  it('vitest.config.js has no @legacy or @legacy-js alias entries', () => {
    const content = readFileSync(VITEST_CONFIG, 'utf-8');
    const aliasLines = content.split('\n').filter(
      line => /['"]@legacy(?:-js)?['"]/.test(line) && /alias/.test(line)
    );
    expect(aliasLines).toHaveLength(0);
  });

  it('src/ contains zero @legacy-js import statements', () => {
    const files = collectFiles(SRC_DIR);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      // Look for actual import/export from @legacy-js
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip pure comment lines
        if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
        if (/from\s+['"]@legacy-js\//.test(line) || /import\(['"]@legacy-js\//.test(line)) {
          violations.push(`${relative(PROJECT_ROOT, file)}:${i + 1}`);
        }
      }
    }

    expect(
      violations,
      `Found @legacy-js import(s) in src/:\n${violations.join('\n')}`
    ).toHaveLength(0);
  });

  it('src/ contains zero @legacy import statements (bare, without -js)', () => {
    const files = collectFiles(SRC_DIR);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
        // Match @legacy/ but NOT @legacy-js/
        if (/from\s+['"]@legacy\/(?!js)/.test(line) || /import\(['"]@legacy\/(?!js)/.test(line)) {
          violations.push(`${relative(PROJECT_ROOT, file)}:${i + 1}`);
        }
      }
    }

    expect(
      violations,
      `Found bare @legacy/ import(s) in src/:\n${violations.join('\n')}`
    ).toHaveLength(0);
  });

  it('src/tsconfig.json has no @legacy or @legacy-js path mappings', () => {
    const tsconfig = join(SRC_DIR, 'tsconfig.json');
    const content = readFileSync(tsconfig, 'utf-8');
    expect(content).not.toMatch(/"@legacy-js/);
    expect(content).not.toMatch(/"@legacy\//);
  });
});
