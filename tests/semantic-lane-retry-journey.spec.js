/**
 * tests/semantic-lane-retry-journey.spec.js
 *
 * Deterministic Playwright journey test covering the semantic-lane failure/retry
 * UI transition: warming → stuck → retry → recovered (healthy).
 *
 * The "stuck" state is reached after 3 consecutive warming probes from the
 * health endpoint (semanticLaneWarmingCounter >= 3). The app fires no probe
 * at boot; this test drives probes via window.focus events (the
 * setupWindowStateBindings hook in AppBoot.svelte). Test intercepts
 * `action=semantic_lane_health` to return warming for the first 3 calls,
 * healthy for the 4th, then verifies DOM transitions including the retry
 * affordance (button semantics, click, recovery).
 *
 * IMPORTANT: Between warming probes (counter < 3), applySemanticLaneHealthPayload
 * falls through to setSemanticLaneUiState('degraded', ...) — there is never
 * a "warming" UI state. The stuck threshold is pure counter >= 3.
 *
 * Drive mechanism (route-interception): similar to
 *   semantic-guide-fetch-fallback-contract.spec.js
 *   loading-overlay-error-state-journey.spec.js
 *   gemma-fallback-error.spec.js
 *
 * Run:
 *   npx playwright test tests/semantic-lane-retry-journey.spec.js --browser=chromium --workers=1 --reporter=list
 *
 * Prerequisite: PHP API server on 127.0.0.1:8795 (for search data), or use
 *   the existing `npm run dev:static` which proxies /api* to the PHP server.
 *
 * Standalone two-terminal recipe:
 *   Terminal 1: php -S 127.0.0.1:8795 -t .
 *   Terminal 2: npx playwright test tests/semantic-lane-retry-journey.spec.js --browser=chromium --workers=1 --headed
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'

test.describe('Semantic lane retry journey (warming → stuck → retry → healthy)', () => {
  test('warming probes trigger stuck pill with retry affordance, click restores healthy state', async ({ page }) => {
    test.setTimeout(60_000)

    // ── Route interception ──
    //
    // Phase 1: return warming for the first 3 health calls so the stuck
    //          threshold (semanticLaneWarmingCounter >= 3) is met.
    // Phase 2: return healthy so the manual retry recovers.
    let healthCallCount = 0
    const WARMING_STUB = {
      ok: true,
      state: 'warming',
      provenance: {
        label: 'Connecting to search',
        detail: 'Semantic engine is warming up. Results will appear shortly.'
      },
      search_ok: false,
      embed_ok: false
    }
    const HEALTHY_STUB = {
      ok: true,
      state: 'healthy',
      provenance: {
        label: 'Search ready',
        detail: 'Semantic search is ready.'
      }
    }

    await page.route((url) => {
      try {
        return new URL(url).searchParams.get('action') === 'semantic_lane_health'
      } catch {
        return false
      }
    }, async (route) => {
      healthCallCount++
      const stub = healthCallCount <= 3 ? WARMING_STUB : HEALTHY_STUB
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(stub)
      })
    })

    // Also route semantic_search so the app can search without hitting a real API
    await page.route((url) => {
      try {
        return new URL(url).searchParams.get('action') === 'semantic_search'
      } catch {
        return false
      }
    }, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          count: 3,
          results: [
            { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
            { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
            { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
          ]
        })
      })
    })

    // ── Navigate ──
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${BASE_URL}/?nodemo=1&staticDev=0`, { waitUntil: 'domcontentloaded' })

    // Wait for the app shell to be interactive and the search container to mount.
    // The #semantic-lane-pill element is rendered inside SearchInputChrome.svelte.
    const pill = page.locator('#semantic-lane-pill')
    await pill.waitFor({ state: 'attached', timeout: 20_000 })

    // ── Phase 1: Drive 3 warming probes via window.focus events ──
    // The app fires NO probe at boot. The only trigger is the window focus
    // handler (registered by setupWindowStateBindings in AppBoot.svelte).
    // Each focus event calls probeSemanticLane({ warm: true, reason: 'focus' }).
    // applySemanticLaneHealthPayload increments semanticLaneWarmingCounter
    // for each response with state: 'warming'. Between warming probes (counter
    // < 3) the UI falls through to setSemanticLaneUiState('degraded', ...).
    // After 3 consecutive warming responses the >= 3 check fires and the pill
    // becomes 'stuck'.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      // Allow the async probe + state effect flush
      await page.waitForTimeout(500)
    }

    // After 3 warming responses, applySemanticLaneHealthPayload should have
    // set the pill to stuck with button semantics.
    await expect(pill).toHaveAttribute('data-state', 'stuck', { timeout: 10_000 })

    // Stuck pill must have button semantics (role="button", tabindex="0")
    await expect(pill).toHaveAttribute('role', 'button')
    await expect(pill).toHaveAttribute('tabindex', '0')

    // Stuck pill must have a meaningful aria-label describing the retry action
    const ariaLabel = await pill.getAttribute('aria-label')
    expect(ariaLabel, 'stuck pill aria-label must mention "Retry search"').toContain('Retry search')

    // The pill must have non-empty text content
    const textBefore = (await pill.textContent())?.trim() ?? ''
    expect(textBefore.length, 'stuck pill must have non-empty text').toBeGreaterThan(0)

    // ── Phase 2: Click the stuck pill to trigger manual retry ──
    // The click handler (syncSemanticLaneRetryBinding's onClick) calls
    // probeSemanticLane({ warm: true, reason: 'manual-retry' }),
    // which fetches the health endpoint again. Since healthCallCount >= 3 now,
    // our route returns healthy.
    //
    // Use dispatchEvent(click) instead of pill.click() because the pill may
    // reside behind the splash/gate overlay (the search container is
    // position:absolute; the splash can overlap it). The click handler fires
    // on click event objects regardless of pointer-events visibility.
    await page.evaluate(() => {
      document.getElementById('semantic-lane-pill')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Allow the probe + state flush
    await page.waitForTimeout(500)

    // Verify recovery: data-state flips from "stuck" to "healthy"
    await expect(pill).toHaveAttribute('data-state', 'healthy', { timeout: 10_000 })

    // Healthy pill must NOT have button semantics
    const roleAfter = await pill.getAttribute('role')
    expect(roleAfter, 'healthy pill must not have role="button"').toBeNull()
    const tabIndexAfter = await pill.getAttribute('tabindex')
    expect(tabIndexAfter, 'healthy pill must not have tabindex').toBeNull()

    // Healthy pill must have a meaningful label (no internal implementation details)
    const textAfter = (await pill.textContent())?.trim() ?? ''
    expect(textAfter.length, 'healthy pill text must not be empty').toBeGreaterThan(0)
    // The sanitized label should not contain raw internal strings like "warming" or "static"
    expect(textAfter.toLowerCase()).not.toContain('warming')
  })
})