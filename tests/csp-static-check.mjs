/**
 * CSP Static Check — validates that the CSP header in .htaccess covers
 * all known origins used by the legacy shell (vector-explorer-polished.html).
 *
 * This is NOT a browser check. It's a structural audit of the CSP against
 * known resource manifests extracted by the worker who designed the policy.
 *
 * Usage: node tests/csp-static-check.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Parse CSP from .htaccess ────────────────────────────────────────
const htaccess = readFileSync(resolve(ROOT, '.htaccess'), 'utf-8');
const cspMatch = htaccess.match(/Header always set Content-Security-Policy\s+"([\s\S]+?)"\s*$/m);
if (!cspMatch) {
  console.error('FAIL: Could not find Content-Security-Policy in .htaccess');
  process.exit(1);
}

const cspRaw = cspMatch[1].replace(/\s+/g, ' ').trim();
console.log('CSP header found in .htaccess');
console.log(`Raw:\n  ${cspRaw}\n`);

// Parse directives
const directives = {};
cspRaw.split(';').forEach(pair => {
  pair = pair.trim();
  if (!pair) return;
  const sep = pair.indexOf(' ');
  const name = sep === -1 ? pair : pair.slice(0, sep);
  const value = sep === -1 ? '' : pair.slice(sep + 1).trim();
  directives[name] = value.split(/\s+/).filter(Boolean);
});

// Report directives
console.log('Parsed directives:');
for (const [name, sources] of Object.entries(directives)) {
  console.log(`  ${name}: ${sources.join(' ')}`);
}
console.log('');

// ── Known origins (extracted during CSP design) ─────────────────────
const knownOrigins = {
  // script-src origins
  'script-src': [
    { origin: "'self'", source: 'dist/bundle.js (module entry), worker initiator' },
    { origin: 'https://cdn.jsdelivr.net', source: 'three.js modules via importmap' },
  ],
  // style-src origins
  'style-src': [
    { origin: "'self'", source: 'Same-origin CSS (semantic-demo.css, mobile_premium_*.css, etc.)' },
    { origin: 'https://fonts.googleapis.com', source: 'Google Fonts stylesheet' },
    { origin: "'unsafe-inline'", source: 'SVG style= attributes, JS element.style assignments' },
  ],
  // font-src origins
  'font-src': [
    { origin: "'self'", source: 'Local font files if served from same origin' },
    { origin: 'https://fonts.gstatic.com', source: 'Google Fonts WOFF2' },
  ],
  // img-src origins
  'img-src': [
    { origin: "'self'", source: 'Same-origin images' },
    { origin: 'data:', source: 'Inline SVG favicon (data:image/svg+xml)' },
  ],
  // connect-src origins
  'connect-src': [
    { origin: "'self'", source: 'api.php calls, JSON manifests, data.dat' },
    { origin: 'https://api.open-meteo.com', source: 'Weather widget forecast fetch' },
  ],
  // worker-src origins
  'worker-src': [
    { origin: "'self'", source: 'js/workers/data-worker.js' },
  ],
};

// ── Verify each known origin is covered ─────────────────────────────
let allPass = true;
const checkDirectives = Object.keys(knownOrigins);

for (const directive of checkDirectives) {
  if (!directives[directive]) {
    console.error(`FAIL: Missing directive "${directive}"`);
    allPass = false;
    continue;
  }
  const allowed = new Set(directives[directive]);
  for (const entry of knownOrigins[directive]) {
    const normalized = entry.origin.replace(/\/+$/g, '');
    // Check that the origin is in the allowed set, handling trailing slashes
    const match = [...allowed].some(a => a.replace(/\/+$/g, '') === normalized);
    if (!match) {
      console.error(`FAIL: ${directive} — origin "${entry.origin}" (${entry.source}) is NOT covered`);
      console.error(`  Allowed: [${[...allowed].join(', ')}]`);
      allPass = false;
    } else {
      console.log(`  OK: ${directive} covers "${entry.origin}" — ${entry.source}`);
    }
  }
}

// ── Check required directives that must not be missing ──────────────
const requiredDirectives = [
  'default-src', 'script-src', 'style-src', 'img-src',
  'connect-src', 'worker-src', 'frame-ancestors', 'base-uri', 'form-action',
];

for (const d of requiredDirectives) {
  if (!directives[d]) {
    console.error(`FAIL: Required directive "${d}" is missing`);
    allPass = false;
  }
}

// ── Warn about overly permissive directives ─────────────────────────
if (directives['default-src'] && directives['default-src'].length > 1) {
  console.warn(`WARN: default-src has ${directives['default-src'].length} sources; prefer 'self' only`);
}

console.log('');

if (allPass) {
  console.log('✓ ALL CHECKS PASSED — CSP covers all known origins');
  process.exit(0);
} else {
  console.log('✗ SOME CHECKS FAILED — see above');
  process.exit(1);
}
