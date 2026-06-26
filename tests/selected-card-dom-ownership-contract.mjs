/**
 * selected-card-dom-ownership-contract.mjs
 *
 * Static contract test for selected-card DOM slot ownership boundaries.
 *
 * The selected-card surface has two layers:
 *   1. **Structural slot management** — visibility, aria, contentVariant on
 *      containers declared by InfoPanel.svelte. These are
 *      managed by vanilla JS (focus-stage-renderer, journey-selected-card)
 *      because they respond to non-Svelte state changes (camera focus, view).
 *   2. **Svelte-internal rendering** — content inside #selected-details, owned
 *      declaratively by SelectedBusinessDetails.svelte from selectedPointStore.
 *
 * This contract enforces:
 *   A. Only authorized modules write to structural container slots.
 *   B. No vanilla JS module writes to Svelte-internal child elements.
 *   C. The TS/JS siblings for focus-stage-renderer and journey-selected-card
 *      export the same names (drift is handled by ts-js-drift-contract).
 *
 * Usage:
 *   node tests/selected-card-dom-ownership-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
const root = process.cwd()
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

// ── Structural container IDs (declared in InfoPanel.svelte) ─────────────────
// These are managed by vanilla JS for slot-level visibility orchestration.
const STRUCTURAL_SLOT_IDS = [
    'selected-card',
    'selected-empty',
    'selected-details',
    'selected-card-title',
    'vector-cascade-bg'
]

// ── Svelte-internal child IDs (owned by SelectedBusinessDetails.svelte) ─────
// No vanilla JS module should query or write these.
const SVELTE_OWNED_CHILD_IDS = [
    'selected-name',
    'selected-what',
    'selected-meta-strip',
    'selected-badges',
    'selected-facts',
    'selected-match-panel',
    'selected-match-copy',
    'selected-action-row',
    'btn-selected-map',
    'selected-theme',
    'selected-status',
    'selected-map',
    'selected-thread'
]

// ── Authorized structural slot writers ──────────────────────────────────────
// These modules are allowed to query/write the structural container IDs.
const AUTHORIZED_SLOT_WRITERS = new Set([
    'src/components/InfoPanel.svelte',
    'src/lib/focus/stage-renderer.ts',
    'src/lib/journey/focus-stage-dom.ts',
    'src/lib/journey/selected-card.ts'
])

// ── Walk migrated src surfaces for violations ──────────────────────────────

function walk(dir, files = []) {
    const absDir = path.join(root, dir)
    if (!fs.existsSync(absDir)) return files
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        const rel = path.join(dir, entry.name).replace(/\\/g, '/')
        if (entry.isDirectory()) {
            if (entry.name === 'dist' || entry.name === 'node_modules') continue
            walk(rel, files)
        } else {
            files.push(rel)
        }
    }
    return files
}

const allFiles = walk('src').filter((f) => /\.(?:js|mjs|svelte|ts)$/.test(f))

const violations = []
const warnings = []

// ── Check A: Only authorized modules write to structural slots ─────────────
for (const file of allFiles) {
    if (AUTHORIZED_SLOT_WRITERS.has(file)) continue
    const src = read(file)
    for (const id of STRUCTURAL_SLOT_IDS) {
        const patterns = [
            `getElementById('${id}')`,
            `getElementById("${id}")`,
            `querySelector('#${id}')`,
            `querySelector("#${id}")`,
            `querySelector('.${id}')`
        ]
        for (const pattern of patterns) {
            if (src.includes(pattern)) {
                violations.push(
                    `${file} queries structural slot #${id} (pattern: ${pattern}) — ` +
                        `only authorized slot writers may manage structural containers`
                )
            }
        }
    }
}

// ── Check B: No vanilla JS writes to Svelte-internal children ──────────────
for (const file of allFiles) {
    // Svelte components and the island are allowed to reference their own IDs
    if (file.endsWith('.svelte') || file.includes('svelte-island')) continue
    const src = read(file)
    for (const id of SVELTE_OWNED_CHILD_IDS) {
        const patterns = [`getElementById('${id}')`, `getElementById("${id}")`, `id="${id}"`, `id='${id}'`]
        for (const pattern of patterns) {
            if (src.includes(pattern)) {
                violations.push(
                    `${file} references Svelte-owned child #${id} (pattern: ${pattern}) — ` +
                        `Svelte component owns this element`
                )
            }
        }
    }
}

// ── Check C: migrated TS/Svelte ownership files exist ───────────────────────
const infoPanel = 'src/components/InfoPanel.svelte'
const focusRendererTS = 'src/lib/focus/stage-renderer.ts'

if (!fs.existsSync(path.join(root, infoPanel))) {
    violations.push(`${infoPanel} missing — InfoPanel.svelte owns selected-card declarative content`)
}
if (!fs.existsSync(path.join(root, focusRendererTS))) {
    violations.push(`${focusRendererTS} missing — focus stage renderer owns structural slot sync`)
}

// ── Check D: focus-stage-renderer.ts documents the ownership boundary ───────
const focusRendererSrc = read(focusRendererTS)
if (!focusRendererSrc.includes('structural slot management') && !focusRendererSrc.includes('Svelte-owned')) {
    warnings.push(`${focusRendererTS} should document the structural-slot vs Svelte-internal ownership boundary`)
}

// ── Report ─────────────────────────────────────────────────────────────────

if (violations.length) {
    console.error('selected-card-dom-ownership-contract VIOLATIONS:')
    for (const v of violations) {
        console.error(`  ✗ ${v}`)
    }
    console.error(`\nTotal: ${violations.length} violation(s)`)
    process.exit(1)
}

if (warnings.length) {
    for (const w of warnings) {
        console.warn(`  ⚠ ${w}`)
    }
}

console.log('selected-card-dom-ownership-contract OK')
console.log(
    `  - structural slot writers: ${STRUCTURAL_SLOT_IDS.length} slots, ${AUTHORIZED_SLOT_WRITERS.size} authorized writers`
)
console.log(`  - Svelte-owned children: ${SVELTE_OWNED_CHILD_IDS.length} elements guarded`)
console.log(`  - migrated TS/Svelte sources: ${infoPanel}, ${focusRendererTS} present`)
