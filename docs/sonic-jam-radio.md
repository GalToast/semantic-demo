# Sonic Jam Radio — Tier 2 & 3

**Status:** committed 2026-09-08 · `d176d9073` on top of `4f34ff77e` · 4/4 journey green, 4/4 unit green, build green
**Source:** Magenta RT2 pipeline (`mrt2/tmp/jam_server.py`, commit 03cd572 era), ear_v7.1 scorer

## What this is

The sonic style dial in the focus panel does three things now, one per tier:

| Tier | Module | What it does |
| --- | --- | --- |
| 1 — playback | `sonic-identity.ts` + `manifest.json` | Picks a pre-rendered clip keyed to the node's cluster category, plays it with fade, respects mute. |
| 2 — steering | `jam-steer.ts` | Fire-and-forget `POST /style {pole}` to the live MRT2 jam server. |
| 3 — radio | `jam-radio.ts` | WebSocket client that streams the jam's live PCM decode to the browser. |

The dial is a 3-way cycle: **★ best → ⚡ beat → 🔴 live → ★**. Each pole both selects a playback variant *and* drives the jam server. Toggling to `live` opens the radio; toggling away closes it.

## Tier 2 — jam steering

`src/lib/audio/jam-steer.ts`:

```ts
export function steerJam(pole: JamPole): Promise<boolean> {
    return fetch(`${JAM_HTTP_URL}/style`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pole })
    }).then(r => r.ok).catch(() => false)
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

**Playback strategy:** each chunk becomes an `AudioBufferSourceNode` scheduled at a monotonically advancing `nextStart` timestamp, so bursty WS arrival still yields gapless output. A starving stream (nextStart fell behind wall clock) resynchronizes to now + a small lead.

**Held notes:** `RADIO_HELD_NOTES = [45, 52, 57, 64, 71]` — a soft A-minor add9 voicing so the stream plays unattended when nothing else is driving it.

**Public API:** `startJamRadio(ctx, onMetrics?)`, `stopJamRadio()`, `getRadioState(): RadioState` (`'idle' | 'connecting' | 'live'`), plus pure helpers `decodePcmChunk`, `chunkToAudioBuffer`, `scheduleChunk`.

## The dial UI

`src/components/sonic/SonicIdentity.svelte`:

```ts
const DIAL_ORDER: JamPole[] = ['best', 'beat', 'live']
```

`toggleStyle` cycles through the order. `best` and `beat` call `steerJam(pole)`; `live` calls `startJamRadio()` and `stopJamRadio()` on exit. The `live` pole has no pre-rendered clip — it *is* the clip, streamed.

## Config

All endpoints live in `src/lib/audio/jam-config.ts`, env-driven:

| Env var | Default | Used by |
| --- | --- | --- |
| `VITE_JAM_HTTP_URL` | `http://127.0.0.1:8083` | `jam-steer.ts` |
| `VITE_JAM_WS_URL` | `ws://127.0.0.1:8083` | `jam-radio.ts` |

Committed at `9bcd0e251` so the endpoints are configurable without touching code.

## Verification

- **Journey** (`tests/journey/sonic.spec.js`, SONIC-1..4): play control, 3-way dial cycle, jam `/style` interception, live radio chord hold. 4/4 green at 34.8s.
- **Unit** (`tests/unit-active/jam-radio.test.ts`): `decodePcmChunk`, `chunkToAudioBuffer`, held-notes, gapless resync. 4/4.
- **Build**: `npm run build:svelte` — 41.51s, `[tdb-ensure] OK`, data-compression gate passes. FocusCard hash `BPGaY18Z` confirms the radio code is in the bundle.
- **Full unit suite**: 4239/4242. The 3 failures are a pre-existing merge-reland guard, unrelated.

## Known constraints

- **Port 8796 is held by mrt2-rt's LM server** (PID 4832). The project's `playwright-web-server.mjs`/`test-server.mjs` cannot start there. Worked around with `TEST_BASE_URL` + `scripts/qa-static-server.mjs` on alternate ports.
- **`record=6218` was a stale fixture** — that lead_id doesn't exist in the 8,406-point corpus. All four sonic specs now use `record=519` (Angel Fire Coffee, index 518).
- **D3D11 cold-start variance**: fixed `waitForTimeout` settle waits caused "Target page, context or browser has been closed" timeouts. Replaced with `waitForFunction` polls on the render rect.
- **Svelte 5 omits `aria-pressed` entirely when `false`** — "not live" assertions check *absence*, not the literal `'false'`.

## Minimal increment order (what's done → what's next)

1. ✅ manifest + clips, typed loader, state slice
2. ✅ playback respecting mute
3. ✅ focus-panel UI (button + badge)
4. ✅ jam steering (tier 2)
5. ✅ jam radio (tier 3)
6. ✅ journey tests + fixture fix
7. ⬜ remaining starter clips + clusterMap expansion
8. ⬜ mobile surface check (CSS ownership per `docs/css-ownership.md`)
