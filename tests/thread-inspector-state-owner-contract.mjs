// thread-inspector-state-owner-contract.mjs
// Proves no runtime module writes appState.threadInspectorPointerInside
// outside the thread-inspector owner module + the focus.svelte.ts
// mirror seam.
//
// Owner: src/lib/journey/thread-inspector.ts
//   - Pointer-enter/leave handlers bind to the inspector DOM
//   - clearThreadInspection resets the flag on inspection teardown
//
// Mirror: src/lib/stores/focus.svelte.ts
//   - The legacy focusStore mirrors to/from appState for backward
//     compatibility with subscribers that read the Svelte store
//     directly. Two writes exist, both inside .update((s) => {...})
//     callbacks that copy next.threadInspector.pointerInside into
//     appState.threadInspectorPointerInside.
//
// All other modules must go through the public API:
//   - inspectThreadNeighbor, pinThreadNeighbor,
//     pinFirstAvailableNeighbor, unpinThreadInspection,
//     clearThreadInspection, exploreThreadNeighbor,
//     getThreadInspectionState, renderThreadInspection
//
// Initialization with ??= (in journey.ts et al.) is allowed because
// it only fires when the field is null/undefined — not a real write.

import { readdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODULES_DIR = join(__dirname, '..', 'src', 'lib')
const OWNER_PATH = join(__dirname, '..', 'src', 'lib', 'journey', 'thread-inspector.ts')
const MIRROR_PATH = join(__dirname, '..', 'src', 'lib', 'stores', 'focus.svelte.ts')
const STATE_TYPES_PATH = join(__dirname, '..', 'src', 'lib', 'state', 'state-types.ts')
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

// Match direct writes: appState.X = or state.X =, NOT ??= initialization.
// Excludes reads (no `=` sign) and initialization (??=).
const WRITE_REGEX = /(?<![?])(\bappState|\bstate)\.threadInspectorPointerInside\s*=(?!=)/g

for (const file of listTsFiles(MODULES_DIR)) {
    if (file === OWNER_PATH || file === MIRROR_PATH) continue

    const fileSource = readFileSync(file, 'utf8')
    let match
    WRITE_REGEX.lastIndex = 0
    while ((match = WRITE_REGEX.exec(fileSource)) !== null) {
        const lineNum = offsetToLine(fileSource, match.index)
        const line = fileSource.split('\n')[lineNum - 1].trim()
        console.error(
            `FAIL: ${relative(join(__dirname, '..'), file)}:${lineNum} writes threadInspectorPointerInside outside owner/mirror:\n  ${line}`
        )
        failures += 1
    }
}

// Verify owner module exports the public API
const ownerSource = readFileSync(OWNER_PATH, 'utf8')
const requiredOwnerExports = [
    'getThreadInspectionState',
    'inspectThreadNeighbor',
    'pinThreadNeighbor',
    'pinFirstAvailableNeighbor',
    'unpinThreadInspection',
    'clearThreadInspection',
    'exploreThreadNeighbor'
]
for (const name of requiredOwnerExports) {
    if (!ownerSource.includes(`export function ${name}`) && !ownerSource.includes(`export const ${name}`)) {
        console.error(`FAIL: thread-inspector owner module missing export "${name}"`)
        failures += 1
    }
}

// Verify the field is declared in state-types.ts (interface) and app.svelte.ts (class)
const stateTypesSource = readFileSync(STATE_TYPES_PATH, 'utf8')
if (!/\bthreadInspectorPointerInside\b\s*:\s*boolean/.test(stateTypesSource)) {
    console.error('FAIL: state-types.ts does not declare threadInspectorPointerInside: boolean')
    failures += 1
}

const appStateSource = readFileSync(APP_STATE_PATH, 'utf8')
if (!/threadInspectorPointerInside\s*=\s*\$state/.test(appStateSource)) {
    console.error('FAIL: app.svelte.ts does not declare threadInspectorPointerInside = $state')
    failures += 1
}

// Verify owner + mirror module paths exist (defensive — fails loudly if renamed)
for (const path of [OWNER_PATH, MIRROR_PATH]) {
    try {
        readFileSync(path, 'utf8')
    } catch (e) {
        console.error(`FAIL: ${relative(join(__dirname, '..'), path)} does not exist (${e.message})`)
        failures += 1
    }
}

// Count actual writes in the owner + mirror for the summary line
const ownerWrites = (ownerSource.match(WRITE_REGEX) ?? []).length
const mirrorSource = readFileSync(MIRROR_PATH, 'utf8')
const mirrorWrites = (mirrorSource.match(WRITE_REGEX) ?? []).length

if (failures === 0) {
    console.log('PASS: no module writes appState.threadInspectorPointerInside outside owner/mirror')
    console.log(`  - Owner module: src/lib/journey/thread-inspector.ts (${ownerWrites} direct writes)`)
    console.log(`  - Mirror module: src/lib/stores/focus.svelte.ts (${mirrorWrites} direct writes inside .update() callbacks)`)
    console.log(`  - Public API: ${requiredOwnerExports.join(', ')}`)
    console.log(`  - Scanned TS modules under ${relative(join(__dirname, '..'), MODULES_DIR)}`)
    process.exit(0)
} else {
    console.error(`\n${failures} failure(s) found`)
    process.exit(1)
}