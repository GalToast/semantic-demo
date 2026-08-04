// thread-inspector-state-owner-contract.mjs
// Proves no runtime module writes appState.threadInspectorPointerInside
// outside the thread-inspector owner modules + the focus.svelte.ts
// mirror seam.
//
// Owner (Wave70 split — the old monolithic src/lib/journey/thread-inspector.ts
// no longer exists):
//   - src/lib/journey/thread-inspector-state.ts
//       - Pointer-inspection state + clearThreadInspection resets the flag
//         on inspection teardown (3 write sites)
//   - src/lib/journey/thread-inspector-render.ts
//       - Pointer-enter/leave handlers bind to the inspector DOM (2 write sites)
//
// Mirror: src/lib/stores/focus.svelte.ts
//   - The legacy focusStore mirrors to/from appState for backward
//     compatibility with subscribers that read the Svelte store
//     directly. One write exists inside the .update((s) => {...})
//     callback that copies next.threadInspector.pointerInside into
//     appState.focusState.threadInspectorPointerInside.
//
// All other modules must go through the public API:
//   - inspectThreadNeighbor, pinThreadNeighbor,
//     pinFirstAvailableNeighbor, unpinThreadInspection,
//     clearThreadInspection, exploreThreadNeighbor (state module)
//   - renderThreadInspection (render module)
//
// Initialization with ??= (in journey.ts et al.) is allowed because
// it only fires when the field is null/undefined — not a real write.

import { readdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODULES_DIR = join(__dirname, '..', 'src', 'lib')
const OWNER_PATHS = [
    join(__dirname, '..', 'src', 'lib', 'journey', 'thread-inspector-state.ts'),
    join(__dirname, '..', 'src', 'lib', 'journey', 'thread-inspector-render.ts')
]
const MIRROR_PATH = join(__dirname, '..', 'src', 'lib', 'stores', 'focus.svelte.ts')
// FocusAppState declares the field in the state-type split.
const FOCUS_TYPE_PATH = join(__dirname, '..', 'src', 'lib', 'state', 'types', 'navigation-types.ts')
// The rune-class default lives inside the focusState sub-aggregate literal.
const APP_STATE_PATH = join(__dirname, '..', 'src', 'lib', 'state', 'app.svelte.ts')
// Canonical domain FocusState interface.
const DOMAIN_TYPE_PATH = join(__dirname, '..', 'src', 'lib', 'types', 'state.ts')

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

// Match direct writes of the flag in both legacy flat form
// (appState.threadInspectorPointerInside =) and the current nested
// focusState form (appState.focusState.threadInspectorPointerInside =).
// legacyState is an alias for appState (exported from app.svelte.ts), so it
// is scanned too. NOT ??= initialization.
const WRITE_REGEX =
    /(?<![?])(\bappState|\bstate|\blegacyState)(\.focusState)?\.threadInspectorPointerInside\s*=(?!=)/g

for (const file of listTsFiles(MODULES_DIR)) {
    if (OWNER_PATHS.includes(file) || file === MIRROR_PATH) continue

    const fileSource = readFileSync(file, 'utf8')
    let match
    WRITE_REGEX.lastIndex = 0
    while ((match = WRITE_REGEX.exec(fileSource)) !== null) {
        if (isInsideComment(fileSource, match.index)) continue
        const lineNum = offsetToLine(fileSource, match.index)
        const line = fileSource.split('\n')[lineNum - 1].trim()
        console.error(
            `FAIL: ${relative(join(__dirname, '..'), file)}:${lineNum} writes threadInspectorPointerInside outside owner/mirror:\n  ${line}`
        )
        failures += 1
    }
}

// Verify the owner modules export the public API
const STATE_OWNER_EXPORTS = [
    'getThreadInspectionState',
    'inspectThreadNeighbor',
    'pinThreadNeighbor',
    'pinFirstAvailableNeighbor',
    'unpinThreadInspection',
    'clearThreadInspection',
    'exploreThreadNeighbor'
]
const RENDER_OWNER_EXPORTS = ['renderThreadInspection']
for (const name of STATE_OWNER_EXPORTS) {
    if (!readFileSync(OWNER_PATHS[0], 'utf8').includes(`export function ${name}`)) {
        console.error(`FAIL: thread-inspector-state owner module missing export "${name}"`)
        failures += 1
    }
}
for (const name of RENDER_OWNER_EXPORTS) {
    if (!readFileSync(OWNER_PATHS[1], 'utf8').includes(`export function ${name}`)) {
        console.error(`FAIL: thread-inspector-render owner module missing export "${name}"`)
        failures += 1
    }
}

// Verify the field is declared in the state-type split (FocusAppState) and
// the domain FocusState interface, and defaulted in the rune class.
const focusTypesSource = readFileSync(FOCUS_TYPE_PATH, 'utf8')
if (!/\bthreadInspectorPointerInside\b\s*:\s*boolean/.test(focusTypesSource)) {
    console.error('FAIL: navigation-types.ts does not declare threadInspectorPointerInside: boolean')
    failures += 1
}

const appStateSource = readFileSync(APP_STATE_PATH, 'utf8')
if (!/threadInspectorPointerInside\s*:\s*false/.test(appStateSource)) {
    console.error('FAIL: app.svelte.ts focusState does not default threadInspectorPointerInside: false')
    failures += 1
}

const domainTypeSource = readFileSync(DOMAIN_TYPE_PATH, 'utf8')
if (!/\bthreadInspectorPointerInside\b\s*:\s*boolean/.test(domainTypeSource)) {
    console.error('FAIL: types/state.ts FocusState does not declare threadInspectorPointerInside: boolean')
    failures += 1
}

// Verify owner + mirror module paths exist (defensive — fails loudly if renamed)
for (const path of [...OWNER_PATHS, MIRROR_PATH]) {
    try {
        readFileSync(path, 'utf8')
    } catch (e) {
        console.error(`FAIL: ${relative(join(__dirname, '..'), path)} does not exist (${e.message})`)
        failures += 1
    }
}

// Count actual writes in the owners + mirror for the summary line
const ownerWriteCounts = OWNER_PATHS.map((p) => (readFileSync(p, 'utf8').match(WRITE_REGEX) ?? []).length)
const mirrorSource = readFileSync(MIRROR_PATH, 'utf8')
const mirrorWrites = (mirrorSource.match(WRITE_REGEX) ?? []).length

if (failures === 0) {
    console.log('PASS: no module writes appState.threadInspectorPointerInside outside owner/mirror')
    console.log(
        `  - Owner modules: src/lib/journey/thread-inspector-state.ts (${ownerWriteCounts[0]} direct writes), ` +
            `src/lib/journey/thread-inspector-render.ts (${ownerWriteCounts[1]} direct writes)`
    )
    console.log(
        `  - Mirror module: src/lib/stores/focus.svelte.ts (${mirrorWrites} direct writes inside .update() callbacks)`
    )
    console.log(`  - Public API: ${STATE_OWNER_EXPORTS.join(', ')}, ${RENDER_OWNER_EXPORTS.join(', ')}`)
    console.log(`  - Scanned TS modules under ${relative(join(__dirname, '..'), MODULES_DIR)}`)
    process.exit(0)
} else {
    console.error(`\n${failures} failure(s) found`)
    process.exit(1)
}
