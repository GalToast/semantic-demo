# Wave-G: obscure-UI hunting harnesses + harvest (2026-08-06)

Three net-new Playwright harnesses targeting UI blind spots that per-state
contract suites (60+) miss. Built main-lane after the provider outage killed
two of three dispatched workers (only the sweep worker landed its file; the
other writes died mid-stream — see doc history notes). Main-lane takeover
delivered fuzz + frame probes; sweep worker file verified + one Playwright bug
fixed (`page.evaluate` 2-arg misuse).

## Deliverables (committed)

| File                                   | Tests               | Blind spot                          | Status                    |
| -------------------------------------- | ------------------- | ----------------------------------- | ------------------------- |
| `tests/state-matrix-sweep.spec.js`     | 24 cells            | state × viewport × margin crossings | **1 real finding, tuned** |
| `tests/adversarial-state-fuzz.spec.js` | 6 (5 seeds + teeth) | rapid-input/broken-state            | net proven                |
| `tests/transition-frame-probe.spec.js` | 1 (5 edges)         | 40-400ms transient windows          | built                     |

### 1. `state-matrix-sweep.spec.js` — the cross-product net

- Product: 3 states (idle/search-open/focus-error) × 4 viewports
  (390×844/768×1024/1280×720/1920×1080) × 2 margins (full / narrow=vp-60).
- Global invariants per cell:
    - (a) no horizontal scroll (`scrollWidth <= innerWidth + 1`)
    - (b) no `position:fixed` element wider than the viewport
    - (c) no clipped text on `overflow:hidden` containers
      **tuned:** skips canvas, `.sr-only` (a11y clip by design), and elements
      that are themselves scroll containers (`overflow-y: auto/scroll`) —
      intentional internal scroll is the FEATURE, not a defect
    - (d) no console errors captured during the transition
    - (e) `#app` fills the viewport (bottom within 2px)
- State via deep-link `?nodemo=1&<state>` (no WebGL/API dependency for mobile).

### 2. `adversarial-state-fuzz.spec.js` — seeded fuzz

- mulberry32 PRNG seeded per-test; every test annotates its action trace →
  reproducible by re-running the same seed.
- 7-action set over real selectors: mode chip click, search+Enter, Esc,
  goBack, reload, first-result click, viewport resize.
- Universal invariants after EVERY action (fail-fast w/ trace):
    - I1 zero uncaught page errors — **allowlist is loose on purpose**:
      `'Failed to load resource'` + `'404'` must BOTH be present to pass through
      (the browser's exact string is
      `Failed to load resource: the server responded with a status of 404 (...)`).
    - I2 never a blank app (canvas / placeholder2d / info-panel / dialog visible)
    - I3 no stuck full-viewport overlay (veil/dialog >95% vh with pointer-events)
    - I4 modal focus sanity (no open `[aria-modal]` without a focusable child)
- **Teeth check test**: injects a `pageerror`; the I1 net MUST catch it —
  proves the net can fail (a harness that reports 0 failures without this
  proof is worthless).

### 3. `transition-frame-probe.spec.js` — temporal

- 5 edges: overview→search, search→focus, focus→inside, overview→map,
  map→overview (back).
- Computed-style captures at +40 / +150 / +400ms:
    - P1 no two visible full-viewport overlays (stuck stack)
    - P2 app box present + non-zero at +400 (no blank window)
    - P3 no >2px x-jitter of `#app` between +150 and +400
    - P4 overlay count never ≥3 (ghost accumulation)

## FINDING — mobile root clip at search-open (REAL)

First concrete catch. Symptom from sweep invariants (a–e): at 390×844 (and
768×1024), `documentElement.scrollHeight` = 892 > 844 while the root
`overflow:hidden` — content clipped below the fold. Desktop ≥1280 clean.

**Measured root cause (3 probes, 2026-08-06):**

- `html` grows to 892 (48px) — downstream symptom; `body` stays 844.
- Actual offender: in `info-panel-contained` mode, `.search-loading`
  (153px, static) sits at top 772 → bottom 925 inside the fixed
  `aside.info-panel` (top 626 → bottom 844, `overflow:hidden`), and its inner
  `.search-loading-text` at 860-876 — **past the panel's 844 bottom**. Fixed
  panel clips it (~81px lost below the fold on mobile).
- NOT (as first suspected) the `max-height: min(52vh, 420px)` wrapper cap —
  the mobile media query already caps at `min(40vh, 320px)`.

**Fix seam (mobile/info-panel CSS, owned by the visual lane):**
`search-container.info-panel-contained` → `.search-loading` must be clamped to
the panel's client box (e.g. `max-height: 100%`-ish inside the panel
scroll/max-height context) or the loading surface must live in a scrolling
child. Any of: allow panel content scroll, `overflow-y: auto` on the
contained search container, or position the loading box within the panel's
flow rather than oversized.

**Current status: with the visual lane (switchboard messages 74 + 76).**
Not fixed by main lane — mobile CSS + SearchResults.svelte are the lane's
seam; posted measurement + repro, awaiting their merge of the current WIP.

## CI wiring (deferred, recipe for when baseline is green)

Current `.github/workflows/ci.yml`: unit + build:svelte + lint-nav-mirror only.
The wave-g harnesses + visual/journey suites are NOT gated. **Do not wire
while the sweep baseline is red** (it currently fails the 6 mobile cells from
the finding above — a red gate is noise). Once the info-panel loading fix
lands:

```yaml
# suggested additions (cheap-first)
- run: npm run qa:journey:smoke # ~1 min, flow regression
- run: npx playwright test tests/state-matrix-sweep.spec.js --browser=chromium # ~7 min, crossings
```

Fuzz seeds (5×12) + frame-probe are slower (~15 min) — consider scheduled
(nightly) or pre-release, not per-merge.

## Repro commands

```bash
# sweep alone
npx playwright test tests/state-matrix-sweep.spec.js --browser=chromium
# full trio
npx playwright test tests/state-matrix-sweep.spec.js tests/adversarial-state-fuzz.spec.js tests/transition-frame-probe.spec.js --browser=chromium
# prove the fuzz net fires
FORCE_BREAK_PROBE=1 npx playwright test tests/adversarial-state-fuzz.spec.js --grep teeth
```

## Lessons (worker + harness)

1. **Workers lost writes mid-`write` during provider outage** — the sweep
   worker alone survived because its file landed before the outage. Main-lane
   takeover recovered both. Evidence: harnesses are 100% deterministic —
   only the LLM calls died.
2. **Allowlists must match browser prose exactly** — the 404 wording
   mismatch caused 5 fuzz failures that were NOT product bugs. Loosen net
   deliberately (both `Failed to load` AND `404` present) or assert on the
   specific allowed string.
3. **The matrix's (c) invariant needs the scroll-container carve-out** — the
   original fired on intentional `overflow-y:auto` internals (a "feature
   not a bug" false positive), and on `.sr-only` (a11y clip). After the
   carve-out the sweep's real signal is the mobile clip.
4. **Measure, don't trust an invariant** — a screen-height delta (892 vs 844)
   is a metric; the DOM parent-chain probes found the true, different
   offender (.search-loading in panel-contained mode). The second message
   corrected the first.

## Dive-feedback chase (2026-08-06 afternoon) — "dead machinery" audit double

**Phenomenon:** the dive-entry "Focusing… / Entering Neighborhood" transient
(parity `data-semantic-dive="transitioning"`) never fired for users.

**Root-cause chain (producer-verify pattern):**

1. CSS "Focusing…" keyed on a **dead body class** (`focus-transition-arriving`,
   0 writers) → migrated to live dataset `body[data-semantic-dive="transitioning"]`
   (commit 9de1f44c).
2. The dataset flips only when `semantic-dive.ts isTransitioning` reads
   `appState._semanticDiveTransitionDeadline > now` — which was **declared +
   initialized + validated + read but never WRITTEN** (0 remain forever, so
   `transitioning` never emitted). Producer was missing from the dive-entry
   seam. Fixed: `ENTER_INSIDE` (compass-controller) arms
   deadline = Date.now()+1200 (commit d7373e96). Covers both the button and
   Ctrl+5 (both route through the same handler).
3. **Button mount flap** (the "present-but-inert" red herring): in plain
   headless (no **PLAYWRIGHT**), `#btn-focus-dive` mounts with jittery timing
   (2.5-6.5s, sometimes never) because it lives in the LAZY JourneyCompass
   chunk that resolves only when legacyCompassSurfaceActive flips. CDP
   matched-styles + mutation-observer disproved CSS race / inert / oscillation;
   it was the cold-start mount window. Fixed with an idle `requestIdleCallback`
   pre-warm of the compass chunk for ALL users (commit 8bb61de8; mount
   3-4s → ~0.4s verified).

**Lesson (repeated):** "dead" UI feedback = producer chain missing a LINK, and
the consumer/validator existence is the evidence it was *intended live*.
Walk declaration → write → read → style-consumer BEFORE concluding dead vs
incomplete. Second: headless mounts are NOT a stable DOM oracle — verify
visibility claims with the REAL test harness (`window.__PLAYWRIGHT__`
preloads) or name the cold-start caveat instead of chasing CSS ghosts.
