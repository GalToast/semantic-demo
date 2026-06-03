# Semantic Demo UI Surface Stabilization Plan

Status: active
Created: 2026-05-20

## Purpose

Stabilize the semantic demo UI by replacing competing visual surface ownership with clear state-owned composition. This plan is grounded in live Playwright evidence captured at desktop, mobile, and tablet sizes under:

`tmp/ui-shit-investigation-2026-05-20/`

The current issue is not a single bad rule. The UI looks poor because multiple surfaces remain alive at the same time, especially on mobile and tablet:

- The right controls rail visually steals viewport space in mobile/tablet search and dive states.
- `#info-panel` and `.search-container` both act as the mobile search sheet.
- Semantic dive repeats labels/actions such as `MapMap`, `INSIDE NEIGHBORHOOD`, and `Prev/Next Stop`.
- Desktop has cleaner geometry but still exposes too many HUD surfaces at once.
- CSS ownership for search, focus, and dive remains distributed across too many files.

## First Five Seams

### 1. Mobile Controls Rail

Goal: make non-map mobile/tablet states stop showing a tall right-side controls rail as primary chrome.

Observed evidence:

- At `390x844`, `.controls` renders around `77px x 616px` during search while pointer events are disabled.
- At `768x1024`, the same rail consumes the right side of the tablet viewport.
- The rail is visually dominant despite not being the primary task surface.

Expected direction:

- In `search`, `focus-search`, and `semantic-dive` galaxy states, controls should be hidden, compacted, or moved into a deliberate small affordance.
- Map states may keep map-specific controls.
- Avoid `!important`; use state-owned selectors and cascade order.

Likely files:

- `css/controls.css`
- `css/progressive_disclosure.css`
- `css/mobile_premium.css`

Acceptance proof:

- No tall right rail visible in `390x844` search or semantic-dive screenshots.
- No horizontal scroll or viewport squeeze.
- Zoom/reset controls remain available where map/scene interaction requires them.

### 2. Single Mobile Search Surface Owner

Goal: choose one mobile search sheet owner so search content is not duplicated between `#info-panel` and `.search-container`.

Observed evidence:

- Mobile search: `#info-panel` begins near `y=196`; `.search-container` begins near `y=205`.
- Tablet search: both surfaces occupy the same bottom-sheet band.
- The same semantic search copy appears inside both surfaces.

Expected direction:

- Either `#info-panel` becomes the sheet and `.search-container` becomes internal content, or `.search-container` becomes the sheet and `#info-panel` becomes a shell/header.
- The losing peer must not render as a separate glass slab in search states.
- Preserve the existing search input, clear button, result count, and mocked/live search flow.

Likely files:

- `css/mobile_base.css`
- `css/search.css`
- `css/progressive_disclosure.css`
- `css/strands.css`
- `css/mobile_premium.css`

Acceptance proof:

- One visible mobile search sheet in `390x844` and `768x1024`.
- Search input and clear button are visible and clickable.
- Search results do not sit behind the controls rail.

### 3. Semantic Dive Content Pruning

Goal: make semantic dive read as one focused inside-neighborhood HUD, not several overlapping UI concepts.

Observed evidence:

- Mobile dive shows repeated `INSIDE NEIGHBORHOOD`.
- Header action text renders as `MapMap`.
- Route controls duplicate `Prev Stop`, `Next Stop`, `Next Stop`, and `County`.
- Hidden search/result content still contributes to visible text and accessibility noise.

Expected direction:

- One title/kicker pair for the dive.
- One primary action row.
- One route/progress row.
- Hidden search/result surfaces should not remain visible or semantically noisy in dive.

Likely files:

- `vector-explorer-polished.html`
- `js/modules/journey-compass-state.js`
- `js/modules/journey.js`
- `css/journey_active.css`
- `css/progressive_disclosure.css`
- `css/mobile_premium.css`

Acceptance proof:

- No `MapMap`.
- No repeated `INSIDE NEIGHBORHOOD`.
- No duplicate route action labels.
- Focus-stage card fits within `390x844` without incoherent clipping.

### 4. CSS Owner Consolidation

Goal: assign canonical geometry owners for search, focus-search, and semantic-dive so later fixes do not fight the cascade.

Observed evidence:

- Focus/search/dive selectors still exist across `journey_active.css`, `progressive_disclosure.css`, `strands.css`, and the collapsed `mobile_premium.css`.
- `body.is-active` is present at runtime, but the effective winning rules still vary by specificity and order.
- `docs/semantic-demo-css-ownership-map.md` and `docs/semantic-demo-mobile-state-ownership.md` identify the intended direction but the live UI shows unresolved overlap.

Expected direction:

- Document current duplicate owners for the first three target states.
- Recommend one canonical file per geometry concern.
- Prefer moving or deleting redundant rules only after live proof, cache refresh, and visual checks.

Likely files:

- `docs/semantic-demo-css-ownership-map.md`
- `docs/semantic-demo-mobile-state-ownership.md`
- `tests/css-ownership-check.mjs`
- CSS modules under `css/`

Acceptance proof:

- Ownership matrix updated or a precise patch plan produced.
- No new broad selectors added without owner mapping.
- Future tests can catch reintroduced duplicate geometry ownership.

### 5. Visual Contracts

Goal: turn the visible failures into deterministic checks.

Contract targets:

- No mobile/tablet right controls rail in `search` and `semantic-dive`.
- Exactly one visible search sheet.
- No `MapMap`.
- No duplicate semantic dive title/action labels.
- Focus-stage geometry fits mobile/tablet viewport.
- Desktop remains readable and does not regress while mobile is fixed.

Likely files:

- `tests/visual-state-audit.mjs`
- `tests/surface-contract-check.mjs`
- New focused Playwright spec if the existing harness cannot express these checks.
- `package.json` only if a new script is truly needed.

Acceptance proof:

- New or extended tests fail against the current broken state or explicitly document which assertions are pending until implementation.
- Tests cover `390x844`, `768x1024`, and a desktop viewport.
- Evidence screenshots are written under `tmp/`.

## Delegation Wave 1

The first worker wave is intentionally decomposed by seam. Because the repo is dirty and the user is working concurrently, workers should avoid broad overlapping source edits. Each worker owns a narrow report or patch recommendation and writes evidence under:

`tmp/ui-surface-stabilization-wave1/`

Main Codex lane responsibilities:

- Poll workers and read reports.
- Integrate safe patches after checking dirty git and active workers.
- Run deterministic build/contracts and browser proof.
- Handle leftover edits and follow-up seams after MiniMax workers return.

Worker slices:

1. `ui-wave1-controls-rail`
   - Diagnose and propose the smallest source patch for the mobile/tablet controls rail.
   - Write `tmp/ui-surface-stabilization-wave1/controls-rail/report.md`.

2. `ui-wave1-search-surface-owner`
   - Determine the best single owner for mobile search sheet geometry.
   - Write `tmp/ui-surface-stabilization-wave1/search-surface-owner/report.md`.

3. `ui-wave1-semantic-dive-prune`
   - Audit semantic-dive duplicated labels/actions and propose source-level cleanup.
   - Write `tmp/ui-surface-stabilization-wave1/semantic-dive-prune/report.md`.

4. `ui-wave1-css-owner-consolidation`
   - Build a concise owner matrix and duplicate-selector list for search/focus/dive geometry.
   - Write `tmp/ui-surface-stabilization-wave1/css-owner-consolidation/report.md`.

5. `ui-wave1-visual-contracts`
   - Add or draft deterministic visual/layout contracts for the failures above.
   - Write `tmp/ui-surface-stabilization-wave1/visual-contracts/report.md`.

## Main-Lane Leftovers

After reports return, the main lane should handle:

- Integrating the controls rail fix.
- Choosing the mobile search owner and removing duplicate peer rendering.
- Applying semantic-dive copy/action pruning.
- Refreshing cache-busted CSS imports when source CSS changes.
- Running `npm run build`, targeted contract checks, and Playwright viewport proof.
- Updating docs/tests only for durable decisions, not transient report noise.
