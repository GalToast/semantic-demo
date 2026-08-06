# UI Issues Hunt — 2026-08-04 (live 1440×900 / 390×844, dev server [::1]:5173)

Method: 25-state visual audit (headless, 13 captures) + live Playwright DOM/hit-test probes
(elementsFromPoint, real clicks, paint-order forensics) + pixel sampling. Screenshots
under `tmp/vision-jury/`, probe JSON `tmp/ui-sweep-1/`, audit PNGs
`tmp/ui-audit-20260804/`.

## P0 — every user of this worktree sees this

### 1. Search API is dead: port 8795 serves static files, not PHP
- `netstat` → pid 16100 = `node scripts/qa-serve.mjs` (static server), NOT `php -S 127.0.0.1:8795 -t .`
- `/api.php?action=semantic_search&q=coffee` returns **raw PHP source** (curl-confirmed).
- `search-engine.ts` detects it (`semantic search returned raw PHP source`) → retries ×3 → falls
  back to local index → **yellow "demo data" banner** + degraded search for everything in this worktree.
- Logs: `[retry] search-engine.api attempt 1/3 ... Semantic search returned raw PHP source`
- PHP 8.3 is installed; the QA static server is shadowing it (docs/search-fallback.md says stop
  whatever's on 8795 and run `php -S 127.0.0.1:8795 -t .`).
- Fix: start `php -S 127.0.0.1:8795 -t .` (kill the qa-serve pid 16100 — verify ownership via
  `Get-CimInstance Win32_Process -Filter 'ProcessId=16100'` first).

## P1. users opening a shared business link get a dead focus card

### 2. Deep-link focus card renders but is click-dead (desktop + mobile)
- Repro (deterministic, 3/3 runs): `http://[::1]:5173/?nodemo=1&view=galaxy&q=coffee&record=519`
- The card mounts: `#focus-card-selected` computed `visibility:visible opacity:1`, correct rect
  (1164,~170) — but `document.elementFromPoint(1232,492)` returns **CANVAS**, not the button;
  Playwright click times out on actionability; synthetic click does not fire.
- Same URL driven by real clicks (type "coffee" → Enter → click result) → button clickable. So the
  **user journey from search works, the shared-link (URL) path is broken**.
- `body.dataset.focusTransition` stays **"entering" for 250+ s** (should settle → idle).
- The whole `#focus-stage` subtree (card + buttons) is absent from the hit-test chain at the card's
  rect even though the card paints (element screenshot 100% opaque). Desktop canvas-layer
  (`#canvas-container`, z-1) interposes; on mobile the `div.layer.canvas-layer` (placeholder2d,
  full-screen, pointer-events auto) sits on top of the whole card.
- Related console: `Safety valve: loading overlay stuck after 15s. Showing error state.` on a cold
  deep-link load — the loading overlay also fails to leave on the deep-link bootstrap.
- Area: deep-link boot (M16 / `parseUrlParams` eager path) + `focusTransition` settle timer.

#### Root-cause lead (measured + source-confirmed, needs fix session)
- Source: `src/App.svelte` sets the active stage to a FULL-VIEWPORT layer and kills pointer events on it:
  - Scoped CSS `.focus-stage.active { position:absolute; top:64px; right:0; bottom:0; left:0;
    width:100%; pointer-events:none; opacity:1; visibility:visible; transition:none }`
  - `:global(.focus-stage.active > *) { pointer-events:auto }` re-enables children, BUT the stage
    node also gets inline `style:pointer-events='none'` when `focusStageActive` (App.svelte ~L463) —
    inline beats every stylesheet rule at the stage itself, so the full-screen box tests as the
    topmost target under the cursor, swallowing events bound for the card below it.
  - Forcing the stage `pointer-events:auto` via JS changed `elementFromPoint` from CANVAS to the
    stage itself — STILL not the button — so the stage/canvas composition chain keeps the card out
    of hit-testing on the deep-link boot.
- The card is `position:fixed` INSIDE a `position:absolute` stage that carries a `transform` — the
  transform makes the stage a containing block for fixed descendants; the card paints at its rect
  (element screenshot 100% opaque) but hit-testing still resolves through canvas first.
- `body` keeps `focus-transition-entering focus-transition-phase-settled` together — the settle timer
  only swaps a CSS class; `parity focusTransition: entering` comes from `focusStore.transitionMode`
  which never returns to `idle` on the deep-link boot.

## P2. visible but lower-priority

### 3. Text clipped inside focus-card action row (`View on Map`, `← Prev`, `Next →`)
- ui-probe textOverflow hit: `#fc-btn-selected-map` (103 px @ 1440, "View on Map") and
  `#btn-prev-node`/`#btn-next-node` — `scrollWidth > clientWidth` with `overflow:hidden`.
- Expected ellipsis/clip; the buttons are small. Confirm during fix work.

### 4. `.mode-grid` chip clip flagged by vs (transient)
- Audit `modeGridDiagnostics.clippedChipsCount = 1` on several mobile states; could not reproduce
  live at 390px — treat as intermittent / grid shadow moment.

### 5. Hidden auxiliary surfaces inflate layout
- Desktop map: `#focus-stage-auxiliary-surfaces` (356×286, `visibility:hidden`) sits below the fold
  → `scrollH 985 > 900`. Hidden so not user-visible, but leaks game `document` scroll height on
  map = page "scrollable" while overflow hidden.

## P3 / false-positive watchlist (verified OK)

- desktop camera-controls hero overlap: parent/child, benign.
- Journey chrome vs Show-walk/Prev/Next: nested inside same stage, benign.
- Category-count "0" in a11y snapshot (pending data): hydration race, transient.
- Fonts: "Failed to decode" warnings on dev server; files are valid WOFF2 served with
  `font/woff2` — Vite/HMR transient, benign.

## Pending: pixel/vision confirmation
- All 3 VLM lanes failed this session (infron credits 403, zenmux NIM 504, modelscope
  Qwen3-VL is text-only). Screenshots in `tmp/vision-jury/` are ready for a future
  vision pass or manual review. DOM evidence above is measured, not guessed.
## CLOSED as of 2026-08-06 (superseded)
Every item was worked through across the 08-04→08-06 wave:
- P0 #1 (Search API dead on 8795) → fixed (php -S)
- P1 #2 (deep-link dead focus card) → fixed + regression
- P2 #3 (clip in action row): ←Prev/Next fixed (trail-btn); View on Map = verified false positive (biofield pseudo inflates scrollWidth)
- P2 #4 mode-grid chip transient → no repro (wontfix-watch)
- P2 #5 hidden aux surfaces scrollH → verified no current escape (map sweep 0)
- P3 watchlist items → verified OK; vision confirmation done across sessions
This report retains historical value only; archived per session close.
