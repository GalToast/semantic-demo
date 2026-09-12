#!/usr/bin/env node
/**
 * scripts/jam-soak-gate.mjs — Jam10 P0-3 real live soak gate (#222).
 *
 * Connects to the live jam server WS, drives a sustained audio stream
 * (prog_play + summit note_on), and asserts over the soak window:
 *   1. Frame flow     — audio frames arrive in every bucket (no stalls)
 *   2. Drop slope     — server droppedFrames rate is bounded and non-accumulating
 *   3. Clock drift    — audio-frame arrival-interval regression slope is bounded
 *   4. Buffer health  — bufferAvail stays within [0, cap] and is not monotonically
 *                       growing (server backlog / leak signal)
 *   5. Server leak    — jam PID working-set growth under a hard cap
 *
 * Usage:
 *   node scripts/jam-soak-gate.mjs [--url ws://127.0.0.1:8083/] [--seconds 300]
 *       [--buckets 30] [--report tmp/jam-soak-report.json] [--jam-pid auto]
 *       [--require-realtime]
 *
 * Exit 0 = gate passed; exit 1 = one or more assertions failed; exit 2 = could
 * not connect / preconditions missing. JSON report written even on failure.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import WebSocket from 'ws'

// ---------- CLI ----------
const args = process.argv.slice(2)
function argOf(flag, fallback) {
    const i = args.indexOf(flag)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const WS_URL = argOf('--url', 'ws://127.0.0.1:8083/')
const SOAK_SECONDS = Number(argOf('--seconds', '300'))
const BUCKET_SECONDS = Number(argOf('--buckets', '30'))
const REPORT = argOf('--report', 'tmp/jam-soak-report.json')
const JAM_PID = argOf('--jam-pid', 'auto')
const REQUIRE_REALTIME = args.includes('--require-realtime')

// Jam audio payloads are stereo signed 16-bit PCM at 48 kHz. The old gate
// counted websocket messages, which proves transport flow but not realtime.
const AUDIO_SAMPLE_RATE = 48000
const AUDIO_CHANNELS = 2
const AUDIO_BYTES_PER_SAMPLE = 2
const KEEPALIVE_MAX_PCM_BYTES = 4096

// ---------- thresholds (P0-3 gate) ----------
const T = {
    minAudioFramesPerBucket: 4, // stream must keep flowing (2 chunks/s nominal → very conservative)
    maxDroppedFramesPerMin: 60, // server-side decode/lm drop budget
    maxDriftMsPerMin: 500, // arrival-clock drift vs wall clock
    maxBufferAvailFractionGrowth: 0.9, // bufferAvail/cap must not trend to full
    maxJamRssGrowthMB: 80, // server process leak cap over the window
    minGeneratedAudioRtf: 1.0 // only enforced with --require-realtime
}

const buckets = []
const arrivalIntervals = []
let lastAudioArrival = null
let firstMetrics = null
let lastMetrics = null
let audioFrames = 0
let audioBytes = 0
let audioPcmBytes = 0
let generatedAudioPcmBytes = 0
let ws = null
let soakTimer = null
let bucketTimer = null
let silenceTimer = null
let reconnects = 0

/** Contention watchdog: another WS client (dev-page HMR, journey loop,
 * second browser tab) can steal the single act["ws"] slot — jam serves
 * audio ONLY to the newest active connection. If no frames arrive for a
 * while, reconnect and re-take the slot; count displacements. */
// CUDA-graph capture on a cold LM can take 5–10s. The server sends a short
// silence preframe before capture, so a 5s client watchdog reconnects during a
// legitimate warm-up and then collides with Jam's single-client lease. Keep
// the watchdog finite, but longer than the measured cold-start window.
const SILENCE_MS = 15000

function armSilenceWatchdog() {
    clearTimeout(silenceTimer)
    silenceTimer = setTimeout(() => {
        reconnects++
        console.log(`[soak] frame silence > ${SILENCE_MS}ms — reconnecting (displacement #${reconnects})`)
        try {
            ws?.close()
        } catch {
            /* reconnecting */
        }
        connect()
    }, SILENCE_MS)
}

function now() {
    return globalThis.performance.now()
}

function jamPid() {
    if (JAM_PID !== 'auto') return Number(JAM_PID)
    try {
        const out = execFileSync(
            'powershell',
            [
                '-NoLogo',
                '-NoProfile',
                '-Command',
                '(Get-NetTCPConnection -LocalPort 8083 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess'
            ],
            { encoding: 'utf8' }
        )
        return Number(out.trim()) || null
    } catch {
        return null
    }
}

function jamRssMB(pid) {
    if (!pid) return null
    try {
        const out = execFileSync(
            'powershell',
            ['-NoLogo', '-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet64`],
            { encoding: 'utf8' }
        )
        const bytes = Number(out.trim())
        return Number.isFinite(bytes) && bytes >= 0 ? bytes / 1048576 : null
    } catch {
        return null
    }
}

function downstreamState(pid) {
    if (!pid) return null
    try {
        const command = `$jamOwner = ${pid}; `
            + '$links = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue '
            + '| Where-Object { $_.OwningProcess -eq $jamOwner -and $_.RemoteAddress -eq "127.0.0.1" }); '
            + '[pscustomobject]@{ '
            + 'lmEstablished = @($links | Where-Object { $_.RemotePort -eq 8796 }).Count -gt 0; '
            + 'decodeEstablished = @($links | Where-Object { $_.RemotePort -eq 8797 }).Count -gt 0 '
            + '} | ConvertTo-Json -Compress'
        const out = execFileSync(
            'powershell',
            ['-NoLogo', '-NoProfile', '-Command', command],
            { encoding: 'utf8' }
        )
        const value = JSON.parse(out.trim())
        return {
            lmEstablished: value.lmEstablished === true,
            decodeEstablished: value.decodeEstablished === true
        }
    } catch {
        return null
    }
}

function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj))
}

function summarize() {
    const droppedDelta = (lastMetrics?.droppedFrames ?? 0) - (firstMetrics?.droppedFrames ?? 0)
    const elapsedSeconds = Math.max((now() - soakStart) / 1000, 0.001)
    const minutes = elapsedSeconds / 60
    // Linear-regression slope of arrival intervals over sequence (ms per minute of soak)
    let driftSlope = 0
    if (arrivalIntervals.length > 8) {
        const n = arrivalIntervals.length
        const xs = arrivalIntervals.map((_, i) => (i / n) * minutes)
        const ys = arrivalIntervals
        const mx = xs.reduce((a, b) => a + b, 0) / n
        const my = ys.reduce((a, b) => a + b, 0) / n
        const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0)
        const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0)
        driftSlope = den ? num / den : 0
    }
    const bufFractions = buckets.map((b) => b.bufFrac).filter((v) => v != null)
    const bufTrend = bufFractions.length > 4 ? bufFractions[bufFractions.length - 1] - bufFractions[0] : 0
    const stalled = buckets.filter((b) => b.audioFrames < T.minAudioFramesPerBucket).length
    const downstreamBothSamples = soak.linkSamples.filter((sample) =>
        sample.lmEstablished && sample.decodeEstablished
    ).length
    const pcmBytesPerSecond = AUDIO_SAMPLE_RATE * AUDIO_CHANNELS * AUDIO_BYTES_PER_SAMPLE
    const audioSeconds = audioPcmBytes / pcmBytesPerSecond
    const generatedAudioSeconds = generatedAudioPcmBytes / pcmBytesPerSecond
    return {
        audioFramesTotal: audioFrames,
        audioMB: +(audioBytes / 1048576).toFixed(2),
        audioWireMB: +(audioBytes / 1048576).toFixed(2),
        audioPcmMB: +(audioPcmBytes / 1048576).toFixed(2),
        generatedAudioPcmMB: +(generatedAudioPcmBytes / 1048576).toFixed(2),
        elapsedSeconds: +elapsedSeconds.toFixed(3),
        audioSeconds: +audioSeconds.toFixed(3),
        generatedAudioSeconds: +generatedAudioSeconds.toFixed(3),
        audioRtf: +(audioSeconds / elapsedSeconds).toFixed(3),
        generatedAudioRtf: +(generatedAudioSeconds / elapsedSeconds).toFixed(3),
        requireRealtime: REQUIRE_REALTIME,
        droppedFramesDelta: droppedDelta,
        dropsPerMin: +(droppedDelta / minutes).toFixed(2),
        driftMsPerMin: +driftSlope.toFixed(2),
        bufferFracFirst: bufFractions[0] ?? null,
        bufferFracLast: bufFractions[bufFractions.length - 1] ?? null,
        bufferFracTrend: +bufTrend.toFixed(3),
        stalledBuckets: stalled,
        bucketCount: buckets.length,
        downstreamLinkSamples: soak.linkSamples.length,
        downstreamBothSamples,
        downstreamLinksObserved: downstreamBothSamples > 0,
        downstreamLinkSampleDetail: soak.linkSamples,
        jamRssStartMB: soak.rssStart,
        jamRssEndMB: soak.rssEnd,
        jamRssGrowthMB: soak.rssStart != null && soak.rssEnd != null ? +(soak.rssEnd - soak.rssStart).toFixed(1) : null
    }
}

const soak = { rssStart: null, rssEnd: null, pid: null }
soak.rssSamples = []
soak.linkSamples = []

function sampleHealth() {
    const t = soakStart > 0 ? +(now() - soakStart).toFixed(0) : 0
    const rssMB = jamRssMB(soak.pid)
    if (rssMB != null) soak.rssSamples.push({ tMs: t, rssMB: +rssMB.toFixed(1) })
    const links = downstreamState(soak.pid)
    if (links) soak.linkSamples.push({ tMs: t, ...links })
}

function assertGate(s) {
    const failures = []
    if (s.audioFramesTotal < T.minAudioFramesPerBucket * 2) failures.push(`frame flow too low: ${s.audioFramesTotal}`)
    if (s.stalledBuckets > 0)
        failures.push(`${s.stalledBuckets} stalled bucket(s) (< ${T.minAudioFramesPerBucket} frames)`)
    if (REQUIRE_REALTIME && s.generatedAudioRtf < T.minGeneratedAudioRtf)
        failures.push(`generated audio RTF ${s.generatedAudioRtf}x < ${T.minGeneratedAudioRtf}x`)
    if (s.dropsPerMin > T.maxDroppedFramesPerMin)
        failures.push(`drop slope ${s.dropsPerMin}/min > ${T.maxDroppedFramesPerMin}`)
    if (Math.abs(s.driftMsPerMin) > T.maxDriftMsPerMin)
        failures.push(`clock drift ${s.driftMsPerMin}ms/min > ${T.maxDriftMsPerMin}`)
    if (!s.downstreamLinksObserved)
        failures.push('no sample observed with both Jam→LM:8796 and Jam→decode:8797 established')
    if (s.bufferFracTrend > T.maxBufferAvailFractionGrowth)
        failures.push(`buffer fill trending up: +${s.bufferFracTrend}`)
    if (s.jamRssGrowthMB != null && s.jamRssGrowthMB > T.maxJamRssGrowthMB)
        failures.push(`jam RSS grew ${s.jamRssGrowthMB}MB > ${T.maxJamRssGrowthMB}MB`)
    return failures
}

function writeReport(summary, failures, code) {
    try {
        mkdirSync(dirname(REPORT), { recursive: true })
        writeFileSync(
            REPORT,
            JSON.stringify(
                {
                    gate: 'jam-soak-p0-3',
                    url: WS_URL,
                    soakSeconds: SOAK_SECONDS,
                    thresholds: T,
                    summary,
                    failures,
                    code,
                    finishedAt: new Date().toISOString()
                },
                null,
                1
            )
        )
        console.log(`[soak] report → ${REPORT}`)
    } catch (e) {
        console.error('[soak] report write failed:', e.message)
    }
}

let soakStart = 0
let soakDone = false
let everOpened = false

function finish(code, failures) {
    if (soakDone) return
    soakDone = true
    sampleHealth()
    soak.rssEnd = jamRssMB(soak.pid)
    if (soak.rssEnd == null && soak.rssSamples.length) {
        soak.rssEnd = soak.rssSamples[soak.rssSamples.length - 1].rssMB
    }
    // Rebuild the summary after the terminal health sample so RSS and
    // downstream-link evidence cannot be omitted from the report that decides
    // the gate. Keep connection-failure code 2 distinct from assertion code 1.
    const s = summarize()
    const finalFailures = code === 2
        ? (failures ?? [])
        : [...new Set([...(failures ?? []), ...assertGate(s)])]
    const finalCode = code === 2 ? 2 : (finalFailures.length ? 1 : code)
    s.reconnects = reconnects
    writeReport(s, finalFailures, finalCode)
    console.log('[soak] summary', JSON.stringify(s, null, 1))
    if (finalCode === 0) console.log('[soak] GATE PASS')
    else console.error('[soak] GATE FAIL:', finalFailures.join('; '))
    clearTimeout(soakTimer)
    clearInterval(bucketTimer)
    clearTimeout(silenceTimer)
    try {
        ws?.close()
    } catch {
        /* noop */
    }
    setTimeout(() => process.exit(finalCode), 100)
}

function connect() {
    ws = new WebSocket(WS_URL)
    ws.on('unexpected-response', (req, res) => {
        // 409 = another lane holds the measurement lease. Cooperate: wait for
        // retry_after (capped) and retry, instead of failing the gate.
        let retry = 30
        try {
            retry = JSON.parse(res.body).retry_after ?? 30
        } catch {
            /* default */
        }
        retry = Math.min(Math.max(1, retry), 60)
        console.log(`[soak] lease held — waiting ${retry}s (window keeps running)`)
        const waitStart = now()
        const poll = setInterval(() => {
            if (soakDone || now() - waitStart >= retry * 1000) {
                clearInterval(poll)
                if (!soakDone) connect()
            }
        }, 1000)
    })
    ws.on('error', (err) => {
        console.error(`[soak] ws error: ${err.message}`)
        if (!everOpened) {
            if (now() - soakStart < SOAK_SECONDS * 1000) {
                reconnects++
                console.log(`[soak] connect refused — retrying (#${reconnects})`)
                setTimeout(connect, 2000)
            } else {
                finish(2, ['connect-failed: ' + err.message], {})
            }
        }
    })
    ws.on('open', () => {
        everOpened = true
        console.log(`[soak] open (#${reconnects + 1}) — prog_set + prog_play + summit note_on`)
        // A single held note generates only a fixed ~8s phrase (measured
        // in the first soak run: 17 frames then silence). Real sustained
        // playback needs a progression: prog_set + prog_play drives the
        // engine to press/release notes continuously at 25fps. Spec format
        // MUST be 'X N | Y N' (chord + bars, pipe-separated) — a freeform
        // string crashes the prog engine and kills the WS (measured).
        send({ type: 'prog_set', spec: 'Am 4 | F 4 | C 4 | G 4', bpm: 100, loop: true })
        send({ type: 'prog_play' })
        send({ type: 'note_on', note: 60, state: 4 })
        armSilenceWatchdog()
    })
    ws.onmessage = (ev) => {
        let msg
        try {
            msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString())
        } catch {
            return
        }
        const b = buckets[buckets.length - 1]
        if (msg.type === 'audio') {
            audioFrames++
            audioBytes += msg.data?.length ?? 0
            if (typeof msg.data === 'string') {
                try {
                    const pcmBytes = Buffer.from(msg.data, 'base64').length
                    audioPcmBytes += pcmBytes
                    // The server emits short mono PCM silence as a transport
                    // keep-alive. Exclude it from generated-audio RTF so a
                    // healthy socket cannot make a stalled generator look
                    // realtime.
                    if (pcmBytes > KEEPALIVE_MAX_PCM_BYTES) generatedAudioPcmBytes += pcmBytes
                } catch {
                    /* malformed payload is covered by the transport gate */
                }
            }
            if (b) b.audioFrames++
            const t = now()
            if (lastAudioArrival != null) arrivalIntervals.push(t - lastAudioArrival)
            lastAudioArrival = t
            armSilenceWatchdog()
        } else if (msg.type === 'metrics') {
            if (!firstMetrics) firstMetrics = msg
            lastMetrics = msg
            if (b && typeof msg.bufferCap === 'number' && msg.bufferCap > 0 && typeof msg.bufferAvail === 'number') {
                b.bufFrac = msg.bufferAvail / msg.bufferCap
            }
        }
    }
    ws.onclose = () => {
        clearTimeout(silenceTimer)
        if (soakDone || !everOpened) return
        // Displaced by another WS client (single act["ws"] slot) or dropped.
        // Reconnect until the soak window ends — a fair client should still
        // get sustained audio from a healthy stack despite contention.
        if (now() - soakStart < SOAK_SECONDS * 1000) {
            reconnects++
            console.log(`[soak] connection lost — reconnecting (#${reconnects})`)
            setTimeout(connect, 400)
        } else {
            finish(1, ['ws closed after window'])
        }
    }
}

function main() {
    soak.pid = jamPid()
    soak.rssStart = jamRssMB(soak.pid)
    soakStart = now()
    sampleHealth()
    console.log(
        `[soak] starting ${SOAK_SECONDS}s against ${WS_URL} (jam pid ${soak.pid}, rss ${soak.rssStart?.toFixed(0) ?? '?'}MB)`
    )
    bucketTimer = setInterval(() => {
        sampleHealth()
        buckets.push({ t: now() - soakStart, audioFrames: 0, bufFrac: null })
    }, BUCKET_SECONDS * 1000)
    buckets.push({ t: 0, audioFrames: 0, bufFrac: null })
    soakTimer = setTimeout(() => {
        try {
            send({ type: 'note_off', note: 60 })
        } catch {
            /* closing */
        }
        const s = summarize()
        const failures = assertGate(s)
        finish(failures.length ? 1 : 0, failures)
    }, SOAK_SECONDS * 1000)
    connect()
}

main()
