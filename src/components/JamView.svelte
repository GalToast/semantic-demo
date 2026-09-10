<!--
  @components/JamView.svelte — Standalone full-screen live-jam surface (?jam=1).

  The radio as a music app, not a panel: transport with a live signal meter,
  state dial, band presets, progression player, MIDI/mic inputs, text vibe
  and morph steering, server-confirmed status. Mounted INSTEAD of the
  explorer shell (main.ts routes ?jam=1 here before any engine-gated chrome)
  and NEVER alongside SonicIdentity — each holds its own dial state, so
  co-mounting would split the truth.
  All audio logic lives in @lib/audio/*; this file is presentation only.

  Journey contract (tests/journey/jam-view.spec.js JAM-1..8): every control
  keeps its id, the idle .jam-status text, the summit/untested markers and
  the exact MIDI/vocal aria strings. Controls render pre-live (disabled)
  so the surface is configurable before connecting.
-->
<script lang="ts">
    import {
        startJamRadio,
        stopJamRadio,
        getRadioState,
        getRadioHeldNotes,
        setRadioNoteState,
        setRadioProg,
        playRadioProg,
        stopRadioProg,
        requestRadioProgStatus,
        setRadioBandMode,
        isMeasuredPair,
        decodePcmChunk,
        SUMMIT_STATE,
        STATE_LABELS,
        DEFAULT_PROG_SPEC,
        DEFAULT_PROG_BPM,
        type RadioState,
        type RadioBandMode,
        type RadioProgStatus
    } from '@lib/audio/jam-radio'
    import {
        startMidiInput,
        stopMidiInput,
        startMidiBridge,
        stopMidiBridge,
        bridgeChordToMidi,
        startMidiProgBridge,
        stopMidiProgBridge
    } from '@lib/audio/jam-midi'
    import { startVocalMonitor, stopVocalMonitor, isVocalMonitoring } from '@lib/audio/jam-vocal'
    import {
        sendStyleText,
        parseProgressionSpec,
        setStyleMorph,
        loadJamSettings,
        saveJamSettings,
        getRadioVolume,
        setRadioVolume
    } from '@lib/audio/jam-radio'
    import { MEASURED_SLOT_PRESETS, steerJamBandSlots, type MeasuredSlotPreset } from '@lib/audio/jam-steer'

    const savedSettings = loadJamSettings()
    let radioState = $state<RadioState>('idle')
    const live = $derived(radioState === 'live')
    const connecting = $derived(radioState === 'connecting')
    let noteState = $state(savedSettings.noteState ?? 4)
    let bandMode = $state<RadioBandMode>(savedSettings.bandMode ?? 'tone')
    let progPlaying = $state(false)
    let progStatus = $state<RadioProgStatus | null>(null)
    let midiCount = $state(0)
    let vocalOn = $state(false)
    let presetLabel = $state<string | null>(null)
    let progSpec = $state(savedSettings.progSpec ?? DEFAULT_PROG_SPEC)
    let progBpm = $state(savedSettings.progBpm ?? DEFAULT_PROG_BPM)
    let volume = $state(savedSettings.volume ?? getRadioVolume())
    let progError = $state<string | null>(null)
    let vocalDenied = $state(false)
    let connectError = $state<string | null>(null)
    // Signal readout: audio-frame count + smoothed peak level 0..1.
    // This is the user-visible answer to "is sound actually flowing".
    let audioFrames = $state(0)
    let level = $state(0)
    let meterTimer: ReturnType<typeof setInterval> | null = null

    const measured = $derived(isMeasuredPair(noteState, bandMode))
    const meterFilled = $derived(Math.round(Math.min(1, Math.max(0, level)) * 12))

    function onAudioFrame(frame?: { data?: unknown }): void {
        audioFrames += 1
        if (typeof window !== 'undefined') {
            const w = window as Window & { __audioFrames?: number }
            w.__audioFrames = (w.__audioFrames || 0) + 1
        }
        if (frame && typeof frame.data === 'string') {
            try {
                const f32 = decodePcmChunk(frame.data)
                let peak = 0
                for (let i = 0; i < f32.length; i += 4) {
                    const a = Math.abs(f32[i])
                    if (a > peak) peak = a
                }
                level = Math.max(Math.min(1, peak), level * 0.6)
            } catch {
                // malformed chunk — the frame count still tells the story
            }
        }
    }

    function onRadioState(s: RadioState): void {
        radioState = s
        if (s === 'live') {
            connectError = null
            // Apply the configured dial (restored or pre-set idle) to the
            // fresh session instead of forcing summit defaults — the rig
            // connects as it looks. Fresh profiles still land on summit.
            setRadioNoteState(noteState)
            setRadioBandMode(bandMode)
            void startMidiBridge().then(ok => {
                if (ok) bridgeChordToMidi(getRadioHeldNotes())
            })
        }
    }
    function onProgStatus(s: RadioProgStatus): void {
        progStatus = s
        if (typeof s.running === 'boolean') progPlaying = s.running
    }

    async function toggleRadio(): Promise<void> {
        if (live || getRadioState() === 'live') {
            stopRadioProg()
            progPlaying = false
            stopMidiInput()
            midiCount = 0
            stopMidiBridge()
            stopVocalMonitor()
            vocalOn = false
            stopJamRadio()
        } else {
            progStatus = null
            connectError = null
            const ok = await startJamRadio({ onState: onRadioState, onProgStatus, onAudioFrame })
            if (!ok) {
                connectError =
                    "Couldn't reach the jam server — it may be busy (measurement lease held by another session) or down. Wait a few seconds and retry."
            }
        }
    }
    function applySlotPreset(p: MeasuredSlotPreset): void {
        noteState = SUMMIT_STATE
        presetLabel = p.label
        setRadioNoteState(SUMMIT_STATE)
        void steerJamBandSlots(p.slots)
    }
    function cycleNoteState(): void {
        presetLabel = null
        noteState = (noteState + 1) % 12
        setRadioNoteState(noteState)
        void import('@lib/audio/jam-midi').then(m => {
            if (m.isMidiBridgeOn()) m.bridgeChordToMidi(getRadioHeldNotes())
        })
    }
    function stepNoteState(delta: -1 | 1): void {
        presetLabel = null
        noteState = (noteState + delta + 12) % 12
        setRadioNoteState(noteState)
    }
    function cycleBandMode(): void {
        presetLabel = null
        bandMode = bandMode === 'tone' ? 'beat' : 'tone'
        setRadioBandMode(bandMode)
    }
    function toggleProg(): void {
        if (progPlaying) {
            stopRadioProg()
            stopMidiProgBridge()
            progPlaying = false
        } else {
            // parseProgressionSpec mirrors chord_sequencer.parse_chord, which
            // throws on a bad root — a typo blocks the send with an inline
            // error instead of stranding an error slot server-side.
            let slots: { notes: number[]; frames: number }[] | null = null
            try {
                slots = parseProgressionSpec(progSpec, progBpm)
            } catch {
                slots = null
            }
            if (!slots) {
                progError = `Couldn't parse that progression — try e.g. ${DEFAULT_PROG_SPEC}.`
                return
            }
            progError = null
            setRadioProg(progSpec, progBpm)
            playRadioProg()
            requestRadioProgStatus()
            progPlaying = true
            startMidiProgBridge(slots, progBpm)
        }
    }
    function restoreSummit(): void {
        presetLabel = null
        noteState = SUMMIT_STATE
        bandMode = 'tone'
        setRadioNoteState(SUMMIT_STATE)
        setRadioBandMode('tone')
    }
    async function toggleMidi(): Promise<void> {
        if (midiCount > 0) {
            stopMidiInput()
            midiCount = 0
            return
        }
        midiCount = await startMidiInput(() => noteState)
    }
    async function toggleVocal(): Promise<void> {
        if (isVocalMonitoring()) {
            stopVocalMonitor()
            vocalOn = false
            return
        }
        vocalDenied = false
        vocalOn = await startVocalMonitor(() => noteState)
        if (!vocalOn) vocalDenied = true
    }

    let morphT = $state(savedSettings.morphT ?? 0)
    let morphDebounce: ReturnType<typeof setTimeout> | null = null

    function onMorphInput(ev: Event & { currentTarget: HTMLInputElement }): void {
        morphT = parseFloat(ev.currentTarget.value)
        if (morphDebounce) clearTimeout(morphDebounce)
        morphDebounce = setTimeout(() => {
            void setStyleMorph(morphT)
        }, 120)
    }
    let styleText = $state('')
    let styleAnchor = $state<string | null>(null)

    async function postStyleText(): Promise<void> {
        if (!styleText.trim()) return
        const anchor = await sendStyleText(styleText.trim())
        styleAnchor = anchor
        styleText = ''
    }

    function onKey(ev: KeyboardEvent): void {
        const t = ev.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
        if (ev.code === 'Space') {
            ev.preventDefault()
            void toggleRadio()
        } else if (ev.key === '[') {
            stepNoteState(-1)
        } else if (ev.key === ']') {
            stepNoteState(1)
        }
    }

    function onVolumeInput(ev: Event & { currentTarget: HTMLInputElement }): void {
        volume = parseFloat(ev.currentTarget.value)
        setRadioVolume(volume)
    }

    $effect(() => {
        setRadioVolume(volume)
        saveJamSettings({ noteState, bandMode, progSpec, progBpm, morphT, volume })
    })

    $effect(() => {
        window.addEventListener('keydown', onKey)
        meterTimer = setInterval(() => {
            if (level > 0) level = Math.max(0, level - 0.09)
        }, 120)
        return () => {
            window.removeEventListener('keydown', onKey)
            if (meterTimer) clearInterval(meterTimer)
            meterTimer = null
        }
    })

    $effect(() => () => {
        if (morphDebounce) clearTimeout(morphDebounce)
        stopRadioProg()
        stopMidiProgBridge()
        stopMidiInput()
        stopMidiBridge()
        stopVocalMonitor()
        stopJamRadio()
    })
</script>

<main class="jam-view" data-testid="jam-view" data-live={live ? 'true' : 'false'}>
    <header class="jam-head">
        <h1 class="jam-title">Live Jam <span class="jam-dot" data-on={live} aria-hidden="true"></span></h1>
        <p class="jam-status" role="status">
            {#if !live}
                {connecting ? 'Connecting…' : 'Radio idle — press play.'}
            {:else}
                Live · state {noteState} {STATE_LABELS[noteState]} · {bandMode === 'tone'
                    ? 'tone {2,11}'
                    : 'beat {2}'}{#if !measured} · <span class="jam-unmeasured">untested combo</span>{/if}{#if progPlaying}
                    · progression playing{/if}{#if midiCount > 0} · MIDI ×{midiCount}{/if}{#if vocalOn} · vocal in{/if}{#if presetLabel} · {presetLabel}{/if}
            {/if}
        </p>
        {#if connectError}
            <p class="jam-error" role="alert">{connectError}</p>
        {/if}
    </header>

    <section class="jam-card jam-transport" aria-label="Transport">
        <button
            id="jam-play"
            class="jam-play"
            type="button"
            onclick={toggleRadio}
            aria-label={live ? 'Stop live jam radio' : 'Play live jam radio'}
            aria-pressed={live}
        >
            <span aria-hidden="true">{live ? '⏸' : '▶'}</span>
            <span class="jam-play-label">{live ? 'Stop' : 'Play'}</span>
        </button>
        <div class="jam-signal">
            <div id="jam-meter" class="jam-meter" aria-hidden="true">
                {#each Array(12) as _, i}
                    <span class="jam-seg" data-on={i < meterFilled}></span>
                {/each}
            </div>
            <span id="jam-frames" class="jam-frames">{audioFrames} audio frame{audioFrames === 1 ? '' : 's'}</span>
            <label class="jam-vol-label" for="jam-volume">vol</label>
            <input
                id="jam-volume"
                class="jam-morph jam-vol"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                oninput={onVolumeInput}
                aria-label="Master volume"
            />
            {#if live && audioFrames === 0}
                <span id="jam-waiting" class="jam-waiting">Live — waiting for first audio frame…</span>
            {/if}
        </div>
    </section>

    <section class="jam-card" aria-label="Pitch dial">
        <h2 class="jam-card-title">Dial</h2>
        <div class="jam-dial-row">
            <button
                id="jam-state"
                class="jam-dial"
                type="button"
                onclick={cycleNoteState}
                disabled={!live}
                aria-label={`Pitch-slot state ${noteState}: ${STATE_LABELS[noteState]}`}
            >
                <span class="jam-dial-num">{noteState}</span>
                <small>{STATE_LABELS[noteState]}</small>
            </button>
            <button
                id="jam-band"
                class="jam-chip"
                type="button"
                onclick={cycleBandMode}
                disabled={!live}
                aria-label={bandMode === 'tone' ? 'Switch to beat preset' : 'Switch to tone preset'}
                aria-pressed={bandMode === 'beat'}
            >{bandMode === 'tone' ? '🎻 tone' : '🥁 beat'}</button>
            <button
                id="jam-summit"
                class="jam-chip"
                type="button"
                onclick={restoreSummit}
                disabled={!live}
                aria-label="Restore summit pair (state 4 + tone)">★ summit</button
            >
        </div>
        <div class="jam-dial-row jam-presets">
            {#each MEASURED_SLOT_PRESETS as p}
                <button
                    id={`jam-preset-${p.id}`}
                    class="jam-chip"
                    type="button"
                    onclick={() => applySlotPreset(p)}
                    disabled={!live}
                    aria-label={`Apply measured preset ${p.label}: ${p.blurb}`}
                    title={p.blurb}>{p.label}</button
                >
            {/each}
        </div>
    </section>

    <section class="jam-card" aria-label="Progression">
        <h2 class="jam-card-title">Progression</h2>
        <div class="jam-dial-row">
            <input
                id="jam-prog-spec"
                class="jam-style-input"
                type="text"
                bind:value={progSpec}
                placeholder={DEFAULT_PROG_SPEC}
                aria-label="Chord progression (chord beats separated by |)"
                maxlength="96"
            />
            <input
                id="jam-prog-bpm"
                class="jam-bpm-input"
                type="number"
                bind:value={progBpm}
                min="40"
                max="220"
                aria-label="Progression tempo in BPM"
            />
            {#if progError}
                <p class="jam-prog-error" role="alert">{progError}</p>
            {/if}
        </div>
        <div class="jam-dial-row">
            <button
                id="jam-prog"
                class="jam-chip"
                type="button"
                onclick={toggleProg}
                disabled={!live}
                aria-label={progPlaying ? 'Stop chord progression' : 'Play Am–F–C–G progression'}
                aria-pressed={progPlaying}
            >{progPlaying ? '⏹ prog' : '𝄢 prog'}</button>
            {#if progStatus && typeof progStatus.slots === 'number'}
                <p class="jam-prog-status">
                    Progression {progStatus.running ? 'running' : 'stopped'} — slot {(progStatus.idx ?? 0) + 1}/{progStatus.slots}
                    @ {progStatus.bpm ?? 100}bpm
                </p>
            {/if}
        </div>
    </section>

    <section class="jam-card" aria-label="Inputs">
        <h2 class="jam-card-title">Inputs</h2>
        <div class="jam-dial-row">
            <button
                id="jam-midi"
                class="jam-chip"
                type="button"
                onclick={toggleMidi}
                disabled={!live}
                aria-label={midiCount > 0 ? `MIDI on (${midiCount}) — click to disable` : 'Enable MIDI keyboard input'}
                aria-pressed={midiCount > 0}
            >🎹{midiCount > 0 ? ` ×${midiCount}` : ''}</button
            >
            <button
                id="jam-vocal"
                class="jam-chip"
                type="button"
                onclick={toggleVocal}
                disabled={!live}
                aria-label={vocalOn
                    ? 'Stop vocal monitor'
                    : vocalDenied
                      ? 'Microphone unavailable'
                      : 'Monitor voice to play the jam'}
                aria-pressed={vocalOn}
            >🎤</button
            >
        </div>
    </section>

    <section class="jam-card" aria-label="Style">
        <h2 class="jam-card-title">Style</h2>
        <div class="jam-dial-row">
            <span class="jam-morph-label">morph</span>
            <input
                id="jam-morph"
                class="jam-morph"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={morphT}
                disabled={!live}
                oninput={onMorphInput}
                aria-label="Continuous style morph t"
            />
            <span id="jam-morph-val" class="jam-morph-val">{morphT.toFixed(2)}</span>
        </div>
        <div class="jam-dial-row">
            <input
                id="jam-style"
                class="jam-style-input"
                type="text"
                bind:value={styleText}
                placeholder="Type a vibe: funky techno…"
                aria-label="Text vibe for the jam"
                maxlength="64"
            />
            <button id="jam-style-send" class="jam-chip" type="button" onclick={postStyleText} aria-label="Send text vibe"
                >💬</button
            >
            {#if styleAnchor}
                <span class="jam-style-anchor" role="status">matched: {styleAnchor}</span>
            {/if}
        </div>
        <p class="jam-hint">Space plays / stops · [ and ] step the dial · configure first, then press play.</p>
    </section>
</main>

<style>
    .jam-view {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.9rem;
        padding: 2rem 1rem 3rem;
        background: radial-gradient(ellipse at 50% 20%, #101828 0%, #05070d 70%);
        color: #e8ecf4;
    }
    .jam-head {
        text-align: center;
        max-width: 34rem;
    }
    .jam-title {
        font-size: 1.1rem;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }
    .jam-dot {
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 50%;
        background: #555;
        display: inline-block;
    }
    .jam-dot[data-on='true'] {
        background: #ff6b6b;
        box-shadow: 0 0 8px #ff6b6b;
    }
    .jam-status {
        font-size: 0.85rem;
        opacity: 0.8;
        margin: 0.5rem 0 0;
    }
    .jam-unmeasured {
        color: #ffd27d;
        font-weight: 700;
    }
    .jam-error {
        font-size: 0.8rem;
        color: #ffb4b4;
        background: rgba(255, 90, 90, 0.1);
        border: 1px solid rgba(255, 90, 90, 0.35);
        border-radius: 0.6rem;
        padding: 0.5rem 0.8rem;
        margin: 0.6rem 0 0;
    }
    .jam-card {
        width: 100%;
        max-width: 34rem;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 1rem;
        padding: 0.9rem 1rem;
    }
    .jam-card-title {
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.55;
        margin: 0 0 0.6rem;
    }
    .jam-transport {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1.2rem;
    }
    .jam-play {
        width: 5rem;
        height: 5rem;
        flex: none;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.25);
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font-size: 1.6rem;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.1rem;
    }
    .jam-play:hover {
        background: rgba(255, 255, 255, 0.16);
    }
    .jam-play-label {
        font-size: 0.62rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        opacity: 0.75;
    }
    .jam-signal {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 10rem;
    }
    .jam-meter {
        display: flex;
        gap: 3px;
    }
    .jam-seg {
        width: 0.55rem;
        height: 1.1rem;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.12);
    }
    .jam-seg[data-on='true'] {
        background: #7dd87d;
    }
    .jam-seg[data-on='true']:nth-child(n + 10) {
        background: #ffd27d;
    }
    .jam-frames {
        font-size: 0.72rem;
        opacity: 0.75;
        font-variant-numeric: tabular-nums;
    }
    .jam-waiting {
        font-size: 0.72rem;
        color: #ffd27d;
    }
    .jam-dial-row {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        flex-wrap: wrap;
        justify-content: center;
    }
    .jam-dial {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 5rem;
        padding: 0.6rem 0.9rem;
        border-radius: 0.75rem;
        border: 1px solid rgba(120, 220, 160, 0.4);
        background: rgba(120, 220, 160, 0.08);
        color: #7dd87d;
        cursor: pointer;
    }
    .jam-dial-num {
        font-size: 1.6rem;
        font-weight: 700;
        line-height: 1;
    }
    .jam-dial small {
        font-size: 0.65rem;
        opacity: 0.85;
    }
    .jam-chip {
        padding: 0.6rem 0.9rem;
        border-radius: 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font-size: 0.85rem;
        cursor: pointer;
    }
    .jam-chip:hover {
        background: rgba(255, 255, 255, 0.16);
    }
    .jam-chip[aria-pressed='true'] {
        border-color: rgba(150, 180, 255, 0.7);
        background: rgba(150, 180, 255, 0.18);
    }
    .jam-chip:disabled,
    .jam-dial:disabled,
    .jam-morph:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
    .jam-chip:focus-visible,
    .jam-dial:focus-visible,
    .jam-play:focus-visible,
    .jam-morph:focus-visible,
    .jam-style-input:focus-visible {
        outline: 2px solid #9fd0ff;
        outline-offset: 2px;
    }
    .jam-prog-status {
        font-size: 0.75rem;
        opacity: 0.7;
        margin: 0;
        width: 100%;
        text-align: center;
    }
    .jam-style-input {
        min-width: 13rem;
        flex: 1;
        padding: 0.5rem 0.7rem;
        border-radius: 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.25);
        color: inherit;
        font-size: 0.8rem;
    }
    .jam-style-anchor {
        font-size: 0.72rem;
        opacity: 0.85;
        color: #9fd0ff;
    }
    .jam-bpm-input {
        width: 4.5rem;
        padding: 0.5rem 0.5rem;
        border-radius: 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.25);
        color: inherit;
        font-size: 0.8rem;
        font-variant-numeric: tabular-nums;
    }
    .jam-prog-error {
        font-size: 0.75rem;
        color: #ffb4b4;
        margin: 0;
        width: 100%;
        text-align: center;
    }
    .jam-morph-label {
        font-size: 0.72rem;
        opacity: 0.7;
    }
    .jam-morph {
        width: 7rem;
        accent-color: #9fd0ff;
    }
    .jam-morph-val {
        font-size: 0.72rem;
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
    }
    .jam-hint {
        font-size: 0.7rem;
        opacity: 0.55;
        margin: 0.6rem 0 0;
        text-align: center;
    }
</style>
