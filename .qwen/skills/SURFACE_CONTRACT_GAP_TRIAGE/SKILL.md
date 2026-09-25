---
name: SURFACE_CONTRACT_GAP_TRIAGE
description: Decision procedure for surface contract failures with missing DOM or activation targets, classifying whether each gap is a selector/test issue, a missing production control, or a coverage gap, and choosing between source and test fixes.
source: auto-skill
extracted_at: '2026-06-09T18:07:46.401Z'
---

# Surface Contract Gap Triage

## When to use

- A surface contract fails on missing DOM selectors or missing activation targets, and the failure is **not resolved by simple selector renaming**.
- The target DOM may exist under a different path in the production shell or Svelte shell (`src/components/*`), or the activation control may have been removed/never migrated.
- Prior selector-drift fixes did not fully resolve the surface, leaving multiple failing assertions (`dom:*`, missing IDs/classes, missing controls, missing overlays).
- You need to decide **before patching** whether the correct fix is a source change, a contract-only change, or a coverage gap to document.

## First principles

1. **Classify each failure independently.** A single surface contract can contain mixed failure types: missing static element, missing dynamic overlay, hidden-by-state, Svelte-only target, and missing activation control.
2. **Prefer the least invasive fix that preserves product intent.** If the missing target is not load-bearing UX, update the contract. If it is load-bearing UX, source the control.
3. **Do not conflate ‘passing the test’ with ‘fixing the product’.** A passing contract after a test-only change can hide a real missing button, strip, or overlay.
4. **Environment can lie.** A failing contract on the wrong shell or wrong server is not a DOM bug; verify the preview/static shell before editing selectors or sources.

## Procedure

### 1. Reproduce on a clean preview

- Build fresh: `npm run build:svelte` or the repo’s canonical build for the shell under test.
- Start preview on a fixed port (e.g. `npm run preview -- --host 127.0.0.1 --port <port> --strictPort`).
- Confirm the URL under test returns HTML, not API JSON or ERR_EMPTY_RESPONSE.
- Run the exact contract command against that URL.
- Record exact pass/fail and exit code.

### 2. Inventory all failing assertions

For each failing check, label it:

| Label | Meaning |
|---|---|
| `missing-static` | The element exists in source but not present in the built/preview DOM generally, even when hidden. |
| `missing-dynamic` | The element exists only after state changes or user actions; contract timing may be off. |
| `state-hidden` | The element exists but is hidden by data attributes / CSS / derivation in the tested surface. |
| `svelte-only` | The selector exists only in `src/` output, not in the production shell or bundled preview. |
| `legacy-only` | The selector exists only in the legacy shell, not the Svelte shell. |
| `missing-activation` | The test clicks an ID/class that does not exist at all in either shell or Svelte output. |

### 3. Map actual owners and paths

For each failing target:

- Search `src/components/**`, `vector-explorer-polished.html`, and built preview HTML.
- Identify current owner component and state derivation path.
- Confirm whether a real toggling action already exists (e.g. map journey primary button toggling map phase and resulting strip visibility).
- If a missing activation target is intentional by product decision (UX removed, flow changed), document that as a **planned gap**.

### 4. Decide fix category

Use this priority order unless the user explicitly states otherwise:

1. **Environment/server fix** — wrong URL, stale dev server, PHP intercept on production shell port.
2. **Contract selector update** — element exists under a different ID/class or state derivation; update selectors to accept real production selectors.
3. **Contract timing/state fix** — element appears after user action or late state derivation; update contract to perform the action or extend waits.
4. **Source control add-back** — the missing target is load-bearing UX and no equivalent control exists.
5. **Coverage gap documentation** — the missing target is not product-required; add a known limitation note and adjust contract expectations.

### 5. Present a neutral recommendation

When multiple valid choices exist, present:

- **Recommended option**
- **Minimal-effort option**
- **Product-correct option** (if different from minimal)
- **Risk** for each option
- **Verification needed** to confirm the fix resolves the failing assertions

Do not default to one category unless the user has stated preference.

### 6. Verify and handoff

- After applying the chosen fix, re-run the exact contract command.
- If the contract is green, record the change and note any remaining coverage gaps.
- If the contract remains red, return to step 2 and rewrite the remaining failures individually.

## Output template

```
## Current state
- Contract pass/fail: X pass / Y fail
- URL under test: ...
- Command: ...
- Notes: ...

## Failure inventory
| Check | Label | Owner/path | Evidence |
|---|---|---|---|
| dom:... | missing-static/... | ... | ... |

## Fix options
- Recommended: <A/B/C>
- Minimal: ...
- Product-correct: ...
- Risk: ...

## Next step
<apply fix / verify / rerun contract>
```

## Anti-patterns to avoid

- **Silent test hallucination:** Changing a contract selector to pass without confirming the element exists, is present when needed, or is not Svelte-only transient markup.
- **Source-first reflex:** Adding a control solely because a legacy test expected it, without confirming product intent or UX ownership.
- **One-category trap:** Treating all missing-DOM failures as selector drift, ignoring that some are genuine activation-coverage or missing-dynamic-element gaps.
- **Environment assumption:** Reusing a stale dev server after a fresh build was requested; the contract runner must use the intended server/shell.
- **Coverage laundering:** Running a contract pass after a broad selector change and not noting which original assertions were renamed vs truly validated.
