# Agent 4 — Determinism Fixes: `Math.random()` + Fetch AbortController

You are fixing two categories of bugs in the semantic-explorer project: (1) non-deterministic `Math.random()` calls in geometry/visual code, and (2) missing `AbortController` for search-related fetch calls.

**Working directory:** `C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## YOUR SCOPE — Non-overlapping with other agents

You own these files ONLY:
- `js/modules/weather-ui.js` — `Math.random()` calls
- `js/modules/audio-scape.js` — `Math.random()` calls
- `js/modules/journey-selected-card.js` — `Math.random()` calls
- `js/modules/search-state.js` — zombie fetch signals (missing AbortController)
- `js/modules/search-results-ui.js` — if it has fetch calls without abort

You do NOT own:
- Any `.ts` files — other agents handle those
- `src/lib/` files — Agent 6 handles those
- Any files being deleted — Agent 3 handles dead code

## TASK 1 — Replace `Math.random()` with `seededUnit()`

The project has a deterministic PRNG at `js/modules/utils/seeded-random.js`:
```javascript
export function seededUnit(index, salt) { ... }
```

It returns a deterministic float in [0, 1] based on a node index and salt value. This is required for screenshot QA — `Math.random()` breaks determinism.

### Files to fix:

**`js/modules/weather-ui.js`:**
```bash
grep -n "Math\.random()" js/modules/weather-ui.js
```
Replace each `Math.random()` with `seededUnit(index, salt)` where `index` is a loop index or node index, and `salt` is a string constant unique to the usage site (e.g., `'weather-icon'`, `'weather-glow'`).

Import at top of file:
```javascript
import { seededUnit } from './utils/seeded-random.js';
```

**`js/modules/audio-scape.js`:**
```bash
grep -n "Math\.random()" js/modules/audio-scape.js
```
Same pattern — replace with `seededUnit()`. Use descriptive salts like `'audio-pan'`, `'audio-volume'`.

**`js/modules/journey-selected-card.js`:**
```bash
grep -n "Math\.random()" js/modules/journey-selected-card.js
```
Replace with `seededUnit()`. Use salts like `'card-delay'`, `'card-variant'`.

### Rules for `seededUnit()` usage:
- `index` should be a meaningful identifier (node index, loop counter, card index)
- `salt` should be a descriptive string constant
- NEVER use `Math.random()` in any file you touch
- If the usage doesn't have a natural index (e.g., "random delay between 0 and 1000ms"), use a combination of a stable identifier and salt: `seededUnit(someId, 'delay') * 1000`

## TASK 2 — Add AbortController to search fetch calls

**`js/modules/search-state.js`:**
The search state module triggers fetch calls that can pile up on rapid typing. Each new search should cancel the previous one.

```bash
grep -n "fetch\|AbortController\|abort" js/modules/search-state.js
```

The fix pattern:
```javascript
// At module level or in the search trigger function:
let _searchAbortController = null;

function triggerSearch(query) {
    // Cancel previous in-flight request
    if (_searchAbortController) {
        _searchAbortController.abort();
    }
    _searchAbortController = new AbortController();
    
    // Pass the signal to fetch:
    fetch(url, { signal: _searchAbortController.signal })
        .then(response => { ... })
        .catch(err => {
            if (err.name === 'AbortError') return; // Expected — previous request cancelled
            // Handle real errors
        });
}
```

Also check `state.searchAbortController` — the `SemanticState` interface already has this field. Use it if the search function has access to state:
```javascript
// If using state singleton:
if (state.searchAbortController) state.searchAbortController.abort();
state.searchAbortController = new AbortController();
fetch(url, { signal: state.searchAbortController.signal });
```

Check if this pattern is already partially implemented — the interface has `searchAbortController: AbortController | null` which suggests it was started but may not be wired up everywhere.

## STEP 1 — Audit current state

```bash
cd "C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer"

echo "=== Math.random() locations ==="
grep -rn "Math\.random()" js/modules/weather-ui.js js/modules/audio-scape.js js/modules/journey-selected-card.js

echo "=== Fetch calls in search-state.js ==="
grep -n "fetch(" js/modules/search-state.js

echo "=== AbortController usage ==="
grep -n "AbortController\|abort()" js/modules/search-state.js

echo "=== seededUnit import availability ==="
head -5 js/modules/utils/seeded-random.js
```

## STEP 2 — Fix `Math.random()` (3 files)

For each file:
1. Read the file to understand the context of each `Math.random()` call
2. Add `import { seededUnit } from './utils/seeded-random.js';` at top
3. Replace each `Math.random()` with `seededUnit(index, 'salt')` using appropriate index/salt
4. Verify no `Math.random()` remains: `grep -n "Math\.random()" <file>`

## STEP 3 — Fix fetch abort (1-2 files)

For `search-state.js`:
1. Read the file to understand the search trigger flow
2. Add AbortController management to the search trigger function
3. Ensure the abort signal is passed to fetch calls
4. Ensure `AbortError` is caught and silently ignored (expected behavior)
5. Check if `state.searchAbortController` is already managed — if so, just wire it up

Also check `search-results-ui.js` for any fetch calls that lack abort:
```bash
grep -n "fetch(" js/modules/search-results-ui.js
```

## STEP 4 — Verify

1. `npm run build` — must succeed
2. `npm run lint` — no new errors
3. `grep -rn "Math\.random()" js/modules/weather-ui.js js/modules/audio-scape.js js/modules/journey-selected-card.js` — must return 0 results
4. `grep -n "fetch(" js/modules/search-state.js` — all fetch calls should have `{ signal: }` option

## STEP 5 — Report

```markdown
## Agent 4 — Determinism + Abort Fix Report

### Math.random() elimination
- `weather-ui.js`: <count> calls replaced, <count> remaining
- `audio-scape.js`: <count> calls replaced, <count> remaining
- `journey-selected-card.js`: <count> calls replaced, <count> remaining

### Fetch abort
- `search-state.js`: AbortController wired: Y/N
- `search-results-ui.js`: checked, needs fix: Y/N
- Previous in-flight requests now cancelled: Y/N

### Verification
- `npm run build`: PASS/FAIL
- `npm run lint`: PASS/FAIL
- `grep Math.random()`: 0 results in scope files

### Cross-seam findings
- Any other files with Math.random() in geometry code: <list>
- Any fetch calls outside your scope lacking abort: <list>
```
