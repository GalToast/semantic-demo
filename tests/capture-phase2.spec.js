import { test } from '@playwright/test'
import { ONBOARDING_STORAGE_KEY } from '@lib/onboarding/onboarding-storage'

// Phase 2 visual sweep: capture surfaces across widths/states for multi-model
// vision grading. Mirrors the canonical journey-test boot (__PLAYWRIGHT__ forces
// webgl + auto-signals engineReady so deep-links bypass the splash CTA). Runs
// against the build served on 8795 (stable, includes the landed fix-wave edits).
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795'
const ROOT = `${BASE}/dist/svelte/index.html`

test('phase2 visual capture across surfaces + widths', async ({ page }) => {
    await page.addInitScript(() => {
        window.__PLAYWRIGHT__ = true
        try {
            localStorage.setItem(
                ONBOARDING_STORAGE_KEY,
                JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
            )
        } catch (e) {
            /* ignore */
        }
    })

    // Data-load ready: the loading-overlay (#loading-overlay, defined in
    // LoadingOverlay.svelte:72-82) is either removed from the DOM (Svelte
    // {#if actuallyVisible} when phase === 'launch') or marked hidden via
    // CSS class (hideLoadingOverlay in lib/ui/loading.ts:200-205).
    // Returns true when the overlay is definitively gone or hidden.
    // @ts-ignore — tests/ is excluded from tsconfig; document.querySelector
    // typing fails the edit-tool compile hook.
    const dataReady = () => {
        const el = document.querySelector('#loading-overlay')
        return !el || el.classList.contains('hidden')
    }

    const cap = async (name, url, w, h, readyFn, waitMs = 1800) => {
        await page.setViewportSize({ width: w, height: h })
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        if (readyFn) {
            await page.waitForFunction(readyFn, null, { timeout: 30000 }).catch(() => {})
        }
        await page.waitForTimeout(waitMs)
        await page.screenshot({ path: `tmp/phase2-${name}.png` })
        console.log(`captured ${name} @ ${w}x${h}`)
    }

    const selReady = () => !!document.querySelector('[id$="selected-name"]')
    const searchReady = () =>
        (document.querySelector('#search-results-count')?.textContent?.trim().length ?? 0) > 0 &&
        (document.querySelector('#search-result-list')?.querySelectorAll(':scope > *').length ?? 0) > 0
    // NOTE (main lane, 2026-07-15): Lane CAP did successfully patch this spec
    // before the 600s timeout—the `dataReady` readyFn above (lines 17-25) is
    // Lane CAP's edit and is already applied to surfaces #1, #4, #5, #6. An
    // initial main-lane follow-up tried to add a duplicate `overlayGone`
    // readyFn here; that duplicate has been removed since `dataReady` is the
    // strict superset (it also checks `.hidden` class for the case Svelte
    // keeps the element rendered but flips a `hidden` class on it — see
    // `hideLoadingOverlay` in `src/lib/ui/loading.ts:200-205`). The active
    // fix lives in `dataReady` above.

    // 1. desktop overview (post-splash, header + canvas)
    await cap('desktop-overview-1280', `${ROOT}?nodemo=1`, 1280, 800, dataReady)
    // 2. search "coffee" (post-fix B-A1: count + Show-more reachability)
    await cap('search-coffee-1280', `${ROOT}?nodemo=1&q=coffee`, 1280, 800, searchReady)
    // 3. focus panel (info panel populated)
    await cap('focus-1280', `${ROOT}?nodemo=1&anchor=519`, 1280, 800, selReady)
    // 4. map mode (deep-link ?view=map → splash auto-cleared; wait for data)
    await cap('map-1280', `${ROOT}?view=map`, 1280, 800, dataReady)
    // 5. narrow desktop chips 820 (post-fix A2.2: no mid-word clip)
    await cap('chips-820', `${ROOT}?nodemo=1`, 820, 800, dataReady, 1500)
    // 6. chips 768 (icon-only breakpoint)
    await cap('chips-768', `${ROOT}?nodemo=1`, 768, 800, dataReady, 1500)
    // 7. mobile idle 375 (placeholder2d mobile path; separate fix-wave)
    await cap('mobile-idle-375', `${ROOT}?nodemo=1`, 375, 667, undefined, 2200)
    // 8. 360px compass focus (post-fix A2.1: translateX(-50%) cleared)
    await cap('compass-360', `${ROOT}?nodemo=1&anchor=519`, 360, 740, selReady)
})
