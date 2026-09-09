# Sonic Jam Radio — Tiers 2–14

**Status:** active · JAM-1..7 and focused Sonic journey green; real-WebSocket JAM-R is environment-gated on the live jam stack
**Source:** Magenta RT2 pipeline (`mrt2/tmp/jam_server.py`, commit 03cd572 era), ear_v7.1 scorer

## What this is

The sonic style dial in the focus panel does three things now, one per tier:

| Tier         | Module                                | What it does                                                                                       |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1 — playback | `sonic-identity.ts` + `manifest.json` | Picks a pre-rendered clip keyed to the node's cluster category, plays it with fade, respects mute. |
| 2 — steering | `jam-steer.ts`                        | Fire-and-forget `POST /style {pole}` to the live MRT2 jam server.                                  |
| 3 — radio    | `jam-radio.ts`                        | WebSocket client that streams the jam's live PCM decode to the browser.                            |

The dial is a 3-way cycle: **★ best → ⚡ beat → 🔴 live → ★**. Each pole both selects a playback variant _and_ drives the jam server. Toggling to `live` opens the radio; toggling away closes it.

## Tier 2 — jam steering

`src/lib/audio/jam-steer.ts`:

```ts
export function steerJam(pole: JamPole): Promise<boolean> {
    return fetch(`${JAM_HTTP_URL}/style`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pole })
    })
        .then((r) => r.ok)
        .catch(() => false)
}
```

- `JAMPole = 'beat' | 'best'`, sourced from `JAM_HTTP_URL` in `jam-config.ts` (env-configurable via `VITE_JAM_HTTP_URL`, defaults to `http://127.0.0.1:8083`).
- **Silent no-op when the jam server is down.** The dial keeps working; only the steering is skipped. This is the whole point — the feature must not degrade the existing playback path.
- Contract mirror: `mrt2/tmp/jam_server.py` `STYLE_POLE_XY`. `beat` = centroid of techno+disco2+metal; `best` = pop neutral anchor. Verified live against the real server.

## Tier 3 — jam radio

`src/lib/audio/jam-radio.ts`. Browser client for `ws://127.0.0.1:8083/`.

**Wire contract** (server → client, JSON text frames):

- `{type:'audio', data:<base64 int16 interleaved stereo>, rate:48000}`
- `{type:'metrics', frameMs, droppedFrames, bufferAvail, bufferCap}`

Client → server:

- `{type:'note_on', note:N}` / `{type:'note_off', note:N}` / `{type:'uiReady'}` / `{type:'param', index, value}`

One live session at a time server-side; newest connection wins.

**Scope decision (2026-09-09): single-user product, no multiclient.**
Newest-wins is CORRECT here, not a limitation: one human jamming means
one stream, and reconnects take over cleanly. No mix bus, no per-client
state, no session multiplexing is planned — dev-time probe contention
(ws_probe loops flapping act["ws"]) is a coordination problem solved by
quiet windows, not architecture.

**Playback strategy:** each chunk becomes an `AudioBufferSourceNode` scheduled at a monotonically advancing `nextStart` timestamp, so bursty WS arrival still yields gapless output. A starving stream (nextStart fell behind wall clock) resynchronizes to now + a small lead.

**Held notes:** `RADIO_HELD_NOTES = [45, 52, 57, 64, 71]` — a soft A-minor add9 voicing so the stream plays unattended when nothing else is driving it.

**Public API:** `startJamRadio(ctx, onMetrics?)`, `stopJamRadio()`, `getRadioState(): RadioState` (`'idle' | 'connecting' | 'live'`), plus pure helpers `decodePcmChunk`, `chunkToAudioBuffer`, `scheduleChunk`.

## The dial UI

`src/components/sonic/SonicIdentity.svelte`:

```ts
const DIAL_ORDER: JamPole[] = ['best', 'beat', 'live']
```

`toggleStyle` cycles through the order. `best` and `beat` call `steerJam(pole)`; `live` calls `startJamRadio()` and `stopJamRadio()` on exit. The `live` pole has no pre-rendered clip — it _is_ the clip, streamed.

## Config

All endpoints live in `src/lib/audio/jam-config.ts`, env-driven:

| Env var             | Default                 | Used by        |
| ------------------- | ----------------------- | -------------- |
| `VITE_JAM_HTTP_URL` | `http://127.0.0.1:8083` | `jam-steer.ts` |
| `VITE_JAM_WS_URL`   | `ws://127.0.0.1:8083`   | `jam-radio.ts` |

Committed at `9bcd0e251` so the endpoints are configurable without touching code.

## Verification

- **Journey** (`tests/journey/sonic.spec.js`, SONIC-1..4): play control, 3-way dial cycle, jam `/style` interception, live radio chord hold. 4/4 green.
- **Standalone Jam journey** (`tests/journey/jam-view.spec.js`, JAM-1..7): engine-free surface, transport, dial/band/progression controls, vocal fallback, text steering, and continuous style morph. 8/8 green.
- **Real-WebSocket journey** (`tests/journey/jam-real.spec.js`, JAM-R): environment-gated proof of the real 8083 handshake, `uiReady`/`note_on`, and streamed audio frames; requires the live jam stack.
- **Unit** (`tests/unit-active/jam-radio.test.ts`): `decodePcmChunk`, `chunkToAudioBuffer`, held-notes, gapless resync. 14/14.
- **Build**: `npm run build` — 537 modules transformed, `[tdb-ensure] OK`, and the data-compression gate passes.
- **Historical full-unit snapshot**: 4239/4242. The 3 failures were a pre-existing merge-reland guard, unrelated.

## Known constraints

- **Port 8796 is held by mrt2-rt's LM server** (PID 4832). The project's `playwright-web-server.mjs`/`test-server.mjs` cannot start there. Worked around with `TEST_BASE_URL` + `scripts/qa-static-server.mjs` on alternate ports.
- **`record=6218` was a stale fixture** — that lead_id doesn't exist in the 8,406-point corpus. All four sonic specs now use `record=519` (Angel Fire Coffee, index 518).
- **D3D11 cold-start variance**: fixed `waitForTimeout` settle waits caused "Target page, context or browser has been closed" timeouts. Replaced with `waitForFunction` polls on the render rect.
- **Svelte 5 omits `aria-pressed` entirely when `false`** — "not live" assertions check _absence_, not the literal `'false'`.

## Minimal increment order (what's done → what's next)

1. ✅ manifest + clips, typed loader, state slice
2. ✅ playback respecting mute
3. ✅ focus-panel UI (button + badge)
4. ✅ jam steering (tier 2)
5. ✅ jam radio (tier 3)
6. ✅ journey tests + fixture fix
7. ✅ pitch-slot latent states (tier 4) — `#sonic-note-state` dial 0..11
8. ✅ summit defaults (tier 5) — state 4 + slots {2,11}, 100/100-S, whine 2.6%
9. ✅ starter clips + clusterMap expansion — `manifest.json` now covers 21
   clusters / 84 variants; all 84 referenced WAVs exist under `public/sonic`.
10. ✅ mobile surface check (CSS ownership per `docs/css-ownership.md`) —
    390×844 live JamView has every control in-bounds with no horizontal
    overflow; evidence: `tmp/sonic-jam-mobile-390x844.png`.
11. ✅ continuous style morph (tier 14) — JamView `#jam-morph` sends the
    debounced `/style_interp` contract; JAM-7 passes with the wire payload
    verified at `t=0.50` and `t=0.78`.

## Tier 4 — pitch-slot latent states

The encoder's pitch embedding has 12 trained states per slot; Google's
sampler emits 3. `note_on` carries an optional `state` 0..11
(`jam_server.py` reads `amp` or `state`, clamps 1..11, defaults 1) and the
steering loop builds `pr[p] = state`. The dial exposes `#sonic-note-state`
in live mode, cycling 0..11 and re-arming the held chord via
`setRadioNoteState()` without dropping the stream. Full results:
`docs/latent-pitch-ladder-results.md` (ladder-mode best: state 10, 95/S).

## Tier 5 — summit defaults (box-best)

The super-additive discovery (mrt2 3a71bed, `SUMMIT_RESULTS.md`): pitch
state 4 (cond 11) + slots {2,11} = **100/100-S**, the first perfect
score — and the whine-clean summit (whine 2.6% vs L2-alone's 12.8%, tempo
137; slot 11 is the non-interfering companion, slots 1 and 3 are poison).
The radio uses this as its default ambient mode:

- `RADIO_HELD_NOTES`: all five chord notes at state 4.
- `ws.onopen`: fires `steerJamBandSlots(RADIO_SUMMIT_SLOTS)` (`POST
/band_mask {slots:[2,11]}`), alongside the pitch states.
- Dial default `noteState` 4, labelled 'summit ★ 100/S'.

Both protocols (`note_on {state}` + `/band_mask {preset}`) already shipped
server-side; the radio just points at the summit values. End-to-end
confirmation (live radio at summit vs baseline, ear_v10 on streamed
output): `scripts/e2e-summit.py`.

## Tier 6 — progression player (harmonic movement)

The jam's prog engine (`prog_engine.py`: `set_prog` DSL + `play`/`stop` at
25fps into the shared held/onset sets) was unclaimed — the radio held one
static chord and never touched it. Now:

- `setRadioProg(spec, bpm)` → `{type:'prog_set', spec, bpm, loop:true}`;
  `playRadioProg()` / `stopRadioProg()`; default `Am 4 | F 4 | C 4 | G 4`.
- Dial `#sonic-prog` button in live mode toggles it. Prog rides every
  radio-stop path (leave-live, play-button stop, unmount) so a running
  progression can never outlive the stream.
- Downbeats press notes into onset (pr=2) then settle to each note's amp
  state — summit-held notes keep state 4, so harmony moves under the
  summit config instead of replacing it.
- Open question (needs the live stack): does harmonic movement preserve
  the 100/S, or do transitions collapse it? Scored prog run is the next
  experiment after the jam restart.

## Tier 7 — band preset menu (beat-vs-tone Pareto)

The whine scan's product consequence: two 100/100-S configs, different
surfaces. `setRadioBandMode('tone'|'beat')` fires
`steerJamBandSlots([2,11] vs [2])` without dropping the stream — tone for
clean (whine 2.6%), beat for pulse (beat 0.586). Dial `#sonic-band` button
in live mode cycles them; the preset resets to tone on every (re)connect
to match what the server gets at `ws.onopen`.

## Tier 8 — measured pairs (sign-reversal guard)

The style×pitch interaction reverses sign across cond 11→12 (c11: L2 +12,
all12 −11; c12: L2 −9, all12 +4), so pitch and band dials are coupled —
independent dials can serve unmeasured combos under summit branding.
`MEASURED_PAIRS` lists the ear-scored combos ({4,tone}, {4,beat});
`isMeasuredPair()` gates the UI. The LIVE badge is a button: one click
restores the summit pair. Unmeasured combos show an amber `*` marker.

## Tier 9 — MIDI keyboard input (pitch from fingers)

Web MIDI (`jam-midi.ts`) supplies pitch + timing; the ladder dial supplies
articulation. Velocity is deliberately NOT mapped onto pitch-slot states
(categorical learned states, not loudness). Note-on voices the key at the
live dial state via `pressRadioNote(note, state)`; note-off releases;
sustain pedal (CC64) defers releases. Dial `#sonic-midi` button toggles
device attach (shows count); MIDI stops with every radio stop. No-MIDI
and denied-permission resolve -1 — the dial works regardless. Zero server
changes: the note protocol already spoke it.

## JamView standalone surface (?jam=1)

The radio as a music app instead of a panel: `src/components/JamView.svelte`
mounts INSTEAD of the explorer shell when `?jam=1` (or `?view=jam`) —
before any engine-gated chrome, so no Canvas/WebGL ever mounts and the
surface costs no GPU. Never co-mounted with SonicIdentity (each holds its
own dial state). Big transport, state dial, band/prog/MIDI/mic controls,
server-confirmed status line, summit restore. Journey:
`tests/journey/jam-view.spec.js` (JAM-1..7, no WebGL needed).

## Vocal monitor

The standalone jam and the focused SonicIdentity card expose a microphone
monitor alongside MIDI. `jam-vocal.ts` requests the mic only after the user
clicks the control, runs bounded autocorrelation over an `AnalyserNode`, and
turns the quantized fundamental into the same `pressRadioNote(note, state)`
messages used by MIDI. The dial remains the articulation source; microphone
level is not mapped onto the learned pitch-slot states. Three hundred
milliseconds of genuinely unvoiced input releases the current note, and every
start/stop path disconnects the source and stops the media tracks. Permission
denial, missing Web Audio, and browsers without `getUserMedia` leave the rest
of the jam usable.

Pure signal coverage lives in `tests/unit-active/jam-vocal.test.ts`; the
standalone journey covers the control's graceful presence without requesting
permission automatically.

## Progression MIDI bridge (tier 11)

The prog button now voices the **full Am–F–C–G** through the Sampler, not
just the held chord. `jam-radio.ts` gains `parseProgressionSpec` + `parseProgChord`
— a client-side mirror of `mrt2/tmp/chord_sequencer.py`'s `parse_prog` /
`parse_chord`, so the scheduler needs no server round-trip per tick.

Why mirror the server instead of reading its `prog_status` reply? The reply
carries `slots[].notes`, but only on `prog_set` — once playback starts the
engine runs autonomously and the client must keep scheduling itself. The
mirror is pinned by `tests/unit-active/jam-prog.test.ts`, where every
expected pitch was captured by running the canonical Python against the
same spec strings.

One deliberate compatibility quirk: the server's `parse_chord` walks the
whole token while counting `#`/`b`, then parses the empty remainder. As a
result, quality and octave suffixes are ignored while accidentals still shift
the root. The client reproduces the observed server slots on purpose — if the
Sampler voices a different chord than the LM received, the two disagree.
`jam-midi.ts` adds `startMidiProgBridge` / `stopMidiProgBridge` (25 fps
`setInterval`, slot advance re-arms notes, previous slot releases).

Verification: jam-radio/progression/vocal unit suites (28/28), production build,
JAM-1..7 plus the `view=jam` alias journey, and a normal explorer deep-link
smoke are green. The jam journey also verifies that no engine asset is fetched.

## Audio style-follow (blocked on mrt2)

Design posted (msg 1584): `POST /style_from_audio {pcm_b64, sr}` → 10s
rolling buffer → MusicCoCa embed every 2-4s → tokenize → swap
`style_tokens` in the LM conditioning block. Covers speech/poetry/song
vibe-following; rap-downbeat sync and melody harmonizing stay separate
future dials.

**Status (2026-09-09): capture/queue is live; encoder application remains
open.** The route now accepts a raw-buffer upload, persists it as
`hum_queue/job_N.wav`, and returns a job id. The console's MediaRecorder path
performs the mono WAV mixdown and submits the capture. This is the first 3/4
of the pipeline, not a proof that style has been applied yet.

The encoder path itself exists: `encode_chain.py` was ground-truth-verified
against JAX for STFT maxdiff, latent diff, and code-match percentage. The
remaining dependency is `resources/spectrostream/encoder.safetensors` plus
`quantizer.safetensors`; `mrt2_small.safetensors` does not contain the
encoder. Once those weights are available, the worker can run the offline
CPU path (`hum_queue/*.wav` → STFT → encoder → RVQ → mean codes →
`style_tokens` → LM `n==48` control) without a GPU window or a live-stack
restart.

`surf_style_helper` is NOT the blocker — it lives at
`mrt2/magenta_port/surf_style_helper.py` and exports
`surf_tokens_for(x, y)` (verified live: it imports cleanly and the
current jam is serving its tokens). It takes PCA coordinates, not a
waveform, so it cannot consume audio directly. The missing piece is the
encoder/quantizer weights plus the queued worker that maps the audio through
the verified encode chain. `codex-disk` owns `jam_server.py`; coordinate that
seam before touching the live server.

The browser capture path is live; the remaining server worker must consume
the queued file and apply its result. The MusicCoCa embed is measured at ~3s
per 10s clip on CPU (`scripts/style-ear-latency.py`, deterministic, cos 1.0),
and the 914MB TFLite bundle does not fit in a browser, so encoding runs
server-side by design.

## Text-vibe steering (tier 13)

`jam-radio.ts` gains `sendStyleText` — `POST /style_text {text}` to the
live jam. mrt2-lane shipped and live-verified this endpoint ('funky
techno' matched the funky anchor, tokens identical to the standalone
probe); this is the client half. Fire-and-forget; the dial applies it
server-side without dropping the stream. Returns the matched anchor name
or null on a network/parse failure.

Why /style_text and not /style_from_audio? The audio endpoint now captures
and queues the upload, but style application still waits on the missing
encoder weights and worker. mrt2-lane's text endpoint uses 100% existing
infrastructure (no MusicCoCa at runtime), so it is the one that is actually
usable end-to-end today. The audio embedding stays queued until the worker
returns an applied style result.

JamView.svelte: `#jam-style` input + 💚 send button + matched-anchor
readout. JAM-6 pins the fetch shape.

## Continuous style morph (tier 14)

`JamView.svelte` exposes `#jam-morph`, a 0..1 range control that debounces
`POST /style_interp {t}` by 120ms so dragging does not flood the jam server.
The endpoint is live on MRT2 and acknowledges `t=0.0`, `0.5`, and `1.0`; its
server-side poison-zone clamp avoids the measured whine spike near `t=0.78`
by snapping that interval to `0.72` (Switchboard verification msg 1606).
The client sends the raw position and leaves that safety clamp server-owned.
JAM-7 (`tests/journey/jam-view.spec.js`) pins the fetch shape without requiring
the live stack.

## Surface inventory (tiers 1–14)

| Tier | Control                    | Dial                                | Verified          |
| ---- | -------------------------- | ----------------------------------- | ----------------- |
| 1–8  | pitch state + band presets | `#sonic-note-state` / `#sonic-band` | SONIC-1..8        |
| 9    | MIDI keyboard in           | `#sonic-midi`                       | SONIC-11          |
| 10   | MIDI OUT bridge            | `#sonic-midi` (bridge)              | unit 13/13        |
| 11   | progression MIDI bridge    | `#sonic-prog` / `#jam-prog`         | JAM-4, unit 10/10 |
| 12   | vocal monitor              | `#sonic-vocal` / `#jam-vocal`       | SONIC-12          |
| 13   | text-vibe steering         | `#jam-style`                        | JAM-6             |
| 14   | continuous style morph     | `#jam-morph`                        | JAM-7             |
