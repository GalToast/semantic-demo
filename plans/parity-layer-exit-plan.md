# Parity Layer — Exit Plan (architectural debt)

> Status: analysis only. No source changes. Files referenced here are NOT in the
> parallel session's 11-file working set, so this plan is safe to develop alongside it.

## What it is

`src/lib/orchestration/parity-attrs.svelte.ts` (~766 LoC) is the single source of truth
that syncs 8–9 Svelte stores → `body[data-*]` attributes + `body` CSS classes. Consumers:

- `LegacyCompassSurface` (rendered in `src/App.svelte`) — a legacy-compatible DOM
  (`#journey-compass`, `#btn-focus-dive`) that the **legacy production shell's CSS and
  hit-test contracts** still read.
- Components read via `getBypassAttr(key)` / `useParityAttrs()` / `parityMap`
  (`FocusCard`, `JourneyChrome`, `Canvas`, `Legend`, `main.ts`, `App.svelte`).

## Why it exists

The production deploy still serves a legacy shell that depends on these body attributes
(CSS ownership is split across ordered modules per `AGENTS.md`). The parity layer keeps the
new Svelte UI and the legacy shell in agreement. It was deliberately consolidated (was N
per-component MutationObservers → 1 shared observer + 1 `$effect.root`).

## Real debt / pain points

- **Size + maintenance**: 766 LoC sync module, recurring edits.
- **Svelte 5 reactivity gotcha**: must use explicit `.subscribe()` (not `$derived`
  function-call reads) or the sync effect never re-runs. Documented in
  `qa-screenshots/PARITY_GAP_AUDIT.md`.
- **`use-parity-attrs.svelte.ts` "Decomp risk"**: destructuring the composable's return
  (`const { x } = useParityAttrs()`) silently loses reactivity (getter-on-plain-object).
- **`setRenderKind()`** exists only to prevent a race between `main.ts` and
  `engine-ready.svelte.ts` writing `data-render-kind` — i.e., the webgl ↔ 2D-placeholder
  dual-mount fragility flagged in W47.
- **`LegacyCompassSurface`** is a whole parallel DOM representation kept purely for
  backward-compat.

## Guards already in place (do NOT remove)

- `tests/css-transient-state-ownership-contract.mjs` — 5 transient choreography attrs must
  not become broad panel owners without `data-panel-surface`.
- `tests/integration/w15-body-attr-live-probe.spec.js` — live body-attr probe.
- `tests/demo-camera-retirement-contract.mjs` — guards demo module retirement.

## Exit path (phased, coordinated)

1. **Inventory**: enumerate every `body[data-*]` + legacy DOM node (`#journey-compass`,
   `#btn-focus-dive`) and its consumers (CSS rules + hit-test JS).
2. **Map** each to a Svelte-component source of truth (the new UI already renders the
   equivalent state).
3. **Flip** consumers to read from components; keep parity attrs as a shim during transition.
4. **Delete** `LegacyCompassSurface`, `parity-attrs.svelte.ts`, `use-parity-attrs.svelte.ts`,
   and the legacy/bypass CSS once no consumer reads body attrs.
5. **Keep** the contract tests as regression guards through the migration; retire them only
   when the legacy shell is fully gone.

## Small wins (low risk, do anytime — non-colliding)

- Loudly document / lint-forbid destructuring `useParityAttrs()` (ESLint rule or dev-only
  runtime warning) to prevent the reactivity footgun.
- Add a one-line comment at `setRenderKind` pointing to the W47 dual-mount race write-up.

## Risk

CSS ownership is split across ordered modules (`css/*.css`); the legacy shell's CSS must be
migrated in lockstep. Touching this without the full inventory (step 1) risks breaking the
production deploy's hit-tests. Recommend a dedicated ticket + session lock, not a casual
cleanup.
