/**
 * map-focus-search-content-owner-contract.mjs
 *
 * Svelte-native ownership contract for the map+focus+search composition.
 *
 * After the chrome migration, the map-focus-search composition is owned by:
 *   1. InfoPanel.svelte — owns #selected-card, #selected-details, and imports
 *      SelectedBusinessDetails.svelte which renders the child IDs.
 *   2. FocusCard.svelte — owns the focus-stage overlay #selected-card variant.
 *   3. src/lib/focus/stage-renderer.ts — manages structural slot visibility
 *      (hidden/aria-hidden) on #selected-card, #selected-details,
 *      without writing retired map-summary subtree content.
 *   4. src/lib/journey/selected-card.ts — delegates content variant sync
 *      to stage-renderer, not directly to DOM.
 *   5. src/lib/orchestration/info-panel-state.ts — per-surface content
 *      descriptors (selectionSuppressed, headerVisible, etc.).
 *
 * This contract verifies:
 *   A. stage-renderer.ts is the single structural slot manager and owns
 *      syncSelectedCardContentVariant().
 *   B. No vanilla JS module writes to Svelte-internal child elements
 *      (selected-name, selected-what, etc.).
 *   C. The map summary content variant elements (#selected-map-summary-*)
 *      no longer exist in any Svelte component — they are dead DOM IDs
 *      in the renderer's null-check path. The map summary content variant
 *      was retired; MapSummary.svelte is a separate mini-map overlay.
 *   D. InfoPanel.svelte owns all surface IDs and data-content-owner attrs.
 *      SelectedBusinessDetails.svelte owns the child IDs (selected-name,
 *      selected-what, selected-meta-strip, selected-action-row, btn-selected-map).
 *   E. Composition updates flow through event-bus COMPOSITION_UPDATED,
 *      not legacy direct-DOM calls.
 *
 * Usage:
 *   node tests/map-focus-search-content-owner-contract.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))

// ── Source paths (post-migration canonical locations) ─────────────────────────

const STAGE_RENDERER = 'src/lib/focus/stage-renderer.ts'
const JOURNEY_STAGE_RENDERER = 'src/lib/journey/focus-stage-renderer.ts'
const JOURNEY_SELECTED_CARD = 'src/lib/journey/selected-card.ts'
const JOURNEY_MODULE = 'src/lib/journey/journey.ts'
const INFO_PANEL = 'src/components/InfoPanel.svelte'
const SELECTED_BUSINESS_DETAILS = 'src/components/SelectedBusinessDetails.svelte'
const FOCUS_CARD = 'src/components/FocusCard.svelte'
const INFO_PANEL_STATE = 'src/lib/orchestration/info-panel-state.ts'
const EVENT_BUS = 'src/lib/orchestration/event-bus.ts'
const LIFECYCLE = 'src/lib/stores/lifecycle.ts'
const PARITY_ATTRS = 'src/lib/orchestration/parity-attrs.svelte.ts'
const APP_SHELL = 'src/App.svelte'
const APP_INIT = 'src/lib/orchestration/app-init.ts'

// ── Svelte-owned child IDs (SelectedBusinessDetails.svelte renders these;
// stage-renderer and journey modules must NOT write them) ─────────────────────

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

// ── Retired map-summary element IDs (should NOT exist in any Svelte source) ──
// These were part of InfoPanelSelectionSurface.svelte, removed in chrome migration.

const RETIRED_MAP_SUMMARY_IDS = [
    'selected-map-summary',
    'selected-map-summary-kicker',
    'selected-map-summary-name',
    'selected-map-summary-what',
    'selected-map-summary-role',
    'selected-map-summary-match',
    'selected-map-summary-match-copy'
]

// ── Retired component paths (must not exist) ──────────────────────────────────

const RETIRED_PATHS = []

// ── Test A: stage-renderer.ts owns structural slot management ─────────────────

function testStageRendererOwnsStructuralSlots() {
    const src = read(STAGE_RENDERER)

    assert(
        /export\s+function\s+syncSelectedCardContentVariant\s*\(/.test(src),
        'stage-renderer.ts must export syncSelectedCardContentVariant()'
    )

    assert(
        /function\s+setSurfaceHidden\s*\(/.test(src),
        'stage-renderer.ts must own setSurfaceHidden() for visibility management'
    )

    // Must use hidden + aria-hidden, not inline display
    assert(
        /el\.hidden\s*=\s*true[\s\S]{0,200}el\.setAttribute\s*\(\s*['"]aria-hidden['"],\s*['"]true['"]\s*\)/.test(
            src
        ) &&
            /el\.hidden\s*=\s*false[\s\S]{0,200}el\.setAttribute\s*\(\s*['"]aria-hidden['"],\s*['"]false['"]\s*\)/.test(
                src
            ),
        'setSurfaceHidden() must own hidden state and aria-hidden, not inline display'
    )

    // Must NOT write style.display
    assert(
        !/function\s+setSurfaceHidden\s*\([^)]*\)\s*\{[\s\S]*?style\.display/.test(src),
        'setSurfaceHidden() must not write inline display; hidden attribute + CSS own layout'
    )

    // Must gate on focus-stage-owned surfaces
    assert(
        /function\s+focusStageOwnsSelectedContent\s*\(/.test(src) &&
            /'focus'/.test(src) &&
            /'focus-search'/.test(src) &&
            /'semantic-dive'/.test(src),
        'stage-renderer must treat focus, focus-search, and semantic-dive as focus-stage owners'
    )

    // Must set data-content-variant and data-content-owner on #selected-card
    assert(
        /cardEl\.dataset\.contentVariant\s*=/.test(src),
        'stage-renderer must set data-content-variant on #selected-card'
    )
    assert(
        /cardEl\.dataset\.contentOwner\s*=/.test(src),
        'stage-renderer must set data-content-owner on #selected-card'
    )

    console.log('  OK - stage-renderer.ts owns structural slot management')
}

// ── Test B: No vanilla JS writes to Svelte-internal children ─────────────────

function testNoLegacySvelteChildWrites() {
    // Check stage-renderer.ts
    const rendererSrc = read(STAGE_RENDERER)
    for (const id of SVELTE_OWNED_CHILD_IDS) {
        assert(
            !rendererSrc.includes(`getElementById('${id}')`) && !rendererSrc.includes(`getElementById("${id}")`),
            `stage-renderer.ts must not query Svelte-owned #${id}`
        )
    }

    // Check journey/selected-card.ts
    const selectedCardSrc = read(JOURNEY_SELECTED_CARD)
    for (const id of SVELTE_OWNED_CHILD_IDS) {
        assert(
            !selectedCardSrc.includes(`getElementById('${id}')`) &&
                !selectedCardSrc.includes(`getElementById("${id}")`),
            `journey/selected-card.ts must not query Svelte-owned #${id}`
        )
    }

    // Check journey/journey.ts
    const journeySrc = read(JOURNEY_MODULE)
    for (const id of SVELTE_OWNED_CHILD_IDS) {
        assert(
            !journeySrc.includes(`getElementById('${id}')`) && !journeySrc.includes(`getElementById("${id}")`),
            `journey/journey.ts must not query Svelte-owned #${id}`
        )
    }

    console.log('  OK - no vanilla JS writes to Svelte-internal child elements')
}

// ── Test C: Retired map-summary elements do not exist in Svelte sources ──────

function testRetiredMapSummaryElementsRemoved() {
    // The old #selected-map-summary subtree was removed from Svelte sources
    // during the chrome migration. MapSummary.svelte is a separate mini-map
    // overlay component — it does NOT render the old selected-map-summary
    // content variant.

    const svelteComponents = [
        INFO_PANEL,
        FOCUS_CARD,
        'src/components/MapSummary.svelte',
        'src/components/SearchBar.svelte',
        'src/components/SearchResults.svelte'
    ]

    for (const component of svelteComponents) {
        if (!exists(component)) continue
        const src = read(component)
        for (const id of RETIRED_MAP_SUMMARY_IDS) {
            assert(
                !src.includes(`id="{idPrefix}${id}"`) && !src.includes(`id='${id}'`),
                `${component} must not render retired map-summary element #${id}`
            )
        }
    }

    // stage-renderer.ts must not keep null-check/content-writer paths for the
    // retired subtree either; InfoPanel owns the compact map-focus-search payload.
    // W7-B Pair 1 collapse: journey/focus-stage-renderer.ts retired, canonical
    // is the single focus/stage-renderer.ts.
    const stageRendererSrc = read(STAGE_RENDERER)
    for (const id of RETIRED_MAP_SUMMARY_IDS) {
        assert(!stageRendererSrc.includes(id), `stage renderer must not reference retired map-summary element #${id}`)
    }

    // The retired IDs must NOT exist in any Svelte component source.
    // Verify the HTML shell doesn't have them either:
    const html = read('src/index.html')
    for (const id of RETIRED_MAP_SUMMARY_IDS) {
        assert(
            !html.includes(`id="{idPrefix}${id}"`) && !html.includes(`id='${id}'`),
            `HTML shell must not render retired map-summary element #${id}`
        )
    }

    console.log('  OK - retired map-summary elements removed from Svelte sources and HTML shell')
}

// ── Test D: InfoPanel.svelte owns surface IDs; SelectedBusinessDetails owns children ─

function testInfoPanelOwnsSurface() {
    const infoPanelSrc = read(INFO_PANEL)
    const selectedDetailsSrc = read(SELECTED_BUSINESS_DETAILS)

    // Must own #info-panel as root element
    assert(infoPanelSrc.includes('id="info-panel"'), 'InfoPanel.svelte must render #info-panel')

    // Must own #info-panel-content
    assert(infoPanelSrc.includes('id="info-panel-content"'), 'InfoPanel.svelte must own #info-panel-content')

    // Must own #selected-card with data-content-owner
    assert(
        infoPanelSrc.includes('id="selected-card"') && infoPanelSrc.includes('data-content-owner='),
        'InfoPanel.svelte must own #selected-card with data-content-owner attribute'
    )

    // Must own #selected-details
    assert(infoPanelSrc.includes('id="selected-details"'), 'InfoPanel.svelte must own #selected-details')

    // Must own #selected-empty
    assert(infoPanelSrc.includes('id="selected-empty"'), 'InfoPanel.svelte must own #selected-empty')

    // Must import SelectedBusinessDetails (which owns the child IDs)
    assert(
        infoPanelSrc.includes('SelectedBusinessDetails') || infoPanelSrc.includes('selected-business-details'),
        'InfoPanel.svelte must import/render SelectedBusinessDetails.svelte'
    )

    // Child IDs live in SelectedBusinessDetails.svelte, not InfoPanel.svelte
    for (const id of [
        'selected-name',
        'selected-what',
        'selected-meta-strip',
        'selected-action-row',
        'btn-selected-map'
    ]) {
        assert(selectedDetailsSrc.includes(`id="{idPrefix}${id}"`), `SelectedBusinessDetails.svelte must own #${id}`)
    }

    // Must use getInfoPanelContent() for per-surface content descriptors
    assert(
        infoPanelSrc.includes('getInfoPanelContent') || infoPanelSrc.includes('contentDescriptor'),
        'InfoPanel.svelte must use info-panel-state for per-surface content descriptors'
    )

    console.log('  OK - InfoPanel.svelte owns surface IDs; SelectedBusinessDetails.svelte owns child IDs')
}

// ── Test E: FocusCard.svelte is the focus-stage overlay card ──────────────────

function testFocusCardOwnsFocusOverlay() {
    const src = read(FOCUS_CARD)

    // FocusCard renders its own #selected-card for focus-stage positioning
    assert(
        src.includes('id="focus-card-selected"'),
        'FocusCard.svelte must render #focus-card-selected for focus-stage overlay'
    )

    // Must have focus-stage-specific positioning (fixed, bottom-right)
    assert(
        src.includes('focus-card') || src.includes('focus-stage-card'),
        'FocusCard.svelte must have focus-stage card class'
    )

    console.log('  OK - FocusCard.svelte owns the focus-stage overlay card')
}

// ── Test F: Composition flow uses event-bus, not legacy direct-DOM ───────────

function testCompositionFlowOwnership() {
    const eventBusSrc = read(EVENT_BUS)
    assert(
        /COMPOSITION_UPDATED:\s*['"]COMPOSITION_UPDATED['"]/.test(eventBusSrc),
        'event-bus.ts must expose COMPOSITION_UPDATED for composition fanout'
    )

    const lifecycleSrc = read(LIFECYCLE)
    assert(/function\s+derivePanelSurface\s*\(/.test(lifecycleSrc), 'lifecycle.ts must own derivePanelSurface()')
    assert(/function\s+applyCompositionState\s*\(/.test(lifecycleSrc), 'lifecycle.ts must own applyCompositionState()')
    assert(
        /export\s+function\s+refreshCompositionState\s*\(/.test(lifecycleSrc),
        'lifecycle.ts must export refreshCompositionState()'
    )

    // Parity attrs must be installed
    const paritySrc = read(PARITY_ATTRS)
    assert(
        /export\s+function\s+installParityAttributeSync\s*\(/.test(paritySrc),
        'parity-attrs.svelte.ts must export installParityAttributeSync()'
    )
    const appSrc = read(APP_SHELL)
    const appInitSrc = read(APP_INIT)
    assert(
        appInitSrc.includes('installParityAttributeSync()'),
        'app-init.ts must install the parity attribute sync layer (the App.svelte text-match moved here when the call was extracted to app-init)'
    )

    // journey.ts must delegate to syncSelectedCardContentVariant
    const journeySrc = read(JOURNEY_MODULE)
    assert(
        /syncSelectedCardContentVariant/.test(journeySrc),
        'journey/journey.ts must import/call syncSelectedCardContentVariant'
    )

    console.log('  OK - composition flow uses event-bus COMPOSITION_UPDATED and lifecycle.ts')
}

// ── Test G: Retired legacy modules do not exist ──────────────────────────────

function testRetiredModulesRemoved() {
    for (const rel of RETIRED_PATHS) {
        assert(!exists(rel), `retired module ${rel} must not be restored`)
    }

    // App.svelte must not reference retired chrome islands
    const appSrc = read(APP_SHELL)
    assert(
        !appSrc.includes('info-panel-chrome-island') && !appSrc.includes('InfoPanelChrome'),
        'App.svelte must not reference retired info-panel chrome island'
    )
    assert(
        !appSrc.includes('legend-panel-chrome-island') && !appSrc.includes('LegendPanelChrome'),
        'App.svelte must not reference retired legend-panel chrome island'
    )

    console.log('  OK - retired legacy modules removed')
}

// ── Test H: Focus-stage ownership is limited to active focus surfaces ────────

function testFocusStageOwnerSurfaceSetIsBounded() {
    const src = read(STAGE_RENDERER)
    const start = src.indexOf('function focusStageOwnsSelectedContent')
    const end = src.indexOf('export function syncSelectedCardContentVariant', start)
    assert(start >= 0 && end > start, 'stage-renderer.ts must define focusStageOwnsSelectedContent()')

    const body = src.slice(start, end)
    for (const surface of ['focus', 'focus-search', 'semantic-dive']) {
        assert(
            body.includes(`'${surface}'`) || body.includes(`"${surface}"`),
            `focusStageOwnsSelectedContent() must include ${surface}`
        )
    }

    assert(
        !body.includes("'idle'") &&
            !body.includes('"idle"') &&
            !body.includes("'map-focus-search'") &&
            !body.includes('"map-focus-search"'),
        'focusStageOwnsSelectedContent() must not claim idle or map-focus-search selected-card ownership'
    )

    console.log('  OK - focus-stage selected-card ownership is bounded to active focus surfaces')
}

// ── Run all tests ────────────────────────────────────────────────────────────

function run() {
    console.log('=================================================================')
    console.log('map-focus-search-content-owner-contract.mjs')
    console.log('Svelte-native ownership contract for map+focus+search composition')
    console.log('=================================================================')

    testStageRendererOwnsStructuralSlots()
    testNoLegacySvelteChildWrites()
    testRetiredMapSummaryElementsRemoved()
    testInfoPanelOwnsSurface()
    testFocusCardOwnsFocusOverlay()
    testCompositionFlowOwnership()
    testRetiredModulesRemoved()
    testFocusStageOwnerSurfaceSetIsBounded()

    console.log('\n=================================================================')
    console.log('ALL TESTS PASSED')
    console.log('=================================================================')
}

run()
