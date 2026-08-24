# UX Copy Rules (W48-J)

Date: 2026-07-03

User-facing copy in Semantic Explorer must not leak engineering jargon. Words like "semantic", "node", "cluster", "signal", "thread", and "mycelium" describe _how the dataset is wired up internally_ — end-users do not need to know that to find a plumber in Conroe. They make copy that should be inviting instead feel like database documentation.

## Forbidden Jargon in User-Visible Strings

The following words must never appear in strings a user sees. Excluded locations: comments, variable names, source-code identifiers, internal-state keys, and the `a11y-ok` comment annotations in CSS:

| Term       | Why it's jargon                                                    | Friendly replacement                             |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| `semantic` | Refers to embedding-space relationships, not user concepts         | Drop entirely or say "similar" / "related"       |
| `node`     | 3D WebGL geometry term                                             | "business" / "listing" / "result"                |
| `cluster`  | K-means cluster id                                                 | "kind" / "type" / "category"                     |
| `signal`   | Cosine-similarity score                                            | "strength of match" or just drop                 |
| `thread`   | Path of related records                                            | "similar businesses" / "connections"             |
| `mycelium` | System-internal metaphor for the network visualization             | Never                                            |
| `trail`    | OK as a UI surface name (one of the 6 journey phases) but not copy | OK in url params and nav-state, not user strings |
| `record`   | Database row                                                       | "listing"                                        |
| `point`    | GeoJSON point                                                      | "location"                                       |
| `demo`     | Legacy key used in rail-status.ts fallback path — copy says "Local data" now | Never as user-visible copy                      |

A test in `tests/unit-active/thread-lens-friendly-copy.test.ts` enforces the string-literal contract for the highest-exposure site (`describeThreadLensForPoint`). The pattern is reusable: source-inspect the file, extract all string literals, fail if any contains a forbidden word. Add the same style of test for a new copy-heavy module.

## Friendly Copy Patterns

| Pattern                         | Example input → output                                                                                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Describe what the user sees     | "Sparse node — only 3 connections" → "Only 3 similar businesses."                                                                                                                             |
| Show the consequence, not state | "Status: disqualified" → "No longer active. Was a HVAC business."                                                                                                                             |
| Verb-first when actionable      | "Showing connections from" rather than "Connection Trail — focused on"                                                                                                                        |
| Concrete nouns over metaphors   | "Connections" rather than "Thread"; "Kind of business" rather than "Semantic Neighborhood"                                                                                                    |
| Give a next step                | When neighborCount === 0 in JourneyChrome: "Stop N. No more visible stops in this slice. Use Prev to return to Overview to find more connections." (already implemented in W47-g by the lane) |

## Layout-Label Conventions

The four label-value rows in `SelectedBusinessDetails.svelte`'s `.selected-grid` are now:

| Visible label      | Title (hover/screen-reader hint)                                                         |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Business type      | "The kind of business this is — what it does, based on similar listings in the area."    |
| Status             | (no title needed — the value is self-descriptive "Active" / "Inactive")                  |
| Coordinates        | (self-descriptive)                                                                       |
| Similar businesses | "Other similar businesses in the area, ordered by how strongly they relate to this one." |

The ids (`#selected-theme`, `#selected-status`, `#selected-map`, `#selected-thread`) remain unchanged so existing ownership-contract tests and journey tests keep passing — only the visible label text and the `title` tooltips changed. **Do not rename the ids without updating every test in `tests/info-panel-surface-ownership-contract.mjs` / `tests/journey-ui-ownership-contract.mjs` / `tests/map-focus-search-content-owner-contract.mjs`.**

## Live Regions & Control Labels (2026-08-24 UX sweep)

- **No container-level `aria-live`** on chrome wrappers (`#journey-chrome`): trail context/progress text changes on every focus step — a live region there spams screen readers and double-announces the scoped `role="status"` regions inside. Announce via dedicated status elements only.
- **Disabled controls don't show counts**: idle filter reset renders plain `Reset`; the `(N)` count appears only when filters are active (a disabled "Reset (0)" reads like it counts something invisible).
- **Decorative swatches carry no tooltips**: identical verbose `title` strings repeated across legend swatches are tooltip/SR noise; the wrapping button already carries name + count.

## Exceptions (Intentional Jargon Surfaces)

| Surface                                                  | Why it's OK                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MapSummary mini-map (debug)                              | The visible label "Trail" matches the journey-phase name (`trail`). Internal jargon in DOM ids (`#map-trail`) is fine.                                              |
| Engine internal error messages                           | Raw `error.message` strings are now hidden inside `<details>` collapsed by default in LoadingOverlay and MapView, with friendly summary above.                      |
| LoadingOverlay / MapView `.loading-error-technical code` | Lives inside `<details>` collapsed by default; user has opted-in by expanding. Annotate with `/* a11y-ok: technical-only, ... */` to opt out of the contrast audit. |

## How to Audit

```bash
# Run the full a11y audit (zero findings = clean slate)
node scripts/audit-a11y.mjs

# Re-run the friendly-copy guard for thread-lens
npx vitest run tests/unit-active/thread-lens-friendly-copy.test.ts

# Find any remaining "semantic" / "cluster" / "thread" strings in src/
rg -n '"[^"]*(semantic|cluster|signal|thread|node)[^"]*"' src/
```
