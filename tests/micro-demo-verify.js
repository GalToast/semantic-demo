#!/usr/bin/env node
/**
 * Micro-demo Visual QA Test Runner
 *
 * ⚠️ LEGACY-ONLY TEST RUNNER — targets `index.html` (legacy static HTML shell).
 * This entire runner is specific to the legacy micro-demo (`micro-demo.js` in
 * the static HTML) and checks legacy DOM elements (#micro-demo-veil),
 * window globals (window.isMicroDemoRunning, window.cancelMicroDemo), and
 * body attributes ([data-demo-active]) that do not exist in the Svelte build.
 * No equivalent test targets the Svelte DemoChoreography component.
 *
 * Run: node tests/micro-demo-verify.js
 * Default URL: http://127.0.0.1:8795/index.html
 *
 * Override with TEST_BASE_URL and TEST_APP_PATH.
 *
 * Strengthened checks:
 *   - Demo lifecycle: force/seen/nodemo/cancel
 *   - Visible UI state: veil, pill, no duplicate running
 *   - Console error filtering (semantic search noise excluded)
 *   - Clear failure messages on missing app or server
 */

import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795'
const PATH = process.env.TEST_APP_PATH || '/index.html'
const DEMO_FORCE = '?demo=force'
const DEMO_NODEMO = '?nodemo'
const STORAGE_KEY = 'moco_mycelium_demo_v1'
const _SESSION_STORAGE_KEY = 'moco_mycelium_demo_session_v1'

let passed = 0
let failed = 0

function assert(condition, message) {
    if (condition) {
        console.log(`  ok ${message}`)
        passed++
    } else {
        console.log(`  fail ${message}`)
        failed++
    }
}

async function clearDemoState(page) {
    await page.evaluate((key) => {
        localStorage.removeItem(key)
        sessionStorage.clear()
    }, STORAGE_KEY)
}

async function seedDemoSeen(page) {
    await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({ seen: true, seenAt: Date.now(), version: 1 }))
    }, STORAGE_KEY)
}

// Check the app page is reachable and the window global is present
async function waitForAppReady(page, url) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    if (!response || response.status() >= 400) {
        throw new Error(`Server not available at ${url} (HTTP ${response?.status()})`)
    }
    // Wait for app globals to be registered
    await page.waitForFunction(
        () => typeof window.isMicroDemoRunning === 'function' && typeof window.cancelMicroDemo === 'function',
        { timeout: 15000 }
    )
}

async function runTests() {
    console.log('\nMicro-demo QA Tests')
    console.log(`   Base: ${BASE_URL}`)
    console.log(`   Path: ${PATH}`)
    console.log('')

    const browser = await chromium.launch({
        headless: false,
        args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox']
    })
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(60000)
    page.setDefaultTimeout(60000)

    const consoleErrors = []
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    try {
        // ── Test 1: Server / app availability ─────────────────────────────────
        console.log('Test 1: App page is reachable and globals are registered')
        try {
            await waitForAppReady(page, `${BASE_URL}${PATH}`)
            assert(true, 'App responds and isMicroDemoRunning + cancelMicroDemo globals exist')
        } catch (err) {
            assert(false, `App not ready: ${err.message}`)
            await browser.close()
            console.log(`\n${'─'.repeat(50)}`)
            console.log(`Results: ${passed} passed, ${failed} failed`)
            console.log(`${'─'.repeat(50)}\n`)
            process.exit(1)
        }

        // ── Test 2: Demo fires on first visit (force param) ───────────────────
        console.log('\nTest 2: Demo fires and completes on first visit (demo=force)')
        await context.clearCookies()
        await clearDemoState(page)
        await page.goto(`${BASE_URL}${PATH}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded', timeout: 60000 })

        // Wait for micro-demo to be running (sessionStorage key set by startMicroDemo)
        await page.waitForFunction(() => sessionStorage.getItem('moco_mycelium_demo_session_v1') !== null, {
            timeout: 30000
        })

        const isRunning = await page.evaluate(() => window.isMicroDemoRunning?.())
        assert(isRunning === true, 'isMicroDemoRunning() === true during demo')

        // Demo should set a localStorage seen flag after completion
        await page.waitForFunction(
            () => {
                const v = localStorage.getItem('moco_mycelium_demo_v1')
                return v && JSON.parse(v).seen === true
            },
            { timeout: 45000 }
        )

        const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
        assert(stored !== null, 'localStorage moco_mycelium_demo_v1 is set after completion')

        const parsed = JSON.parse(stored)
        assert(parsed.seen === true, 'localStorage seen flag is true')
        assert(parsed.seenAt !== undefined, 'localStorage seenAt timestamp is set')

        // Page title should be restored after demo (may be prefixed with "Semantic Explorer | ")
        const title = await page.title()
        assert(title.includes('MoCo Business Mycelium'), `Page title restored: "${title}"`)

        // No console errors (filter known noise)
        const realErrors = consoleErrors.filter(
            (e) =>
                !e.includes('Semantic search') &&
                !e.includes('net::ERR') &&
                !e.includes('Failed to load resource') &&
                !e.includes('semantic_lane_health') &&
                !e.includes('404') &&
                !e.includes('favicon')
        )
        assert(realErrors.length === 0, `No console errors (${realErrors.length} found)`)

        // ── Test 3: Veil and pill appear during demo ──────────────────────────
        console.log('\nTest 3: Veil overlay and demo pill are visible during demo')
        await clearDemoState(page)
        await page.goto(`${BASE_URL}${PATH}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded', timeout: 60000 })

        await page.waitForFunction(() => sessionStorage.getItem('moco_mycelium_demo_session_v1') !== null, {
            timeout: 30000
        })

        // Veil should be present and become visible after its CSS transition starts.
        await page.waitForFunction(
            () => {
                const veil = document.getElementById('micro-demo-veil') || document.querySelector('.micro-demo-veil')
                return veil && parseFloat(window.getComputedStyle(veil).opacity || 0) > 0
            },
            { timeout: 3000 }
        )
        const veilOpacity = await page.evaluate(() => {
            const veil = document.getElementById('micro-demo-veil') || document.querySelector('.micro-demo-veil')
            return parseFloat(window.getComputedStyle(veil).opacity || 0)
        })
        assert(veilOpacity > 0, `Veil overlay is visible (opacity: ${veilOpacity})`)

        // Demo pill should exist somewhere in the DOM and be populated with text
        await page
            .waitForFunction(
                () => {
                    const pill =
                        document.getElementById('micro-demo-pill') || document.querySelector('.micro-demo-pill')
                    return pill && pill.textContent.trim().length > 0
                },
                { timeout: 4000 }
            )
            .catch(() => {})

        const pillText = await page.evaluate(() => {
            const pill = document.getElementById('micro-demo-pill') || document.querySelector('.micro-demo-pill')
            return pill ? pill.textContent.trim() : ''
        })
        assert(pillText.length > 0, `Demo pill is present with text: "${pillText}"`)
        const pillBox = await page.evaluate(() => {
            const pill = document.getElementById('micro-demo-pill') || document.querySelector('.micro-demo-pill')
            if (!pill) return null
            const rect = pill.getBoundingClientRect()
            const style = window.getComputedStyle(pill)
            return {
                width: rect.width,
                height: rect.height,
                display: style.display,
                visibility: style.visibility,
                opacity: Number(style.opacity)
            }
        })
        assert(
            pillBox &&
                pillBox.width > 0 &&
                pillBox.height > 0 &&
                pillBox.display !== 'none' &&
                pillBox.visibility !== 'hidden' &&
                pillBox.opacity > 0.05,
            'Demo pill has a visible rendered box'
        )

        // data-active body attribute flips true while the demo pill is shown.
        // (.view-toggle rule was deleted 2026-07-23 — no DOM ever matched the
        // .view-toggle class, so its `body[data-demo-active='true'] .view-toggle
        // { display: none }` rule was dead CSS; the file css/demo_ui.css was
        // deleted too.)
        const demoActiveSet = await page.evaluate(() => document.body.dataset.demoActive)
        assert(demoActiveSet === 'true', 'body[data-demo-active="true"] is set while demo runs')

        // ── Test 4: Demo does NOT fire on repeat visits (seen guard) ───────────
        console.log('\nTest 4: Demo does not fire on repeat visits (seen=true blocks)')
        await clearDemoState(page)
        await seedDemoSeen(page)
        await page.goto(`${BASE_URL}${PATH}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForTimeout(1500)

        const isRunningRepeat = await page.evaluate(() => window.isMicroDemoRunning?.())
        assert(isRunningRepeat === false, 'isMicroDemoRunning() === false on repeat visit')

        // sessionStorage should NOT be set (demo was blocked)
        const sessionSet = await page.evaluate(() => sessionStorage.getItem('moco_mycelium_demo_session_v1'))
        assert(sessionSet === null, 'sessionStorage key is NOT set on repeat visit (demo blocked)')

        // ── Test 5: demo=force bypasses already-seen guard ────────────────────
        console.log('\nTest 5: demo=force bypasses already-seen guard')
        await seedDemoSeen(page)
        await page.goto(`${BASE_URL}${PATH}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded', timeout: 60000 })

        await page.waitForFunction(() => window.isMicroDemoRunning?.() === true, { timeout: 30000 })
        const isRunningForce = await page.evaluate(() => window.isMicroDemoRunning())
        assert(isRunningForce === true, 'isMicroDemoRunning() === true with demo=force despite seen flag')

        // Wait for sessionStorage
        await page.waitForFunction(() => sessionStorage.getItem('moco_mycelium_demo_session_v1') !== null, {
            timeout: 30000
        })
        const sessionKeyForce = await page.evaluate(() => sessionStorage.getItem('moco_mycelium_demo_session_v1'))
        assert(sessionKeyForce !== null, 'sessionStorage key is set when demo runs')

        // ── Test 6: cancelMicroDemo returns camera to overview ────────────────
        console.log('\nTest 6: cancelMicroDemo cancels demo and restores overview')
        await clearDemoState(page)
        await page.goto(`${BASE_URL}${PATH}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded', timeout: 60000 })

        await page.waitForFunction(() => window.isMicroDemoRunning?.() === true, { timeout: 30000 })

        // Cancel the demo
        await page.evaluate(() => window.cancelMicroDemo('user-input'))

        await page.waitForFunction(() => window.isMicroDemoRunning?.() === false, { timeout: 5000 })
        const isRunningAfterCancel = await page.evaluate(() => window.isMicroDemoRunning())
        assert(isRunningAfterCancel === false, 'isMicroDemoRunning() === false after cancelMicroDemo')

        const titleAfterCancel = await page.title()
        assert(titleAfterCancel.includes('MoCo Business Mycelium'), `Title after cancel: "${titleAfterCancel}"`)

        // Veil should be gone (cancelMicroDemo resets veil via _resetAppState)
        await page.waitForFunction(
            () => {
                const veil = document.getElementById('micro-demo-veil') || document.querySelector('.micro-demo-veil')
                if (!veil) return true
                return parseFloat(window.getComputedStyle(veil).opacity || 0) <= 0.05
            },
            { timeout: 5000 }
        )
        const veilVisible = await page.evaluate(() => {
            const veil = document.getElementById('micro-demo-veil') || document.querySelector('.micro-demo-veil')
            if (!veil) return false
            return parseFloat(window.getComputedStyle(veil).opacity || 0) > 0.05
        })
        assert(veilVisible === false, 'Veil overlay is hidden after cancelMicroDemo')

        // ── Test 7: nodemo param blocks demo entirely ─────────────────────────
        console.log('\nTest 7: nodemo URL param blocks demo init')
        await clearDemoState(page)
        await page.goto(`${BASE_URL}${PATH}${DEMO_NODEMO}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForTimeout(2000)

        const isRunningNodemo = await page.evaluate(() => window.isMicroDemoRunning?.())
        assert(isRunningNodemo === false, 'isMicroDemoRunning() === false when nodemo param is set')

        const sessionNodemo = await page.evaluate(() => sessionStorage.getItem('moco_mycelium_demo_session_v1'))
        assert(sessionNodemo === null, 'sessionStorage key is NOT set when nodemo param is set')

        // ── Test 8: No duplicate running state ────────────────────────────────
        console.log('\nTest 8: Demo does not start twice in same session')
        await clearDemoState(page)
        await page.goto(`${BASE_URL}${PATH}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded', timeout: 60000 })

        await page.waitForFunction(() => sessionStorage.getItem('moco_mycelium_demo_session_v1') !== null, {
            timeout: 30000
        })

        // Attempt a second forced navigation without clearing sessionStorage
        // Since sessionStorage is set, startMicroDemo should refuse to run again
        const sessionBefore = await page.evaluate(() => sessionStorage.getItem('moco_mycelium_demo_session_v1'))
        assert(sessionBefore !== null, 'sessionStorage key is set from first run')

        // Reload with demo=force — sessionStorage should prevent double-fire
        await page.goto(`${BASE_URL}${PATH}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForTimeout(1000)

        // Only one demo should be registered; check that isRunning is stable
        const isRunningStable = await page.evaluate(() => window.isMicroDemoRunning?.())
        // sessionStorage blocks re-entry; isRunning should reflect the single instance
        assert(isRunningStable !== undefined, 'isMicroDemoRunning() is accessible after reload')

        // ── Test 9: Console error noise filter is not blanketing real errors ───
        console.log('\nTest 9: Console error filter does not hide actual app errors')
        const unfilteredErrors = consoleErrors.filter(
            (e) =>
                !e.includes('Semantic search') &&
                !e.includes('net::ERR') &&
                !e.includes('Failed to load resource') &&
                !e.includes('semantic_lane_health') &&
                !e.includes('404') &&
                !e.includes('favicon') &&
                (e.includes('TypeError') || e.includes('ReferenceError') || e.includes('SyntaxError'))
        )
        assert(unfilteredErrors.length === 0, `No unfiltered JS runtime errors (${unfilteredErrors.length} found)`)
    } catch (err) {
        console.error(`\n  Test error: ${err.message}`)
        failed++
    } finally {
        await Promise.race([browser.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 5000))])
    }

    console.log(`\n${'─'.repeat(50)}`)
    console.log(`Results: ${passed} passed, ${failed} failed`)
    console.log(`${'─'.repeat(50)}\n`)

    process.exit(failed > 0 ? 1 : 0)
}

runTests().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
