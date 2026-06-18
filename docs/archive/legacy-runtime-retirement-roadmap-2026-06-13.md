# Legacy runtime retirement roadmap — 2026-06-13

**Status:** In progress. Ticket 9A (Worker D) in flight.
**Companion:** `docs/both-pattern-exit-criteria.md` (the strategic frame),
`docs/both-pattern-exit-evidence-2026-06-13.md` (the wave record),
`docs/both-pattern-follow-ups-2026-06-13.md` (the closeout doc).

This file replaces `tmp/alias-removal-survey-2026-06-13.md` (which had to
move out of `tmp/` because `tmp/` is gitignored in this repo). It captures
the survey that informed the Ticket 9 wave plan.

---

## Current state at 2026-06-13 23:20 UTC

`git log --oneline -1` = `12fbbbf` (wave push)
Working tree clean. Auto-marked-at: `5261be5 docs(closeout): mark BOTH
Ticket 8 closed — queue is now fully empty`.

### Dynamic `@legacy/*` imports remaining in `src/`: **15**

```
src/components/MapView.svelte                          1
src/lib/demo/choreography.ts                           1
src/lib/journey/journey.ts                             4
src/lib/engine/demo-choreography.ts                    7
src/lib/engine/adapters/lifecycle-bridge.ts            2   (+ 1 cycle-keep, post-Ticket-9A)
```

### Static `@legacy/*` imports remaining (acceptable)

These are the desired BOTH-pattern state — actual TS facade re-exports
or direct module references. Not in scope for any alias-removal ticket.

```
~38 files in src/lib/ with `import ... from '@legacy/...'`
~10 files in src/lib/types with `legacy-modules.d.ts` (the TS facade)
```

The `@legacy/*` path alias in `vite.config.ts` is still needed.

---

## Ticket 9 wave plan

### Ticket 9A — non-cycle conversions (in flight via Worker D ~10-15 min)

Per-ripgrep survey, 4 of the 15 dynamic `@legacy/*` imports have no
circular-dep risk and convert cleanly to static ESM:

| File | Pattern | Why safe |
|---|---|---|
| `src/components/MapView.svelte` | `import('@legacy/state')` for `withStateMutation` + `state.currentView` | `js/state.js` already statically imported by `FilterChrome.svelte`, `journey-thread-settler.js`, etc.; the dynamic form was INEFFECTIVE per the build warning |
| `src/lib/demo/choreography.ts` | `import('@legacy/modules/micro-demo-choreography.js')` | TS module, no current static sibling — fresh static reference safe |
| `src/lib/engine/adapters/lifecycle-bridge.ts` (filter-state site) | `import('@legacy/modules/filter-state.js')` | The static `legacyStateModule` and `legacyViewControllerModule` are already in this file; `filter-state` follows the same intentionally-stale pattern |
| `src/lib/engine/adapters/lifecycle-bridge.ts` (event-bus site) | `import('@legacy/modules/event-bus.js')` | `event-bus` is statically imported in many other Svelte modules (`search-state.ts`, `cluster-filter-controller.ts`, `triggers.ts`); cycle-safe |

Total to convert: **4**. After Ticket 9A: **15 → 11** dynamic imports.

### Ticket 9B — `journey-canvas-interaction` cycle break (next)

The 4 imports of `@legacy/modules/journey-canvas-interaction` (in
`src/lib/journey/journey.ts` and 1 in `src/lib/engine/adapters/lifecycle-bridge.ts`)
are a real cycle:

```
journey.ts → journey-canvas-interaction.ts → ... → journey.ts
```

The current pattern uses `let _loadCanvasInteraction = import(...)` so the
import is deferred until inside a function body (post-init). Converting to
static would deadlock Vite module resolution at boot.

**Ticket 9B plan:** introduce a deferred-init protocol so the cycle is
broken at the type-system level, not via dynamic import. Options:

1. **Boot-time injection (preferred).** Move the `ensureCanvasNodeInteractionBindings`
   call to be after both modules are loaded. Use a publish/subscribe
   gating pattern: journey.ts publishes a `READY_FOR_CANVAS_BIND` event,
   journey-canvas-interaction subscribes; on mount of JourneyChrome.svelte
   (which is the only consumer of the binding), the wiring runs.
2. **Symbol/key indirection.** Define a typed binding interface in a
   small `@lib/journey/canvas-interaction-types.ts` module imported by
   both sides. The actual implementation is injected at boot. The two
   modules import only the types; one or both sides accept the binding
   via a setter.
3. **Split the cycle source.** Identify what journey-canvas-interaction
   imports back from journey.ts; inline those constants into
   journey-canvas-interaction.ts directly. If the back-reference is
   purely static (constants/types), this works without a runtime
   contract change.

Effort: 4-6 hours. Risk: moderate — affects JourneyChrome render path.

### Ticket 9C — `demo-choreography.ts` lazy-loader simplification (follow-up)

The file has 7 dynamic imports:

```
loadLifecycle                 → @legacy/modules/lifecycle.js
loadJourneyCompass            → @legacy/modules/journey-compass-controller.js
loadJourney                   → @legacy/modules/journey.js
loadPanelBindings             → @legacy/modules/bindings/panel-bindings.js
loadMicroDemoGuards           → @legacy/modules/micro-demo-guards.js
loadMicroDemoCamera           → @legacy/modules/micro-demo-camera.js
loadMicroDemoUi               → @legacy/modules/micro-demo-ui.js
```

Each is a deliberate lazy-loader (one async helper per module). The
pattern holds 7 dynamic-import boundaries intentionally as a runtime
isolation strategy.

**Ticket 9C plan:** Refactor `demo-choreography.ts` to consume
single-track modules:

1. For modules that have BOTH pattern Svelte ts sources (e.g.,
   `journey-compass-controller.ts` is canonical; the .js is a facade),
   import the .ts directly with a typed cast.
2. For modules that ARE pure JS shims (e.g., `bindings/panel-bindings`,
   `micro-demo-guards`, `-camera`, `-ui`), keep dynamic import for the
   cycle-break reason — but convert to `Promise.all([...])` in the
   `_ensureLoaded()` helper to drop 6 dynamic imports to 1 Promise.all.
3. The single remaining dynamic import can stay or be replaced with a
   `import(/* @vite-ignore */ ...)` if Vite supports it.

Effort: 4-8 hours. Risk: moderate — affects demo state machine.

### Ticket 9D — drop `@legacy/*` from `vite.config.ts`

Once Ticket 9A + 9B + 9C land, the dynamic `@legacy/*` count in `src/`
should be 0 (or near-zero with documented cycle-keep sites). The path
alias can be removed from `vite.config.ts`.

Verification: `npm run check` + `npm run dev:svelte` + `npm run build`.
If any import breaks, the alias-removal is too aggressive; restore
the alias and address the broken import separately.

Effort: 1-2 hours. Risk: low.

### Ticket 9E — write `docs/legacy-runtime-retirement.md`

The exit-criteria doc requires this artifact (signal #4). It names:
- The deletion commit (likely Ticket 9D)
- The consumer surface that migrated (Ticket 9A + 9B + 9C)
- The verification that built without the alias

Effort: 30 minutes.

---

## What's currently NOT in scope for the alias-removal wave

- **Most static `@legacy/*` imports** — these are the desired BOTH-pattern
  shape: TS modules reaching into legacy through a stable alias. The
  retirement doc is about removing the alias entirely, but for now the
  alias is the bridge that lets both tracks coexist.
- **`js/modules/**/*.js` runtime stubs** — these will be deleted as
  they're migrated; the BOTH-pattern infrastructure handles the Vite
  resolution.

---

## Estimation

| Phase | Effort | Risk |
|---|---|---|
| Ticket 9A (4 static conversions) | 10-15 min | Low |
| Ticket 9B (cycle break refactor) | 4-6 h | Moderate |
| Ticket 9C (lazy-loader simplification) | 4-8 h | Moderate |
| Ticket 9D (alias removal) | 1-2 h | Low |
| Ticket 9E (retirement doc) | 30 min | None |
| **Total to "BOTH-pattern retired"** | **10-16 hours** | **Cumulative moderate** |

The original exit-criteria doc projected 6-10 weeks. At current cadence
this wave closes the arc; ticket 9B + 9C land next week.

---

## How to extend this survey

When Worker D returns from Ticket 9A, update the file's "Current state"
section. After each subsequent ticket, re-run:

```bash
rg 'import\(.@legacy' src/  # dynamic imports remaining
rg '@legacy' src/ -l         # files still touching the alias
```

The remaining dynamic count after each Ticket is the inflection signal.
