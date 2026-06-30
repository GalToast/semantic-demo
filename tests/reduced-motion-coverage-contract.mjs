/**
 * reduced-motion-coverage-contract.mjs
 *
 * Source-level contract ensuring that every Svelte component that declares
 * CSS animations also provides a `prefers-reduced-motion: reduce` override.
 *
 * Rationale: Svelte component styles are scoped to the component and are not
 * reliably reached by the global `css/animations.css` overrides. Component
 * authors must therefore include their own reduced-motion guard.
 *
 * This test scans all .svelte files under src/components/ that contain
 * `@keyframes`. For each one, it asserts the same file also contains
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

// Files that declare @keyframes but are intentionally exempt from the
// component-level reduced-motion requirement. Add a brief justification when
// adding an entry.
const ALLOWLIST = new Set([
  // Global animation files or files already covered by css/animations.css
  // should still ideally include their own guard, but we keep an escape hatch
  // for edge cases.
])

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

function* walkSvelte(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkSvelte(fullPath)
    } else if (entry.isFile() && entry.name.endsWith('.svelte')) {
      yield fullPath
    }
  }
}

const offenders = []

for (const file of walkSvelte(COMPONENTS_DIR)) {
  const relative = path.relative(ROOT, file).replace(/\\/g, '/')
  const source = fs.readFileSync(file, 'utf-8')

  if (!source.includes('@keyframes')) continue
  if (ALLOWLIST.has(relative)) continue

  const hasReducedMotion = source.includes('@media (prefers-reduced-motion')
  if (!hasReducedMotion) {
    offenders.push(relative)
  }
}

assert(
  offenders.length === 0,
  `Svelte components with @keyframes must include a prefers-reduced-motion override:\n${offenders.join('\n')}`
)

console.log('reduced-motion-coverage-contract OK')
