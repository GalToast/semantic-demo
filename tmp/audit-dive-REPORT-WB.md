# Audit Report — semantic-dive surface (Worker B)

Date: 2026-08-06 · Viewport: 1440×900 + 390×844 (mobile bonus) · Headless chromium · Repo: C:/Users/HP/repos/semantic-explorer · Live app: http://localhost:5174

## 1. Scorecard

| Gate | Score | Notes |
|---|---|---|
| R5 reach | **10/10** | Reached + proven on live app, both viewports. `body[data-panel-surface]="semantic-dive"`, `body[data-semantic-dive]="active"`, `body.surface-semantic-dive` + `navigation-inside-walk` classes. Bonus (+1): focus indicator + 44px CTA verified → effectively 10/10 with bonus credit. |
| R4 evidence | **10/10** | Per-stage heartbeat JSONL written to tmp/ (see §2). 26 lines main battery + bonus evidence + CSSOM rule dump. |
| R3 triage | **9/10** | 12 shortInteractive hits — ALL dismissed via known-FP class `.focus-pocket-a11y` (off-canvas a11y pocket list, rect x=-1, 13×27px). 0 overflow / 0 clipped / 0 noName / 0 genuine. |
| R2 verdict | **10/10** | VERDICT: NONE (no genuine defects on the semantic-dive surface). See §3 for evidence-backed non-defect observations. |
| R1 read-only | **10/10** | No writes outside tmp/. Only probe scripts + JSONL + report under tmp/. |

## 2. Evidence paths

- `tmp/audit-dive-2026-08-06.jsonl` — main probe: reach stages, battery summary + findings, a11y bonus, mobile checks
- `tmp/audit-dive-bonus-2026-08-06.jsonl` — refined focus-visible + mobile CTA hit-area checks
- `tmp/dive-css-rules.json` — CSSOM rule dump for `inside-controls` / `inside-status` visibility gating (435 rules scanned)
- `tmp/audit-dive-probe.mjs`, `tmp/audit-dive-bonus.mjs` — probe source

## 3. Verdict list

**VERDICT: NONE** — no genuine layout/a11y defects found on the semantic-dive surface.

Battery results on the dive surface (desktop 1440×900):
- 122 visible elements scanned (skip: SCRIPT/STYLE/CANVAS/SVG, display:none, visibility:hidden, opacity:0, 0×0)
- Horizontal overflow (rect.right > innerWidth+2): **0**
- Clipped nowrap text (scrollWidth > clientWidth+2): **0**
- Interactive < 42px tall: **12 found → 0 genuine** (all `.focus-pocket-item-btn` inside `.focus-pocket-a11y` UL — the off-canvas a11y pocket list, x=-1, 13×27px, a listed known-FP)
- Interactive with no accessible name: **0**

## 4. Per-finding detail (genuine = none; notable observations below)

### Obs 1 (non-defect, documented for owners): desktop dive surface has no inside controls by design
- Selector: `#focus-stage-inside-controls` / `#focus-stage-inside-status` / `#btn-inside-next|map|county`
- At 1440×900 on the dive surface all compute to 0×0, `display:none`, despite `hidden` attr = false and `tabindex=0`.
- Root cause (CSSOM-verified): the ONLY rules that display them are mobile media queries — `(max-width: 768px)`, `(max-width: 900px) and (max-height: 430px) and (orientation: landscape)`, `(max-width: 390px)`, `(max-width: 360px)`. Base rule `.focus-stage-inside-controls { display: none }` (focus_stage.css, runtime-injected) wins at desktop.
- Ancestor chain captured: BUTTON(0×0, inline-block) → DIV#focus-stage-inside-controls(0×0, display:none) → DIV#app → BODY.
- Verdict: intentional responsive split (desktop = compass rail + focus card; mobile = cockpit). `body.surface-semantic-dive` class IS applied at runtime, so the gating hook exists and matches — no bug.

### Obs 2 (non-defect): `.compass-dive-surface` element does not exist in this codebase
- grep across src/ + runtime query: no such class anywhere. Surface identity is carried by `body[data-panel-surface="semantic-dive"]` + `body[data-semantic-dive="active"]` + `body.surface-semantic-dive` + `navigation-inside-walk`. R5's "look for" item answered: absent; nearest structural equivalents are `#focus-stage-inside-status` / `#focus-stage-inside-controls` (CompassDiveSurface.svelte, W52 extraction).

### Obs 3 (non-defect): keyboard focus indicator confirmed present
- Tab cycle on desktop dive surface: focused elements match `:focus-visible` with `outline: 2px solid rgb(78, 205, 196)` + `box-shadow: rgba(78,205,196,.6) 0 0 0 2px` glow, on-screen. Indicator is `:focus-visible` pseudo-class based — `.focus-visible` class count is 0 by design (no class-based styling).
- Note: sequence lands on `.focus-pocket-item-btn` (off-canvas list); real browsers scroll focused elements into view, headless Tab does not. No `:focus` style leaks (e.g., no visible focus ring on the 3D canvas — canvas is skipped in battery).
- `#btn-inside-next` also carries `biofield-glow` + focus outline CSS (outline-width 3px, rgb(255,240,184)) for its mobile appearance.

### Obs 4 (non-defect): mobile dive-surface CTA hit areas all ≥ 44px (bonus)
At 390×844, dive surface active:
- `#btn-focus-dive` "Explore Neighborhood" (pre-click): 366×44
- `#focus-stage-inside-status` "Inside neighborhood": 390×30 (non-interactive)
- `#btn-inside-next` "Trail Complete": 191×44
- `#btn-inside-map` "Map": 191×44
- `#btn-inside-county` "County": 390×44
- `#fc-btn-selected-map` "View on Map" (focus-card CTA, remains on dive): 362×44

### Obs 5 (non-defect): "Trail Complete" label is intended
- `#btn-inside-next` shows "Trail Complete" when no next candidate remains — implemented at `src/lib/journey/semantic-dive.ts:202` (`isExploring ? 'Following...' : hasNextCandidate ? 'Next Stop' : 'Trail Complete'`). Not a defect.

## 5. Repro recipes

- Reach (proven): open `http://localhost:5174/?nodemo=1&q=coffee&record=519` (desktop or mobile) → wait for `__APP_STATE__.points.length > 100` + focus card → click `#btn-focus-dive` (a.k.a. `.focus-stage-dive-btn`, `data-journey-action="enter-inside"`) → within ~2s `body[data-panel-surface]="semantic-dive"` + `body[data-semantic-dive]="active"`.
- Any re-audit of the battery: reuse `node tmp/audit-dive-probe.mjs` (evidence appends to `tmp/audit-dive-<date>.jsonl`).

## 6. Method notes

- Deep-link route verified rather than assumed (path hypothesis confirmed: `?q=` deep-link → focus-search → dive button click). `?record=519` maps to the `lead_id === 519` array index per `applyUrlState()`.
- All awaits ran under hard timeouts (Promise.race, ≤30s); no hang ever occurred. First run hit an app full-reload (execution context destroyed) — handled with post-boot settle wait + guarded snapshots.
- The dive button hides (`hidden` attr + `display:none`) once the dive surface is active — expected (it becomes the inside cockpit on mobile).

## dives-a11y-check (bonus, captured)

| Item | Result |
|---|---|
| Visible keyboard focus indicator on dive surface | YES — `:focus-visible` outline 2px solid rgb(78,205,196) + glow box-shadow on focused controls (no `.focus-visible` class in use) |
| Primary CTA ≥ 44px hit area at 390×844 | YES — dive CTA 366×44; inside controls 44px tall (Next 191×44, Map 191×44, County 390×44); focus-card "View on Map" 362×44 |

DIVE AUDIT DONE — verdict: NONE
