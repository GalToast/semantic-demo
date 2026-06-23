/**
 * component-Controls.test.ts — Component test for Controls.svelte
 *
 * Verifies:
 *  1. Renders div.controls with role="toolbar" and id="camera-controls"
 *  2. Toolbar has aria-label="Camera controls"
 *  3. Renders zoom-in button with aria-label="Zoom in" and title="Zoom in"
 *  4. Renders zoom-out button with aria-label="Zoom out" and title="Zoom out"
 *  5. Renders reset-view button with aria-label="Reset view" and title="Reset view"
 *  6. Renders auto-rotate toggle button with aria-pressed attribute
 *  7. Renders share-link button with aria-label="Share link"
 *  8. All SVG icons are aria-hidden="true"
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Controls from '../../src/components/Controls.svelte'

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
