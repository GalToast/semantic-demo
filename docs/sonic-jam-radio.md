# Sonic Jam Radio — Tiers 2–14

**Status:** active · JAM-1..18, JAM-RC reconnect safety, baseline JAM-R, shared audio engine/limiter, and live continuous-style interpolation apply/draw are green; quality continuity remains open in follow-up #224
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
export function steerJam(pole: JamPole): Promise<JamResult<boolean>> {
    return postJson(styleUrl(), { pole })
}
```

- `JAMPole = 'beat' | 'best'`, sourced from `JAM_HTTP_URL` in `jam-config.ts` (env-configurable via `VITE_JAM_HTTP_URL`, defaults to `http://127.0.0.1:8083`).
- **Discriminated failure results:** `ok`, `offline`, `lease-held`, or `rejected`. The dial keeps working when the jam server is down, while JamView surfaces the reason instead of silently swallowing it.
- Contract mirror: `mrt2/tmp/jam_server.py` `STYLE_POLE_XY`. `beat` = centroid of techno+disco2+metal; `best` = pop neutral anchor. Verified live against the real server.

## Tier 3 — jam radio

`src/lib/audio/jam-radio.ts`. Browser client for `ws://127.0.0.1:8083/`.

**Wire contract** (server → client, JSON text frames):

- `{type:'audio', data:<base64 int16 interleaved stereo>, rate:48000}`
- `{type:'metrics', frameMs, droppedFrames, bufferAvail, bufferCap}`

`bufferAvail/bufferCap` report the bounded server-side decode-input queue.
Current MRT2 Jam builds may also include `audioBufferAvail`, `decodeMs`, and
`decodeBlockFrames` for diagnostics; clients must tolerate those additive
fields. The live torch path keeps its decode TCP connection open across
length-prefixed requests, and batches 16 fresh token frames with retained
context before emitting audio.

Client → server:

- `{type:'note_on', note:N}` / `{type:'note_off', note:N}` / `{type:'uiReady'}` / `{type:'param', index, value}`

One live measurement session at a time server-side, enforced by an explicit
lease. The owner retains its metrics/audio stream; a competing probe receives
HTTP 409 while the lease is active, and an owner reconnect can reacquire it.
The lease expires after a bounded TTL so an abandoned session cannot block the
single-user UI forever. No mix bus, per-client stream state, or session
multiplexing is planned.

**Playback strategy:** each chunk becomes an `AudioBufferSourceNode` scheduled at a monotonically advancing `nextStart` timestamp, so bursty WS arrival still yields gapless output. A starving stream (nextStart fell behind wall clock) resynchronizes to now + a small lead.

**Held notes:** `RADIO_HELD_NOTES = [45, 52, 57, 64, 71]` — a soft A-minor add9 voicing so the stream plays unattended when nothing else is driving it.

**Public API:** `startJamRadio(events?)`, `stopJamRadio()`, `getRadioState(): RadioState` (`'idle' | 'connecting' | 'live'`), plus pure helpers `decodePcmChunk`, `chunkToAudioBuffer`, `scheduleChunk`.

## Shared audio engine

`src/lib/audio/jam-engine.ts` is the only production owner that constructs an
`AudioContext`. It builds one `masterGain -> DynamicsCompressor -> destination`
chain, applies the persisted 0..2 volume as a v² gain taper, and exposes the
post-gain recorder/analyser taps. Jam Radio, the reactive audio scape (including
corridor blooms), SonicIdentity playback, and the vocal monitor all reuse that
context. Scape teardown disconnects only its own oscillator/filter/gain nodes;
it never closes the shared context while another surface may still be playing.

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
- **Standalone Jam journey** (`tests/journey/jam-view.spec.js`, JAM-1..18): engine-free surface, initial socket connection, transport, dial/band/progression controls, vocal fallback, text steering, connection screen, and continuous style morph. 19/19 green.
- **Reconnect journey** (`tests/journey/jam-reconnect.spec.js`, JAM-RC.1..2): a live socket drop reconnects, while the Stop control cancels backoff without resurrecting the radio. 2/2 green.
- **Real-WebSocket journey** (`tests/journey/jam-real.spec.js`, JAM-R): environment-gated proof of the real 8083 handshake, `uiReady`/`note_on`, and streamed audio frames; requires the live jam stack.
- **Strict JAM-R result (2026-09-10):** an initial clean run reached `data-live="true"` but exposed a missing jam→decode link and timed out at the strict audio assertion. After owner-controlled reconnect work established jam→LM 8796 and jam→decode 8797 simultaneously, the bounded rerun passed in 8.2s with `uiReady`, summit `state=4` `note_on`, and `audioFrames=1`; post-run TCP retained both links. A subsequent post-apply run passed in 26.1s after `/style_interp t=0.5` returned HTTP 200, with `audioFrames=1`; the table was restored with `/style_interp t=0.0` HTTP 200. Baseline and live interpolation browser audio are proven; quality continuity remains separate.
- **Live soak gate (2026-09-11, mobile-surface lane): GATE PASS — first full pass of this arc.** Solo 300s soak against the healthy stack (jam 8083 pid 16864, LM 8796, decode 8797): opened on attempt #1, **143 frames / 0.7 MB, 0 dropped, 0 stalls in all 10 buckets, drift −3.95 ms/min, 0 reconnects, RSS +4.6 MB** — all gate assertions green (`code: 0`, evidence `tmp/jam-soak-report.json`, log `tmp/jam-soak-20260911-w50.log`). The 2026-09-10 structural drop-slope failure (164/min > 60, global `dropped_frames` on `block_q` overflow) is **confirmed fixed** by the mrt2 lane: 0 drops across the whole window. Residual watch item (non-gating): the downstream-link samples show Jam→decode:8797 ESTABLISHED in only 5/11 samples (lost after t≈182s) while Jam→LM stays 11/11 and frame flow continues — consistent with the documented decode-socket 10053 churn; audio is unaffected but the churn remains an mrt2-lane work item. History: the 2026-09-10 soak (126 frames, drift −271.9 ms/min, drop slope fail) is retained below for provenance.
- **Live soak gate (2026-09-10, commit/verify lane):** connectivity restored — the earlier all-409 blocker was a zombie `lm_server_v2.py` (no bound port, LM listener down) plus a watchdog double-start of `jam_server.py` (two instances bound to 8083; duplicate killed with process evidence). After the stack self-restored (lm 8796, decode 8797, jam 8083 — one listener each), the solo-client 300s soak opened once, streamed **126 frames / 4.82 MB with 0 stalls, 0 reconnects**, drift −271.9 ms/min (inside ±500 budget), and failed only the drop-slope assertion (164/min > 60). Finding: the server's `dropped_frames` counter is **global** and increments +4 on `block_q` (maxsize 16) overflow — jam's steer-loop catch-up bursts saturate it even at decode RT 1.2x, so the budget fails structurally until either the queue or the counter is per-session. Evidence: `tmp/jam-soak-report-2026-09-10*.json`. Drop-slope fix belongs to the mrt2 lane.
- **Unit** (`tests/unit-active/jam-radio.test.ts`, `jam-steer.test.ts`, `jam-vocal.test.ts`, `audio-scape-*.test.ts`): PCM decode, buffer scheduling, held-notes, gapless resync, shared engine chain, steering payloads, morph-safe routing, shared rig notifications, vocal signal processing, and discriminated server outcomes. The focused audio run is green.
- **Build**: `npm run build` — 541 modules transformed, `[tdb-ensure] OK`, and the data-compression gate passes.
- **Full-unit baseline:** the shared-engine migration is green in its affected contracts; two unrelated hygiene guards remain outside this seam (ungated `console.error` calls in `src/main.ts` and historical mixed `test(...)` commits).

## Known constraints

- **Port 8796 is held by MRT2's LM server.** The project's Playwright web server cannot start there. Real jam journeys must set `TEST_BASE_URL` to the already-running static server (currently 8841) and must not start a second 8796 stack.
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
    verified at `t=0.50` and unsafe input `t=0.78` routed to `t=0.75`.

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
surface costs no GPU. It is normally not co-mounted with SonicIdentity, but
both surfaces read and write the shared `jam-rig` store so navigation and
storage updates do not split dial truth. Big transport, state dial,
band/prog/MIDI/mic controls,
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
When permission is denied, the visible vocal control exposes
`aria-disabled="true"`; while the monitor is available, that attribute is
omitted.

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

Live-capture proof (2026-09-10, WS-only lease, summit state, single-owner
stack 16248/31164/32388 with both jam fixes): SIXTY consecutive 409s
(retry_after 299->2, one owner) with zero takeovers, then handshake 101
first try after legitimate lease expiry, 38 frames in 15s (37 metrics +
1 audio). The 0.34s live fragment scores overall_v10 100 / music_like
True with zero defect flags (rms 2413). Quality is proven end-to-end;
the audible gap is rate alone (1 audio frame / ~15s while metrics flow
freely) plus the suspended-AudioContext bug fixed in `fc5ba2e9a`.
Evidence: `C:/tmp/live_wait.log`, `C:/tmp/live_capture2.wav`. Reference:
offline `styled_s7.wav` scores 94; contention-era live captures scored
47-48 (silence) and 77.

## Audio style-follow (offline path complete; bridge apply proven; clean-runtime browser proof pending)

Design posted (msg 1584): `POST /style_from_audio {pcm_b64, sr}` → 10s
rolling buffer → MusicCoCa embed every 2-4s → tokenize → swap
`style_tokens` in the LM conditioning block. Covers speech/poetry/song
vibe-following; rap-downbeat sync and melody harmonizing stay separate
future dials.

**Status (2026-09-10): capture, queue, encoder, status, and one live bridge
apply are proven.** A real WAV upload returned HTTP 202; job 2 was consumed,
persisted as a `[12]` `int32` token vector, applied through the jam bridge with
`lm_applied: true`, and followed by a passing raw two-client lease/stream
probe. The browser journey now asserts at least one audio frame. An initial
strict run exposed a stale jam→decode link; after owner-controlled reconnect
work, the clean rerun reached the live handshake and received one real audio
frame with both jam downstream TCP links established, so baseline browser audio
is green. The corrected persistent-socket `/style_interp` path was then
applied at `t=0.5` (HTTP 200; LM table-version log advanced), followed by a
passing JAM-R audio frame and a successful `t=0` restore. A prior external
`pitch_style_cross/kill_all.py` loop was observed; the runtime owner now
reports it parked. The route accepts a raw-buffer upload,
reads the declared Content-Length before dispatch, persists the exact WAV via
an atomic rename as `hum_queue/job_N.wav`, and returns a job id. The console's
MediaRecorder path performs the mono WAV mixdown, submits the capture, and
polls `GET /style_job?id=N` until queued, done, or error. This is now an
offline- and bridge-proven pipeline; the browser proof still needs one clean
coordinated run.

The encoder path itself exists: `encode_chain.py` was ground-truth-verified
against JAX for STFT maxdiff, latent diff, and code-match percentage. The
checked-out MRT2 root still lacks `resources/spectrostream/encoder.safetensors`
and `quantizer.safetensors`; verified copies are staged under
`C:/tmp/mrt2-weights-20260909/` and can be passed explicitly to
`magenta_port/audio_style_worker.py` under `tmp/torch-venv`. The worker runs
the CPU path (`hum_queue/*.wav` → STFT → encoder → RVQ → mean codes →
12x int32 global `style_tokens`) and `lm_server_v2.py` now accepts the
validated `n==48` control, rebuilds conditioning, invalidates its encoder
cache, and echoes the applied tokens. The model-backed queue proof passed
without a GPU window or live-stack restart.

`surf_style_helper` is NOT the blocker — it lives at
`mrt2/magenta_port/surf_style_helper.py` and exports
`surf_tokens_for(x, y)` (verified live: it imports cleanly and the
current jam is serving its tokens). It takes PCA coordinates, not a
waveform, so it cannot consume audio directly. The offline worker and queue
seam are now implemented. The live jam keeps one persistent LM TCP client;
therefore the worker's direct `--apply-lm` connection is for isolated use only.
The patched `jam_server.py` exposes `POST /style_tokens`, which serializes the
validated n==48 control through the jam's existing LM socket.

The browser capture path and server worker are wired. Baseline and post-apply
live browser audio are proven. The source routes the 8-byte `/style_interp`
control through the jam's existing `lm_sock` under `lm_io_lock` and matches
v2's four-byte ACK framing. The remaining quality work is tracked in #224:
reconcile the existing discontinuity result, choose an approved criterion, and
resolve or explicitly accept the cliff and poison-zone behavior.
Do not run a blind `--watch` loop while the known 8-byte `job_1.wav` marker is
still queued.
The MusicCoCa embed is measured at ~3s per
10s clip on CPU (`scripts/style-ear-latency.py`, deterministic, cos 1.0), and
the 914MB TFLite bundle does not fit in a browser, so encoding runs server-side
by design.

## Text-vibe steering (tier 13)

`jam-radio.ts` gains `sendStyleText` — `POST /style_text {text}` to the
live jam. mrt2-lane shipped and live-verified this endpoint ('funky
techno' matched the funky anchor, tokens identical to the standalone
probe); this is the client half. Fire-and-forget; the dial applies it
server-side without dropping the stream. Returns the matched anchor name
or null on a network/parse failure.

Why /style_text and not /style_from_audio? The text endpoint remains the
lowest-latency path because it uses existing infrastructure and no encoder
batch. The audio path now has its worker and LM control, but stays a queued
feature in the product until the restored live stack returns one applied-style
frame and a healthy jam/decode check.

JamView.svelte: `#jam-style` input + 💚 send button + matched-anchor
readout. JAM-6 pins the fetch shape.

## Continuous style morph (tier 14)

`JamView.svelte` exposes `#jam-morph`, a 0..1 range control that debounces
`POST /style_interp {t}` by 120ms so dragging does not flood the jam server.
The endpoint is live on MRT2 and acknowledges `t=0.0`, `0.5`, and `1.0`;
`clampMorphT` routes through the measured 12-point map (ear_v10, closes
#224): safe passthrough on `[0.60,0.66]` and `[0.72,0.74]`, poison zones
`[0.68,0.70]` and `[0.76,0.80]` snap to the nearest safe edge, and
`t>=0.81` reaches the 100/100-S summit at `t=0.82` (second perfect score;
the old blunt `[0.74,0.82]→0.75` clamp blocked it — evidence: 97/95 with
12.3% whine at 0.75 versus 83/71 with 20.8% at 0.78). Client and server
apply the same route, and the slider reflects the value actually sent.
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
