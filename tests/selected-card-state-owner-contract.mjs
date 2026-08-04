// selected-card-state-owner-contract.mjs
// Proves no runtime module writes appState.focusState.selectedPoint outside
// the selected-card owner module + the focus.svelte.ts mirror seam.
//
// Owner: src/lib/journey/selected-card.ts
//   - updateSelectedBusiness(point, options) is the canonical writer.
//     It calls focusOnPoint → setSelectedBusiness → focusStore → mirror,
//     AND triggers UI side effects (DOM active class, vector cascade,
//     fade animation, document.title reset). It holds ZERO direct writes —
//     all routing happens through the focus store via focusOnPoint.
//
// Mirror: src/lib/stores/focus.svelte.ts
//   - The legacy focusStore mirrors to/from appState for backward
//     compatibility with subscribers reading the Svelte store directly.
//     One write exists inside the .update((s) => ({...s, ...}))
//     callback that copies narrowToPoint(next.selectedBusiness) into
//     appState.focusState.selectedPoint.
//
// Documented seam writers (allowed — both re-assert or mirror the SAME
// value the canonical mirror already set, without firing selection UI):
//   - src/lib/journey/thread-settler.ts — reassertThreadTarget re-asserts
//     the strand-walk target on the 120/420ms reassert timers.
//   - src/lib/stores/lifecycle.ts — legacy store-subscription mirror that
//     feeds the legacy window test surface (same $focus.selectedBusiness
//     source as the canonical mirror).
//
// All other modules must go through updateSelectedBusiness.
// Initialization with ??= (in journey.ts et al.) is allowed because
// it only fires when the field is null/undefined — not a real write.
//
// T-1 commits (e3d6a78e, 0fa33ef5, bbce2c7b, 2e36bee3) refactored
// 5 rogue writers to use the owner API:
//   - cursor.ts:78 (canvas click) → updateSelectedBusiness(point, { revealCard: true })
//   - url-state.ts:108 (filter evict) → updateSelectedBusiness(null)
//   - url-state.ts:104 (URL restore) → updateSelectedBusiness(null)
//   - demo-choreography.ts:213 (demo teardown) → drop redundant direct write
//   - demo-choreography.ts:265 (demo focus) → drop redundant direct write
//
// This contract enforces that future contributors don't reintroduce
// direct writes that bypass the owner API and lose UI side effects.

import { readdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODULES_DIR = join(__dirname, '..', 'src', 'lib')
const OWNER_PATH = join(__dirname, '..', 'src', 'lib', 'journey', 'selected-card.ts')
const MIRROR_PATH = join(__dirname, '..', 'src', 'lib', 'stores', 'focus.svelte.ts')
// Documented seam writers — allowed to re-assert/mirror the canonical value.
const SEAM_PATHS = [
    join(__dirname, '..', 'src', 'lib', 'journey', 'thread-settler.ts'),
    join(__dirname, '..', 'src', 'lib', 'stores', 'lifecycle.ts')
]
// FocusAppState declares the field in the state-type split.
const FOCUS_TYPE_PATH = join(__dirname, '..', 'src', 'lib', 'state', 'types', 'navigation-types.ts')
// The rune-class default lives inside the focusState sub-aggregate literal.
const APP_STATE_PATH = join(__dirname, '..', 'src', 'lib', 'state', 'app.svelte.ts')

let failures = 0

function listTsFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) return listTsFiles(full)
        return entry.isFile() && entry.name.endsWith('.ts') ? [full] : []
    })
}

function offsetToLine(source, offset) {
    return source.slice(0, offset).split('\n').length
}

/** True when `index` falls inside a // or /* *\/ comment (not a string literal
 *  or real code). Keeps line-number reporting on the original source. */
function isInsideComment(source, index) {
    let inLine = false
    let inBlock = false
    for (let i = 0; i < index; i++) {
        const c = source[i]
        const n = source[i + 1]
        if (inLine) {
            if (c === '\n') inLine = false
        } else if (inBlock) {
            if (c === '*' && n === '/') {
                inBlock = false
                i++
            }
        } else if (c === '/' && n === '/') {
            inLine = true
            i++
        } else if (c === '/' && n === '*') {
            inBlock = true
            i++
        }
    }
    return inLine || inBlock
}

// Match direct writes in both legacy flat form (appState.selectedPoint =)
// and the current nested focusState form
// (appState.focusState.selectedPoint =). legacyState is an alias for
// appState (exported from app.svelte.ts), so it is scanned too. NOT ??= initialization.
const WRITE_REGEX = /(?<![?])(\bappState|\bstate|\blegacyState)(\.focusState)?\.selectedPoint\s*=(?!=)/g

for (const file of listTsFiles(MODULES_DIR)) {
    if (file === OWNER_PATH || file === MIRROR_PATH || SEAM_PATHS.includes(file)) continue

    const fileSource = readFileSync(file, 'utf8')
    let match
    WRITE_REGEX.lastIndex = 0
    while ((match = WRITE_REGEX.exec(fileSource)) !== null) {
        if (isInsideComment(fileSource, match.index)) continue
        const lineNum = offsetToLine(fileSource, match.index)
        const line = fileSource.split('\n')[lineNum - 1].trim()
        console.error(
            `FAIL: ${relative(join(__dirname, '..'), file)}:${lineNum} writes selectedPoint outside owner/mirror/seams:\n  ${line}`
        )
        failures += 1
    }
}

// Verify owner module exports the public API
const ownerSource = readFileSync(OWNER_PATH, 'utf8')
const requiredOwnerExports = [
    'initJourneySelectedCard',
    'initJourneySelectedCardAdapter',
    'syncFocusStage',
    'updateSelectedBusiness'
]
for (const name of requiredOwnerExports) {
    if (!ownerSource.includes(`export function ${name}`)) {
        console.error(`FAIL: selected-card owner module missing export "${name}"`)
        failures += 1
    }
}

// Verify the field is declared in the state-type split (FocusAppState) and
// defaulted in the rune class. state-types.ts is a re-export barrel — the
// literal declaration lives in types/navigation-types.ts.
const focusTypesSource = readFileSync(FOCUS_TYPE_PATH, 'utf8')
if (!/\bselectedPoint\s*:\s*Point\s*\|(?:\s*)null/.test(focusTypesSource)) {
    console.error('FAIL: navigation-types.ts does not declare selectedPoint: Point | null')
    failures += 1
}

const appStateSource = readFileSync(APP_STATE_PATH, 'utf8')
if (!/selectedPoint\s*:\s*null/.test(appStateSource)) {
    console.error('FAIL: app.svelte.ts focusState does not default selectedPoint: null')
    failures += 1
}

// Verify owner + mirror module paths exist (defensive — fails loudly if renamed)
for (const path of [OWNER_PATH, MIRROR_PATH, ...SEAM_PATHS]) {
    try {
        readFileSync(path, 'utf8')
    } catch (e) {
        console.error(`FAIL: ${relative(join(__dirname, '..'), path)} does not exist (${e.message})`)
        failures += 1
    }
}

// Count actual writes in the owner + mirror + seams for the summary line.
// The owner module should have ZERO direct writes (all routed through
// the focus store via focusOnPoint).
const ownerWrites = (ownerSource.match(WRITE_REGEX) ?? []).length
const mirrorSource = readFileSync(MIRROR_PATH, 'utf8')
const mirrorWrites = (mirrorSource.match(WRITE_REGEX) ?? []).length
const seamWrites = SEAM_PATHS.map((p) => (readFileSync(p, 'utf8').match(WRITE_REGEX) ?? []).length)

if (failures === 0) {
    console.log('PASS: no module writes appState.focusState.selectedPoint outside owner/mirror/seams')
    console.log(
        `  - Owner module: src/lib/journey/selected-card.ts (${ownerWrites} direct writes — should be 0; all routed via focusOnPoint)`
    )
    console.log(
        `  - Mirror module: src/lib/stores/focus.svelte.ts (${mirrorWrites} direct writes inside .update() callbacks)`
    )
    console.log(
        `  - Seam writers: thread-settler.ts (${seamWrites[0]}, reassert), lifecycle.ts (${seamWrites[1]}, legacy mirror)`
    )
    console.log(`  - Public API: ${requiredOwnerExports.join(', ')}`)
    console.log(`  - Scanned TS modules under ${relative(join(__dirname, '..'), MODULES_DIR)}`)
    process.exit(0)
} else {
    console.error(`\n${failures} failure(s) found`)
    process.exit(1)
}
