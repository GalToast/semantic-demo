/**
 * @lib/keyboard/keyboard-help.ts — Native keyboard shortcut utilities
 *
 * Ported from
 *
 * Pure utility functions for keyboard target detection.
 * DOM-heavy hint-panel functions remain delegated to the legacy module
 * until the panel is ported to a Svelte component.
 */

import { startMicroDemo, cancelMicroDemo } from '@lib/demo/choreography'
import { showToast } from '@lib/stores/toast.svelte'

// ── Pure utilities (native, no legacy deps) ─────────────────────────────────

export function isKeyboardTextEntryTarget(target: EventTarget | null): target is HTMLElement {
    if (!target || typeof (target as HTMLElement).tagName !== 'string') return false
    const el = target as HTMLElement
    const tagName = el.tagName.toLowerCase()
    const type = typeof (el as HTMLInputElement).type === 'string' ? (el as HTMLInputElement).type.toLowerCase() : ''

    if (
        tagName === 'input' &&
        (type === 'text' || type === 'search' || type === 'email' || type === 'url' || type === 'password')
    ) {
        return true
    }
    if (tagName === 'textarea') return true
    if (el.isContentEditable) return true

    return false
}

export function isKeyboardControlTarget(target: EventTarget | null): target is HTMLElement {
    if (!target || typeof (target as HTMLElement).tagName !== 'string') return false
    const tagName = (target as HTMLElement).tagName.toLowerCase()
    if (tagName === 'button' || tagName === 'select' || tagName === 'a') return true
    return false
}

// ── DOM-heavy hint-panel functions (ported from legacy, no external deps) ────

interface KeyboardHintPanelElement extends HTMLElement {
    _openKeyboardHintPanel?: (ref?: HTMLElement | null) => void
    _closeKeyboardHintPanel?: () => void
    _autoDismissTimer?: ReturnType<typeof setTimeout> | null
}

let _returnToOverview: () => void = () => {}
let _resetExplorationFocus: () => void = () => {}

export function initKeyboardResetOwnership({
    returnToOverview,
    resetExplorationFocus
}: { returnToOverview?: () => void; resetExplorationFocus?: () => void } = {}): void {
    if (typeof returnToOverview === 'function') _returnToOverview = returnToOverview
    if (typeof resetExplorationFocus === 'function') _resetExplorationFocus = resetExplorationFocus
}

export function handleGalaxyKeydown(e: KeyboardEvent): void {
    if (isKeyboardTextEntryTarget(e.target) || isKeyboardControlTarget(e.target)) return

    if (e.key === 'Home') {
        e.preventDefault()
        _returnToOverview()
        return
    }

    if (e.key === '?') {
        e.preventDefault()
        showKeyboardShortcutsHint()
        return
    }

    if (e.key === 'Escape') {
        e.preventDefault()
        _resetExplorationFocus()
    }
}

let _previouslyFocused: HTMLElement | null = null

export function initKeyboardShortcutsHint(): void {
    if (document.getElementById('keyboard-hint-panel')) return

    const panel = document.createElement('div') as KeyboardHintPanelElement
    panel.id = 'keyboard-hint-panel'
    panel.className = 'keyboard-hint-panel'
    panel.setAttribute('role', 'region')
    panel.setAttribute('aria-label', 'Keyboard shortcuts')
    panel.setAttribute('aria-hidden', 'true')
    const title = document.createElement('div')
    title.className = 'kh-title'
    title.textContent = 'Keyboard Shortcuts'
    panel.appendChild(title)

    const shortcuts = [
        { key: 'Arrow', desc: 'Navigate nodes' },
        { key: 'Home', desc: 'Reset view' },
        { key: 'End', desc: 'Recenter' },
        { key: '+ / -', desc: 'Zoom' },
        { key: '/', desc: 'Focus search input' },
        { key: 'w', desc: 'Toggle weather widget' },
        { key: 'm', desc: 'Toggle audio mute' },
        { key: 'Ctrl+1-6', desc: 'Switch view mode' },
        { key: 'Esc', desc: 'Return to overview' },
        { key: '?', desc: 'Open this help panel' }
    ]

    shortcuts.forEach((s) => {
        const row = document.createElement('div')
        row.className = 'kh-row'

        const keysSpan = document.createElement('span')
        keysSpan.className = 'kh-keys'

        const kbd = document.createElement('kbd')
        kbd.textContent = s.key

        keysSpan.appendChild(kbd)
        row.appendChild(keysSpan)

        const descSpan = document.createElement('span')
        descSpan.textContent = s.desc

        row.appendChild(descSpan)
        panel.appendChild(row)
    })

    const closeBtn = document.createElement('button')
    closeBtn.className = 'kh-close'
    closeBtn.type = 'button'
    closeBtn.setAttribute('aria-label', 'Dismiss shortcuts panel')
    closeBtn.textContent = '×'
    panel.appendChild(closeBtn)

    // W47-T2 #2.3: a "Replay tour" button at the bottom of the panel so
    // users who closed the first-visit demo (or whose session expired)
    // can re-trigger it. Clears the choreography session-storage gate and
    // fires startMicroDemo() to start a fresh demo.
    const replayBtn = document.createElement('button')
    replayBtn.id = 'btn-replay-tour'
    replayBtn.className = 'kh-replay-btn'
    replayBtn.type = 'button'
    replayBtn.setAttribute('aria-label', 'Replay the first-visit tour')
    replayBtn.textContent = 'Replay tour'
    replayBtn.addEventListener('click', () => {
        try {
            // Clear the session storage gate so shouldRunMicroDemo() returns
            // true on the next call. The lifetime key (moco_mycelium_demo_v1)
            // is left alone — replay is per-session, not lifetime.
            sessionStorage.removeItem('moco_mycelium_demo_session_v1')
        } catch {
            // sessionStorage unavailable in sandboxed mode; replay may not
            // work but the click handler still closes the panel and tries.
        }
        closePanel()
        // M15 fix: Replay must NOT stack demos. The legacy 6-phase
        // micro-demo and the canonical 10-phase have independent guards —
        // firing both races two camera writers + two veils producing stacked
        // veils. Replay now: cancel any active micro-demo, dispatch
        // demo-replay-requested so the canonical DemoChoreography does
        // store reset + attemptStart after sceneReady (one veil, one writer).
        // Keep micro-demo fallback for when DemoChoreography hasn't mounted.
        const onCancelled = (): void => {
            showToast(
                'Replay unavailable',
                'Search for a business type above, or click any dot to explore connections.'
            )
        }
        document.addEventListener('demo-cancelled', onCancelled, { once: true })
        try {
            cancelMicroDemo('replay')
            // Prefer canonical path via event (M15)
            const evt = new CustomEvent('demo-replay-requested')
            document.dispatchEvent(evt)
            // Replay is handled by the canonical `demo-replay-requested` event,
            // which DemoChoreography consumes and re-runs attemptStart after
            // sceneReady (M15 — prevents stacked veils). No legacy setTimeout
            // fallback: it could start a second demo on top of an active one.
        } catch {
            startMicroDemo()
        }
    })
    panel.appendChild(replayBtn)

    // W48-T3: progressive-disclosure terminology section. The product uses
    // a lot of jargon ("mycelium", "cluster", "galaxy", "focus", "thread",
    // "trail anchor") that maps to the visual model but isn't obvious to a
    // new user. Hide the definitions behind a <details> element so the
    // help panel stays compact for users who already know the terms.
    const terminology = document.createElement('details')
    terminology.className = 'kh-terminology'

    const termSummary = document.createElement('summary')
    termSummary.textContent = 'Terminology'
    terminology.appendChild(termSummary)

    const terms: ReadonlyArray<readonly [string, string]> = [
        [
            'Mycelium',
            'The web of relationships connecting Montgomery County businesses. Each business is a node; shared ownership, addresses, and industry codes are the threads that link them.'
        ],
        [
            'Cluster',
            'A group of businesses with a similar category or industry. The 12 clusters are color-coded in the legend.'
        ],
        [
            'Galaxy',
            'The full 3D view showing all 8,406 businesses and the threads between them. The starting point for exploration.'
        ],
        [
            'Focus',
            'A single business selected in the scene. The summary card on the right shows that business and related ones.'
        ],
        [
            'Thread',
            'A relationship between two or more businesses, often through shared ownership or co-located operations.'
        ],
        [
            'Trail anchor / Next stop / Side trail',
            'Suggestions on the summary card. Trail anchor is the strongest connection, Next stop is the most likely next business to explore, Side trail is a related business for a sideways step.'
        ]
    ]

    const termList = document.createElement('dl')
    termList.className = 'kh-term-list'
    for (const [term, def] of terms) {
        const dt = document.createElement('dt')
        dt.textContent = term
        const dd = document.createElement('dd')
        dd.textContent = def
        termList.appendChild(dt)
        termList.appendChild(dd)
    }
    terminology.appendChild(termList)
    panel.appendChild(terminology)

    document.body.appendChild(panel)

    function closePanel(): void {
        if (panel._autoDismissTimer) {
            clearTimeout(panel._autoDismissTimer)
            panel._autoDismissTimer = null
        }
        panel.classList.remove('visible')
        panel.setAttribute('aria-hidden', 'true')
        const helpButton = document.getElementById('btn-keyboard-help')
        if (helpButton) {
            helpButton.setAttribute('aria-expanded', 'false')
            helpButton.setAttribute('aria-pressed', 'false')
        }
        sessionStorage.setItem('kh_dismissed', '1')
        if (_previouslyFocused) {
            if (typeof (_previouslyFocused as HTMLElement).focus === 'function')
                (_previouslyFocused as HTMLElement).focus()
            _previouslyFocused = null
        }
        document.removeEventListener('keydown', _onPanelKeydown)
        if (panel.parentNode) {
            panel.remove()
        }
    }

    function _onPanelKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            e.stopPropagation()
            closePanel()
            return
        }
        if (e.key === 'Tab') {
            const focusable = panel.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
            if (focusable.length === 0) return
            const first = focusable[0] as HTMLElement
            const last = focusable[focusable.length - 1] as HTMLElement
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first.focus()
            }
        }
    }

    closeBtn.addEventListener('click', closePanel)

    function openPanel(returnFocusEl?: HTMLElement | null): void {
        // Re-attach panel if a prior closePanel() removed it from the DOM.
        // closePanel() calls panel.remove() to prevent the panel + its
        // listener closure from leaking as a dead subtree across re-mount
        // cycles; this re-append completes the cycle so the help button
        // can re-open the panel indefinitely.
        if (!document.body.contains(panel)) document.body.appendChild(panel)
        if (panel._autoDismissTimer) {
            clearTimeout(panel._autoDismissTimer)
            panel._autoDismissTimer = null
        }
        _previouslyFocused =
            returnFocusEl || document.getElementById('btn-keyboard-help') || (document.activeElement as HTMLElement)
        panel.classList.add('visible')
        panel.setAttribute('aria-hidden', 'false')
        const helpButton = document.getElementById('btn-keyboard-help')
        if (helpButton) {
            helpButton.setAttribute('aria-expanded', 'true')
            helpButton.setAttribute('aria-pressed', 'true')
        }
        ;(panel.querySelector('.kh-close') as HTMLElement)?.focus({ preventScroll: true })
        document.removeEventListener('keydown', _onPanelKeydown)
        document.addEventListener('keydown', _onPanelKeydown)
    }

    panel._openKeyboardHintPanel = openPanel
    panel._closeKeyboardHintPanel = closePanel

    const helpBtn = document.getElementById('btn-keyboard-help')
    if (helpBtn) {
        helpBtn.setAttribute('aria-controls', 'keyboard-hint-panel')
        helpBtn.setAttribute('aria-expanded', 'false')
        helpBtn.setAttribute('aria-pressed', 'false')

        helpBtn.onclick = null

        helpBtn.addEventListener(
            'click',
            () => {
                if (panel.classList.contains('visible')) {
                    closePanel()
                } else {
                    openPanel((document.activeElement as HTMLElement) || helpBtn)
                }
            },
            { capture: true }
        )
    }
}

export function showKeyboardShortcutsHint(): void {
    const panel = document.getElementById('keyboard-hint-panel') as KeyboardHintPanelElement | null
    if (!panel) return
    if (typeof panel._openKeyboardHintPanel === 'function') {
        panel._openKeyboardHintPanel(document.getElementById('btn-keyboard-help'))
    } else {
        panel.classList.add('visible')
        panel.setAttribute('aria-hidden', 'false')
        ;(panel.querySelector('.kh-close') as HTMLElement)?.focus({ preventScroll: true })
    }
    if (panel._autoDismissTimer) clearTimeout(panel._autoDismissTimer)
    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
    panel._autoDismissTimer = setTimeout(() => {
        if (typeof panel._closeKeyboardHintPanel === 'function') {
            panel._closeKeyboardHintPanel()
        } else {
            panel.classList.remove('visible')
            panel.setAttribute('aria-hidden', 'true')
        }
        panel._autoDismissTimer = null
    }, 5000)
}

/**
 * Toggle the keyboard-shortcuts panel without auto-dismiss.
 *
 * The "?" key still uses `showKeyboardShortcutsHint` (which auto-closes after
 * 5 s) so the hint can't get stuck on screen if invoked accidentally. But the
 * header "?" button is a real toggle affordance, so we open/close on click
 * and leave the panel open until the user dismisses it.
 */
export function toggleKeyboardShortcutsHint(): void {
    const panel = document.getElementById('keyboard-hint-panel') as KeyboardHintPanelElement | null
    if (!panel) return
    if (panel._autoDismissTimer) {
        clearTimeout(panel._autoDismissTimer)
        panel._autoDismissTimer = null
    }
    if (panel.classList.contains('visible')) {
        if (typeof panel._closeKeyboardHintPanel === 'function') {
            panel._closeKeyboardHintPanel()
        } else {
            panel.classList.remove('visible')
            panel.setAttribute('aria-hidden', 'true')
        }
        return
    }
    if (typeof panel._openKeyboardHintPanel === 'function') {
        panel._openKeyboardHintPanel(document.getElementById('btn-keyboard-help'))
    } else {
        panel.classList.add('visible')
        panel.setAttribute('aria-hidden', 'false')
    }
}
