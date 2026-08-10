/**
 * component-DevGui.test.ts — DevGui.svelte a11y/structure behavioral contract.
 *
 * The component lazily imports lil-gui inside onMount when visible=true; we
 * mock lil-gui so the shell structure can be asserted without a real GUI
 * (jsdom lacks the canvas/dom APIs lil-gui touches).
 *
 * ISOLATION (order-dependent flake, fixed 2026-08-07): DevGui's onMount fires
 * an UNAWAITED async IIFE (`await import('lil-gui')` → GUI construction).
 * Standalone this file finishes fast enough that the continuation lands inside
 * the file and passes. Under full-suite timing pressure the continuation can
 * land AFTER this file's tests have finished, surfacing as an Unhandled
 * Rejection attributed to whichever test file is active next (observed:
 * "TypeError: pocketFolder.open is not a function" at DevGui.svelte:98).
 *
 * Fix (test-side isolation only): (a) the mock records construction/destruction
 * on vi.hoisted counters, (b) the visible test awaits vi.waitFor until the
 * lazily-constructed GUI has actually landed, and (c) afterEach explicitly
 * unmounts (so the component's onMount teardown runs `guiInstance?.destroy()`)
 * and asserts constructed === destroyed. No GUI work can now leak into a later
 * test file; a regression fails THIS file deterministically instead of
 * poisoning a random neighbor.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import DevGui from '../../src/components/DevGui.svelte'

// The vi.mock factory below is hoisted above this declaration, so the counters
// must be created via vi.hoisted before the factory executes.
const guiLifecycle = vi.hoisted(() => ({ constructed: 0, destroyed: 0 }))

vi.mock('lil-gui', () => {
    return {
        default: class FakeGui {
            constructor() {
                guiLifecycle.constructed += 1
            }
            add() {
                return this
            }
            addFolder() {
                return this
            }
            name() {
                return this
            }
            onChange() {
                return this
            }
            open() {}
            close() {}
            destroy() {
                guiLifecycle.destroyed += 1
            }
        }
    }
})

afterEach(() => {
    // Unmount BEFORE checking the balance so the component's onMount teardown
    // (`void guiInstance?.destroy()`) has run. @testing-library's auto-cleanup
    // is registered earlier and would run after this hook; calling cleanup()
    // here makes the ordering explicit and deterministic.
    cleanup()
    expect(guiLifecycle.constructed).toBe(guiLifecycle.destroyed)
    guiLifecycle.constructed = 0
    guiLifecycle.destroyed = 0
})

describe('DevGui component shell', () => {
    it('renders complementary region with developer-tools label when visible', async () => {
        const { container } = render(DevGui, { props: { visible: true } })
        // The onMount IIFE's `await import('lil-gui')` continuation must land
        // WHILE the component is still mounted. Without this wait the
        // continuation constructs the GUI after the afterEach cleanup() ran
        // (guiInstance assigned post-unmount ⇒ destroy() never pairs), which
        // leaked into the next test file as pocketFolder.open is not a function.
        await vi.waitFor(() => expect(guiLifecycle.constructed).toBe(1))
        const region = container.querySelector('[role="complementary"]')
        expect(region).not.toBeNull()
        expect(region?.getAttribute('aria-label')).toBe('Developer tools')
    })

    it('renders nothing when visible is false', () => {
        const { container } = render(DevGui, { props: { visible: false } })
        expect(container.querySelector('[role="complementary"]')).toBeNull()
    })
})
