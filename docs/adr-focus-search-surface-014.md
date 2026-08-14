# ADR-014 — `focus-search` surface: preserve mode vs force `focus`

**Status:** Accepted (2026-08-14 — verified against implementation, committed)
**Date:** 2026-08-14
**Source:** phone-farm drift-swarm review (`drift-diff-review`, deepseek-v4-flash) + main-lane verification of `src/lib/stores/navigation/surface-mode-map.ts`.

## Context

The surface-mode refactor (uncommitted) introduces `surface-mode-map.ts` as the
single source of truth mapping `PanelSurface` → `NavMode` + `viewFamily`. It
replaces the old inline `_surfaceToMode` map in `url-params.ts` and the
`isMapFamilySurface`-style checks.

`PANEL_SURFACES` includes `'focus-search'`, and the canonical map sets:

```ts
'focus-search': undefined, // fallthrough — preserves current mode (usually focus/search)
```

## Decision

Two candidate semantics for a `?surface=focus-search` URL restore:

1. **Fallthrough (current implementation):** `mode: undefined` → restore keeps the
   user's _current_ mode, only patching the surface. Deliberately _not_ forcing `focus`.
2. **Force `focus`:** treat `focus-search` as a primary focus surface whose restore
   must set `mode: 'focus'` for deterministic deep-link behavior.

Adopted today: **candidate 1 (fallthrough)** — it matches the old behavior where
`focus-search` was not in `_surfaceToMode` (never overrode mode) and, unlike plain
`focus`/`search`, it is a _search-overlay-on-focus_ composite that should inherit
the active mode rather than declare one.

## Consequences

- **Positive:** URL restore keeps current mode stable when landing on
  `?surface=focus-search` from inside focus — no jarring mode switch.
- **Risks:**
    - Deep-link determinism: a fresh `?surface=focus-search` visit with no prior
      mode may leave `mode` at whatever the app default is (not explicitly `focus`).
    - `isMapFamilySurface('focus-search')` must remain `false` (it is galaxy-family),
      which the map confirms (`viewFamily: 'galaxy'`).

### Test-gap note (from review)

No dedicated test asserts the fallthrough for `focus-search` (old map lacked it
entirely; new map makes it explicit). Recommend a unit test on
`requireThreadPayload`-style URL restore: `?surface=focus-search` with prior
`mode='focus'` must yield a patch with `mode: undefined, viewFamily: 'galaxy'`.

## Main-lane verdict

Verified correct against `surface-mode-map.ts` content (file exists untracked;
was absent from the phone clone → the worker's "missing module" flag was an
audit-boundary artifact, resolved by `farm-stage.sh`).

**Acceptance note (2026-08-14):** re-verified against the real code before
committing — `KNOWN_SURFACE_MODE['focus-search'] = undefined` (map:57) and
`getSurfaceModePatch` returns `mode: undefined` + `viewFamily: 'galaxy'` for
`focus-search`, matching the documented fallthrough semantics. Test-gap note
below stands as a recommendation for the owning lane.

---

_Created via farm-swarm drift review; owned by the surface-refactor lane._
