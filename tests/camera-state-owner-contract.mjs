// camera-state-owner-contract.mjs
// Proves no runtime module writes appState.focusTransitionMode outside
// the camera-controls-core owner module + the focus.svelte.ts mirror seam.
//
// Owner: src/lib/engine/camera-controls-core.svelte.ts
//   - cameraControlsCore.setFocusTransitionMode(mode, options) is the
//     canonical writer. It sets the class-field source-of-truth, clears
//     any pending settle timer, mirrors to the legacy state, and updates
//     body.dataset.focusTransition / focusTransitionPhase.
//
// Mirror: src/lib/stores/focus.svelte.ts
//   - The legacy focusStore mirrors to/from appState for backward
//     compatibility with subscribers reading the Svelte store directly.
//     Two writes exist, both inside .update((s) => ({...s, ...}))
//     callbacks that copy next.transitionMode into
//     appState.focusTransitionMode.
//
// All other modules must go through setFocusTransitionMode.
//
// T-2 commits (3d7affa9, 29264dd4) refactored the rogue writer:
//   - cursor.ts:79 was already using unpinThreadInspection after T-2.1
//   - demo-choreography.ts:228 (demoReset) → setFocusTransitionMode('idle')
//     removed 2 stale body.dataset.* clears that the owner API handles
//
// This contract enforces that future contributors don't reintroduce
// direct writes that bypass the owner API and leak settle timers /
// stale mirrors.

import { readdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODULES_DIR = join(__dirname, '..', 'src', 'lib')
const OWNER_PATH = join(__dirname, '..', 'src', 'lib', 'engine', 'camera-controls-core.svelte.ts')
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
const WRITE_REGEX = /(?<![?])(\bappState|\bstate)\.focusTransitionMode\s*=(?!=)/g

for (const file of listTsFiles(MODULES_DIR)) {
    if (file === OWNER_PATH || file === MIRROR_PATH) continue

    const fileSource = readFileSync(file, 'utf8')
    let match
    WRITE_REGEX.lastIndex = 0
    while ((match = WRITE_REGEX.exec(fileSource)) !== null) {
        const lineNum = offsetToLine(fileSource, match.index)
        const line = fileSource.split('\n')[lineNum - 1].trim()
        console.error(
            `FAIL: ${relative(join(__dirname, '..'), file)}:${lineNum} writes focusTransitionMode outside owner/mirror:\n  ${line}`
        )
        failures += 1
    }
}

// Verify owner module exports the public API
const ownerSource = readFileSync(OWNER_PATH, 'utf8')
const requiredOwnerExports = [
    'CameraControlsCore',  // class
    'cameraControlsCore'   // singleton instance
]
const classMatch = ownerSource.includes('class CameraControlsCore')
if (!classMatch) {
    console.error('FAIL: camera-controls-core owner module missing CameraControlsCore class')
    failures += 1
}
const singletonMatch = ownerSource.includes('export const cameraControlsCore = new CameraControlsCore()')
if (!singletonMatch) {
    console.error('FAIL: camera-controls-core owner module missing cameraControlsCore singleton')
    failures += 1
}

// The class should declare setFocusTransitionMode as a method
if (!/setFocusTransitionMode\s*\(/.test(ownerSource)) {
    console.error('FAIL: CameraControlsCore class missing setFocusTransitionMode method')
    failures += 1
}

// Verify the field is declared in state-types.ts (interface) and app.svelte.ts (class)
const stateTypesSource = readFileSync(STATE_TYPES_PATH, 'utf8')
if (!/\bfocusTransitionMode\s*:/.test(stateTypesSource)) {
    console.error('FAIL: state-types.ts does not declare focusTransitionMode')
    failures += 1
}

const appStateSource = readFileSync(APP_STATE_PATH, 'utf8')
if (!/focusTransitionMode\s*=\s*\$state/.test(appStateSource)) {
    console.error('FAIL: app.svelte.ts does not declare focusTransitionMode = $state')
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

// Count actual writes in the owner + mirror for the summary line.
// Owner should have 1 write (the legacy mirror inside setFocusTransitionMode).
// Mirror should have 2 writes inside .update() callbacks.
const ownerWrites = (ownerSource.match(WRITE_REGEX) ?? []).length
const mirrorSource = readFileSync(MIRROR_PATH, 'utf8')
const mirrorWrites = (mirrorSource.match(WRITE_REGEX) ?? []).length

if (failures === 0) {
    console.log('PASS: no module writes appState.focusTransitionMode outside owner/mirror')
    console.log(`  - Owner module: src/lib/engine/camera-controls-core.svelte.ts (${ownerWrites} legacy-mirror write inside setFocusTransitionMode)`)
    console.log(`  - Mirror module: src/lib/stores/focus.svelte.ts (${mirrorWrites} direct writes inside .update() callbacks)`)
    console.log(`  - Public API: cameraControlsCore.setFocusTransitionMode(mode, options)`)
    console.log(`  - Scanned TS modules under ${relative(join(__dirname, '..'), MODULES_DIR)}`)
    process.exit(0)
} else {
    console.error(`\n${failures} failure(s) found`)
    process.exit(1)
}