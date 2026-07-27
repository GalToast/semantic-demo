/**
 * svelte-style-token-contract.mjs
 *
 * Ratchet guard: prevents NEW hardcoded primary-alt color values
 * (#4ecdc4 / rgb(78,205,196)) from appearing in .svelte <style> blocks.
 * Components must use the design tokens instead:
 *   - #4ecdc4          -> var(--color-primary-alt)
 *   - rgba(78,205,196,α)-> rgba(var(--color-primary-alt-rgb), α)
 * both defined in css/base.css (:root).
 *
 * ALLOWLIST grandfatheres the .svelte files that still contain hardcoded
 * primary-alt as of 2026-06-26. As each file is migrated to tokens, REMOVE
 * it from the allowlist — this locks the migration so the raw color can
 * never silently regress.
 *
 * .ts files (Three.js materials, shaders, palettes) legitimately need raw
 * hex and are out of scope; js-design-token-contract.mjs governs those.
 */
import fs from 'node:fs'
import path from 'node:path'

const SRC_ROOT = path.join(process.cwd(), 'src')
const PRIMARY_ALT_RE = /#4ecdc4\b|rgba?\(\s*78\s*,\s*205\s*,\s*196/gi
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi

// Grandfathered files (still contain hardcoded primary-alt). Remove on migration.
const ALLOWLIST = new Set([
    'src/components/Canvas.svelte',
    'src/components/CompassRail.svelte',
    'src/components/Controls.svelte',
    'src/components/FocusPocket.svelte',
    'src/components/Splash.svelte'
])

function listSvelteFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) listSvelteFiles(full, out)
        else if (entry.name.endsWith('.svelte')) out.push(full)
    }
    return out
}

function styleBlocksContent(src) {
    let css = ''
    let m
    while ((m = STYLE_BLOCK_RE.exec(src)) !== null) css += m[1] + '\n'
    STYLE_BLOCK_RE.lastIndex = 0
    return css
}

const failures = []
const migrationCandidates = []

for (const abs of listSvelteFiles(SRC_ROOT)) {
    const rel = path.relative(process.cwd(), abs).replace(/\\/g, '/')
    const css = styleBlocksContent(fs.readFileSync(abs, 'utf8'))
    if (!css) continue
    const hits = css.match(PRIMARY_ALT_RE)
    if (!hits) continue
    if (ALLOWLIST.has(rel)) continue // grandfathered
    failures.push(
        `${rel}: ${hits.length} hardcoded primary-alt in <style> — use var(--color-primary-alt) / rgba(var(--color-primary-alt-rgb), α)`
    )
}

// Info: grandfathered files that now have ZERO hardcodes — drop from allowlist to lock.
for (const rel of ALLOWLIST) {
    const abs = path.join(process.cwd(), rel)
    if (!fs.existsSync(abs)) continue
    const css = styleBlocksContent(fs.readFileSync(abs, 'utf8'))
    if (css && !css.match(PRIMARY_ALT_RE)) migrationCandidates.push(rel)
}

if (failures.length) {
    console.error('svelte-style-token-contract FAIL — new hardcoded primary-alt colors in .svelte <style>:')
    for (const f of failures) console.error(`  - ${f}`)
    console.error('')
    console.error('Use var(--color-primary-alt) or rgba(var(--color-primary-alt-rgb), <alpha>) instead.')
    console.error('If grandfathering is truly required, add the file to ALLOWLIST with a justification comment.')
    process.exit(1)
}

console.log(`svelte-style-token-contract OK: ${ALLOWLIST.size} grandfathered file(s), 0 new violations.`)
if (migrationCandidates.length) {
    console.log(
        `  Migration candidates (zero hardcodes — remove from ALLOWLIST to lock): ${migrationCandidates.join(', ')}`
    )
}
