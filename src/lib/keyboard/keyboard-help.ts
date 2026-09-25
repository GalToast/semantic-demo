/**
 * @lib/keyboard/keyboard-help.ts — Native keyboard shortcut utilities
 *
 * Ported from js/modules/keyboard-help.ts.
 *
 * Pure utility functions for keyboard target detection.
 * DOM-heavy hint-panel functions remain delegated to the legacy module
 * until the panel is ported to a Svelte component.
 */

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

let _shortcutsPanelArrowToastShown = false
let _previouslyFocused: HTMLElement | null = null

export function initKeyboardShortcutsHint(): void {
    if (document.getElementById('keyboard-hint-panel')) return

    const panel = document.createElement('div')
    panel.id = 'keyboard-hint-panel'
    panel.className = 'keyboard-hint-panel'
    panel.setAttribute('role', 'region')
    panel.setAttribute('aria-label', 'Keyboard shortcuts')
    panel.setAttribute('aria-hidden', 'true')
    panel.innerHTML = `
        <div class="kh-title">Keyboard Shortcuts</div>
        <div class="kh-row"><span class="kh-keys"><kbd>Arrow</kbd></span><span>Navigate nodes</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>Home</kbd></span><span>Reset view</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>End</kbd></span><span>Recenter</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>+ / -</kbd></span><span>Zoom</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>Esc</kbd></span><span>Close overlays</span></div>
        <button class="kh-close" type="button" aria-label="Dismiss shortcuts panel">&times;</button>
    `
    document.body.appendChild(panel)

    function closePanel(): void {
        if ((panel as any)._autoDismissTimer) {
            clearTimeout((panel as any)._autoDismissTimer)
            ;(panel as any)._autoDismissTimer = null
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

    panel.querySelector('.kh-close')!.addEventListener('click', closePanel)

    function openPanel(returnFocusEl?: HTMLElement | null): void {
        if ((panel as any)._autoDismissTimer) {
            clearTimeout((panel as any)._autoDismissTimer)
            ;(panel as any)._autoDismissTimer = null
        }
        _previouslyFocused =
            returnFocusEl || document.getElementById('btn-keyboard-help') || (document.activeElement as HTMLElement)
        const onboarding = document.getElementById('onboarding-hint')
        onboarding?.classList.remove('visible')
        onboarding?.setAttribute('aria-hidden', 'true')
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

    ;(panel as any)._openKeyboardHintPanel = openPanel
    ;(panel as any)._closeKeyboardHintPanel = closePanel

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
    const panel = document.getElementById('keyboard-hint-panel')
    if (!panel) return
    if (typeof (panel as any)._openKeyboardHintPanel === 'function') {
        ;(panel as any)._openKeyboardHintPanel(document.getElementById('btn-keyboard-help'))
    } else {
        const onboarding = document.getElementById('onboarding-hint')
        onboarding?.classList.remove('visible')
        onboarding?.setAttribute('aria-hidden', 'true')
        panel.classList.add('visible')
        panel.setAttribute('aria-hidden', 'false')
        ;(panel.querySelector('.kh-close') as HTMLElement)?.focus({ preventScroll: true })
    }
    if ((panel as any)._autoDismissTimer) clearTimeout((panel as any)._autoDismissTimer)
    ;(panel as any)._autoDismissTimer = setTimeout(() => {
        if (typeof (panel as any)._closeKeyboardHintPanel === 'function') {
            ;(panel as any)._closeKeyboardHintPanel()
        } else {
            panel.classList.remove('visible')
            panel.setAttribute('aria-hidden', 'true')
        }
        ;(panel as any)._autoDismissTimer = null
    }, 5000)
}
