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

console.log('reduced-motion-coverage-contract OK')
