/**
 * Source-only contract for direct window assignments.
 *
 * This is a ratchet, not a cleanup gate. Known globals are explicitly
 * classified so new window exposure cannot slip in unnoticed. Existing
 * migration debt remains allowed until a focused dewindowing slice removes it.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const JS_ROOT = path.join(ROOT, 'src')

const liveProduct = new Set([
    '__APP_ACTIONS__',
    '__LEGACY_APP_STATE__',
    '__SEMANTIC_EXPLORER_APP_STATE_DIRECT__',
    'THREE',
    'animateCameraToSearchCorridor',
    'applyFocusOrbitSlack',
    'applyPointFilterColors',
    'clearAutoRotateResumeTimer',
    'clearFocusOrbitSlack',
    'clearInsideCentroid',
    'clearStrandContinuityState',
    'clearThreadInspection',
    'clearSearch',
    'clearWeatherRefreshTimer',
    'closeLegendGuide',
    'closeLegendPanel',
    'computeFocusPocketScreenBounds',
    'computeSafeAreaCameraTargetOffset',
    'cancelMicroDemo',
    'disposeArrivalHandoffOverlay',
    'executeJourneyCompassAction',
    'focusCameraAssistIsActive',
    'getCanvasUnobstructedRegion',
    'getCurrentTrailFocusIndex',
    'getFocusOrbitSlackPivot',
    'getGeometricThreadCandidates',
    'getSemanticThreadCandidates',
    'getThreadCandidatesForIndex',
    'hideTooltip',
    'inspectThreadNeighbor',
    'isCameraIdleOrbitAllowed',
    'isLegendPanelOpen',
    'isMicroDemoRunning',
    'isSearchRouteFocusActive',
    'openLegendPanel',
    'pinThreadNeighbor',
    'positionTooltip',
    'previewInsideNextThread',
    'refreshFocusSemanticOverlay',
    'refreshCompositionState',
    'refreshRouteTraceOverlay',
    'refreshWeatherStalenessIndicator',
    'renderThreadInspection',
    'scheduleAutoRotateResume',
    'setAutoRotateSuspended',
    'setSemanticDiveMode',
    'setRouteChoreographyPhase',
    'setStrandContinuityState',
    'setTrailDepth',
    'startFocusCameraAssist',
    'summarizeNeighborReason',
    'syncArrivalHandoffOverlay',
    'syncCameraAssistDataset',
    'traverseNeighbor',
    'unpinThreadInspection',
    'updateArrivalHandoffOverlay',
    'updateAutoRotateSoftResume',
    'updateFocusSemanticOverlayPositions',
    'updateRouteTraceOverlayPositions',
    'updateSelectedBusiness',
    'updateTooltipContent',
    'updateTrailIndices',
    'updateWeatherStaleness',
    'walkThreadNeighbor',
    'returnToOverview',
    'resetExplorationFocus',
    'search',
    'zoomCamera',
    'withStateMutation'
])

const debugProbe = new Set([
    '__ERROR_RING__',
    '__forceSemanticDiveContractSurface',
    '__spectorStatus',
    '__telemetry__',
    '__APP_STATE__',
    '__TEST_STATE__',
    '__initTimings',
    '__semanticCanvasThreadProbe',
    '__semanticFocusCueProbe',
    '__semanticThreadInspectorProbe',
    '__semanticPostprocessing',
    '__toastHooks__',
    '__SEMANTIC_GUIDE_TIMEOUT_MS__',
    '__telemetry_devtoolsVisible',
    '__spector',
    '__navStore__',
    '__focusStore__',
    '__journeyStore__',
    '__searchStore__',
    '__navActions__',
    '__dataLoadState__',
    '__publishCameraNodeFocused__',
    '__semanticExplorerSessionSeed',
    'syncTestStateFromBody',
    '__refreshTestCompatState__',
    '_getSelectedBusinessRoleLabel',
    '_ti'
])

const migrationDebt = new Set([])

function assert(condition, message) {
    if (!condition) throw new Error(message)
}

function collectJsFiles(dir) {
    const files = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...collectJsFiles(fullPath))
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte'))) {
            files.push(fullPath)
        }
    }
    return files
}

function lineForIndex(source, index) {
    return source.slice(0, index).split(/\r?\n/).length
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractWindowAssignments(source, filePath) {
    const assignments = []
    const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/')

    // Keep a mutable matchIndex so record() can reference the current match position.
    let matchIndex = 0
    let match

    const push = (name) => {
        if (!name) return
        assignments.push({ name, file: relPath, line: lineForIndex(source, matchIndex) })
    }

    // ── Literal-name patterns (the name is directly in the source) ────────────

    // P1: window.NAME =
    const p1 = /window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g
    while ((match = p1.exec(source)) !== null) { matchIndex = match.index; push(match[1]) }

    // P2: window['NAME'] =  |  window["NAME"] =
    const p2 = /window\[['"]([^'"]+)['"]\]\s*=(?!=)/g
    while ((match = p2.exec(source)) !== null) { matchIndex = match.index; push(match[1]) }

    // P3: Object.defineProperty(window, 'NAME'  |  Object.defineProperty(window, "NAME"
    const p3 = /Object\.defineProperty\(\s*window\s*,\s*['"]([^'"]+)['"]/g
    while ((match = p3.exec(source)) !== null) { matchIndex = match.index; push(match[1]) }

    // P5: (window as Type).NAME =
    const p5 = /\(window\s+as\s+[^)]+\)\s*\.\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g
    while ((match = p5.exec(source)) !== null) { matchIndex = match.index; push(match[1]) }

    // P6: (window as Type)['NAME'] =  |  (window as Type)["NAME"] =
    const p6 = /\(window\s+as\s+[^)]+\)\s*\[\s*['"]([^'"]+)['"]\s*\]\s*=(?!=)/g
    while ((match = p6.exec(source)) !== null) { matchIndex = match.index; push(match[1]) }

    // ── Computed-property patterns (identifier key → resolve to literal) ─────
    // Only emit when the identifier can be resolved to a string-literal constant.
    // Function parameters (storageKey, key, etc.) stay unresolved → skipped.

    // P4: window[CONST_IDENT] =  (may have 'as' cast before '[')
    const p4 = /window(?:\s+as\s+[^[\]]+?)?\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*=(?!=)/g
    while ((match = p4.exec(source)) !== null) {
        matchIndex = match.index
        const resolved = resolveConstant(source, match[1])
        if (resolved) push(resolved)
    }

    // P7: (window as Type)[CONST_IDENT] =  (computed via variable key inside cast-parens)
    const p7 = /\(window\s+as\s+[^)]+\)\s*\[\s*([A-Za-z_$][\w$]*)\s*\]\s*=(?!=)/g
    while ((match = p7.exec(source)) !== null) {
        matchIndex = match.index
        const resolved = resolveConstant(source, match[1])
        if (resolved) push(resolved)
    }

    // ── Alias detection (two-pass: find aliases, then alias writes) ──────────

    // Step A: find "const/let/var ALIAS = window" (with optional "as Type" suffix).
    // Negative lookahead (?!\.) prevents matching window.indexedDB / window.location etc.
    const varAliases = []
    const aliasDecl = /(?:const|let|var)\s+(\w+)\s*=\s*window\b(?!\.)/g
    while ((match = aliasDecl.exec(source)) !== null) {
        varAliases.push(match[1])
    }

    // Step B: find "function NAME(...)[:Type] { ... return window ... }" (non-greedy to first return)
    const funcAliases = []
    const funcDecl = /function\s+(\w+)\s*\([^)]*\)[\s\S]*?return\s+window\b/g
    while ((match = funcDecl.exec(source)) !== null) {
        funcAliases.push(match[1])
    }

    // Step C: for each variable alias, find ALIAS.NAME =  and  ALIAS['NAME'] =
    for (const alias of [...new Set(varAliases)]) {
        const aliasDot = new RegExp(`\\b${escapeRegex(alias)}\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, 'g')
        const aliasBrk = new RegExp(`\\b${escapeRegex(alias)}\\s*\\[\\s*['"]([^'"]+)['"]\\s*\\]\\s*=(?!=)`, 'g')
        for (const pat of [aliasDot, aliasBrk]) {
            while ((match = pat.exec(source)) !== null) { matchIndex = match.index; push(match[1]) }
        }
    }

    // Step D: for each function alias, find FUNC().NAME =  and  FUNC()['NAME'] =
    for (const alias of [...new Set(funcAliases)]) {
        const funcDot = new RegExp(`\\b${escapeRegex(alias)}\\(\\)\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=(?!=)`, 'g')
        const funcBrk = new RegExp(`\\b${escapeRegex(alias)}\\(\\)\\s*\\[\\s*['"]([^'"]+)['"]\\s*\\]\\s*=(?!=)`, 'g')
        for (const pat of [funcDot, funcBrk]) {
            while ((match = pat.exec(source)) !== null) { matchIndex = match.index; push(match[1]) }
        }
    }

    return assignments
}

/**
 * Resolve a computed-property-key identifier to its literal value when the
 * constant is declared as `const KEY = 'literal'` in the same file.
 * Returns null when the identifier can't be resolved.
 */
function resolveConstant(source, identifier) {
    const re = new RegExp(
        `(?:const|let|var)\\s+${escapeRegex(identifier)}\\s*=\\s*['"]([^'"]+)['"]`,
        'g'
    )
    const m = re.exec(source)
    return m ? m[1] : null
}

function classify(name) {
    if (liveProduct.has(name)) return 'live-product'
    if (debugProbe.has(name)) return 'debug-probe'
    if (migrationDebt.has(name)) return 'migration-debt'
    return 'unknown'
}

function main() {
    const files = collectJsFiles(JS_ROOT)
    const assignments = files.flatMap((file) => extractWindowAssignments(fs.readFileSync(file, 'utf8'), file))
    const unknown = assignments.filter(({ name }) => classify(name) === 'unknown')
    const summary = assignments.reduce((acc, assignment) => {
        const tier = classify(assignment.name)
        acc[tier] = (acc[tier] || 0) + 1
        return acc
    }, {})

    assert(files.length > 0, `No JavaScript files found under ${path.relative(ROOT, JS_ROOT)}`)

    if (unknown.length > 0) {
        const details = unknown.map(({ file, line, name }) => `  ${file}:${line} window.${name}`).join('\n')
        throw new Error(
            `Unclassified window assignments found:\n${details}\n\nClassify each new global in tests/window-global-allowlist-contract.mjs and docs/window-global-allowlist.md.`
        )
    }

    console.log('[window-global-allowlist] pass')
    console.log(`  files scanned: ${files.length}`)
    console.log(`  assignments: ${assignments.length}`)
    console.log(`  live-product: ${summary['live-product'] || 0}`)
    console.log(`  debug-probe: ${summary['debug-probe'] || 0}`)
    console.log(`  migration-debt: ${summary['migration-debt'] || 0}`)
}

main()
