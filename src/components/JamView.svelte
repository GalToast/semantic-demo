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
        type RadioProgStatus,
        type RadioMetrics
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
        setRadioVolume,
        getLastSteerNotice,
        clearLastSteerNotice,
        stallState,
        isRecorderSupported,
        isRecording,
        startJamRecording,
        stopJamRecording,
        recordingExtension
    } from '@lib/audio/jam-radio'
    import {
        MEASURED_SLOT_PRESETS,
        steerJamBandSlots,
        clampMorphT,
        type MeasuredSlotPreset
    } from '@lib/audio/jam-steer'
    import { jamResultLabel } from '@lib/audio/jam-result'
    import {
        getJamHost,
        saveJamHost,
        clearJamHost,
        getRecentJamHosts,
        resolveJamUrls,
        isPlausibleJamHost
    } from '@lib/audio/jam-config'
    import { MUSICIAN_PRESETS } from '@lib/audio/jam-presets'
    import { getRig, patchRig, subscribeRig } from '@lib/audio/jam-rig'

    const rig0 = getRig()
    const savedSettings = loadJamSettings()
    let radioState = $state<RadioState>('idle')
    const live = $derived(radioState === 'live')
    const connecting = $derived(radioState === 'connecting')
    // Rig truth is shared with SonicIdentity via jam-rig: local dials mirror
    // it, writes go through patchRig, and a subscription pulls cross-tab /
    // cross-surface changes in. Never write localStorage directly here.
    let noteState = $state(rig0.noteState)
    let bandMode = $state<RadioBandMode>(rig0.bandMode)
    let progPlaying = $state(false)
    let progStatus = $state<RadioProgStatus | null>(null)
    let midiCount = $state(0)
    let vocalOn = $state(false)
    let presetLabel = $state<string | null>(null)
    let progSpec = $state(rig0.progSpec)
    let progBpm = $state(rig0.progBpm)
    let volume = $state(rig0.volume)
    const recSupported = isRecorderSupported()
    let recActive = $state(false)
    let recUrl = $state<string | null>(null)
    let recExt = $state('webm')
    let progError = $state<string | null>(null)
    let vocalDenied = $state(false)
    let connectError = $state<string | null>(null)
    let steerNotice = $state<string | null>(null)
    let styleError = $state<string | null>(null)
    let showAdvanced = $state(false)
    // Connection screen: host override + recent hosts + active endpoints.
    let jamHost = $state(getJamHost() ?? '')
    let recentHosts = $state<string[]>(getRecentJamHosts())
    let hostError = $state<string | null>(null)
    let activeEndpoints = $state(resolveJamUrls())
    function refreshEndpoints(): void {
        try {
            activeEndpoints = resolveJamUrls()
        } catch {
            // keep last known — the connect attempt reports the failure
        }
        recentHosts = getRecentJamHosts()
    }
    // Signal readout: audio-frame count + smoothed peak level 0..1.
    // This is the user-visible answer to "is sound actually flowing".
    let audioFrames = $state(0)
    let audioAt = $state<number | null>(null)
    let level = $state(0)
    let lastMsgAt = $state<number | null>(null)
    let nowTs = $state(0)
    // Transport telemetry: buffer/drops/latency name the cause every time
    // the meter sits at zero (starving server vs stall vs suspended ctx).
    // Declared before the stall deriveds — they read it.
    let metrics = $state<RadioMetrics | null>(null)
    let meterTimer: ReturnType<typeof setInterval> | null = null
    // Split stalls: audio silence vs metrics silence are different faults
    // (dead decode vs dead steering loop). A metrics-only keepalive must not
    // mask dead audio, and background-tab timer jitter must not false-positive.
    const audioStall = $derived(live ? stallState(audioAt, nowTs, document.hidden) : 'ok')
    const metricsStall = $derived(live && metrics ? stallState(lastMsgAt, nowTs, document.hidden) : 'ok')
    const stall = $derived(audioStall === 'stalled' || metricsStall === 'stalled' ? 'stalled' : 'ok')
    const degraded = $derived(live && stall === 'stalled')

    const measured = $derived(isMeasuredPair(noteState, bandMode))
    // Displayed level follows the monitor mix: a muted rig shows a flat
    // meter instead of dancing to inaudible chunks.
    const meterFilled = $derived(Math.round(Math.min(1, Math.max(0, level)) * Math.min(1, volume) * 12))

    function onAudioFrame(frame?: { data?: unknown }): void {
        audioFrames += 1
        audioAt = Date.now()
        lastMsgAt = audioAt
        if (typeof window !== 'undefined') {
            const w = window as Window & { __audioFrames?: number }
            w.__audioFrames = (w.__audioFrames || 0) + 1
        }
        if (frame && typeof frame.data === 'string') {
            try {
                const f32 = decodePcmChunk(frame.data)
                let peak = 0
                for (let i = 0; i < f32.length; i += 4) {
                    const a = Math.abs(f32[i] ?? 0)
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
            steerNotice = getLastSteerNotice()
            // Apply the configured dial (restored or pre-set idle) to the
            // fresh session instead of forcing summit defaults — the rig
            // connects as it looks. Fresh profiles still land on summit.
            setRadioNoteState(noteState)
            void setRadioBandMode(bandMode).then((r) => {
                steerNotice = jamResultLabel(r)
            })
            void startMidiBridge().then(ok => {
                if (ok) bridgeChordToMidi(getRadioHeldNotes())
            })
        }
    }
    function onProgStatus(s: RadioProgStatus): void {
        progStatus = s
        lastMsgAt = Date.now()
        if (typeof s.running === 'boolean') progPlaying = s.running
    }
    function onMetrics(m: RadioMetrics): void {
        metrics = m
        lastMsgAt = Date.now()
    }

    async function toggleRecord(): Promise<void> {
        if (recActive) {
            recActive = false
            const url = await stopJamRecording()
            if (recUrl) URL.revokeObjectURL(recUrl)
            recUrl = url
            recExt = recordingExtension()
        } else {
            if (recUrl) {
                URL.revokeObjectURL(recUrl)
                recUrl = null
            }
            recActive = startJamRecording()
            recExt = recordingExtension()
        }
    }
    async function toggleRadio(): Promise<void> {
        if (live || getRadioState() === 'live') {
            if (recActive) {
                recActive = false
                const url = await stopJamRecording()
                if (recUrl) URL.revokeObjectURL(recUrl)
                recUrl = url
            }
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
            metrics = null
            lastMsgAt = null
            audioAt = null
            nowTs = Date.now()
            connectError = null
            steerNotice = null
            clearLastSteerNotice()
            refreshEndpoints()
            const ok = await startJamRadio({ onState: onRadioState, onProgStatus, onAudioFrame, onMetrics })
            if (!ok) {
                // Discriminate refused vs lease-held vs down: the connect
                // attempt leaves the last steering notice behind, and a
                // failed socket open means the server never answered at all.
                const notice = getLastSteerNotice()
                connectError =
                    notice ??
                    `Couldn't reach the jam server at ${activeEndpoints.ws} — it may be down. Check the Server address below, or start the jam stack and retry.`
            }
        }
    }
    function applyHost(): void {
        hostError = null
        if (!jamHost.trim()) {
            clearJamHost()
            refreshEndpoints()
            return
        }
        if (!isPlausibleJamHost(jamHost)) {
            hostError = 'That address doesn’t parse — try host:port, e.g. 192.168.1.20:8083.'
            return
        }
        const saved = saveJamHost(jamHost)
        if (!saved) {
            hostError = 'That address doesn’t parse — try host:port, e.g. 192.168.1.20:8083.'
            return
        }
        jamHost = saved
        refreshEndpoints()
    }
    function useRecentHost(h: string): void {
        jamHost = h
        hostError = null
        saveJamHost(h)
        refreshEndpoints()
    }
    function resetHost(): void {
        clearJamHost()
        jamHost = ''
        hostError = null
        refreshEndpoints()
    }
    function syncRig(): void {
        patchRig({ noteState, bandMode, progSpec, progBpm, morphT, volume })
    }
    function applySlotPreset(p: MeasuredSlotPreset): void {
        noteState = SUMMIT_STATE
        presetLabel = p.label
        setRadioNoteState(SUMMIT_STATE)
        void steerJamBandSlots(p.slots).then((r) => {
            steerNotice = jamResultLabel(r)
        })
        syncRig()
    }
    function applyMusicianPreset(id: string): void {
        const found = MUSICIAN_PRESETS.find((m) => m.id === id)
        if (!found) return
        noteState = found.state
        bandMode = found.mode
        presetLabel = found.name
        setRadioNoteState(found.state)
        void setRadioBandMode(found.mode).then((r) => {
            steerNotice = jamResultLabel(r)
        })
        syncRig()
    }
    function cycleNoteState(): void {
        presetLabel = null
        noteState = (noteState + 1) % 12
        setRadioNoteState(noteState)
        void import('@lib/audio/jam-midi').then(m => {
            if (m.isMidiBridgeOn()) m.bridgeChordToMidi(getRadioHeldNotes())
        })
        syncRig()
    }
    function stepNoteState(delta: -1 | 1): void {
        presetLabel = null
        noteState = (noteState + delta + 12) % 12
        setRadioNoteState(noteState)
        syncRig()
    }
    function cycleBandMode(): void {
        presetLabel = null
        bandMode = bandMode === 'tone' ? 'beat' : 'tone'
        void setRadioBandMode(bandMode).then((r) => {
            steerNotice = jamResultLabel(r)
        })
        syncRig()
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
        void setRadioBandMode('tone').then((r) => {
            steerNotice = jamResultLabel(r)
        })
        syncRig()
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

    let morphT = $state(rig0.morphT)
    let morphDebounce: ReturnType<typeof setTimeout> | null = null

    function onMorphInput(ev: Event & { currentTarget: HTMLInputElement }): void {
        presetLabel = null
        // SINGLE MORPH TRUTH: clamp client-side so the thumb always equals
        // the sent value — the slider never lies, then apologizes.
        morphT = clampMorphT(parseFloat(ev.currentTarget.value))
        ev.currentTarget.value = String(morphT)
        if (morphDebounce) clearTimeout(morphDebounce)
        morphDebounce = setTimeout(() => {
            void setStyleMorph(morphT).then((r) => {
                steerNotice = jamResultLabel(r)
            })
        }, 120)
        syncRig()
    }
    let styleText = $state('')
    let styleAnchor = $state<string | null>(null)

    const STYLE_SUGGESTIONS = ['funky techno', 'dark ambient drone', 'bright disco pulse', 'heavy metal drive']

    async function postStyleText(): Promise<void> {
        if (!styleText.trim()) return
        presetLabel = null
        styleError = null
        const outcome = await sendStyleText(styleText.trim())
        if (outcome.kind === 'ok') {
            styleAnchor = outcome.anchor
            styleText = ''
        } else if (outcome.kind === 'offline') {
            styleError = 'Jam server not reachable — vibe not applied.'
        } else if (outcome.kind === 'lease-held') {
            styleError = 'Another session owns the live stream — vibe not applied.'
        } else if (outcome.kind === 'rejected') {
            styleError = `Jam server declined that vibe (${outcome.status}) — try another.`
        } else {
            styleError = 'No close match — try one of the suggestions below.'
        }
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
        syncRig()
    }

    $effect(() => {
        setRadioVolume(volume)
        syncRig()
    })

    // Cross-tab / cross-surface rig sync: SonicIdentity writes arrive here.
    $effect(() => {
        const unsub = subscribeRig((s) => {
            noteState = s.noteState
            bandMode = s.bandMode
            progSpec = s.progSpec
            progBpm = s.progBpm
            morphT = s.morphT
            volume = s.volume
        })
        return unsub
    })

    // Pause stall clocks when hidden: background-tab timer jitter must not
    // false-positive a stall. nowTs still ticks so resume is instant.
    function onVisibility(): void {
        nowTs = Date.now()
    }

    $effect(() => {
        window.addEventListener('keydown', onKey)
        document.addEventListener('visibilitychange', onVisibility)
        meterTimer = setInterval(() => {
            if (level > 0) level = Math.max(0, level - 0.09)
            nowTs = Date.now()
            // Surface steering outcomes that arrived without a click context
            // (connect-time summit mask). Cleared on next user steering.
            if (!steerNotice) steerNotice = getLastSteerNotice()
        }, 120)
        return () => {
            window.removeEventListener('keydown', onKey)
            document.removeEventListener('visibilitychange', onVisibility)
            if (meterTimer) clearInterval(meterTimer)
            meterTimer = null
        }
    })

    $effect(() => () => {
        if (recUrl) URL.revokeObjectURL(recUrl)
        if (morphDebounce) clearTimeout(morphDebounce)
        stopRadioProg()
        stopMidiProgBridge()
        stopMidiInput()
        stopMidiBridge()
        stopVocalMonitor()
        stopJamRadio()
    })
</script>

<main class="jam-view" data-testid="jam-view" data-live={degraded ? 'degraded' : live ? 'true' : 'false'}>
    <header class="jam-head">
        <h1 class="jam-title">Live Jam <span class="jam-dot" data-on={live} data-degraded={degraded} aria-hidden="true"></span></h1>
        <p class="jam-status" role="status">
            {#if !live}
                {connecting ? 'Connecting…' : 'Radio idle — press play.'}
            {:else if degraded}
                Stream degraded — {audioStall === 'stalled' ? 'no audio' : 'no meter data'} for a while. Stop and press play again.
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
        {#if steerNotice}
            <p class="jam-notice" role="status">{steerNotice}</p>
        {/if}
    </header>

    <section class="jam-card" aria-label="Server connection">
        <h2 class="jam-card-title">Server</h2>
        <div class="jam-dial-row">
            <input
                id="jam-host"
                class="jam-style-input"
                type="text"
                bind:value={jamHost}
                placeholder="127.0.0.1:8083"
                aria-label="Jam server address (host and port)"
                maxlength="128"
                disabled={live}
            />
            <button id="jam-host-apply" class="jam-chip" type="button" onclick={applyHost} disabled={live} aria-label="Apply jam server address">connect</button>
            {#if jamHost}
                <button id="jam-host-reset" class="jam-chip" type="button" onclick={resetHost} disabled={live} aria-label="Reset to default server">reset</button>
            {/if}
        </div>
        {#if hostError}
            <p class="jam-prog-error" role="alert">{hostError}</p>
        {/if}
        {#if recentHosts.length > 0}
            <div class="jam-dial-row jam-recents">
                {#each recentHosts as h}
                    <button class="jam-chip jam-recent" type="button" onclick={() => useRecentHost(h)} disabled={live} aria-label={`Use jam server ${h}`}>{h}</button>
                {/each}
            </div>
        {/if}
        <p class="jam-endpoints">audio {activeEndpoints.ws} · control {activeEndpoints.http}</p>
    </section>

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
            <span id="jam-frames" class="jam-frames" role="status" aria-live="polite"
                >{audioFrames} audio frame{audioFrames === 1 ? '' : 's'}</span
            >
            {#if metrics}
                <div id="jam-health" class="jam-health" role="status" aria-label="Stream health">
                    <div class="jam-bufbar" aria-hidden="true">
                        <span
                            class="jam-buffill"
                            style={`width: ${Math.round((100 * metrics.bufferAvail) / Math.max(1, metrics.bufferCap))}%`}
                        ></span>
                    </div>
                    <span class="jam-health-text"
                        >buf {metrics.bufferAvail}/{metrics.bufferCap} · {metrics.droppedFrames} dropped · {metrics.frameMs}ms/frame</span
                    >
                </div>
            {/if}
            {#if recSupported}
                <button
                    id="jam-record"
                    class="jam-chip"
                    type="button"
                    onclick={toggleRecord}
                    disabled={!live}
                    aria-label={recActive ? 'Stop recording the session' : 'Record the session to a file'}
                    aria-pressed={recActive}>{recActive ? '■ stop' : '● rec'}</button
                >
                {#if recUrl}
                    <a id="jam-download" class="jam-chip jam-download" href={recUrl} download={`jam-session.${recExt}`}>⤓ take</a>
                {/if}
            {/if}
            <label class="jam-vol-label" for="jam-volume">vol</label>
            <input
                id="jam-volume"
                class="jam-morph jam-vol"
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={volume}
                oninput={onVolumeInput}
                aria-label="Master volume, up to 200 percent boost"
            />
            <span id="jam-vol-val" class="jam-morph-val">{Math.round(volume * 100)}%</span>
            {#if live && audioFrames === 0}
                <span id="jam-waiting" class="jam-waiting">Live — waiting for first audio frame…</span>
            {/if}
            {#if stall === 'stalled'}
                <p id="jam-stalled" class="jam-error" role="alert">
                    {#if audioStall === 'stalled' && metricsStall === 'stalled'}
                        Stream stalled — no audio or meter data for a while. The connection may be half-open; stop and press play again.
                    {:else if audioStall === 'stalled'}
                        No audio for a while — the decoder may be down (meter still alive). Stop and press play again.
                    {:else}
                        No meter data for a while — audio still flowing. The steering loop may be down.
                    {/if}
                </p>
            {/if}
        </div>
    </section>

    <section class="jam-card" aria-label="Voices">
        <h2 class="jam-card-title">Voices</h2>
        <div class="jam-dial-row">
            {#each MUSICIAN_PRESETS as m}
                <button
                    id={`jam-voice-${m.id}`}
                    class="jam-chip"
                    type="button"
                    onclick={() => applyMusicianPreset(m.id)}
                    disabled={!live}
                    aria-label={`${m.name}: ${m.musical}`}
                    aria-pressed={presetLabel === m.name}
                    title={m.musical}>{m.name}</button
                >
            {/each}
            <button
                id="jam-summit"
                class="jam-chip"
                type="button"
                onclick={restoreSummit}
                disabled={!live}
                aria-label="Restore summit pair (state 4 + tone)">★ summit</button
            >
        </div>
        <div class="jam-dial-row">
            <button
                id="jam-advanced-toggle"
                class="jam-chip jam-subtle"
                type="button"
                onclick={() => (showAdvanced = !showAdvanced)}
                aria-expanded={showAdvanced}
                aria-controls="jam-advanced"
                >{showAdvanced ? '▾ hide lab dials' : '▸ lab dials'}</button
            >
        </div>
        {#if showAdvanced}
            <div id="jam-advanced" class="jam-dial-row">
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
        {/if}
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
            {#if styleError}
                <p class="jam-prog-error" role="alert">{styleError}</p>
            {/if}
        </div>
        {#if !live}
            <div class="jam-dial-row jam-suggest">
                {#each STYLE_SUGGESTIONS as s}
                    <button
                        class="jam-chip jam-subtle"
                        type="button"
                        onclick={() => {
                            styleText = s
                        }}
                        aria-label={`Try vibe ${s}`}>{s}</button
                    >
                {/each}
            </div>
        {/if}
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
    .jam-dot[data-degraded='true'] {
        background: #ffd27d;
        box-shadow: 0 0 8px #ffd27d;
    }
    .jam-status {
        font-size: 0.85rem;
        opacity: 0.8;
        margin: 0.5rem 0 0;
    }
    .jam-notice {
        font-size: 0.78rem;
        color: #ffd27d;
        background: rgba(255, 210, 125, 0.08);
        border: 1px solid rgba(255, 210, 125, 0.35);
        border-radius: 0.6rem;
        padding: 0.5rem 0.8rem;
        margin: 0.6rem 0 0;
    }
    .jam-endpoints {
        font-size: 0.68rem;
        opacity: 0.65;
        margin: 0.5rem 0 0;
        text-align: center;
        word-break: break-all;
    }
    .jam-recents {
        margin-top: 0.5rem;
    }
    .jam-recent {
        font-size: 0.72rem;
        padding: 0.4rem 0.7rem;
    }
    .jam-subtle {
        opacity: 0.85;
        font-size: 0.75rem;
        padding: 0.45rem 0.75rem;
    }
    .jam-suggest {
        margin-top: 0.5rem;
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
        opacity: 0.7;
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
    .jam-health {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .jam-bufbar {
        height: 0.4rem;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.12);
        overflow: hidden;
    }
    .jam-buffill {
        display: block;
        height: 100%;
        background: #9fd0ff;
    }
    .jam-health-text {
        font-size: 0.7rem;
        opacity: 0.75;
        font-variant-numeric: tabular-nums;
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
        opacity: 0.85;
    }
    .jam-vol-label {
        font-size: 0.72rem;
        opacity: 0.85;
    }
    .jam-download {
        text-decoration: none;
    }
    .jam-morph {
        width: 10rem;
        min-height: 2.75rem;
        accent-color: #9fd0ff;
    }
    @media (max-width: 28rem) {
        .jam-transport {
            flex-direction: column;
            gap: 0.9rem;
        }
        .jam-morph {
            width: 100%;
        }
        .jam-style-input {
            min-width: 0;
        }
    }
    .jam-morph-val {
        font-size: 0.72rem;
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
    }
    .jam-hint {
        font-size: 0.75rem;
        opacity: 0.9;
        margin: 0.6rem 0 0;
        text-align: center;
    }
</style>
