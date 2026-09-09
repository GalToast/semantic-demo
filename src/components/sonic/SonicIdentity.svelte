<!--
  @components/sonic/SonicIdentity.svelte — Per-node generated music clip UI.

  Shows a play/pause control and the ear_v7.1 score badge for the focused
  business's sonic identity (Magenta RT2 generated clip keyed by cluster).
  v2: the exact clip variant is picked deterministically from the node's
  leadId, so businesses of the same cluster play different takes.
  Hidden entirely when no clip resolves (manifest missing / clips empty).
-->
<script lang="ts">
  import { loadSonicManifest, pickVariantForNode, type SonicManifest, type SonicClip, type SonicStyle } from '@lib/sonic/sonic-manifest';
  import { playSonicIdentity, stopSonicIdentity, isPlaying } from '@lib/audio/sonic-identity';
  import { steerJam } from '@lib/audio/jam-steer';
  import { startJamRadio, stopJamRadio, getRadioState, setRadioNoteState } from '@lib/audio/jam-radio';
  import { setRadioProg, playRadioProg, stopRadioProg, DEFAULT_PROG_SPEC } from '@lib/audio/jam-radio';
  import { requestRadioProgStatus, type RadioProgStatus } from '@lib/audio/jam-radio';
  import { CLUSTER_NAMES } from '@lib/utils/ui-presentation';

  interface Props {
    /** Focused business record fields driving clip resolution. */
    cluster: number | null;
    leadId?: string | null;
  }

  let { cluster, leadId = null }: Props = $props();

  let manifest = $state<SonicManifest | null>(null);
  $effect(() => {
    let cancelled = false;
    loadSonicManifest().then((m) => { if (!cancelled) manifest = m; });
    return () => { cancelled = true; };
  });

  const clusterName = $derived(cluster !== null ? CLUSTER_NAMES[cluster % CLUSTER_NAMES.length] ?? null : null);

  // Style dial: 3-way cycle — ★ 'best' (ear-ranked clip), ⚡ 'beat' (max
  // beat_clarity clip), 🔴 'live' (generative radio via the MRT2 jam server).
  type Dial = 'best' | 'beat' | 'live';
  const DIAL_ORDER: Dial[] = ['best', 'beat', 'live'];
  let dial = $state<Dial>('best');
  // Clip-selection style: the live pole plays the radio, not a canned clip.
  const style = $derived<SonicStyle>(dial === 'live' ? 'best' : dial);
  const live = $derived(dial === 'live');
  let radioPlaying = $state(false);

  // Pitch-slot state for the live radio. The encoder's pitch embedding has
  // 12 trained states per slot; Google's sampler emits 3, and the radio has
  // been driving only 2. This cycles 0..11 and re-arms the held chord at the
  // new state — the server's steering loop picks it up on the next frame.
  // Visible only in live mode so it can't interfere with clip playback.
  //
  // Mapping to the MRT2 sweeps: radio noteState N -> pr[p]=N -> cond N+7.
  // Google's sampler uses cond 7/8/9 (states 0/1/2). The ladder sweep measured
  // cond 17 (state 10) at 95/S ladder-mode best; the summit (mrt2 3a71bed)
  // measured cond 11 (state 4) + slots {2,11} at 100/100-S box-best
  // (whine-clean summit, whine 2.6%).
  // Default is 4 so the dial agrees with what the radio actually holds on
  // connect (RADIO_HELD_NOTES state 4 + steerJamBandSlots summit slots).
  let noteState = $state(4);
  const STATE_LABELS: Record<number, string> = {
    0: 'silent', 1: 'held', 2: 'onset',
    3: 'free ★ documented', 4: 'summit ★ 100/S', 5: 'ghost',
    6: 'tremolo', 7: 'roll', 8: 'ping',
    9: 'swell', 10: 'ladder 95/S', 11: 'flare',
  };
  const clip = $derived(manifest ? pickVariantForNode(manifest, clusterName, leadId, style) : null);

  // Stop the radio if the focus card unmounts — never leak a live stream.
  // Prog rides along: a running progression must not outlive the radio.
  $effect(() => () => { stopRadioProg(); stopJamRadio(); });

  function cycleNoteState(): void {
    noteState = (noteState + 1) % 12;
    setRadioNoteState(noteState);
  }

  // Progression player: loads Am–F–C–G into the jam's prog engine and
  // starts it. The engine moves harmony while the summit config (state 4
  // + slots {2,11}) holds the quality. Toggle off returns to the drone.
  let progPlaying = $state(false);
  // Last server-confirmed prog status (null until the first prog_status
  // reply). The toggle is optimistic; this is ground truth when present.
  let progStatus = $state<RadioProgStatus | null>(null);
  function onProgStatus(s: RadioProgStatus): void {
    progStatus = s;
    if (typeof s.running === 'boolean') progPlaying = s.running;
  }
  function toggleProg(): void {
    if (progPlaying) {
      stopRadioProg();
      progPlaying = false;
    } else {
      setRadioProg(DEFAULT_PROG_SPEC);
      playRadioProg();
      requestRadioProgStatus();
      progPlaying = true;
    }
  }

  function toggleStyle(): void {
    const prev = dial;
    const next: Dial = DIAL_ORDER[(DIAL_ORDER.indexOf(dial) + 1) % DIAL_ORDER.length];
    dial = next;
    if (next === 'live') {
      // Radio replaces the canned clip; steer with the pole we came from so
      // the generative stream continues the mood.
      stopSonicIdentity();
      playing = false;
      void steerJam(prev === 'beat' ? 'beat' : 'best');
      void startJamRadio({ onState: (s) => { radioPlaying = s === 'live'; }, onProgStatus });
      return;
    }
    // State cycling lives on the dedicated #sonic-note-state button — the
    // style button keeps its pole-cycle contract, including a clean radio
    // stop when leaving live (SONIC-4).
    if (prev === 'live') {
      stopRadioProg();
      progPlaying = false;
      stopJamRadio();
      radioPlaying = false;
    }
    // Steer any live jam session toward the new pole (fire-and-forget; the
    // jam server may not be running — playback dial works regardless).
    void steerJam(next);
    if (playing && manifest) {
      // Swap the clip seamlessly if audio is active. Note: `clip` is still the
      // pre-toggle derived value here — resolve the next clip explicitly.
      stopSonicIdentity();
      playing = false;
      const nextClip = pickVariantForNode(manifest, clusterName, leadId, next);
      void playSonicIdentity(clusterName, nextClip?.id ?? null, leadId, next).then((ok) => { playing = ok; });
    }
  }

  let playing = $state(false);
  // Keep the local flag in sync when the clip ends naturally.
  $effect(() => {
    if (!clip) return;
    const id = clip.id;
    const t = setInterval(() => { playing = isPlaying(id); }, 500);
    return () => clearInterval(t);
  });

  function toggle(): void {
    if (live) {
      // In live mode the play button controls the generative radio.
      if (radioPlaying || getRadioState() === 'live') {
        stopRadioProg();
        progPlaying = false;
        stopJamRadio();
        radioPlaying = false;
      } else {
        void startJamRadio({ onState: (s) => { radioPlaying = s === 'live'; }, onProgStatus }).then((ok) => { radioPlaying = ok; });
      }
      return;
    }
    if (!clip) return;
    if (playing) {
      stopSonicIdentity();
      playing = false;
    } else {
      void playSonicIdentity(clusterName, clip.id, leadId, style).then((ok) => { playing = ok; });
    }
  }
</script>

{#if clip}
  <div class="sonic-identity" data-testid="sonic-identity" data-live={live ? 'true' : 'false'}>
    <button
      id="sonic-play"
      class="sonic-play"
      type="button"
      aria-label={live
        ? (radioPlaying ? 'Pause live jam radio' : 'Play live jam radio')
        : (playing ? `Pause sonic identity for ${clip.prompt}` : `Play sonic identity for ${clip.prompt}`)}
      aria-pressed={live ? radioPlaying : playing}
      onclick={toggle}
    >{live ? (radioPlaying ? '⏸' : '▶') : (playing ? '⏸' : '▶')}</button>
    <div class="sonic-meta">
      {#if live}
        <span id="sonic-live-badge" class="sonic-live">LIVE</span>
      <button
        id="sonic-note-state"
        class="sonic-note-state"
        type="button"
        aria-label={`Pitch-slot state ${noteState}: ${STATE_LABELS[noteState]}`}
        title={`Pitch-slot state ${noteState} of 11 — ${STATE_LABELS[noteState]}. Click to cycle the held chord's encoder state.`}
        onclick={cycleNoteState}
      >{noteState}<small>{STATE_LABELS[noteState]}</small></button>
      <button
        id="sonic-prog"
        class="sonic-prog"
        type="button"
        aria-label={progPlaying ? 'Stop chord progression' : 'Play Am–F–C–G progression'}
        aria-pressed={progPlaying}
        title={progStatus && typeof progStatus.slots === 'number'
          ? `Progression ${progStatus.running ? 'running' : 'stopped'} — slot ${(progStatus.idx ?? 0) + 1}/${progStatus.slots} @ ${progStatus.bpm ?? 100}bpm (server-confirmed).`
          : 'Chord progression (Am–F–C–G) through the summit config — harmonic movement experiment.'}
        onclick={toggleProg}
      >{progPlaying ? '⏹' : '𝄢'}</button>
      {:else if clip.ear}
        <span id="sonic-score" class="sonic-score sonic-score-{clip.ear.grade.toLowerCase()}">{clip.ear.score}/{clip.ear.grade}</span>
      {/if}
      <span class="sonic-prompt" title={clip.prompt}>{clip.prompt}</span>
      <button
        id="sonic-style"
        class="sonic-style"
        type="button"
        aria-label={dial === 'best'
          ? 'Switch to max-beat variant (stronger pulse)'
          : dial === 'beat'
            ? 'Switch to live generative radio'
            : 'Switch to best variant'}
        aria-pressed={live}
        title={dial === 'best'
          ? 'Best ear-ranked take'
          : dial === 'beat'
            ? 'Max beat-clarity take — strongest pulse'
            : 'Live generative radio (MRT2 jam)'}
        onclick={toggleStyle}
      >{dial === 'best' ? '★' : dial === 'beat' ? '⚡' : '🔴'}</button>
    </div>
  </div>
{/if}

<style>
  .sonic-identity {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    margin-top: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.04);
  }
  .sonic-play {
    flex: none;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 0.8rem;
    line-height: 1;
    cursor: pointer;
  }
  .sonic-play:hover { background: rgba(255, 255, 255, 0.16); }
  .sonic-style {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 0.7rem;
    line-height: 1;
    cursor: pointer;
  }
  .sonic-style:hover { background: rgba(255, 255, 255, 0.16); }
  .sonic-style[aria-pressed='true'] {
    border-color: rgba(120, 220, 160, 0.7);
    background: rgba(120, 220, 160, 0.18);
  }
  .sonic-live {
    flex: none;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: #ff6b6b;
    border: 1px solid rgba(255, 107, 107, 0.5);
    border-radius: 0.25rem;
    padding: 0 0.3rem;
    line-height: 1.5;
  }
  .sonic-note-state {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1;
    border: 1px solid rgba(120, 220, 160, 0.4);
    border-radius: 0.35rem;
    background: rgba(120, 220, 160, 0.08);
    color: #7dd87d;
    cursor: pointer;
    padding: 0.15rem 0.3rem;
  }
  .sonic-note-state small {
    font-size: 0.5rem;
    opacity: 0.8;
    text-transform: lowercase;
  }
  .sonic-note-state:hover { background: rgba(120, 220, 160, 0.18); }
  .sonic-prog {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 0.7rem;
    line-height: 1;
    cursor: pointer;
  }
  .sonic-prog:hover { background: rgba(255, 255, 255, 0.16); }
  .sonic-prog[aria-pressed='true'] {
    border-color: rgba(150, 180, 255, 0.7);
    background: rgba(150, 180, 255, 0.18);
  }
  .sonic-meta {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }
  .sonic-score {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .sonic-score-s { color: #7dd87d; }
  .sonic-score-a, .sonic-score-b { color: #d8d87d; }
  .sonic-score-c, .sonic-score-d { color: #d8a27d; }
  .sonic-score-f { color: #d87d7d; }
  .sonic-prompt {
    font-size: 0.75rem;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
