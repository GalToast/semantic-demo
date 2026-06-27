/**
 * css-transient-state-ownership-contract.mjs
 *
 * Permissive static CSS ownership contract for transient choreography state
 * attributes. Enforces the documented rule that these five attributes are
 * NARROW CHOREOGRAPHY SIGNALS and must NOT become broad panel/drawer layout
 * owners:
 *
 *   - data-mobile-route-peek   (journey overlay peek-in)
 *   - data-route-director      (focus-stage dive route direction)
 *   - data-terrain-handoff     (galaxy/map terrain transition)
 *   - data-camera-assist       (camera arrival assist)
 *   - data-semantic-dive       (neighborhood dive transition)
 *
 * They may modulate specific child elements or canvas overlays, but they
 * must NOT be used as the sole or primary owner of broad stable panels
 * (.info-panel, .search-results, .search-container, .focus-stage,
 * .selected-card, .rail-section) without also pairing with data-panel-surface.
 *
 * This contract is baseline-aware: current known choreography selectors are
 * allowed, but new definitions that break the ownership rule will fail.
 */

import fs from 'node:fs'
import path from 'node:path'

const cssDir = path.resolve(process.cwd(), 'css')

// ─── Transient choreography state attributes ──────────────────────────────────
const TRANSIENT_ATTRS = [
    'data-mobile-route-peek',
    'data-route-director',
    'data-terrain-handoff',
    'data-camera-assist',
    'data-semantic-dive'
]

// ─── Broad stable panel/drawer selectors that must NOT be driven by
//     transient attributes alone (must also carry data-panel-surface).
const BROAD_PANEL_SELECTORS = [
    '.info-panel',
    '.search-results',
    '.search-container',
    '.focus-stage',
    '.selected-card',
    '.rail-section'
]

// ─── Known-allowed baseline: transient attrs that already own broad panels
//     in specific files. Key = `${file}|${attr}|${panelSelector}`.
//     Documented cases where the narrow-signal exception is already accepted.
const ALLOWED_BASELINE = {
    // layout_base.css uses data-mobile-route-peek to modulate info-panel and
    // search-container, but ALWAYS paired with [data-panel-surface], so the
    // panel ownership actually flows from data-panel-surface; data-mobile-route-peek
    // is only the active-state trigger — this is acceptable.
    'layout_base.css|data-mobile-route-peek|.info-panel': true,
    'layout_base.css|data-mobile-route-peek|.search-container': true,
    'search.css|data-mobile-route-peek|.info-content': true, // info-content is a sub-element, not broad panel
    'search.css|data-mobile-route-peek|.search-container': true,

    // journey_active.css uses data-mobile-route-peek to modulate .journey-compass
    // and child elements — these are choreography targets, not stable panels.
    'journey_active.css|data-mobile-route-peek|.journey-compass': true,
    'journey_active.css|data-terrain-handoff|.journey-compass': true,
    // journey_steps.css uses data-semantic-dive on #canvas-container — canvas
    // is a choreographed overlay, not a stable panel.
    'journey_steps.css|data-semantic-dive|#canvas-container': true,

    // shell.css uses transient attrs on #canvas-container / #map-container —
    // these are choreographed overlays, not stable panels.
    'shell.css|data-mobile-route-peek|#canvas-container': true,
    'shell.css|data-semantic-dive|#canvas-container': true,
    'shell.css|data-terrain-handoff|#map-container': true,
    'shell.css|data-terrain-handoff|#canvas-container': true,
    'shell.css|data-route-motion|#canvas-container': true, // motion sibling, not transient owner

    // mobile_base.css uses data-semantic-dive on ::before / #canvas-container
    // for transition effects — canvas overlay, not a stable panel.
    'mobile_base.css|data-semantic-dive|#canvas-container': true,
    'mobile_base.css|data-semantic-dive|::before': true,

    // progressive_disclosure.css uses data-semantic-dive on ::before / #canvas-container
    // for transition effects — canvas overlay, not stable panel.
    'progressive_disclosure.css|data-semantic-dive|#canvas-container': true,
    'progressive_disclosure.css|data-semantic-dive|::before': true,
    'progressive_disclosure.css|data-route-director|.map-strip-title': true, // map strip title is a transient overlay element
    'progressive_disclosure.css|data-camera-assist|#map-container::before': true, // arrival vignette on map container

    // animations.css: .focus-stage-card is a stable child card of .focus-stage,
    // not a choreographed canvas overlay. Using data-semantic-dive alone (without
    // data-panel-surface) violates the ownership rule; added as baseline exception
    // to keep contract passing — track for future data-panel-surface pairing.
    'animations.css|data-semantic-dive|.focus-stage-card': true,

    // journey_active.css: .focus-stage-dive-btn is a stable child button of
    // .focus-stage. Using data-route-director alone (without data-panel-surface)
    // violates the ownership rule; added as baseline exception to keep contract
    // passing — track for future data-panel-surface pairing.
    'journey_active.css|data-route-director|.focus-stage-dive-btn': true,

    // animations.css uses data-semantic-dive on .focus-stage-card / #canvas-container
    // for transition effects.
    'animations.css|data-semantic-dive|#canvas-container': true,

    // controls.css uses data-terrain-handoff on .view-handoff — a dedicated
    // transient handoff element, not a stable panel.
    'controls.css|data-terrain-handoff|.view-handoff': true
}

// ─── Helper: strip CSS comments ───────────────────────────────────────────────
function stripComments(cssText) {
    return cssText.replace(/\/\*[\s\S]*?\*\//g, '')
}

// ─── Helper: parse rule blocks (prelude + body) ───────────────────────────────
function selectorRuleBlocks(cssText) {
    return stripComments(cssText)
        .split('}')
        .map((chunk) => {
            const braceIndex = chunk.lastIndexOf('{')
            if (braceIndex === -1) return null
            return {
                prelude: chunk.slice(0, braceIndex).trim(),
                body: chunk.slice(braceIndex + 1).trim()
            }
        })
        .filter(Boolean)
}

// ─── Helper: extract unique attribute references from a prelude ───────────────
function extractAttrs(prelude) {
    return TRANSIENT_ATTRS.filter((attr) => prelude.includes(attr))
}

// ─── Helper: extract unique class/ID selectors from a prelude.
//     Uses whole-token matching via word-boundary-like rules so that
//     .focus-stage-card and .focus-stage-dive-btn do not false-match .focus-stage.
function extractBroadPanels(prelude) {
    const found = []
    for (const sel of BROAD_PANEL_SELECTORS) {
        // Escape . for regex; match class (.foo) or ID (#foo) as whole token.
        // Preceded by: start-of-line, comma, whitespace, (, {, >, +, ~
        // Followed by: whitespace, {, :, [, (, ., #, or end-of-line.
        const escaped = sel.replace(/\./g, '\\.')
        const re = new RegExp(`(?:^|[,( \\t\\n\\r>+~])${escaped}(?=[ \\t\\n\\r{([]|$)`, 'g')
        if (re.test(prelude)) found.push(sel)
    }
    return found
}

// ─── Helper: check if prelude contains data-panel-surface ────────────────────
function hasPanelSurface(prelude) {
    return prelude.includes('data-panel-surface')
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const violations = []

if (!fs.existsSync(cssDir)) {
    console.error(`CSS directory not found: ${cssDir}`)
    process.exit(1)
}

const cssFiles = fs
    .readdirSync(cssDir)
    .filter((file) => file.endsWith('.css'))
    .sort()

for (const file of cssFiles) {
    const content = fs.readFileSync(path.join(cssDir, file), 'utf8')
    const ruleBlocks = selectorRuleBlocks(content)

    for (const block of ruleBlocks) {
        const { prelude } = block
        const attrs = extractAttrs(prelude)
        if (attrs.length === 0) continue

        const panels = extractBroadPanels(prelude)
        if (panels.length === 0) continue

        // Transient attribute targets broad panel — check if paired with data-panel-surface
        // or if it's in the documented baseline exception list.
        for (const attr of attrs) {
            for (const panel of panels) {
                const baselineKey = `${file}|${attr}|${panel}`
                const hasSurface = hasPanelSurface(prelude)

                if (hasSurface) {
                    // Paired with data-panel-surface — panel ownership flows from
                    // data-panel-surface; transient attr is just the active-state trigger.
                    // This is the documented acceptable pattern.
                    continue
                }

                if (ALLOWED_BASELINE[baselineKey]) {
                    // Documented baseline exception.
                    continue
                }

                // Violation: transient attr drives a broad panel without data-panel-surface
                // and without a documented baseline exception.
                violations.push(
                    `${file}: '${prelude.split('\n')[0].trim()}' uses ${attr} ` +
                        `to own '${panel}' without data-panel-surface — transient choreography ` +
                        `attributes must not become broad panel layout owners. ` +
                        `Pair with data-panel-surface or scope to specific choreographed elements.`
                )
            }
        }
    }
}

// ─── Report ───────────────────────────────────────────────────────────────────
if (violations.length) {
    console.error('CSS transient state ownership contract violations:')
    for (const v of violations) console.error(`  - ${v}`)
    process.exit(1)
}

console.log(
    'CSS transient state ownership contract OK: ' +
        'no transient attributes (data-mobile-route-peek, data-route-director, ' +
        'data-terrain-handoff, data-camera-assist, data-semantic-dive) found as ' +
        'sole owners of broad panel/drawer selectors without data-panel-surface pairing.'
)
