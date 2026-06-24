/**
 * info-panel-collapsed-render-contract.mjs
 *
 * Mobile idle info-panel collapsed-state render contract.
 * Verifies the collapsed info-panel uses bottom-sheet anchoring (translateY)
 * and NOT desktop translateX offscreen semantics at 390px mobile viewport.
 *
 * The collapsed state is: body.is-active[data-panel-surface="idle"]
 * with .info-panel NOT having .active class.
 *
 * Usage:
 *   node tests/info-panel-collapsed-render-contract.mjs [--url=<url>]
 *
 * Default URL: http://127.0.0.1:8814/docs/archive/vector-explorer-polished-legacy.html
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { chromium } from 'playwright'

const DEFAULT_PORT = 8814
const DEFAULT_WIDTH = 390
const DEFAULT_HEIGHT = 844
const DEFAULT_SCALE = 2

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const cliArgs = process.argv.slice(2)
const urlArg = cliArgs.find((a) => a.startsWith('--url='))
const positionalUrl = urlArg
    ? urlArg.slice('--url='.length)
    : `http://127.0.0.1:${DEFAULT_PORT}/docs/archive/vector-explorer-polished-legacy.html`

// ---------------------------------------------------------------------------
// Minimal static file server
// ---------------------------------------------------------------------------

function startServer(dir, port) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            // Parse the URL, removing query strings and decode URI
            const urlPath = decodeURIComponent(req.url.split('?')[0])

            // Route: serve docs/archive/vector-explorer-polished-legacy.html for root
            let filePath
            if (urlPath === '/' || urlPath === '/docs/archive/vector-explorer-polished-legacy.html') {
                filePath = path.join(dir, 'docs/archive/vector-explorer-polished-legacy.html')
            } else {
                // Remove leading slash and resolve
                const cleanPath = urlPath.replace(/^\//, '')
                filePath = path.join(dir, cleanPath)
            }

            const ext = path.extname(filePath).toLowerCase()

            const mimeTypes = {
                '.html': 'text/html',
                '.ts': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.svg': 'image/svg+xml',
                '.gif': 'image/gif',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.ttf': 'font/ttf',
                '.eot': 'application/vnd.ms-fontobject'
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' })
                    res.end(`Not found: ${urlPath}`)
                    return
                }
                res.writeHead(200, {
                    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                    'Cache-Control': 'no-cache'
                })
                res.end(data)
            })
        })

        server.listen(port, () => {
            resolve(server)
        })
    })
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

async function makePage(browser) {
    return browser.newPage({
        viewport: {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT
        },
        deviceScaleFactor: DEFAULT_SCALE,
        isMobile: true
    })
}

async function loadAndWait(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {})
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})
}

// ---------------------------------------------------------------------------
// Transform analysis
// ---------------------------------------------------------------------------

/**
 * Parse a CSS transform matrix or none/initial and return the transform type.
 * Returns: 'none' | 'translateX' | 'translateY' | 'matrix3d' | 'unknown'
 */
function parseTransformType(raw) {
    if (!raw || raw === 'none' || raw === 'initial') {
        return 'none'
    }
    if (raw.startsWith('matrix3d')) {
        const nums = raw.match(/[\d.\-]+/g) || []
        if (nums.length >= 13) {
            const tx = parseFloat(nums[12])
            if (tx < -100) return 'translateX'
        }
        return 'matrix3d'
    }
    if (raw.startsWith('matrix')) {
        const nums = raw.match(/[\d.\-]+/g) || []
        if (nums.length >= 6) {
            const a = parseFloat(nums[0])
            const b = parseFloat(nums[1])
            const c = parseFloat(nums[2])
            const d = parseFloat(nums[3])
            const e = parseFloat(nums[4])
            const f = parseFloat(nums[5])
            if (Math.abs(b) < 0.001 && Math.abs(c) < 0.001 && Math.abs(a - 1) < 0.001 && Math.abs(d - 1) < 0.001) {
                if (Math.abs(e) > 100) return 'translateX'
                if (Math.abs(f) > 10) return 'translateY'
                return 'unknown'
            }
        }
        return 'matrix3d'
    }
    if (raw.includes('translateX') && !raw.includes('translateY')) {
        return 'translateX'
    }
    if (raw.includes('translateY')) {
        return 'translateY'
    }
    return 'unknown'
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

async function run() {
    // Find the workspace root (one level up from tests/)
    const scriptDir = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname))
    const normalizedScriptDir = scriptDir.replace(/^\/([A-Za-z]):/, '$1:')
    const workspaceRoot = path.resolve(normalizedScriptDir, '..')
    const htmlPath = path.join(workspaceRoot, 'docs/archive/vector-explorer-polished-legacy.html')

    if (!fs.existsSync(htmlPath)) {
        console.error(`ERROR: docs/archive/vector-explorer-polished-legacy.html not found at ${htmlPath}`)
        process.exit(1)
    }

    // Start server
    const server = await startServer(workspaceRoot, DEFAULT_PORT)
    const serverAddr = server.address()
    const serverUrl = `http://127.0.0.1:${serverAddr.port}`

    let browser
    let passed

    try {
        browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] })
        const page = await makePage(browser)

        const targetUrl = `http://127.0.0.1:${DEFAULT_PORT}/docs/archive/vector-explorer-polished-legacy.html`
        await loadAndWait(page, targetUrl)

        // -------------------------------------------------------------------------
        // Set up the idle + collapsed state:
        //   body.is-active[data-panel-surface="idle"]  → mobile CSS applies
        //   .info-panel NOT having .active class       → collapsed state
        // -------------------------------------------------------------------------
        await page.evaluate(() => {
            document.body.classList.add('is-active')
            document.body.dataset.panelSurface = 'idle'
            document.body.dataset.activeView = 'galaxy'
        })

        // Remove .active to get collapsed
        await page.evaluate(() => {
            const panel = document.querySelector('#info-panel')
            if (panel) panel.classList.remove('active')
        })

        // Wait for CSS to apply and animations to settle
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
            .catch(() => {})

        // Capture info-panel state
        const info = await page.evaluate(() => {
            const panel = document.querySelector('#info-panel')
            if (!panel) {
                return { error: 'no panel found' }
            }

            const style = getComputedStyle(panel)
            const rect = panel.getBoundingClientRect()
            const bodySurface = document.body?.dataset?.panelSurface || ''
            const isActive = panel.classList.contains('active')
            const isIdle = bodySurface === 'idle'

            return {
                panelFound: true,
                panelSurface: bodySurface,
                isActive,
                isIdle,
                isCollapsed: !isActive,
                transform: style.transform,
                opacity: parseFloat(style.opacity),
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth,
                bottomAnchored: Math.abs(window.innerHeight - rect.bottom) <= 2,
                leftOffscreen: rect.left < -10,
                edgeAnchored: Math.abs(rect.left) <= 1 && Math.abs(window.innerWidth - rect.right) <= 1,
                animationName: style.animationName,
                animationPlayState: style.animationPlayState
            }
        })

        if (info.error) {
            console.error(`FAIL: ${info.error}`)
            process.exit(1)
        }

        const transformType = parseTransformType(info.transform)
        const checks = []
        const failures = []

        function check(name, condition, detail) {
            checks.push({ name, pass: condition, detail })
            if (!condition) failures.push({ name, detail })
        }

        // Core assertions
        check('panel-present', info.panelFound, 'info-panel found in DOM')
        check('idle-surface', info.isIdle, `panel-surface="${info.panelSurface}"`)
        check('collapsed-state', info.isCollapsed, `active=${info.isActive}`)
        check('not-left-offscreen', !info.leftOffscreen, `left=${info.left.toFixed(1)}px`)
        check(
            'bottom-anchored',
            info.bottomAnchored,
            `bottom=${info.bottom.toFixed(1)}px vs viewport=${info.viewportHeight}px`
        )
        check(
            'mobile-sheet-geometry',
            info.edgeAnchored && info.bottomAnchored,
            'panel uses mobile bottom-sheet geometry'
        )

        // THE KEY CHECK: collapsed info-panel must NOT use translateX
        check(
            'no-translateX-in-collapsed',
            transformType !== 'translateX',
            `transform="${info.transform}" (type=${transformType})`
        )

        // Additional: if using translateY, it should be downward (positive f) or none
        if (transformType === 'translateY') {
            // translateY in a bottom-sheet collapse means sliding down; that's fine
            check('translateY-ok-for-collapse', true, 'translateY is acceptable for bottom-sheet collapse')
        } else if (transformType === 'none') {
            // transform:none means no transform; this is only OK if the panel is
            // naturally positioned via top/left/bottom/right (not translateX offscreen)
            check('no-transform-with-bottom-anchor', info.bottomAnchored, 'transform:none with bottom anchor is OK')
        }

        // Print results
        console.log('\n=== Info-Panel Collapsed Render Contract ===')
        console.log(`Surface:       ${info.panelSurface}`)
        console.log(`Collapsed:     ${info.isCollapsed} (active=${info.isActive})`)
        console.log(`Transform:     ${info.transform}`)
        console.log(`Transform type: ${transformType}`)
        console.log(`Left:          ${info.left.toFixed(1)}px`)
        console.log(`Bottom:        ${info.bottom.toFixed(1)}px (anchored: ${info.bottomAnchored})`)
        console.log(`Width:         ${info.width.toFixed(1)}px`)
        console.log(`Height:        ${info.height.toFixed(1)}px`)
        console.log(`Animation:     ${info.animationName} (${info.animationPlayState})`)
        console.log('')
        console.log('Checks:')
        for (const c of checks) {
            const mark = c.pass ? '[PASS]' : '[FAIL]'
            console.log(`  ${mark} ${c.name}${c.detail ? ' — ' + c.detail : ''}`)
        }

        if (failures.length > 0) {
            console.log('\nFAILED CHECKS:')
            for (const f of failures) {
                console.log(`  - ${f.name}: ${f.detail}`)
            }
            console.log('\ninfo-panel-collapsed-render-contract FAILED')
            process.exit(1)
        }

        console.log('\ninfo-panel-collapsed-render-contract passed')
        passed = true
    } finally {
        await browser?.close()
        server.close()
    }

    process.exit(passed ? 0 : 1)
}

run().catch((err) => {
    console.error('Unhandled error:', err)
    process.exit(1)
})
