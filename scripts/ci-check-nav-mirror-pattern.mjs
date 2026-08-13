#!/usr/bin/env node
/**
 * ci-check-nav-mirror-pattern.mjs
 *
 * CI guard: ensures that direct mutations of `appState.navState.<field>`
 * (or `legacyState.navState.<field>`) — AND the flat compatibility alias
 * door (`appState.currentView` / `semanticDiveMode` / `focusedNode` /
 * `trailDepth`, which are setters that write into nested navState) — only
 * occur inside canonical mirror helpers, never bare in arbitrary call-sites.
 *
 * Covers nav-state fields AND focus-pocket fields (`focusPocketIndices`,
 * `focusPocketRoleByIndex`, `focusPocketMeta`).
 *
 * Allowed patterns (not flagged):
 *   1. writeNavStateMirror(...)              — the canonical batch helper
 *   2. writeFocusPocketMirror(...)           — focus-pocket mirror helper
 *   3. _navWritable.update(...)              — Svelte store update callback
 *   4. _journeyWritable.update(...) / withJourneyNotify — journey store bridge
 *   5. _focusWritable.update(...) / withFocusNotify     — focus store bridge
 *   6. _searchWritable.update(...) / withSearchNotify   — search store bridge
 *   7. Entries in the allowlist file (known-good line ranges)
 *
 * Usage:
 *   node scripts/ci-check-nav-mirror-pattern.mjs
 *
 * Exit codes:
 *   0 — no violations found
 *   1 — one or more violations (printed to stdout)
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const SRC_DIR = resolve(PROJECT_ROOT, 'src', 'lib')
const ALLOWLIST_PATH = resolve(PROJECT_ROOT, 'scripts', 'ci-check-nav-mirror-pattern.allowlist.json')

// ---------------------------------------------------------------------------
// 1. Load allowlist
// ---------------------------------------------------------------------------
/** @type {Record<string, [number, number, string][]>} */
const allowlist = {}
if (existsSync(ALLOWLIST_PATH)) {
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8'))
    for (const [file, ranges] of Object.entries(raw)) {
        const abs = resolve(PROJECT_ROOT, file)
        allowlist[abs] = ranges.map(([start, end, reason]) => ({ start, end, reason }))
    }
}

function isAllowlisted(absPath, line) {
    const entries = allowlist[absPath]
    if (!entries) return false
    return entries.some((e) => line >= e.start && line <= e.end)
}

// ---------------------------------------------------------------------------
// 2. Find all appState.navState.<field> = ... assignments
// ---------------------------------------------------------------------------
// Keep this in-process instead of shelling out. This guard is run from several
// Windows agent shells, and synthetic fixture tests need deterministic output.

const DIRECT_NAV_MUTATION_RE = /\b(appState|legacyState)\.navState\.(\w+)\s*=(?!=)/

// Alias-door pattern: flat compatibility aliases (currentView, semanticDiveMode,
// focusedNode, trailDepth) are setters that write into nested navState WITHOUT
// going through writeNavStateMirror — so they bypass the Svelte navStore mirror,
// VIEW_CHANGED events, and the drift baseline. This is the "alias door" the
// original guard could not see. It is now a first-class violation class.
const ALIAS_DOOR_RE = /\b(appState|legacyState)\.(currentView|semanticDiveMode|focusedNode|trailDepth)\s*=(?!=|>)/

function shouldScanFile(absPath) {
    return absPath.endsWith('.ts') || absPath.endsWith('.js') || absPath.endsWith('.svelte')
}

function listSourceFiles(dir) {
    /** @type {string[]} */
    const files = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = resolve(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...listSourceFiles(abs))
        } else if (entry.isFile() && shouldScanFile(abs)) {
            files.push(abs)
        }
    }
    return files
}

/** @type {{file: string, line: number, field: string, kind: 'navState'|'aliasDoor', text: string}[]} */
let matches = []

for (const absFile of listSourceFiles(SRC_DIR)) {
    const source = readFileSync(absFile, 'utf-8')
    const tracksAppState = /import\s*\{[^}]*\bappState\b[^}]*\}/.test(source)
    const tracksLegacyState = /import\s*\{[^}]*\blegacyState\b[^}]*\}/.test(source)
    if (!tracksAppState && !tracksLegacyState) continue

    let inBlockComment = false
    source.split('\n').forEach((text, index) => {
        const trimmed = text.trim()

        // Track /* */ block comments so we don't flag prose examples in JSDoc.
        if (!inBlockComment && trimmed.includes('/*')) {
            inBlockComment = !trimmed.includes('*/')
        } else if (inBlockComment && trimmed.includes('*/')) {
            inBlockComment = false
            return
        }
        if (inBlockComment) return

        // Skip single-line comments.
        if (trimmed.startsWith('//')) return

        const mutationMatch = text.match(DIRECT_NAV_MUTATION_RE)
        if (mutationMatch) {
            const receiver = mutationMatch[1]
            if (receiver === 'appState' && !tracksAppState) return
            if (receiver === 'legacyState' && !tracksLegacyState) return
            matches.push({
                file: relative(PROJECT_ROOT, absFile).replace(/\\/g, '/'),
                line: index + 1,
                field: mutationMatch[2],
                kind: 'navState',
                text: text.trim()
            })
        }

        // Separate pass for the alias door (flat aliases that write navState).
        const aliasMatch = text.match(ALIAS_DOOR_RE)
        if (aliasMatch) {
            const receiver = aliasMatch[1]
            if (receiver === 'appState' && !tracksAppState) return
            if (receiver === 'legacyState' && !tracksLegacyState) return
            matches.push({
                file: relative(PROJECT_ROOT, absFile).replace(/\\/g, '/'),
                line: index + 1,
                field: aliasMatch[2],
                kind: 'aliasDoor',
                text: text.trim()
            })
        }
    })
}

// ---------------------------------------------------------------------------
// 3. Filter matches: remove allowlisted, and remove those inside allowed
//    syntactic contexts (withMutation, writeNavStateMirror, store.update)
// ---------------------------------------------------------------------------

/**
 * Read the source file and determine whether the given line is inside an
 * allowed context. We walk backwards from the line to find the enclosing
 * function/block and check whether it's one of the canonical patterns.
 *
 * This is a heuristic — not a full AST walk — but handles the patterns in
 * this codebase:
 *   - appState.withMutation(() => { ... })
 *   - writeNavStateMirror(...)
 *   - _navWritable.update(...)
 *   - _journeyWritable.update(...) / withJourneyNotify(...)
 *   - _focusWritable.update(...) / withFocusNotify(...)
 *   - _searchWritable.update(...) / withSearchNotify(...)
 */
function isInsideAllowedContext(absPath, line, kind = 'navState') {
    let source
    try {
        source = readFileSync(absPath, 'utf-8')
    } catch {
        return false // can't read → treat as violation (safe default)
    }
    const lines = source.split('\n')

    // Get a window of lines around the match to search for enclosing context.
    // We look from 30 lines before the match up to the match line.
    const contextStart = Math.max(0, line - 30)
    const contextEnd = Math.min(lines.length, line)
    const context = lines.slice(contextStart, contextEnd).join('\n')

    // Direct navState assignments may be part of the canonical mirror helpers.
    // Alias-door assignments are different: merely calling a helper nearby
    // does not make a separate flat-property write canonical. This distinction
    // prevents a 30-line proximity window from hiding a real alias violation.
    if (kind !== 'aliasDoor' && /writeNavStateMirror\s*\(/.test(context)) return true
    if (kind !== 'aliasDoor' && /writeFocusPocketMirror\s*\(/.test(context)) return true

    // navMirror.update() / navMirror.set() are the canonical nav store bridge
    // (navigation-state.svelte.ts _applyNavUpdate / _createNavStore): the
    // alias-door writes there keep the flat appState field in sync AFTER the
    // canonical Object.assign(appState.navState, …) — the single legitimate
    // alias-door usage, so it must not be flagged.
    if (/navMirror\.update\s*\(/.test(context)) return true
    if (/navMirror\.set\s*\(/.test(context)) return true

    // The withMutation no-op has been removed — direct property writes are
    // validated by the appState proxy (state-validation.validation.ts).

    // Check for _navWritable.update(...)
    if (kind !== 'aliasDoor' && /_navWritable\.update\s*\(/.test(context)) return true

    // Check for _journeyWritable.update(...) or withJourneyNotify(...)
    if (kind !== 'aliasDoor' && /_journeyWritable\.update\s*\(/.test(context)) return true
    if (kind !== 'aliasDoor' && /withJourneyNotify\s*\(/.test(context)) return true

    // Check for _focusWritable.update(...) or withFocusNotify(...)
    if (kind !== 'aliasDoor' && /_focusWritable\.update\s*\(/.test(context)) return true
    if (kind !== 'aliasDoor' && /withFocusNotify\s*\(/.test(context)) return true

    // Check for _searchWritable.update(...) or withSearchNotify(...)
    if (kind !== 'aliasDoor' && /_searchWritable\.update\s*\(/.test(context)) return true
    if (kind !== 'aliasDoor' && /withSearchNotify\s*\(/.test(context)) return true

    return false
}

/** @type {{file: string, line: number, field: string, kind: 'navState'|'aliasDoor', text: string}[]} */
const violations = []
/** @type {{file: string, line: number, field: string, kind: 'aliasDoor', text: string}[]} */
const allowlistedAliasDoors = []

for (const m of matches) {
    const absPath = resolve(PROJECT_ROOT, m.file)

    // Skip allowlisted ranges; remember alias-door sites so the success report
    // can surface their (truthful, documented) residual risk instead of hiding
    // them behind a falsely clean tree.
    if (isAllowlisted(absPath, m.line)) {
        if (m.kind === 'aliasDoor') allowlistedAliasDoors.push(m)
        continue
    }

    // Skip if inside an allowed syntactic context
    if (isInsideAllowedContext(absPath, m.line, m.kind)) continue

    violations.push(m)
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------
if (violations.length === 0) {
    console.log(
        '[nav-mirror-check] ✓ No unpoliced navState mutations or alias-door writes outside canonical helpers.'
    )
    if (allowlistedAliasDoors.length > 0) {
        console.log(
            `[nav-mirror-check] ℹ ${allowlistedAliasDoors.length} alias-door site(s) accounted for via allowlist (documented residual risk):`
        )
        for (const a of allowlistedAliasDoors) {
            console.log(`    ${a.file}:${a.line}  aliasDoor.${a.field}`)
        }
    }
    process.exit(0)
}

console.log(`[nav-mirror-check] ✗ Found ${violations.length} violation(s):\n`)
for (const v of violations) {
    const label = v.kind === 'aliasDoor' ? `aliasDoor.${v.field}` : `navState.${v.field}`
    console.log(`  ${v.file}:${v.line}  ${label}`)
    console.log(`    ${v.text}`)
    console.log()
}
console.log(
    '[nav-mirror-check] navState.* mutations and alias-door writes (currentView, semanticDiveMode, focusedNode, trailDepth) must go through writeNavStateMirror() / the canonical helpers.'
)

process.exit(1)
