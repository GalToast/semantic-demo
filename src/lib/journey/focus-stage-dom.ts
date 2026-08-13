/**
 * focus-stage-dom.ts
 *
 * Typed sibling of focus-stage-dom.js.
 * Lazily constructs the auxiliary DOM surfaces for the focus-stage pocket:
 * neighbor rail, inside controls, thread inspector, and trail controls.
 *
 * This module does NOT manage visibility toggling or content updates —
 * it only ensures the structural elements exist in the DOM. Higher-level
 * modules (journey-focus-ui, thread-inspector, journey-thread-settler)
 * own attribute/state mutations on these elements.
 */

const AUXILIARY_SURFACE_ID = 'focus-stage-auxiliary-surfaces'

// ── Types ──────────────────────────────────────────────────────────────────

interface MakeElementOptions {
    id?: string
    className?: string
    text?: string
    attributes?: Record<string, string>
    hidden?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeElement(
    tagName: string,
    { id, className, text, attributes = {}, hidden = false }: MakeElementOptions = {}
): HTMLElement {
    const el = document.createElement(tagName)
    if (id) el.id = id
    if (className) el.className = className
    if (text) el.textContent = text
    if (hidden) {
        el.hidden = true
        // Hidden elements should not be reachable by keyboard or
        // screen readers; CSS-driven display:none elsewhere in the app
        // also leaves the element in the tab order. Tabindex=-1 plus
        // aria-hidden=true removes it from both.
        el.setAttribute('tabindex', '-1')
        el.setAttribute('aria-hidden', 'true')
    }
    Object.entries(attributes).forEach(([name, value]) => {
        el.setAttribute(name, value)
    })
    return el
}

function appendInsideControls(root: HTMLElement): void {
    const status = makeElement('div', {
        id: 'focus-stage-inside-status',
        className: 'focus-stage-inside-status',
        attributes: {
            role: 'status',
            'aria-live': 'polite',
            'aria-atomic': 'false',
            'aria-hidden': 'true'
        }
    })
    status.append(
        makeElement('span', {
            className: 'focus-stage-inside-pulse',
            attributes: { 'aria-hidden': 'true' }
        }),
        makeElement('span', {
            id: 'focus-stage-inside-status-copy',
            className: 'focus-stage-inside-status-copy',
            text: 'Step into this neighborhood to follow related businesses.'
        })
    )

    const controls = makeElement('div', {
        id: 'focus-stage-inside-controls',
        className: 'focus-stage-inside-controls',
        attributes: { 'aria-hidden': 'true' }
    })
    controls.append(
        makeElement('button', {
            id: 'btn-inside-next',
            className: 'focus-stage-inside-btn',
            text: 'Next Stop',
            attributes: { type: 'button', 'data-journey-action': 'next-stop', tabindex: '-1' }
        }),
        makeElement('button', {
            id: 'btn-inside-map',
            className: 'focus-stage-inside-btn secondary',
            text: 'Map',
            attributes: {
                type: 'button',
                'data-journey-action': 'open-map',
                'aria-label': 'Project this trail onto the map',
                tabindex: '-1'
            }
        }),
        makeElement('button', {
            id: 'btn-inside-county',
            className: 'focus-stage-inside-btn secondary',
            text: 'County',
            attributes: {
                type: 'button',
                'data-journey-action': 'county-overview',
                'aria-label': 'Exit Step Inside and return to County View',
                tabindex: '-1'
            }
        })
    )

    root.append(status, controls)
}

function appendThreadInspector(root: HTMLElement): void {
    const inspector = makeElement('div', {
        id: 'focus-thread-inspector',
        className: 'focus-thread-inspector',
        attributes: { 'aria-hidden': 'true' }
    })
    inspector.append(
        makeElement('div', { className: 'focus-thread-inspector-kicker', text: 'Connection Preview' }),
        makeElement('div', {
            id: 'focus-thread-inspector-title',
            className: 'focus-thread-inspector-title',
            text: 'Select a nearby stop'
        }),
        makeElement('div', {
            id: 'focus-thread-inspector-copy',
            className: 'focus-thread-inspector-copy',
            text: 'Click a neighbor below to preview why it belongs here, then pin or follow.'
        }),
        makeElement('div', {
            id: 'focus-thread-inspector-meta',
            className: 'focus-thread-inspector-meta',
            text: 'Preview connection'
        })
    )

    const actions = makeElement('div', { className: 'focus-thread-inspector-actions' })
    actions.append(
        makeElement('button', {
            id: 'btn-thread-pin',
            className: 'focus-thread-inspector-btn',
            text: 'Pin',
            attributes: { type: 'button', disabled: '' }
        }),
        makeElement('button', {
            id: 'btn-thread-follow',
            className: 'focus-thread-inspector-btn primary',
            text: 'Follow',
            attributes: { type: 'button', disabled: '' }
        }),
        makeElement('button', {
            id: 'btn-thread-clear',
            className: 'focus-thread-inspector-btn secondary',
            text: 'Clear',
            attributes: { type: 'button', disabled: '' }
        })
    )
    inspector.appendChild(actions)
    root.appendChild(inspector)
}

function appendTrailControls(root: HTMLElement): void {
    const controls = makeElement('div', {
        id: 'trail-controls',
        className: 'trail-controls',
        attributes: { 'aria-label': 'Connection path controls' }
    })
    controls.append(
        makeElement('button', {
            id: 'btn-prev-node',
            className: 'focus-stage-action-btn',
            text: 'Prev Stop',
            attributes: { type: 'button', 'aria-label': 'Go to previous path stop', disabled: '' }
        }),
        makeElement('button', {
            id: 'btn-next-node',
            className: 'focus-stage-action-btn',
            text: 'Next Stop',
            attributes: { type: 'button', 'aria-label': 'Go to next path stop', disabled: '' }
        })
    )
    root.append(controls, makeElement('div', { id: 'trail-context', className: 'trail-context' }))
}

// ── Public API ─────────────────────────────────────────────────────────────

export function ensureFocusStageAuxiliaryDom(): boolean {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false
    const card = document.getElementById('focus-pocket') || document.querySelector?.('.focus-stage-card')
    if (!card) return false

    let root = document.getElementById(AUXILIARY_SURFACE_ID)
    if (!root) {
        root = makeElement('div', {
            id: AUXILIARY_SURFACE_ID,
            className: 'focus-stage-auxiliary-surfaces'
        })
        card.appendChild(root)
    }

    if (
        !document.getElementById('focus-stage-inside-status') ||
        !document.getElementById('focus-stage-inside-controls')
    ) {
        appendInsideControls(root)
    }
    if (!document.getElementById('focus-thread-inspector')) appendThreadInspector(root)
    if (!document.getElementById('trail-controls') || !document.getElementById('trail-context')) {
        appendTrailControls(root)
    }

    return true
}

// ── Dive button helpers ─────────────────────────────────────────────────────

function appendDiveButton(root: HTMLElement): void {
    const diveBtn = makeElement('button', {
        id: 'btn-focus-dive-legacy',
        className: 'focus-stage-dive-btn',
        hidden: true,
        attributes: {
            type: 'button',
            'aria-label': 'Explore the neighborhood around this business',
            'aria-pressed': 'false',
            'aria-disabled': 'true',
            tabindex: '-1'
        }
    })
    diveBtn.append(
        makeElement('span', { className: 'focus-stage-dive-label', text: 'Explore Neighborhood' }),
        makeElement('span', {
            className: 'focus-stage-dive-copy',
            text: 'Explore related businesses in the neighborhood.'
        })
    )
    root.appendChild(diveBtn)
}

/**
 * Ensure the dive (Step Inside) button exists in the DOM.
 * This button is referenced by semantic-dive-ui.js and journey-bindings.js
 * but may not be inside the auxiliary-surfaces root. It is created as a
 * child of #focus-pocket, #selected-details, or the info-panel as available.
 */
export function ensureDiveButton(): void {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return
    // F3 (W61): guard on BOTH ids. This module creates #btn-focus-dive-legacy,
    // while the canonical #btn-focus-dive belongs to CompassDiveSurface.svelte
    // (W53 F5) and JourneyCompass.svelte also renders a hidden legacy button.
    // syncSemanticDiveUi calls ensureDiveButton() on every focus event — without
    // the legacy guard, each call appended another duplicate legacy button.
    const existing = document.getElementById('btn-focus-dive')
    const existingLegacy = document.getElementById('btn-focus-dive-legacy')

    // Prefer the focus-pocket card or its auxiliary surfaces root
    const card = document.getElementById('focus-pocket') || document.querySelector?.('.focus-stage-card')
    if (card) {
        let root = document.getElementById(AUXILIARY_SURFACE_ID)
        if (!root) {
            root = makeElement('div', {
                id: AUXILIARY_SURFACE_ID,
                className: 'focus-stage-auxiliary-surfaces'
            })
            card.appendChild(root)
        }
        if (existingLegacy) return
        if (existing) {
            // The canonical button is owned by Svelte's CompassDiveSurface.
            // Never reparent it into this imperative auxiliary root: moving a
            // Svelte-managed node behind its fragment anchor lets the next
            // reconciliation remove the live button, leaving only the legacy
            // fallback in the DOM.
            return
        }
        appendDiveButton(root)
        return
    }

    if (existing || existingLegacy) return

    // Fallback: create inside #selected-details or #info-panel
    const target =
        document.getElementById('selected-details') ||
        document.getElementById('info-panel-content') ||
        document.getElementById('info-panel')
    if (target) {
        appendDiveButton(target)
    }
}
