# Nemotron Subagent A — WebGL Listener Leak Fix

## Role
You are a **fix-and-verify** subagent. Edit specific files within your scope. Use source verification before each change. Stay inside your scope.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Source of Truth
Read `tmp/m3-advisor-quality-stability-2026-06-07.md` Step 2 for full evidence. The advisor verified the leak by reading the actual source.

## Scope (you MAY touch)
- `js/modules/three-interaction-visuals.ts:572,573` — listener 1 (and its callback)
- `js/modules/three-interaction-visuals.ts:600` — listener 2 (and its callback)
- `js/modules/three-interaction-visuals.ts:168-171` — `disposeInteractionVisuals()` (add the unbinding)
- `js/modules/three-interaction-visuals.js:568,596` — sync .js sibling lines for the same listeners
- `js/modules/three-interaction-visuals.js:163-166` — sync .js sibling's `disposeInteractionVisuals()`

## OUT OF SCOPE (do NOT touch)
- All other files
- `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`
- TS migration queue files
- CSS files (off-limits per AGENTS.md)
- Any other WebGL/Three.js files

## What to SKIP
- Don't re-investigate the leak. The m3 advisor verified it. Just fix it.
- Don't refactor the surrounding code. Smallest change only.
- Don't run the full test suite. `npm run check:shell` as final smoke test only.

## The Fix

### What's wrong
The two `document.addEventListener` calls at `three-interaction-visuals.ts:572,600` (and the same in the `.js` sibling at lines 568, 596) are **never paired with `removeEventListener`**. The `disposeInteractionVisuals()` function at lines 168-171 only calls `disposeSemanticLens()` and `disposeFocusAnchorIndicator()` — it does NOT unbind the document listeners.

AGENTS.md line 263 says these are "fully disposed" — verified NOT.

### What to do

**Step 1: Hoist the listener callbacks to named functions**

If the callbacks are inline arrows like:
```js
document.addEventListener('pointerdown', (e) => { ... }, options);
document.addEventListener('pointermove', (e) => { ... }, options);
```

Convert them to named functions at module scope:
```js
function _handlePointerDown(e) { ... }
function _handlePointerMove(e) { ... }

document.addEventListener('pointerdown', _handlePointerDown, options);
document.addEventListener('pointermove', _handlePointerMove, options);
```

**Step 2: Pair the listeners in `disposeInteractionVisuals()`**

Add the corresponding `removeEventListener` calls:
```js
export function disposeInteractionVisuals() {
    disposeSemanticLens();
    disposeFocusAnchorIndicator();
    document.removeEventListener('pointerdown', _handlePointerDown, options);
    document.removeEventListener('pointermove', _handlePointerMove, options);
}
```

(Adjust listener types and options to match the actual code.)

**Step 3: Sync the .js sibling**

The `.js` sibling at lines 568, 596, 163-166 has the same bug. Apply the same fix. The .js and .ts should have identical logic.

**Step 4: Verify**

Run `findstr /N "addEventListener\|removeEventListener" js\modules\three-interaction-visuals.js` to confirm pairs exist. Run `npm run check:shell` to confirm no syntax errors.

## Time Budget
- 5 min read source, hoist callbacks
- 10 min apply fix to both .ts and .js
- 5 min verify + smoke test
- 5 min write report

## Output
Save your report to `tmp/nemotron-webgl-listener-leak-report.md` with:
- File:line refs for each addEventListener and the paired removeEventListener
- Sync verification (show both .ts and .js diffs)
- Smoke test result
- Any unexpected findings

## Return
≤120 words: count of pairs added, sync status, smoke test result, any blockers.
