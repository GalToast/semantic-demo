<!--
  @components/JamView.svelte — Standalone full-screen live-jam surface (?jam=1).

  The radio as a music app, not a panel: big transport, state dial, band
  presets, progression player, MIDI/mic inputs, server-confirmed status.
  Mounted INSTEAD of the explorer shell (App.svelte branches on ?jam=1
  before any engine-gated chrome) and NEVER alongside SonicIdentity —
  each holds its own dial state, so co-mounting would split the truth.
  All audio logic lives in @lib/audio/*; this file is presentation only.
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
    SUMMIT_STATE,
    STATE_LABELS,
    DEFAULT_PROG_SPEC,
    DEFAULT_PROG_BPM,
    type RadioState,
    type RadioBandMode,
    type RadioProgStatus,
  } from '@lib/audio/jam-radio';
  import { startMidiInput, stopMidiInput, startMidiBridge, stopMidiBridge, bridgeChordToMidi, startMidiProgBridge, stopMidiProgBridge } from '@lib/audio/jam-midi';
  import { startVocalMonitor, stopVocalMonitor, isVocalMonitoring } from '@lib/audio/jam-vocal';
  import { sendStyleText, parseProgressionSpec, setStyleMorph } from '@lib/audio/jam-radio';
  let morphT = $state(0)
  let morphDebounce: ReturnType<typeof setTimeout> | null = null

  function onMorphInput(ev: Event & { currentTarget: HTMLInputElement }): void {
    morphT = parseFloat(ev.currentTarget.value)
    if (morphDebounce) clearTimeout(morphDebounce)
    morphDebounce = setTimeout(() => { void setStyleMorph(morphT) }, 120)
  }
  let styleText = $state('');
  let styleAnchor = $state<string | null>(null);

  async function postStyleText(): Promise<void> {
    if (!styleText.trim()) return
    const anchor = await sendStyleText(styleText.trim())
    styleAnchor = anchor
    styleText = ''
  }

  let radioState = $state<RadioState>('idle');
  const live = $derived(radioState === 'live');
  let noteState = $state(4);
  let bandMode = $state<RadioBandMode>('tone');
  let progPlaying = $state(false);
  let progStatus = $state<RadioProgStatus | null>(null);
  let midiCount = $state(0);
  let vocalOn = $state(false);
  let vocalDenied = $state(false);

  const measured = $derived(isMeasuredPair(noteState, bandMode));

  function onRadioState(s: RadioState): void {
    radioState = s;
    if (s === 'live') {
      bandMode = 'tone';
      void startMidiBridge().then((ok) => {
        if (ok) bridgeChordToMidi(getRadioHeldNotes());
      });
    }
  }
  function onProgStatus(s: RadioProgStatus): void {
    progStatus = s;
    if (typeof s.running === 'boolean') progPlaying = s.running;
  }

  async function toggleRadio(): Promise<void> {
    if (live || getRadioState() === 'live') {
      stopRadioProg();
      progPlaying = false;
      stopMidiInput();
      midiCount = 0;
      stopMidiBridge();
      stopVocalMonitor();
      vocalOn = false;
      stopJamRadio();
    } else {
      progStatus = null;
      await startJamRadio({ onState: onRadioState, onProgStatus });
    }
  }
  function cycleNoteState(): void {
    noteState = (noteState + 1) % 12;
    setRadioNoteState(noteState);
    void import('@lib/audio/jam-midi').then((m) => {
      if (m.isMidiBridgeOn()) m.bridgeChordToMidi(getRadioHeldNotes());
    });
  }
  function cycleBandMode(): void {
    bandMode = bandMode === 'tone' ? 'beat' : 'tone';
    setRadioBandMode(bandMode);
  }
  function toggleProg(): void {
    if (progPlaying) {
      stopRadioProg();
      stopMidiProgBridge();
      progPlaying = false;
    } else {
      // parseProgressionSpec mirrors chord_sequencer.parse_chord, which
      // raises ValueError on a bad root — catch it so a typo can't strand
      // the UI half-way into a toggle. The server still gets the raw spec
      // and replies with an error slot; the bridge just won't start.
      let slots: { notes: number[]; frames: number }[] | null = null
      try {
        slots = parseProgressionSpec(DEFAULT_PROG_SPEC, DEFAULT_PROG_BPM)
      } catch {
        /* bad spec — skip the bridge, server handles it */
      }
      setRadioProg(DEFAULT_PROG_SPEC, DEFAULT_PROG_BPM);
      playRadioProg();
      requestRadioProgStatus();
      progPlaying = true;
      if (slots) startMidiProgBridge(slots, DEFAULT_PROG_BPM);
    }
  }
  function restoreSummit(): void {
    noteState = SUMMIT_STATE;
    bandMode = 'tone';
    setRadioNoteState(SUMMIT_STATE);
    setRadioBandMode('tone');
  }
  async function toggleMidi(): Promise<void> {
    if (midiCount > 0) {
      stopMidiInput();
      midiCount = 0;
      return;
    }
    midiCount = await startMidiInput(() => noteState);
  }
  async function toggleVocal(): Promise<void> {
    if (isVocalMonitoring()) {
      stopVocalMonitor();
      vocalOn = false;
      return;
    }
    vocalDenied = false;
    vocalOn = await startVocalMonitor(() => noteState);
    if (!vocalOn) vocalDenied = true;
  }

  $effect(() => () => {
    stopRadioProg();
    stopMidiProgBridge();
    stopMidiInput();
    stopMidiBridge();
    stopVocalMonitor();
    stopJamRadio();
  });
</script>

<main class="jam-view" data-testid="jam-view" data-live={live ? 'true' : 'false'}>
  <h1 class="jam-title">Live Jam <span class="jam-dot" data-on={live} aria-hidden="true"></span></h1>
  <p class="jam-status" role="status">
    {#if !live}
      {radioState === 'connecting' ? 'Connecting…' : 'Radio idle — press play.'}
    {:else}
      Live · state {noteState} {STATE_LABELS[noteState]} · {bandMode === 'tone' ? 'tone {2,11}' : 'beat {2}'}{#if !measured} · <span class="jam-unmeasured">untested combo</span>{/if}{#if progPlaying} · progression playing{/if}{#if midiCount > 0} · MIDI ×{midiCount}{/if}{#if vocalOn} · vocal in{/if}
    {/if}
  </p>

  <button id="jam-play" class="jam-play" type="button" onclick={toggleRadio} aria-label={live ? 'Stop live jam radio' : 'Play live jam radio'} aria-pressed={live}>
    {live ? '⏸' : '▶'}
  </button>

  {#if live}
    <div class="jam-dial-row">
      <button id="jam-state" class="jam-dial" type="button" onclick={cycleNoteState} aria-label={`Pitch-slot state ${noteState}: ${STATE_LABELS[noteState]}`}>
        <span class="jam-dial-num">{noteState}</span>
        <small>{STATE_LABELS[noteState]}</small>
      </button>
      <button
        id="jam-band"
        class="jam-chip"
        type="button"
        onclick={cycleBandMode}
        aria-label={bandMode === 'tone' ? 'Switch to beat preset' : 'Switch to tone preset'}
        aria-pressed={bandMode === 'beat'}
      >{bandMode === 'tone' ? '🎻 tone' : '🥁 beat'}</button>
      <button
        id="jam-prog"
        class="jam-chip"
        type="button"
        onclick={toggleProg}
        aria-label={progPlaying ? 'Stop chord progression' : 'Play Am–F–C–G progression'}
        aria-pressed={progPlaying}
      >{progPlaying ? '⏹ prog' : '𝄢 prog'}</button>
    </div>
    <div class="jam-dial-row">
      <button
        id="jam-midi"
        class="jam-chip"
        type="button"
        onclick={toggleMidi}
        aria-label={midiCount > 0 ? `MIDI on (${midiCount}) — click to disable` : 'Enable MIDI keyboard input'}
        aria-pressed={midiCount > 0}
      >🎹{midiCount > 0 ? ` ×${midiCount}` : ''}</button>
      <button
        id="jam-vocal"
        class="jam-chip"
        type="button"
        onclick={toggleVocal}
        aria-label={vocalOn ? 'Stop vocal monitor' : vocalDenied ? 'Microphone unavailable' : 'Monitor voice to play the jam'}
        aria-pressed={vocalOn}
      >🎤</button>
      <span class="jam-morph-label">morph</span>
      <input id="jam-morph" class="jam-morph" type="range" min="0" max="1" step="0.01" value="0" oninput={onMorphInput} aria-label="Continuous style morph t" />
      <span id="jam-morph-val" class="jam-morph-val">{morphT.toFixed(2)}</span>
      <input id="jam-style" class="jam-style-input" type="text" bind:value={styleText} placeholder="Type a vibe: funky techno…" aria-label="Text vibe for the jam" maxlength="64" />
      <button id="jam-style-send" class="jam-chip" type="button" onclick={postStyleText} aria-label="Send text vibe">💬</button>
      {#if styleAnchor}
        <span class="jam-style-anchor" role="status">matched: {styleAnchor}</span>
      {/if}
      <button id="jam-summit" class="jam-chip" type="button" onclick={restoreSummit} aria-label="Restore summit pair (state 4 + tone)">★ summit</button>
    </div>
    {#if progStatus && typeof progStatus.slots === 'number'}
      <p class="jam-prog-status">Progression {progStatus.running ? 'running' : 'stopped'} — slot {(progStatus.idx ?? 0) + 1}/{progStatus.slots} @ {progStatus.bpm ?? 100}bpm</p>
    {/if}
  {/if}
</main>

<style>
  .jam-view {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem 1rem;
    background: radial-gradient(ellipse at 50% 30%, #101828 0%, #05070d 70%);
    color: #e8ecf4;
    text-align: center;
  }
  .jam-title {
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin: 0;
    display: flex;
    align-items: center;
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
    margin: 0;
    max-width: 28rem;
  }
  .jam-unmeasured {
    color: #ffd27d;
    font-weight: 700;
  }
  .jam-play {
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 1.8rem;
    cursor: pointer;
  }
  .jam-play:hover { background: rgba(255, 255, 255, 0.16); }
  .jam-dial-row {
    display: flex;
    gap: 0.75rem;
    align-items: stretch;
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
  .jam-dial-num { font-size: 1.6rem; font-weight: 700; line-height: 1; }
  .jam-dial small { font-size: 0.65rem; opacity: 0.85; }
  .jam-chip {
    padding: 0.6rem 0.9rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .jam-chip:hover { background: rgba(255, 255, 255, 0.16); }
  .jam-chip[aria-pressed='true'] {
    border-color: rgba(150, 180, 255, 0.7);
    background: rgba(150, 180, 255, 0.18);
  }
  .jam-prog-status { font-size: 0.75rem; opacity: 0.7; margin: 0; }
  .jam-style-input {
    min-width: 13rem;
    padding: 0.5rem 0.7rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    font-size: 0.8rem;
  }
  .jam-style-anchor { font-size: 0.72rem; opacity: 0.85; color: #9fd0ff; }
  .jam-morph-label { font-size: 0.72rem; opacity: 0.7; margin-right: 0.35rem; }
  .jam-morph { width: 7rem; accent-color: #9fd0ff; }
  .jam-morph-val { font-size: 0.72rem; opacity: 0.85; margin-left: 0.3rem; font-variant-numeric: tabular-nums; }
</style>
