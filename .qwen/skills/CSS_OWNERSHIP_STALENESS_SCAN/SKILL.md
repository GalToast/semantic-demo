---
name: CSS_OWNERSHIP_STALENESS_SCAN
description: Static grep-based audit of CSS ownership risks: stale/dead selectors, rules targeting non-existent DOM elements, load-order inversion, and dual-owner splits in a split-cascade mobile setup.
source: auto-skill
extracted_at: '2026-06-08T16:37:37.725Z'
---

# CSS Ownership Staleness Scan

Use when the project uses a split CSS cascade (e.g. `semantic-demo.css` + 7-file `mobile_premium__*.css` split) with strict ownership docs, and you need to audit for maintenance risks without running the browser.

## When to Use

- Before a production polish pass to catch selector decay before it bites QA.
- After a Svelte/JS migration wave that may have orphaned legacy CSS selectors.
- When an ownership doc claims certain selectors belong to one file but evidence suggests they never fire.
- As a low-cost alternative to browser QA when time/compute is constrained.

## When NOT to Use

- For visual/layout bugs (use browser Playwright/contract tests instead).
- For specificity/cascade living-behavior bugs that only show up with computed styles.
- When `npm run check:ownership` already passes and you need structural cascade validation (use that contract suite; this skill focuses on selector/DOM-targeted gaps).

## Procedure

1. **Anchor on authoritative ownership docs first**
   - Read the ownership map (e.g. `docs/semantic-demo-css-ownership-map.md`) and state-ownership matrix (e.g. `docs/semantic-demo-mobile-state-ownership.md`).
   - Note: documented owner differs from *load order winner* for equally-specific selectors in later files.

2. **Run the ownership contract suite as a floor**
   - Run `npm run check:ownership`.
   - If it fails, stop: prior fixes are still pending and this scan may be stale.
   - If it passes, note retired contracts (Svelte migration may have moved invariants to runtime tests).

3. **Cross-reference each key selector class against live DOM producers**
   - For each suspect selector family (e.g. `.focus-stage-*`, `.selected-*`, `.journey-compass-*`), verify that **something** creates the element:
     - `grep -n "focus-stage-filed" js/ src/ dist/ vector-explorer-polished.html` for statically referenced IDs.
     - Check legacy JS: `document.getElementById('focus-stage-filed')` or `.createElement(<class>)`.
     - Check Svelte src: `<div class="focus-stage-filed">` in `src/components/`.
     - Check `dist/bundle.js` and `dist/svelte/assets/*.js` — the actual runtime DOM creation code lives there, not necessarily in raw `.js`/`.svelte` if a build hasn’t been refreshed.
   - A selector with zero producers is **dead CSS**. Record the exact line ranges owning it.

4. **Find CSS rules on non-existent elements (stale selectors)**
   - `grep -n "\.selected-details" css/` — if zero hits, those elements aren’t styled anywhere (confirm producers exist via Step 3; legitimate unstyled elements are fine if intentional).
   - `grep -n "\.selected-hero" css/` — if hits exist but no producer creates `.selected-hero` in runtime, the class definition is dead weight.
   - Flag any selector that might cause silent no-ops at runtime.

5. **Find dual-owner splits (competing selectors across mobile files)**
   - For a given selector (e.g. `.focus-stage-dive-btn`), count matches across `css/mobile_premium__*.css`:
     - `grep -n "\.focus-stage-dive-btn" css/mobile_premium__*.css`
   - If the owning doc designates only one file (e.g. `focus-dive.css`) as canonical but 2–3 files contain state-scoped rules, mark it as a **dual-owner risk**.
   - Calculate effective specificity: later files override earlier ones if specificity ties. Load order is in `vector-explorer-polished.html`.

6. **Find load-order inversion smells (tail-loaded base files)**
   - Identify files loaded via the HTML `<link>` cascade **after** the split mobile files.
   - `grep -n "css/modules/focus_stage.css" vector-explorer-polished.html` — if it’s the last `<link>`, its rules are final/tail authority even though it’s conceptually a “base” file.
   - Flag this because editors are liable to treat later-loaded files as lower priority.

7. **Find state-surface gaps (documented states without mobile owner)**
   - For each `data-panel-surface` value listed in the ownership doc, grep mobile_premium__ files for that value.
   - Example: `grep -rn "data-panel-surface='map-focus'" css/mobile_premium__*.css`
   - If zero matches for a valid state value, flag it: the state has no mobile-specific cascade rules.
   - Verify whether the state can even fire (check JS writers in `js/modules/lifecycle.js` or `js/modules/view-controller.js`).

8. **Check for legacy-then-Svelte duplication rot**
   - Search for `.selected-role-badge`, `.selected-hero`, `.selected-subtitle`, etc., across both `css/*.css` and `src/components/*.svelte`.
   - If the Svelte component defines the element and its own style, but legacy CSS also styles it when mounted via legacy JS, mark it as a **transition-shift risk** during migration.

## Output Format

Report findings as:

```
## Finding N: <title>
- **Risk**: High / Medium / Low
- **Files**: explicit path + line ranges
- **Evidence**: exact grep output or count
- **User-visible effect**: what breaks / shifts / becomes unpredictable
- **Verification command**: one-line shell command to reproduce the finding
- **Fix order**: 1st, 2nd, etc., with rationale
```

Top 5 risks only. Rank by user-visible severity × latent breakage likelihood.

## Constraints

- Do NOT edit CSS. This is a **report-only** worker skill.
- Do NOT run `grep` on `dist/` during automated loops unless instructed; `dist/` is generated and stale checks waste time. Prefer `src/` and `js/modules/` plus one targeted `dist/` spot-check if ownership is unclear.
- Respect dirty worktree: if the diff shows recent uncommitted CSS fixes, cross-reference them before concluding a rule is still “live.” A rule could be fixed but uncommitted.
- If a selector targets an element the doc explicitly says is “supporting/legacy,” lower its severity unless it’s actively misleading editors.
