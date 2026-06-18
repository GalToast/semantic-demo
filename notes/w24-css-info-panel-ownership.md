# CSS .info-panel Ownership Map (W24, 2026-06-17)

**Status:** Phase 4 of CSS Smell 2 consolidation plan  
**Reference:** notes/w24-css-smell-2-audit.md (Phase 1 audit), 86fa026 (Phase 2 commit)

## 1. Canonical Ownership Rules

When adding or modifying `.info-panel*` rules, **add them to the canonical owner file below**. Do not scatter across files.

### Desktop (default view, `body`)
**Canonical owner:** `css/layout_base.css`
- Desktop base panel styles (`.info-panel {}`, `.info-panel::before`, `.info-panel.active`, `.info-panel.collapsed`)
- Default state (no `body.is-active[data-panel-surface=...]`)
- Default hover/focus/active states
- Scrollbar customization
- Panel toggle icon styles (`.info-toggle-icon`)

### Mobile chrome (with `body.is-active[data-active-view='mobile']`)
**Canonical owner:** `css/mobile_premium__chrome.css`
- Mobile shell, mobile chrome
- Compact layouts (`.info-panel.compact`, `.info-panel.is-mobile`)
- Mobile-specific positioning (state-dependent visibility)
- Mobile panel sizing inside the shell

### Mobile state machine (`body.is-active[data-panel-surface=...]`)
**Canonical owner:** `css/mobile_premium__state.css`
- State transitions: `idle`, `search`, `focus`, `focus-search`, `semantic-dive`, `overview`, `map-*`
- Surface visibility per state (peek/expanded/fullscreen)
- `body.is-active .info-panel` base mobile rule
- `body.is-active[data-panel-surface='idle'] .info-panel` and siblings

### Animations
**Canonical owner:** `css/animations.css`
- Fade/slide transitions for `.info-panel*` (if any)
- `@keyframes` related to panel appearance/disappearance
- Skeleton loaders (transition-based)

### Empty/loading states
**Canonical owner:** `css/progressive_disclosure.css`
- Empty state copy/styling (`.info-panel.is-empty`)
- Loading skeletons (`.info-panel__skeleton`)
- Discovery surfaces
- `body[data-panel-surface='focus'] .info-panel` (progressive disclosure transitions)

## 2. Files NOT Allowed to Own `.info-panel*` Rules

The following files should NEVER add `.info-panel*` rules (rules belong in canonical owner per Section 1):

| File | Why |
|---|---|
| `css/strands.css` | Strand-level rules; surface state belongs in state.css. Galaxy view rules belong in layout_base.css |
| `css/mobile_premium__surfaces.css` | Mobile surface rendering; state visibility belongs in state.css |
| `css/mobile_premium__focus-dive.css` | Focus-stage specific; cross-cut with focus state |
| `css/mobile_premium__idle.css` | Idle-specific; state machine handles idle in state.css |
| `css/mobile_premium__narrow.css` | Narrow viewport; inherits from canonical base |
| `css/mobile_base.css` | Historical; superseded by mobile_premium__chrome.css |

## 3. Pattern Categories

### 3.1 Base Layout (canonical: `css/layout_base.css`)
- `.info-panel { display: ... }`
- `.info-panel-header`, `.info-panel-body`, `.info-panel-footer`
- Default positioning, sizing
- Scrollbar styles
- `.info-panel.collapsed .info-toggle-icon`

### 3.2 Mobile Chrome (canonical: `css/mobile_premium__chrome.css`)
- `.info-panel.is-mobile`
- `.info-panel.compact`
- Mobile shell positioning
- State visibility at chrome layer

### 3.3 State Machine (canonical: `css/mobile_premium__state.css`)
- `body.is-active[data-panel-surface='idle'] .info-panel { ... }`
- `body.is-active[data-panel-surface='search'] .info-panel { ... }`
- `body.is-active[data-panel-surface='focus'] .info-panel { ... }`
- State visibility per surface

### 3.4 Animations (canonical: `css/animations.css`)
- `@keyframes info-panel-fade-in { ... }`
- Transition declarations

### 3.5 Empty/Loading (canonical: `css/progressive_disclosure.css`)
- `.info-panel.is-empty { ... }`
- `.info-panel__skeleton { ... }`
- Progressive disclosure transitions

## 4. Enforcement

### Pre-commit hook (recommended for W25+)
Add to package.json scripts:
```json
"lint:css-ownership": "node scripts/lint-css-ownership.js"
```

Script flags any `.info-panel*` rule in non-canonical files. Implementation deferred to W25+.

### Manual review
Until lint is in place:
1. Before adding `.info-panel*` rule, check Section 1 for canonical owner
2. Add to canonical owner ONLY
3. If you think you need it in another file, justify in PR description
4. Verify rule count hasn't regressed (current total: 143 across 10 files per Phase 1 audit)

## 5. Audit Cadence

- Re-audit every wave (per `notes/w24-css-smell-2-audit.md` format)
- Add to wave charter's "CSS Audit" section
- Track in `docs/semantic-demo-css-ownership-map.md` (existing, currently empty)

## 6. Reference

- `notes/w21-css-ownership-investigation-2026-06-17.md` — W21 original audit
- `notes/w24-css-smell-2-audit.md` — W24 re-audit + 4-phase plan
- `86fa026` — Phase 2 commit (first consolidation: .info-header dedup)
- `docs/semantic-demo-css-ownership-map.md` — existing ownership docs (empty, planned update)
