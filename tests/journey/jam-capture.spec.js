// JAM-CAP. Capture the REAL audio stream the live jam sends to a real
// browser, and write it to /c/tmp/jam_live.wav.
//
// Why a Playwright test and not a raw-socket script: the server's
// WebSocket is an asyncio AsyncWS (jam_server.py:625) that sends
// server->client frames UNMASKED (0x81, no MASK bit, line 319) while
// expecting client frames MASKED (ws_recv_frame:245). A raw socket that
// gets either half wrong hangs in recv(). Playwright's WebSocket
// handles both correctly, so it is the only honest way to capture the
// stream from inside the page.
//
// Writes /c/tmp/jam_live.wav — int16 interleaved stereo 48kHz, exactly
// what the server streams (see jam-radio.ts chunkToAudioBuffer).
//
// Skips cleanly when the live stack is down, so it is safe to run
// anywhere. It is a capture harness, not a contract test.

import { test } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'

const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8841'

test('JAM-CAP. Capture live jam audio to /c/tmp/jam_live.wav', async ({ page }) => {
    try { mkdirSync('C:/tmp', { recursive: true }) } catch { /* best-effort */ }

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
                    try { msg = JSON.parse(ev.data) } catch { return }
                    window.__types[msg.type] = (window.__types[msg.type] || 0) + 1
                    if (msg.type === 'audio' && typeof msg.data === 'string') {
                        // atob is a browser global — this runs inside the page,
                        // not in Node. The linter doesn't know that.
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
    const live = await page.waitForFunction(
        () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
        { timeout: 30000 }
    ).catch(() => null)

    if (!live) {
        console.log('JAM DOWN — stack not up, nothing to capture')
        return
    }

    // Record 8 seconds of real streaming.
    await page.waitForTimeout(8000)

    const result = await page.evaluate(() => ({
        frames: window.__frames,
        types: window.__types,
        sent: window.__sent.slice(0, 4),
    }))

    console.log('frame types from server:', JSON.stringify(result.types))
    console.log('messages sent to server:', JSON.stringify(result.sent))

    const totalBytes = result.frames.reduce((a, b) => a + b.byteLength, 0)
    console.log(`captured ${result.frames.length} audio frames, ${totalBytes} bytes`)

    if (result.frames.length > 0) {
        const total = result.frames.reduce((a, b) => a + b.byteLength, 0)
        const out = new Uint8Array(total)
        let off = 0
        for (const buf of result.frames) {
            out.set(new Uint8Array(buf), off)
            off += buf.byteLength
        }
        const wav = buildWav(out, 48000, 2, 2)
        writeFileSync('C:/tmp/jam_live.wav', wav)
        console.log(`wrote C:/tmp/jam_live.wav (${wav.length} bytes)`)
    } else {
        console.log('NO AUDIO — server sent zero audio frames')
    }
})

function buildWav(pcm, sampleRate, numChannels, bytesPerSample) {
    const blockAlign = numChannels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataLen = pcm.length
    const buffer = new ArrayBuffer(44 + dataLen)
    const view = new DataView(buffer)
    let off = 0
    const s = (str) => { for (let i = 0; i < str.length; i++) view.setUint8(off++, str.charCodeAt(i)) }
    s('RIFF')
    view.setUint32(off, 36 + dataLen, true); off += 4
    s('WAVE')
    s('fmt ')
    view.setUint32(off, 16, true); off += 4
    view.setUint16(off, 1, true); off += 2
    view.setUint16(off, numChannels, true); off += 2
    view.setUint32(off, sampleRate, true); off += 4
    view.setUint32(off, byteRate, true); off += 4
    view.setUint16(off, blockAlign, true); off += 2
    view.setUint16(off, bytesPerSample * 8, true); off += 2
    s('data')
    view.setUint32(off, dataLen, true); off += 4
    new Uint8Array(buffer, 44).set(pcm)
    return Buffer.from(buffer)
}
