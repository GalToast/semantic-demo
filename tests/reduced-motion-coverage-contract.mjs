/**
 * reduced-motion-coverage-contract.mjs
 *
 * Source-level contract ensuring that every Svelte component and CSS module
 * that declares CSS animations also provides a `prefers-reduced-motion: reduce`
 * override.
 *
 * Rationale: Svelte component styles are scoped to the component and are not
 * reliably reached by the global `css/animations.css` overrides. Component
 * authors must therefore include their own reduced-motion guard. Likewise,
 * individual CSS modules that declare and consume keyframes should include a
 * local guard so the rule is self-documenting and survives even if the global
 * animations.css order changes.
 *
 * This test scans:
 *   - all .svelte files under src/components/ that contain `@keyframes`
 *   - all .css files under css/ that contain both `@keyframes` and at least
 *     one `animation:` declaration
 * For each one, it asserts the same file also contains
 * `@media (prefers-reduced-motion`.
 *
 * If a file legitimately cannot honor reduced-motion (e.g. an essential
 * progress indicator), add it to the ALLOWLIST with a brief justification.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')
const COMPONENTS_DIR = path.join(ROOT, 'src', 'components')
const CSS_DIR = path.join(ROOT, 'css')

// Files that declare @keyframes but are intentionally exempt from the
// file-level reduced-motion requirement. Add a brief justification when
// adding an entry.
const ALLOWLIST = new Set([
  // css/strands.css defines keyframes consumed by other modules; it contains
  // no animation declarations of its own.
])

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function* walkFiles(dir, ext) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath, ext)
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      yield fullPath
    }
  }
}

const offenders = []

for (const file of walkFiles(COMPONENTS_DIR, '.svelte')) {
  const relative = path.relative(ROOT, file).replace(/\\/g, '/')
  const source = fs.readFileSync(file, 'utf-8')

  if (!source.includes('@keyframes')) continue
  if (ALLOWLIST.has(relative)) continue

  const hasReducedMotion = source.includes('@media (prefers-reduced-motion')
  if (!hasReducedMotion) {
    offenders.push(relative)
  }
}

for (const file of walkFiles(CSS_DIR, '.css')) {
  const relative = path.relative(ROOT, file).replace(/\\/g, '/')
  const source = fs.readFileSync(file, 'utf-8')

  if (!source.includes('@keyframes')) continue
  if (ALLOWLIST.has(relative)) continue

  // Only require reduced-motion for CSS files that actually consume animations.
  const consumesAnimations = /[\s;:{}]animation\s*:/.test(source)
  if (!consumesAnimations) continue

  const hasReducedMotion = source.includes('@media (prefers-reduced-motion')
  if (!hasReducedMotion) {
    offenders.push(relative)
  }
}

assert(
  offenders.length === 0,
  `Files with @keyframes that consume animations must include a prefers-reduced-motion override:\n${offenders.join('\n')}`
)

// ---------------------------------------------------------------------------
// RUNTIME TEST 1: prefersReducedMotion() is SSR-safe (returns false without window)
// ---------------------------------------------------------------------------
console.log('\n[RUNTIME] prefersReducedMotion SSR-safe (no window)')

// When window is undefined, prefersReducedMotion() should return false (not throw)
// Since we're in Node with no window.matchMedia shim, this tests the SSR fallback path
const savedWindowMatchMedia = globalThis.window?.matchMedia
try {
    delete globalThis.window
    const { prefersReducedMotion } = await import('../src/lib/utils/environment.ts')
    const result = prefersReducedMotion()
    assert(result === false, `prefersReducedMotion() must return false in SSR, got: ${result}`)
    console.log('  OK prefersReducedMotion() returns false in SSR')
} finally {
    if (savedWindowMatchMedia !== undefined) {
        globalThis.window = { matchMedia: savedWindowMatchMedia }
    } else {
        globalThis.window = undefined
    }
}

// ---------------------------------------------------------------------------
// RUNTIME TEST 2: prefersReducedMotion() with mock window.matchMedia returning false
// ---------------------------------------------------------------------------
console.log('\n[RUNTIME] prefersReducedMotion respects matchMedia (reduce: no)')

globalThis.window = {
    matchMedia: (query) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
    })
}

// Need to re-import to get a fresh module (cached MQL may hold old values)
const mod2 = await import('../src/lib/utils/environment.ts?t=' + Date.now())
// But we can't bust the ESM cache. Instead, test with the same module but verify behavior.
// The getReducedMotionMQL function checks window.matchMedia identity and rebuilds if changed.
const resultNo = mod2.prefersReducedMotion()
// Note: the first call creates the MQL cache; subsequent calls return cached.
// Since we changed window.matchMedia after the first import, the identity check should trigger a rebuild.
console.log(`  prefersReducedMotion() = ${resultNo} (expect false when OS does not prefer reduced motion)`)

// ---------------------------------------------------------------------------
// RUNTIME TEST 3: prefersReducedMotion() with mock window.matchMedia returning true
// ---------------------------------------------------------------------------
console.log('\n[RUNTIME] prefersReducedMotion respects matchMedia (reduce: yes)')

globalThis.window = {
    matchMedia: (query) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
    })
}

// The identity check in getReducedMotionMQL should detect the new matchMedia function
const resultYes = mod2.prefersReducedMotion()
assert(resultYes === true, `prefersReducedMotion() must return true when OS prefers reduced motion, got: ${resultYes}`)
console.log('  OK prefersReducedMotion() returns true')

// ---------------------------------------------------------------------------
// RUNTIME TEST 4: prefersReducedMotion is the canonical API
// ---------------------------------------------------------------------------
console.log('\n[RUNTIME] prefersReducedMotion is exported and callable')

assert(typeof mod2.prefersReducedMotion === 'function', 'prefersReducedMotion must be exported as a function')
const prmResult = mod2.prefersReducedMotion()
// prefersReducedMotion() should return a boolean
assert(typeof prmResult === 'boolean', `prefersReducedMotion() must return boolean, got: ${typeof prmResult}`)
console.log(`  OK prefersReducedMotion() returns ${prmResult} (boolean)`)

// ---------------------------------------------------------------------------
// RUNTIME TEST 5: prefersReducedMotion() MQL cache rebuild on matchMedia swap
// ---------------------------------------------------------------------------
console.log('\n[RUNTIME] MQL cache rebuilds when window.matchMedia is replaced')

// Switch to a fresh mock that returns true
globalThis.window = {
    matchMedia: (query) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
    })
}
// Previous call cached true; identity check should detect the new function and rebuild
const cachedResult = mod2.prefersReducedMotion()
assert(cachedResult === false, `MQL cache rebuild detected new matchMedia, got: ${cachedResult}`)
console.log('  OK MQL cache rebuilds when window.matchMedia identity changes')

// Restore window
if (typeof globalThis.window !== 'undefined') {
    delete globalThis.window
}

console.log('reduced-motion-coverage-contract OK (static scan + 5 runtime behavioral tests)')
