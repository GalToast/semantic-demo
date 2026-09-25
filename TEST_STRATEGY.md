# Test Strategy - semantic-demo

## Philosophy
Two complementary verification layers: fast DOM contracts (CI-friendly) and visual screenshot audits (human judgement).

## Layer 1: Surface Contract Check (DOM/Layout Assertions)
**File:** `tests/surface-contract-check.mjs`
**Speed:** ~5-10s for all surfaces
**What it checks:** Touch target sizes, CSS custom property values, DOM element presence, layout geometry
**What it does NOT check:** Visual aesthetics, color fidelity, animation smoothness

```bash
# All surfaces (17 checks)
node tests/surface-contract-check.mjs --surfaces=mobile-idle,desktop-idle,launch-focus,search-error,map-trail,focus-pocket,field-node,info-panel-empty,compass-rail,loading-overlay,mode-grid,filters,thread-inspector,controls,search-chrome,info-panel-populated,global-spacing

# Single surface
node tests/surface-contract-check.mjs --surface=mobile-idle

# Named npm shortcuts
npm run qa:contract:all
npm run qa:contract:mobile-idle
npm run qa:contract:launch-focus
npm run qa:contract:mobile-critical   # subset: mobile-idle, search-chrome, focus-pocket, map-trail, controls, field-node, compass-rail, global-spacing
```

**Surfaces and what they validate:**
| Surface | Viewport | Key assertions |
|---|---|---|
| `mobile-idle` | 390x844 | touch targets >=44px, compass overlay, black-on-dark, gutter >=8px |
| `desktop-idle` | 1440x900 | selected-card border-radius 12px, canvas present, black-on-dark panels |
| `launch-focus` | 390x844 | focus-stage DOM + overlay, dive-button target + text clip |
| `search-error` | 390x844 | error-state present, retry/dismiss buttons >=44px |
| `focus-pocket` | 390x844 | pocket nodes rendered, card populated |
| `field-node` | 390x844 | field node ring + glow active |
| `map-trail` | 390x844 | map-trail strip present, card title visible |
| `search-chrome` | 390x844 | search input + clear button + mode chips present |
| `controls` | 390x844 | toolbar buttons visible, map-toggle present |
| `global-spacing` | 390x844 | viewport overflow hidden, gutter >=8px |

**Output:** `tmp/surface-contract-check/<run-id>/summary.json` - JSON with pass/fail counts and failure list.

## Layer 2: Visual State Audit (Screenshot-based)
**File:** `tests/visual-state-audit.mjs`
**Speed:** ~60-90s for full suite
**What it checks:** Visual rendering at named states, animation keyframes, UI element appearance
**What it does NOT check:** Programmatic correctness (use contract checks for that)

```bash
# Full suite
node tests/visual-state-audit.mjs

# Filter states
node tests/visual-state-audit.mjs --states=01-mobile-idle,07-desktop-idle

# Named npm shortcuts
npm run qa:surface:all
npm run qa:surface:mobile-idle   # 01-mobile-idle
npm run qa:surface:desktop-idle  # 07-desktop-idle
npm run qa:surface:search-error  # 10-mobile-search-error-state
npm run qa:surface:focus         # 03+04 mobile focus states
```

**States (12 total):** `01-mobile-idle`, `02-mobile-search-coffee`, `03-mobile-focus-first-result`, `04-mobile-field-node-active`, `05-mobile-map`, `06-mobile-filters-open`, `07-desktop-idle`, `08-desktop-search-coffee`, `09-mobile-map-empty-state`, `10-mobile-search-error-state`, `11-mobile-selected-card-map-trail`, `12-desktop-reduced-motion`

**Output:** `tmp/semantic-ui-visual-audit/<run-id>/` - per-state PNG + JSON + summary.json.

## Layer 3: Micro-Demo Verification
**File:** `tests/micro-demo-verify.js`
```bash
npm run test:microdemo    # programmatic micro-demo check
npm run test:microdemo:server  # Playwright E2E with live browser
```

## Layer 4: Shell/Ownership Checks (fast CI)
```bash
npm run check:shell      # CSS delivery contract
npm run check:cache     # cache-buster integrity
npm run check:ownership # CSS module ownership map
npm run check:manifest  # CSS import manifest order
```

## Layer 5: UI Quality & Motion
```bash
npm run qa:ui-quality           # accessibility, touch targets, visual hierarchy
npm run qa:surface-redundancy   # CSS selector duplication tracking (ratchet mode)
npm run qa:micro-interactions   # micro-demo choreography, panel transitions
npm run qa:motion-state         # reduced-motion preference handling
```

## When to Use Which
| Need | Layer |
|---|---|
| Fast CI pass/fail | Layer 1 (contract checks) |
| Visual regression after CSS change | Layer 2 (visual audit) |
| New feature DOM correctness | Layer 1 surface relevant to feature |
| Micro-demo choreography change | Layer 3 |
| CSS selector ownership drift | Layer 4 + `npm run qa:surface-redundancy` |
| Accessibility audit | Layer 5 `qa:ui-quality` |
| Reduced-motion correctness | Layer 5 `qa:motion-state` |
| Pre-deploy final check | Layer 1 + Layer 2 + Layer 3 + Layer 4 |
