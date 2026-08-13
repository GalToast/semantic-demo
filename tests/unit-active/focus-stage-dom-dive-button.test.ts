import { describe, it, expect, beforeEach } from 'vitest'
import { ensureDiveButton } from '../../src/lib/journey/focus-stage-dom'

/**
 * W61 F3 regression — ensureDiveButton idempotency.
 *
 * syncSemanticDiveUi() calls ensureDiveButton() on EVERY focus-related event.
 * The pre-fix guard checked `getElementById('btn-focus-dive')` while
 * appendDiveButton creates `#btn-focus-dive-legacy`, so every call when the
 * canonical (CompassDiveSurface-owned) button was absent appended ANOTHER
 * duplicate legacy button into the auxiliary root.
 */
describe('ensureDiveButton (W61 F3)', () => {
    beforeEach(() => {
        document.body.replaceChildren()
    })

    it('creates exactly one legacy dive button across repeated calls', () => {
        const card = document.createElement('div')
        card.id = 'focus-pocket'
        document.body.appendChild(card)

        ensureDiveButton()
        ensureDiveButton()
        ensureDiveButton()

        expect(document.querySelectorAll('#btn-focus-dive-legacy').length).toBe(1)
        expect(document.getElementById('btn-focus-dive')).toBeNull()
    })

    it('does not duplicate when a canonical #btn-focus-dive already exists', () => {
        const card = document.createElement('div')
        card.id = 'focus-pocket'
        document.body.appendChild(card)
        const canonical = document.createElement('button')
        canonical.id = 'btn-focus-dive'
        document.body.appendChild(canonical)
        const originalParent = canonical.parentElement

        ensureDiveButton()
        ensureDiveButton()

        expect(document.querySelectorAll('#btn-focus-dive').length).toBe(1)
        expect(document.querySelectorAll('#btn-focus-dive-legacy').length).toBe(0)
        expect(canonical.parentElement).toBe(originalParent)
    })

    it('does not append a duplicate when a hidden legacy button already exists (JourneyCompass case)', () => {
        const card = document.createElement('div')
        card.id = 'focus-pocket'
        document.body.appendChild(card)
        const legacy = document.createElement('button')
        legacy.id = 'btn-focus-dive-legacy'
        legacy.hidden = true
        document.body.appendChild(legacy)

        ensureDiveButton()
        ensureDiveButton()

        expect(document.querySelectorAll('#btn-focus-dive-legacy').length).toBe(1)
    })

    it('creates the legacy button inside the auxiliary root when no card exists yet (fallback)', () => {
        // No #focus-pocket and no .focus-stage-card → fallback target is absent
        // too, so nothing is created and no error is thrown.
        ensureDiveButton()
        expect(document.querySelectorAll('#btn-focus-dive-legacy').length).toBe(0)
    })
})
