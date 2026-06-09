---
name: HIDDEN_PARENT_GEOMETRY_TRIAGE
description: Diagnose root cause when populated DOM elements report 0x0 geometry in QA/visual audit evidence, by tracing hidden ancestor impact, QA rect snapshots, and owning selector/state writer.
source: auto-skill
extracted_at: '2026-06-09T00:37:38.537Z'
---

# Hidden Parent Geometry Triage

## When to use
- QA JSON or audit shows populated data for an element but `width: 0, height: 0` geometry.
- Surface contract/visual checks fail with "0x0" or `null` rects for live text/rail/list items.
- A specific surface is blocked only in one viewport (desktop vs mobile) and may depend on a different DOM ancestor.

## Procedure
1. Read the blocker QA JSON first. Inspect `.rect` or `rects` snapshots for the symptom element and known parent chain.
2. Identify every ancestor DOM node for the symptom element in the static HTML shell (`vector-explorer-polished.html` or equivalent).
3. For each ancestor, ask whether it is hidden inert by default (`hidden`, `display:none`, `visibility:hidden`, `aria-hidden=true`).
4. Grep owned JS modules for any assignment that unhides that ancestor (e.g. `element.hidden = false`, `classList.remove('hidden')`).
5. Distinguish computed-style values from `getBoundingClientRect()`: `display:block` on a child can still yield `0x0` when its nearest ancestor has `hidden=true` / `display:none`.
6. Only after confirming the hidden-ancestor cause, propose the smallest patch:
   - Preferred: unhide the ancestor from the existing state writer that already surfaces the child.
   - If the ancestor must stay hidden in other states, move the child DOM outside the hidden subtree.
7. Verify by re-grepping the proposed selector to confirm no existing test/audit depends on sibling ancestry.

## Output contract
- Routing/tool-surface sanity
- Exact blocker diagnosis with QA evidence refs
- Owning selector/state writer and why geometry becomes 0x0
- Recommended patch plan, scoped and ordered
- Verification result from grep/static checks
- Risks or unresolved issues

## Guardrails
- Do not edit source files in this procedure unless explicitly authorized.
- Do not delete dead DOM/CSS until exhaustive import/descendant searches confirm no live references.

## Implementation pattern (when authorized)
Once the diagnosis confirms a hidden-ancestor blocker and the owning state writer is identified:

1. **Count every exit path** in the state writer. A function like `syncFocusStage(point)` typically has:
   - One "show" path (valid point, valid view)
   - Two or more "hide" paths (null/clear, filtered out, wrong view, guard failures)
2. **Apply the hidden toggle to the child card on every path**, mirroring the existing pattern for the parent container. Do not rely on CSS cascade or `display:none` inheritance — the `hidden` attribute overrides computed styles and is set by the HTML shell.
3. **Mirror JS and TS siblings** if both exist. The change is structural enough that drift breaks runtime behavior in one track or the other.
4. **Optional targeted tests only** — do not add wide tests for a minimal one-line fix. Rely on existing `journey-selected-card.test.js` / `focus-stage-render-contract.mjs` unless they miss the specific toggle.
5. **Verification stack, in order:**
   - `npm run build` (verifies JS bundle still compiles)
   - `npm run test:unit` (verifies no regression in `journey-selected-card` and related focus-stage tests)
   - `npm run check` or `npm run check:ts-progress` (verifies TS shadow stays type-correct)
   - Regrep the static HTML to confirm the initial `hidden` attribute on the child is still present (it should be — the runtime now toggles it correctly)
6. **Only re-open the ancestor if the child's own toggle is insufficient.** In the `syncFocusStage` pattern, the child `.focus-stage-card` is the surface that needs geometry; toggling `stageCard.hidden` is both minimal and correct.
