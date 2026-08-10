/**
 * component-Controls.test.ts — Component test for Controls.svelte
 *
 * Structural tests (8):
 *  1. Renders div.controls with role="toolbar" and id="camera-controls"
 *  2. Toolbar has aria-label="Camera controls"
 *  3. Renders zoom-in button with aria-label="Zoom in" and title="Zoom in"
 *  4. Renders zoom-out button with aria-label="Zoom out" and title="Zoom out"
 *  5. Renders reset-view button with aria-label="Reset view" and title="Reset view"
 *  6. Renders auto-rotate toggle button with aria-pressed attribute
 *  7. Renders share-link button with aria-label="Share link"
 *  8. All SVG icons are aria-hidden="true"
 *
 * Behavioral tests (3) — regression coverage for the non-functional zoom bug:
 *  9. Clicking zoom-in moves the camera closer to the target (distance shrinks)
 * 10. Clicking zoom-out moves the camera farther from the target (distance grows)
 * 11. Zoom respects orbit distance clamps (does not cross target or escape bounds)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Controls from '../../src/components/Controls.svelte'
import { cameraState } from '../../src/lib/stores/camera.svelte.ts'
import { toastStore } from '../../src/lib/stores/toast.svelte'
import { get } from 'svelte/store'

// Mock navigator.clipboard before each test; reset to original after.
const originalClipboard = (navigator as { clipboard?: unknown }).clipboard

function distance(a: readonly number[], b: readonly number[]): number {
    const dx = a[0] - b[0]
    const dy = a[1] - b[1]
    const dz = a[2] - b[2]
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

describe('Controls component', () => {
    it('renders div.controls with role="toolbar" and id="camera-controls"', () => {
        const { container } = render(Controls)
        const toolbar = container.querySelector('#camera-controls')
        expect(toolbar).toBeTruthy()
        expect(toolbar!.getAttribute('role')).toBe('toolbar')
        expect(toolbar!.getAttribute('id')).toBe('camera-controls')
    })

    it('toolbar has aria-label="Camera controls"', () => {
        const { container } = render(Controls)
        const toolbar = container.querySelector('#camera-controls')
        expect(toolbar!.getAttribute('aria-label')).toBe('Camera controls')
    })

    it('renders zoom-in button with aria-label and title', () => {
        const { container } = render(Controls)
        const btn = container.querySelector('button[aria-label="Zoom in"]')
        expect(btn).toBeTruthy()
        expect(btn!.getAttribute('title')).toBe('Zoom in')
    })

    it('renders zoom-out button with aria-label and title', () => {
        const { container } = render(Controls)
        const btn = container.querySelector('button[aria-label="Zoom out"]')
        expect(btn).toBeTruthy()
        expect(btn!.getAttribute('title')).toBe('Zoom out')
    })

    it('renders reset-view button with aria-label and title', () => {
        const { container } = render(Controls)
        const btn = container.querySelector('button[aria-label="Reset view"]')
        expect(btn).toBeTruthy()
        expect(btn!.getAttribute('title')).toBe('Reset view')
    })

    it('renders auto-rotate toggle button with aria-pressed attribute', () => {
        const { container } = render(Controls)
        const btn = container.querySelector('button[aria-label="Toggle auto-rotate"]')
        expect(btn).toBeTruthy()
        expect(btn!.getAttribute('title')).toBe('Toggle auto-rotate')
        expect(btn!.hasAttribute('aria-pressed')).toBe(true)
    })

    it('renders share-link button with aria-label and title', () => {
        const { container } = render(Controls)
        const btn = container.querySelector('button[aria-label="Share link"]')
        expect(btn).toBeTruthy()
        expect(btn!.getAttribute('title')).toBe('Share link')
    })

    it('all SVG icons inside buttons are aria-hidden="true"', () => {
        const { container } = render(Controls)
        const svgs = container.querySelectorAll('button svg')
        expect(svgs.length).toBeGreaterThanOrEqual(5)
        svgs.forEach((svg) => {
            expect(svg.getAttribute('aria-hidden')).toBe('true')
        })
    })
})

describe('Controls component — zoom behavior', () => {
    // Reset camera state between tests so each one starts at the known
    // OVERVIEW pose. The store has a setter via the underlying API.
    beforeEach(() => {
        // Force the transition to idle so subsequent reads see the live position.
        cameraState.transition = {
            phase: 'idle',
            token: 0,
            startedAt: 0,
            durationMs: 0,
            from: { position: [...cameraState.position], target: [...cameraState.target] },
            to: { position: [...cameraState.position], target: [...cameraState.target] }
        }
    })

    it('zoom-in moves the camera closer to the target (regression: was a no-op)', async () => {
        const { container } = render(Controls)
        const before = distance(cameraState.position, cameraState.target)
        const btn = container.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement
        expect(btn).toBeTruthy()
        await fireEvent.click(btn)
        // After click, the transition's `to.position` holds the new destination.
        const after = distance(cameraState.transition.to.position, cameraState.transition.to.target)
        expect(after).toBeLessThan(before)
        expect(after).toBeCloseTo(before / 1.2, 5)
    })

    it('zoom-out moves the camera farther from the target (regression: was a no-op)', async () => {
        const { container } = render(Controls)
        const before = distance(cameraState.position, cameraState.target)
        const btn = container.querySelector('button[aria-label="Zoom out"]') as HTMLButtonElement
        expect(btn).toBeTruthy()
        await fireEvent.click(btn)
        const after = distance(cameraState.transition.to.position, cameraState.transition.to.target)
        expect(after).toBeGreaterThan(before)
        expect(after).toBeCloseTo(before * 1.2, 5)
    })

    it('zoom-in is a no-op when already at the min-distance clamp', async () => {
        // Park the camera at exactly the min distance from the target.
        const target: [number, number, number] = [0, 0, 0]
        const position: [number, number, number] = [0, 0, 0.5] // ORBIT_MIN_DISTANCE_DEFAULT
        cameraState.target = target
        cameraState.position = position
        cameraState.transition = {
            phase: 'idle',
            token: 0,
            startedAt: 0,
            durationMs: 0,
            from: { position: [...position], target: [...target] },
            to: { position: [...position], target: [...target] }
        }
        const { container } = render(Controls)
        const btn = container.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement
        await fireEvent.click(btn)
        // No transition should have been scheduled: token stays at 0 (idle).
        expect(cameraState.transition.token).toBe(0)
    })
})

describe('Controls component — shareLink feedback (regression: silent no-op)', () => {
    beforeEach(() => {
        // Reset toast state before each test.
        // @ts-ignore — harness: ToastState type requires additional fields not in test fixture
    toastStore.set({ message: "", variant: "info", active: false } as any)
    })

    afterEach(() => {
        // Restore the real clipboard API between tests.
        if (originalClipboard !== undefined) {
            ;(navigator as { clipboard: unknown }).clipboard = originalClipboard
        } else {
            delete (navigator as { clipboard?: unknown }).clipboard
        }
    })

    it('share-link success path surfaces an info toast with the URL', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true
        })
        const { container } = render(Controls)
        const btn = container.querySelector('button[aria-label="Share link"]') as HTMLButtonElement
        expect(btn).toBeTruthy()
        // fireEvent.click awaits the click handler; our handler awaits the
        // mocked clipboard promise, so the toast is set by the time this returns.
        await fireEvent.click(btn)
        expect(writeText).toHaveBeenCalledTimes(1)
        // Controls.svelte delegates to the canonical copyCurrentViewLink()
        // (wave-10 BS-B#6), which writes the CLEANED share URL (view param
        // from navStore, anchor→record rewrite) — not the raw location.href.
        const written = String(writeText.mock.calls[0][0])
        expect(new URL(written).searchParams.get('view')).toBe('galaxy')
        const captured = get(toastStore)
        expect(captured.active).toBe(true)
        expect(captured.variant).toBe('info')
        expect(captured.message).toContain('Link copied')
    })

    it('share-link failure path surfaces a copy-unavailable toast (no silent catch)', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'))
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true
        })
        const { container } = render(Controls)
        const btn = container.querySelector('button[aria-label="Share link"]') as HTMLButtonElement
        await fireEvent.click(btn)
        const captured = get(toastStore)
        expect(captured.active).toBe(true)
        // Canonical copyCurrentViewLink() reports clipboard failure via the
        // 'Copy unavailable' info toast (wave-10 BS-B#6 — the legacy
        // execCommand fallback was removed by design; there is no 'error'
        // variant and no 'Copy failed' copy anymore).
        expect(captured.message).toContain('Copy unavailable')
    })

    it('share-link with no clipboard API surfaces the unavailable toast (no execCommand fallback)', async () => {
        // Some browsers expose no clipboard at all (e.g. insecure http context).
        // Wave-10 BS-B#6 removed the legacy document.execCommand fallback:
        // the canonical helper catches the missing API and shows the
        // 'Copy unavailable' toast instead of silently no-oping.
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
        const originalExec = (document as { execCommand?: unknown }).execCommand
        const execMock = vi.fn(() => true)
        Object.defineProperty(document, 'execCommand', {
            value: execMock,
            configurable: true,
            writable: true
        })
        try {
            const { container } = render(Controls)
            const btn = container.querySelector('button[aria-label="Share link"]') as HTMLButtonElement
            await fireEvent.click(btn)
            expect(execMock).not.toHaveBeenCalled()
            const captured = get(toastStore)
            expect(captured.active).toBe(true)
            expect(captured.message).toContain('Copy unavailable')
        } finally {
            if (originalExec === undefined) {
                delete (document as { execCommand?: unknown }).execCommand
            } else {
                Object.defineProperty(document, 'execCommand', {
                    value: originalExec,
                    configurable: true,
                    writable: true
                })
            }
        }
    })
})
