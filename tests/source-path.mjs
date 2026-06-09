/**
 * source-path.mjs
 *
 * Resolve a legacy js/modules/*.js path to its active source.
 * During the TS migration, implementations live in .ts files.  This helper
 * prefers the .ts sibling when present so source-only contracts (ownership,
 * canonicality, transition-table checks) read the real implementation instead
 * of a thin re-export shim.
 *
 * Usage in contracts:
 *   import { resolveSource } from './source-path.mjs';
 *   const src = fs.readFileSync(resolveSource('js/modules/weather.ts'), 'utf8');
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve a source path.  Prefers .ts sibling over .js (canonical TS migration).
 * Falls back to .js when no .ts sibling exists.
 * @param {string} legacyPath - original .js path, relative to root
 * @param {string} [root] - absolute root (defaults to process.cwd())
 * @returns {string} absolute path to the active source file
 */
export function resolveSource(legacyPath, root) {
  const base = root ?? process.cwd();
  const absolute = path.resolve(base, legacyPath);

  // Prefer .ts sibling — canonical implementation during TS migration
  const tsPath = absolute.replace(/\.js$/, '.ts');
  if (fs.existsSync(tsPath)) return tsPath;

  if (fs.existsSync(absolute)) return absolute;

  // Neither exists — let the caller's fs.readFileSync throw naturally.
  return absolute;
}
