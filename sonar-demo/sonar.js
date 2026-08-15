/* global document, navigator, window, setTimeout, setInterval, clearInterval, performance */
// Sonar Lab — active acoustic echolocation.
// Emit a high-frequency chirp; cross-correlate the mic capture against the
// chirp replica; time-of-flight * speed / 2 = range of the first strong echo.
const C_SPEED = 343
const SR = 44100
const CHIRP_LO = 13000
const CHIRP_HI = 20500
const CHIRP_MS = 40
const LISTEN_MS = 80

// ----------------------------------------------------------- FFT helpers
function fft(re, im) {
    const n = re.length
    if (n <= 1) return
    const half = n >> 1
    const eR = new Array(half),
        eI = new Array(half)
    const oR = new Array(half),
        oI = new Array(half)
    for (let i = 0; i < half; i++) {
        eR[i] = re[i * 2]
        eI[i] = im[i * 2]
        oR[i] = re[i * 2 + 1]
        oI[i] = im[i * 2 + 1]
    }
    fft(eR, eI)
    fft(oR, oI)
    for (let k = 0; k < half; k++) {
        const t = (-2 * Math.PI * k) / n
        const cr = Math.cos(t),
            ci = Math.sin(t)
        const xr = oR[k] * cr - oI[k] * ci
        const xi = oR[k] * ci + oI[k] * cr
        re[k] = eR[k] + xr
        im[k] = eI[k] + xi
        re[k + half] = eR[k] - xr
        im[k + half] = eI[k] - xi
    }
}

// Cross-correlation of a (chirp) and b (capture) via FFT → power profile.
function correlate(a, b) {
    let size = 1
    while (size < a.length + b.length) size <<= 1
    const reA = new Float64Array(size),
        imA = new Float64Array(size)
    const reB = new Float64Array(size),
        imB = new Float64Array(size)
    reA.set(a)
    reB.set(b)
    fft(reA, imA)
    fft(reB, imB)
    const out = new Float64Array(size)
    for (let k = 0; k < size; k++) {
        const rr = reA[k] * reB[k] + imA[k] * imB[k]
        const ri = imA[k] * reB[k] - reA[k] * imB[k]
        reA[k] = rr
        imA[k] = ri
    }
    fft(reA, imA)
    const norm = size
    for (let i = 0; i < size; i++) out[i] = Math.hypot(reA[i], imA[i]) / norm
    return out
}

// ------------------------------------------------------------------ DOM
const goBtn = document.getElementById('go')
const distEl = document.getElementById('dist')
const matEl = document.getElementById('mat')
const cv = document.getElementById('spectro')
const g = cv.getContext('2d')
cv.width = 880
cv.height = 160

const MAXM = 10 // meters of the x-axis
const MAX_SAMPLES = Math.floor((((MAXM * 2) / C_SPEED) * SR) / 2) * 2 // 2*maxm round trip

let running = false
let audioCtx = null

function buildChirp() {
    const len = Math.floor((CHIRP_MS / 1000) * SR)
    const out = new Float32Array(len)
    const f0 = CHIRP_LO,
        f1 = CHIRP_HI
    let ph = 0
    for (let i = 0; i < len; i++) {
        const tr = i / len
        ph += (2 * Math.PI * (f0 + ((f1 - f0) * tr) / 2)) / SR // integ freq
        out[i] = 0.9 * Math.sin(ph) * Math.sin(Math.PI * tr) // raised-cos envelope
    }
    return out
}

async function start() {
    if (running) return
    running = true
    goBtn.disabled = true
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        await audioCtx.resume()
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        })
        run(stream)
    } catch (err) {
        void err
        distEl.textContent = '!'
        matEl.textContent = 'microphone unavailable — grant permission and sit near a speaker'
        running = false
        goBtn.disabled = false
    }
}

function run(stream) {
    micStream = stream
    const chirp = buildChirp()
    const src = audioCtx.createMediaStreamSource(stream)
    const recLen = Math.floor((LISTEN_MS / 1000) * SR)
    const ring = new Float32Array(recLen)
    let head = 0

    const node = audioCtx.createScriptProcessor(2048, 1, 1)
    node.onaudioprocess = (ev) => {
        const ch = ev.inputBuffer.getChannelData(0)
        for (let i = 0; i < ch.length; i++) {
            ring[head] = ch[i]
            head = (head + 1) % recLen
        }
    }
    src.connect(node)
    node.connect(audioCtx.destination) // keep graph running

    const history = [] // recent correlation profiles (for the canvas)
    const send = () => {
        if (!running) return
        const s = audioCtx.createBufferSource()
        const buf = audioCtx.createBuffer(1, chirp.length, SR)
        buf.copyToChannel(chirp, 0)
        s.buffer = buf
        s.connect(audioCtx.destination)
        s.start()
        setTimeout(() => {
            // snapshot ring window ending "now" (already written continuously)
            const cap = new Float32Array(recLen)
            for (let i = 0; i < recLen; i++) cap[i] = ring[(head + i) % recLen]
            decodeAndDraw(cap, chirp, history)
        }, LISTEN_MS + 2)
    }
    send()
    const timer = setInterval(send, LISTEN_MS + 110)
    setTimeout(() => {
        clearInterval(timer)
        running = false
    }, 120000) // 2-minute session
}

function decodeAndDraw(cap, chirp, history) {
    const prof = correlate(chirp, cap)
    // limit to the first MAX_SAMPLES taps (we care about near range)
    const n = Math.min(prof.length, MAX_SAMPLES + 1024)
    let max = 0
    for (let i = 0; i < n; i++) if (prof[i] > max) max = prof[i]
    if (max < 1e-7) return

    // find the first strong peak after the direct-path tail (~1ms): echo rank
    const startIdx = Math.floor((1.0 / 1000) * SR)
    const thresh = 0.28 // of max
    let idx = -1
    for (let i = startIdx; i < n; i++)
        if (prof[i] > max * thresh) {
            idx = i
            break
        }

    // second estimate: global max after direct
    let big = startIdx
    for (let i = startIdx; i < n; i++) if (prof[i] > prof[big]) big = i

    const dist = idx >= 0 ? ((idx / SR) * C_SPEED) / 2 : ((big / SR) * C_SPEED) / 2
    if (idx >= 0) {
        const t = dist
        distEl.textContent = t.toFixed(3).padStart(6, ' ') + ''
        // crude reflector classifier: sharpness of the selected peak
        let wid = 1
        for (let i = idx + 1; i < n; i++) {
            if (prof[i] < max * thresh * 0.5) break
            wid++
        }
        matEl.textContent = wid < 6 ? 'sharp reflector (hard/flat)' : 'broad return (soft / textured)'
    }

    // push row into history for the "echo waveform" strip
    const row = new Float32Array(MAX_SAMPLES)
    for (let i = 0; i < MAX_SAMPLES; i++) row[i] = prof[i]
    history.push(row)
    if (history.length > 60) history.shift()
    draw(history)
}

function draw(history) {
    g.fillStyle = '#080503'
    g.fillRect(0, 0, cv.width, cv.height)
    const w = cv.width,
        h = cv.height
    for (let r = 0; r < history.length; r++) {
        const row = history[r]
        const y = h - Math.round((r / (history.length - 1 || 1)) * (h - 6)) - 1
        for (let x = 0; x < w; x++) {
            const i = Math.floor((x / w) * row.length)
            const v = row[i]
            if (v > 1e-6) {
                const red = Math.min(255, Math.round(40 + v * 32000))
                g.fillStyle = `rgba(${red},${Math.round(180 - v * 5000)},120,${Math.min(1, v * 9000).toFixed(2)})`
                g.fillRect(x, y, 1, 2)
            }
        }
    }
}

goBtn.addEventListener('click', start)

// --------------------------------------------------------------------
// Doppler Watch — passive: track a stable tonal source sweeping up-and-
// down as it passes (the source's OWN pulse) → radial velocity
// v = c * (Δf) / (2*f0)   [f: observed pitch, c: speed of sound]

let micStream = null
let dopBusy = false
const dopEl = document.getElementById('dop')

dopEl.textContent = 'idle — hit DOPPLER WATCH to listen'

document.getElementById('dopGo').addEventListener('click', dopplerStart)

function dopplerStart() {
    if (dopBusy) return
    if (!micStream) {
        dopEl.textContent = 'start a sweep first (shares the mic)'
    }
    dopBusy = true

    const N = 16384
    const ring = new Float32Array(N)
    let head = 0
    const node = audioCtx.createScriptProcessor(4096, 1, 1)
    node.onaudioprocess = (ev) => {
        const ch = ev.inputBuffer.getChannelData(0)
        for (let i = 0; i < ch.length; i++) {
            ring[head] = ch[i]
            head = (head + 1) % N
        }
    }
    const src = audioCtx.createMediaStreamSource(micStream)
    src.connect(node)
    node.connect(audioCtx.destination)

    const re = new Float64Array(N)
    const im = new Float64Array(N)
    const hann = new Float64Array(N)
    for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))

    const b0 = Math.floor((70 * SR) / N)
    const b1 = Math.floor((1500 * SR) / N)
    const band = new Array(b1 - b0 + 1)

    let tone = { on: false, f: 0, min: 0, max: 0, t: 0 }
    dopEl.textContent = 'listening… (70–1500 Hz)'

    const tick = () => {
        if (!dopBusy) return
        for (let i = 0; i < N; i++) {
            re[i] = ring[(head + i) % N] * hann[i]
            im[i] = 0
        }
        fft(re, im)

        let idx = -1
        let peak = 0
        for (let i = b0; i <= b1; i++) {
            const m = re[i] * re[i] + im[i] * im[i]
            band[i - b0] = m
            if (m > peak) {
                peak = m
                idx = i
            }
        }
        // noise floor = median of band magnitude^2
        const sorted = band.slice().sort((a, b) => a - b)
        const floor = sorted[sorted.length >> 1] || 1e-12
        const f = (idx * SR) / N
        const now = performance.now()

        if (peak > floor * 30 && idx >= b0) {
            if (!tone.on) {
                tone = { on: true, f, min: f, max: f, t: now }
            } else if (Math.abs(f - tone.f) < 25 && now - tone.t < 15000) {
                tone.f = f
                tone.min = Math.min(tone.min, f)
                tone.max = Math.max(tone.max, f)
            } else {
                tone = { on: true, f, min: f, max: f, t: now }
            }
        } else if (tone.on) {
            // tonal source ended → resolve the pass
            const dF = tone.max - tone.min
            if (dF > 4) {
                const f0 = (tone.max + tone.min) / 2
                const v = (C_SPEED * dF) / (2 * f0)
                const kmh = Math.round(v * 3.6)
                const what = tone.min < CHIRP_LO && f0 < 1500 ? 'mechanical/acoustic source' : 'source'
                dopEl.textContent = `${what} passed: ${dF.toFixed(1)} Hz sweep @ ${f0.toFixed(0)} Hz → ≈ ${kmh} km/h`
            } else {
                dopEl.textContent = `tone ${f.toFixed(0)} Hz (no closing sweep)`
            }
            tone.on = false
        } else {
            const strong = Math.sqrt(peak)
            if (strong > 0.0008) dopEl.textContent = `ambient tone ${f.toFixed(0)} Hz`
        }
        setTimeout(tick, 300)
    }
    tick()

    setTimeout(() => {
        if (dopBusy) {
            dopBusy = false
            try {
                node.disconnect()
                src.disconnect()
            } catch (e) {
                void e
            }
            if (!dopEl.textContent.includes('km/h')) dopEl.textContent = 'watch stopped'
        }
    }, 120000)
}
