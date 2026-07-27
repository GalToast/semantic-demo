/**
 * visual-audit.js — Reusable Playwright helpers for visual audits.
 *
 * Usage from a journey test:
 *   import { visualAudit } from './helpers/visual-audit.js'
 *   await visualAudit.screenshot(page, 'desktop-idle-overview')
 *   await visualAudit.measureFPS(page)
 */
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const SCREENSHOT_DIR = join(process.cwd(), 'reports', 'screenshots', 'audit')
mkdirSync(SCREENSHOT_DIR, { recursive: true })

export const visualAudit = {
    /**
     * Capture a screenshot and save it to reports/screenshots/audit/.
     * @param {import('@playwright/test').Page} page
     * @param {string} name — filename stem (e.g. 'desktop-idle-overview')
     * @param {object} [opts] — passed to page.screenshot()
     */
    async screenshot(page, name, opts = {}) {
        const path = join(SCREENSHOT_DIR, `audit-${name}.png`)
        await page.screenshot({ path, fullPage: false, ...opts })
        return path
    },

    /**
     * Poll until the scene canvas + minimal DOM are present.
     * @param {import('@playwright/test').Page} page
     * @param {number} [timeoutMs=30000]
     */
    async waitForSceneLoaded(page, timeoutMs = 30000) {
        const start = Date.now()
        while (Date.now() - start < timeoutMs) {
            const ready = await page.evaluate(() => {
                const canvas = document.querySelector('canvas')
                return !!(canvas && canvas.width > 0 && document.querySelectorAll('*').length > 10)
            })
            if (ready) return true
            await page.waitForTimeout(500)
        }
        throw new Error('Scene did not load within timeout')
    },

    /**
     * Sample FPS over a short window using requestAnimationFrame.
     * @param {import('@playwright/test').Page} page
     * @param {number} [durationMs=2000]
     * @returns {{ fps: number, frames: number, elapsedMs: number }}
     */
    async measureFPS(page, durationMs = 2000) {
        return page.evaluate((dur) => {
            return new Promise((resolve) => {
                let frames = 0
                const start = performance.now()
                function tick() {
                    frames++
                    if (performance.now() - start < dur) {
                        requestAnimationFrame(tick)
                    } else {
                        const elapsed = performance.now() - start
                        resolve({ fps: Math.round(frames / (elapsed / 1000)), frames, elapsedMs: Math.round(elapsed) })
                    }
                }
                requestAnimationFrame(tick)
            })
        }, durationMs)
    },

    /**
     * Screenshot a specific DOM element.
     * @param {import('@playwright/test').Page} page
     * @param {string} selector — CSS selector for the element
     * @param {string} name — filename stem
     * @param {object} [opts]
     */
    async captureElementScreenshot(page, selector, name, opts = {}) {
        const el = page.locator(selector).first()
        await el.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
        const path = join(SCREENSHOT_DIR, `audit-${name}.png`)
        await el.screenshot({ path, ...opts })
        return path
    }
}
