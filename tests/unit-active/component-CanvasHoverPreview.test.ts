/**
 * component-CanvasHoverPreview.test.ts — Keyboard/AT parity for canvas-hover-preview
 *
 * Verifies the W48-B keyboard/AT parity work for `src/lib/journey/canvas-hover-preview.ts`:
 *
 *   1. The legacy mouse-driven `showCanvasHoverPreview(index, x, y)` still works
 *      and positions the preview near the cursor.
 *   2. The NEW `showCanvasHoverPreviewForFocused(index)` is pinned to the
 *      top-right of `#canvas-container` (no cursor for AT / keyboard users).
 *   3. `initCanvasHoverPreviewSubscription()` flips on a `CAMERA_NODE_FOCUSED`
 *      event with a numeric index → preview shows the focused business content
 *      pinned top-right.
 *   4. A `CAMERA_NODE_FOCUSED` event WITHOUT a numeric index (clearing focus)
 *      hides the preview.
 *   5. `aria-hidden` toggles correctly (false when shown, true when hidden).
 *   6. `destroyCanvasHoverPreview()` unsubscribes (subsequent focuses don't
 *      update the DOM).
 *
 * The canvas-hover-preview module is not a Svelte component — it's a
 * TypeScript module that creates a singleton `<div id='canvas-hover-preview'>`
 * and mutates it. We treat it as a "module" test (vitest + jsdom), not
 * @testing-library/svelte. Pattern parallels vitest's existing module-style
 * tests in `tests/unit-active/`.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
    showCanvasHoverPreview,
    showCanvasHoverPreviewForFocused,
    hideCanvasHoverPreview,
    destroyCanvasHoverPreview,
    initCanvasHoverPreviewSubscription
} from '../../src/lib/journey/canvas-hover-preview'
import { businessRecords } from '../../src/lib/data-store'
import { EVENTS, publish } from '../../src/lib/orchestration/event-bus'
import type { BusinessRecord } from '../../src/lib/types/business'

/**
 * Minimal mock BusinessRecord. canvas-hover-preview only reads id, name, what,
 * city, cluster, status, website, email, phone (see buildPreviewContent()). All
 * optional fields are populated minimally so describeCluster + calculateSignalScore
 * can render without throwing.
 */
function makeRecord(over: Partial<BusinessRecord> = {}): BusinessRecord {
    return {
        lead_id: 'mock-lead-' + (over.lead_id ?? '0'),
        index: 0,
        name: 'Sunset Grill',
        what: 'Casual dining with patio seating',
        cluster: 0,
        city: 'Conroe',
        status: 'active',
        public_note: '',
        trivia: '',
        public_detail: '',
        website: 'https://sunsetgrill.example',
        email: '',
        phone: '',
        ...over
    } as BusinessRecord
}

describe('canvas-hover-preview (W48-B keyboard / AT parity)', () => {
    beforeEach(() => {
        // Reset module-scoped singleton so each test gets a clean DOM. Also
        // unsubscribes the focused-business listener so events fired by
        // sibling tests in this suite don't leak in.
        destroyCanvasHoverPreview()
        // Seed the records store so the focus path has a real BusinessRecord
        // to project onto the preview. Only a single record is needed for
        // these tests.
        businessRecords.set([
            makeRecord({
                lead_id: '0',
                index: 0,
                name: 'Sunset Grill',
                what: 'Casual dining with patio seating',
                cluster: 0,
                city: 'Conroe'
            })
        ])
        // The focused-business preview pins to the top-right of
        // `#canvas-container`. jsdom + vitest don't compute real layout, so
        // we stub the canvas-container's bounding rect via a positioned
        // mock element. getBoundingClientRect is mocked in beforeEach.
        const container = document.createElement('div')
        container.id = 'canvas-container'
        container.style.width = '1280px'
        container.style.height = '720px'
        // jsdom default rect is all zeros — set a stable rect so the
        // positioning math has something to anchor against.
        container.getBoundingClientRect = (): DOMRect =>
            ({
                x: 0,
                y: 0,
                width: 1280,
                height: 720,
                top: 0,
                right: 1280,
                bottom: 720,
                left: 0,
                toJSON: () => ({})
            }) as DOMRect
        document.body.appendChild(container)
    })

    it('mouse-driven showCanvasHoverPreview positions near cursor', () => {
        showCanvasHoverPreview(0, 200, 300)
        const el = document.getElementById('canvas-hover-preview')
        expect(el).toBeTruthy()
        // Cursor variant: left/top set to coordinate-based value
        expect(el!.style.left).not.toBe('auto')
        expect(el!.style.left).toMatch(/px$/)
        expect(el!.getAttribute('aria-hidden')).toBe('false')
        hideCanvasHoverPreview()
    })

    it('showCanvasHoverPreviewForFocused pins to top-right of canvas-container', () => {
        showCanvasHoverPreviewForFocused(0)
        const el = document.getElementById('canvas-hover-preview')
        expect(el).toBeTruthy()
        // Focused variant: right pinned, left set to "auto" so the previous
        // cursor-style `left` doesn't conflict with the new `right` value.
        expect(el!.style.left).toBe('auto')
        expect(el!.style.right).toBe('16px')
        // Top should be canvas-container.top + 16 (= 16) since the stub
        // rect's top is 0
        expect(el!.style.top).toBe('16px')
        expect(el!.getAttribute('aria-hidden')).toBe('false')
    })

    it('focused-case preview contains the focused business name + cluster', () => {
        showCanvasHoverPreviewForFocused(0)
        const el = document.getElementById('canvas-hover-preview')!
        const text = el.textContent ?? ''
        expect(text).toContain('Sunset Grill')
        expect(text).toContain('Casual dining with patio seating')
        expect(text).toContain('Conroe')
    })

    it('initCanvasHoverPreviewSubscription shows preview on CAMERA_NODE_FOCUSED with index', () => {
        initCanvasHoverPreviewSubscription()
        publish(EVENTS.CAMERA_NODE_FOCUSED, { index: 0, point: null })
        const el = document.getElementById('canvas-hover-preview')
        expect(el).toBeTruthy()
        expect(el!.style.right).toBe('16px')
        expect(el!.getAttribute('aria-hidden')).toBe('false')
        const text = el!.textContent ?? ''
        expect(text).toContain('Sunset Grill')
    })

    it('CAMERA_NODE_FOCUSED without numeric index hides the preview', () => {
        // First show, then drive a "clear focus" event
        showCanvasHoverPreviewForFocused(0)
        expect(document.getElementById('canvas-hover-preview')!.getAttribute('aria-hidden')).toBe('false')

        initCanvasHoverPreviewSubscription()
        // No index → hide
        publish(EVENTS.CAMERA_NODE_FOCUSED, { point: null })
        expect(document.getElementById('canvas-hover-preview')!.getAttribute('aria-hidden')).toBe('true')
    })

    it('destroyCanvasHoverPreview unsubscribes (subsequent events ignored)', () => {
        initCanvasHoverPreviewSubscription()
        destroyCanvasHoverPreview()

        // Now publish a focus event — nothing should happen because the
        // subscription was torn down.
        publish(EVENTS.CAMERA_NODE_FOCUSED, { index: 0, point: null })

        // Preview should not exist (or should be hidden if it was left over
        // from a previous test). Hidden state is asserted.
        const el = document.getElementById('canvas-hover-preview')
        if (el) {
            expect(el.getAttribute('aria-hidden')).toBe('true')
        } else {
            expect(el).toBeNull()
        }
    })

    it('hideCanvasHoverPreview sets aria-hidden=true and zeros opacity', () => {
        showCanvasHoverPreviewForFocused(0)
        expect(document.getElementById('canvas-hover-preview')!.style.opacity).toBe('1')

        hideCanvasHoverPreview()
        const el = document.getElementById('canvas-hover-preview')!
        expect(el.style.opacity).toBe('0')
        expect(el.getAttribute('aria-hidden')).toBe('true')
    })
})
