# UX State Coverage Audit — Phase 8c (2026-06-26)

## Purpose

Documents the loading/empty/error UX states that each major component provides,
and the patterns that make them accessible. This is the inventory that backs
`tests/unit-active/ux-state-coverage-contract.test.ts` — the contract test that
ensures these states don't silently regress.

## State Taxonomy

Each user-facing async data component should provide **four states**:

| State | Trigger | Visual | A11y |
|-------|---------|--------|------|
| **Idle** | No query yet, no data | (none — component hidden) | N/A |
| **Loading** | Async data in flight | Spinner + brief text | `aria-live="polite"` |
| **Empty** | Query done, no results | Icon + headline + suggested next step | `aria-live="polite"` |
| **Error** | Async failed | Icon + headline + retry/dismiss actions | `role="alert"` or `aria-live="assertive"` |
| **Populated** | Has data | Normal content | (normal markup) |

## Component Inventory

### Tier 1 — Full state coverage (loading + error + empty + populated)

| Component | Loading | Error | Empty | Populated |
|-----------|---------|-------|-------|-----------|
| `Canvas` | ✓ `canvas-loading-overlay` (aria-live polite) | ✓ `canvas-error-overlay` (role=alert, aria-live assertive) | (n/a — no data) | ✓ |
| `InfoPanel` | ✓ `.info-panel-loading` (role=status) | ✓ `.info-panel-error` (role=alert) | ✓ `#selected-empty` | ✓ |
| `SearchInput` | ✓ "Searching..." via `.search-status` | ✓ "Search is unavailable" | ✓ "No matching businesses found" | ✓ |
| `SearchResults` | ✓ `.search-loading` + spinner | ✓ `.search-error-state` + retry/dismiss | ✓ `.search-empty-state` + suggestions | ✓ |
| `MapView` | ✓ `status='loading'` via `.map-status` | ✓ `status='error'` via `.map-status.is-error` | (n/a — map shows tiles or doesn't) | ✓ |
| `FocusPocket` | ✓ `.focus-pocket-loading` (role=status, aria-label) | (parent handles) | (parent handles) | ✓ |
| `JourneyChrome` | ✓ `aria-busy` + isLoading derived | (parent handles) | ✓ "No neighboring stops found" | ✓ |

### Tier 2 — Partial coverage (loading or empty, not both)

| Component | Loading | Error | Empty | Notes |
|-----------|---------|-------|-------|-------|
| `MapSummary` | (n/a) | (n/a) | (hidden when no stops) | Conditional render — empty = not shown |
| `SearchTrailCue` | (n/a) | (n/a) | (n/a) | Static informational overlay, hidden by default |
| `WalkBreadcrumb` | (n/a) | (n/a) | (hidden when no trail) | Conditional render |
| `NeighborRail` | (parent) | (parent) | (n/a) | Renders candidate count, always populated when shown |
| `LoadingOverlay` | ✓ (its purpose) | (parent) | (parent) | App-level overlay with phase progression |

### Tier 3 — Static / no async data

These components don't load data; they're presentation-only:

`DemoChoreography`, `DevGui`, `FocusPocketA11y`, `Header`, `HoverTooltip`,
`LegacyCompassSurface`, `Legend`, `Placeholder2D`, `SearchBar`,
`SearchResultItem`, `SelectedBusinessDetails`, `SemanticGuideCard`,
`SemanticOverlay`, `SpectorInspector`, `Splash`, `ThreadInspector`,
`Toast`, `TrailControls`, `WeatherWidget`

## Accessibility Patterns (Established Conventions)

### Loading announcement

```svelte
<div class="component-loading" role="status" aria-live="polite">
  <div class="spinner" aria-hidden="true"></div>
  <div class="loading-text">Searching the field…</div>
</div>
```

- `role="status"` tells screen readers this is informational
- `aria-live="polite"` waits for current speech to finish
- `aria-hidden="true"` on the spinner icon (decorative)
- Visible text label for sighted users

### Error announcement

```svelte
<div class="component-error" role="alert" aria-live="assertive">
  <svg aria-hidden="true">…</svg>
  <p class="error-headline">Unable to load</p>
  <p class="error-sub">Please try again later</p>
  <button type="button" onclick={retry}>Retry</button>
  <button type="button" onclick={dismiss}>Dismiss</button>
</div>
```

- `role="alert"` interrupts current speech (urgent)
- Recovery actions always present (retry, dismiss)
- Icon is decorative (`aria-hidden`)

### Empty state

```svelte
<div class="component-empty" role="status" aria-live="polite">
  <svg aria-hidden="true">…</svg>
  <p class="empty-headline">No results for "X"</p>
  <p class="empty-sub">Try one of:</p>
  <div class="empty-suggestions">
    {#each suggestions as s}
      <button onclick={() => trySuggestion(s)}>{s}</button>
    {/each}
  </div>
</div>
```

- Polite announcement (not urgent)
- Always provides a suggested next step
- Echoes the user's input so they know what failed

## What's NOT here (acknowledged gaps)

| Gap | Reason | Future work |
|-----|--------|-------------|
| Global error boundary | Svelte 5 doesn't have built-in error boundaries; would need wrapper pattern | Phase 9a |
| Telemetry / analytics | No instrumentation to measure which states users actually see | Phase 9b |
| Performance monitoring | Budgets exist but not measured in CI | Phase 10a |
| Cancel UX on long-running search | No abort button on `SearchInput` | Phase 9c |
| Loading skeletons (vs spinners) | Current pattern uses spinners, not skeleton screens | (style decision) |

## Test Coverage

- **9 components** have explicit loading announcements
- **3 components** have explicit error states (Canvas, InfoPanel, SearchResults)
- **3 components** have explicit empty states (InfoPanel, SearchInput, SearchResults)

Contract test: `tests/unit-active/ux-state-coverage-contract.test.ts`

This document + the contract test are the diamond tier — documented + enforced.
Without them, the UX is gold (works correctly) but undocumented. With them,
the UX is diamond (works correctly AND the contract is locked in).
