// JAM-PROBE. One 3-second capture that logs EVERY frame type the server
// sends, so we can see whether it streams audio at all — without the
// 8s wait that JAM-CAP uses.
import { test } from '@playwright/test'

const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8841'

test('JAM-PROBE. Log every frame the live jam sends', async ({ page }) => {
    await page.addInitScript(() => {
        window.__frames = []
        window.__types = {}
        window.__sent = []
        const RealWS = window.WebSocket
        window.WebSocket = class extends RealWS {
            constructor(url, protocols) {
                super(url, protocols)
                const origSend = this.send.bind(this)
                this.send = (data) => {
                    window.__sent.push(typeof data === 'string' ? data : '[blob]')
                    return origSend(data)
                }
                // Keep the app's own ws.onmessage handler intact. The radio
                // assigns that property after constructing the socket, so an
                // assignment here would be silently overwritten.
                this.addEventListener('message', (ev) => {
                    let msg
                    try {
                        msg = JSON.parse(ev.data)
                    } catch {
                        return
                    }
                    window.__types[msg.type] = (window.__types[msg.type] || 0) + 1
                    if (msg.type === 'audio' && typeof msg.data === 'string') {
                        const bin = atob(msg.data) // eslint-disable-line no-undef
                        const bytes = new Uint8Array(bin.length)
                        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
                        window.__frames.push(bytes.buffer)
                    }
                })
            }
        }
    })

    await page.goto(`${TEST_BASE_URL}/dist/svelte/index.html?jam=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('[data-testid="jam-view"]'), { timeout: 30000 })

    await page.evaluate(() => document.querySelector('#jam-play').click())
    const live = await page
        .waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        .catch(() => null)

    if (!live) {
        console.log('JAM DOWN')
        return
    }

    await page.waitForTimeout(3000)

    const result = await page.evaluate(() => ({
        types: window.__types,
        sent: window.__sent.slice(0, 4),
        frames: window.__frames.length,
        bytes: window.__frames.reduce((a, b) => a + b.byteLength, 0)
    }))

    console.log('FRAME TYPES FROM SERVER:', JSON.stringify(result.types))
    console.log('SENT TO SERVER:', JSON.stringify(result.sent))
    console.log(`AUDIO FRAMES: ${result.frames}, ${result.bytes} bytes`)
})
