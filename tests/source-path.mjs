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

  // Remap deleted js/modules/*.ts to current canonical src/lib locations.
  const mm = legacyPath.match(/^(?:\.\.?\/)*js\/modules\/([\w-]+)(?:\.ts|\.js)?$/);
  if (mm) {
    const stem = mm[1];
    // Explicit remap table for non-trivial stem→target mappings.
    const REMAP = {
      'journey-compass-state': 'src/lib/journey/compass-state.ts',
      'journey-route-trace':   'src/lib/journey/route-trace.ts',
      'journey-webgl':         'src/lib/engine/journey-webgl-bridge.ts',
      'strand-continuity':     'src/lib/utils/strand-continuity.ts',
      'weather':               'src/lib/utils/weather.ts',
      'weather-ui':            'src/lib/ui/weather-ui.ts',
      'lifecycle':             'src/lib/orchestration/lifecycle.ts',
      'navigation-state':      'src/lib/orchestration/navigation-state.ts',
      'url-state':             'src/lib/orchestration/url-state.ts',
      'cluster-filter':        'src/lib/orchestration/cluster-filter-controller.ts',
      'lifecycle-reset':       'src/lib/stores/lifecycle.ts',
      'event-bindings':        'src/lib/ui/event-bindings.ts',
      'app':                   'src/lib/orchestration/app-init.ts',
      'journey-compass-controller': 'src/lib/orchestration/compass-controller.ts',
    };
    const target = REMAP[stem] ?? `src/lib/journey/${stem}.ts`;
    const canonicalTs = path.resolve(base, target);
    if (fs.existsSync(canonicalTs)) return canonicalTs;
  }

  // Prefer .ts sibling — canonical implementation during TS migration
  const tsPath = absolute.replace(/\.js$/, '.ts');
  if (fs.existsSync(tsPath)) return tsPath;

  if (fs.existsSync(absolute)) return absolute;

  // Neither exists — let the caller's fs.readFileSync throw naturally.
  return absolute;
}
