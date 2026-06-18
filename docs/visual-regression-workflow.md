# Visual Regression Workflow

## Overview

This project uses Playwright screenshot comparison to detect visual regressions in the 4 primary body data-attr states. The test suite captures full-page screenshots at 1440×900 viewport and compares them against stored baselines.

**Test file:** `tests/integration/visual-state-snapshots.spec.js`
**Baselines:** `tests/integration/visual-state-snapshots.spec.js-snapshots/`
**Reference PNGs:** `tests/integration/__snapshots__/` (copy of baselines for documentation)

---

## How to Add a New Visual Baseline

1. **Add a test case** to `tests/integration/visual-state-snapshots.spec.js`:

```js
test('my-new-state', async ({ page }) => {
    await navigateToApp(page)
    // ... perform actions to reach the state ...
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS)  // 3 seconds for CSS animations

    await expect(page).toHaveScreenshot('my-new-state.png', {
        ...SNAPSHOT_OPTIONS,
        updateSnapshots: UPDATE_SNAPSHOTS ? 'always' : 'missing',
        fullPage: true,
    })
})
```

2. **Generate the baseline** by running with `UPDATE_SNAPSHOTS=true`:

```bash
# Against the production preview (recommended):
TEST_BASE_URL=http://127.0.0.1:4174 UPDATE_SNAPSHOTS=true \
  npx playwright test tests/integration/visual-state-snapshots.spec.js \
  --browser=chromium --timeout=60000

# Or against the Vite dev server:
TEST_BASE_URL=http://127.0.0.1:5175 UPDATE_SNAPSHOTS=true \
  npx playwright test tests/integration/visual-state-snapshots.spec.js \
  --browser=chromium --timeout=60000
```

3. **Copy the new PNG** from the Playwright-generated `*-snapshots/` directory to `tests/integration/__snapshots__/` for documentation:

```bash
cp tests/integration/visual-state-snapshots.spec.js-snapshots/my-new-state-chromium-win32.png \
   tests/integration/__snapshots__/my-new-state.png
```

4. **Commit both** the `*-snapshots/` PNG and the `__snapshots__/` copy.

5. **Verify** future runs pass in compare mode (without `UPDATE_SNAPSHOTS`):

```bash
TEST_BASE_URL=http://127.0.0.1:4174 \
  npx playwright test tests/integration/visual-state-snapshots.spec.js \
  --browser=chromium --timeout=60000
```

---

## How to Update an Existing Baseline

1. **Set `UPDATE_SNAPSHOTS=true`** and run the test:

```bash
TEST_BASE_URL=http://127.0.0.1:4174 UPDATE_SNAPSHOTS=true \
  npx playwright test tests/integration/visual-state-snapshots.spec.js \
  --browser=chromium --timeout=60000
```

2. **Manually inspect the diff** (check `test-results/` for the actual vs expected PNGs):

```bash
# The actual screenshot is saved in test-results/ alongside error-context.md
ls test-results/*-actual.png
```

3. **Decide:**
   - **Intentional change** → update the baseline PNG and commit
   - **Unintentional regression** → fix the code, then re-run

4. **Copy the updated PNG** to `__snapshots__/` for documentation.

5. **Commit** the updated PNG.

---

## How to Interpret Failures

### No diff → test passes
The current rendering matches the baseline. This is the expected outcome.

### Small diff (anti-aliasing, font rendering, color profile)
These are environmental differences between machines or OS versions. The test uses:
- `maxDiffPixelRatio: 0.01` — allows up to 1% pixel difference
- `threshold: 0.2` — per-pixel tolerance for anti-aliasing
- `animations: 'disabled'` — captures a stable frame

If the diff is small and matches known environmental variance, update the baseline.

### Large diff → visual regression
A significant visual change indicates either:
- A CSS/HTML change that affected the layout
- A JS change that affected the rendering pipeline
- A Three.js/WebGL change that affected the 3D scene

**Do not update the baseline until you investigate the root cause.**

---

## The 4 Existing State Baselines

### 1. idle-overview
**User flow:** Navigate to the app and wait for scene readiness.
**Expected body attrs:** `data-mode="overview"`, `data-journey-phase="overview"`, `data-search-status="idle"`
**Screenshot captures:** The initial galaxy view with compass rail, no panels open.

### 2. search-mode
**User flow:** Navigate → click Search mode radio → type "cafe" → wait.
**Expected body attrs:** `data-search-status` reflects search activity.
**Screenshot captures:** Search panel open with query results visible.

### 3. focus-search
**User flow:** Navigate → click Search mode → type "cafe" → press Enter → click first search result.
**Expected body attrs:** `data-mode="focus"`, `data-nav-surface="focus-search"`, `data-focused-node="522"`, `data-journey-phase="focus-search"`
**Screenshot captures:** Focused node with info panel, search context visible.

### 4. focus-programmatic
**User flow:** Navigate → click a visible field-node in overview.
**Expected behavior:** Falls back to programmatic focus without search context.
**Note:** This test skips if no field-node is visible in the initial view (depends on data loading).

---

## Why Visual Regression Matters

### The W15 parity-attrs gap
The W15 bug caused `data-journey-phase` to revert to `'overview'` after a search-result focus click in production builds. This was invisible in unit tests but would have been caught by visual regression (the panel layout and mode indicators would differ).

### Three-layer regression detection
1. **Unit level:** `tests/unit-active/parity-attrs-derivation.test.ts` — validates attribute derivation logic
2. **Integration level:** `tests/integration/w15-body-attr-live-probe.spec.js` — validates body attrs in a live browser
3. **Visual level:** `tests/integration/visual-state-snapshots.spec.js` — validates the visual rendering

Visual regression is the third layer: it catches cases where the DOM is correct but the visual output is wrong (CSS issues, layout shifts, missing animations).

---

## Prerequisites

### Production preview server (port 4174)
```bash
# Build first (one-time or after source changes):
npm run build:svelte

# Start the preview server:
nohup npx vite preview --config vite.config.ts --port 4174 --host 127.0.0.1 &
```

### Vite dev server (port 5175)
```bash
npm run dev:svelte
```

### Playwright browsers
```bash
npx playwright install chromium
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_BASE_URL` | `http://127.0.0.1:5175` | Target server URL |
| `UPDATE_SNAPSHOTS` | `false` | Set to `true` to generate/update baselines |
| `INTEGRATION_TIMEOUT` | `30000` | Per-step timeout in ms |
| `INTEGRATION_HEADLESS` | `true` | Set to `false` for headed mode |

---

## npm Scripts

```bash
# Run visual regression tests (compare against baselines):
npm run test:visual

# Update baselines:
npm run test:visual:update

# Both target port 5175 by default. Override with:
TEST_BASE_URL=http://127.0.0.1:4174 npm run test:visual
```

---

## Snapshot Architecture

```
tests/integration/
├── visual-state-snapshots.spec.js          # The test file
├── visual-state-snapshots.spec.js-snapshots/  # Playwright-managed baselines
│   ├── idle-overview-chromium-win32.png
│   ├── search-mode-chromium-win32.png
│   └── focus-search-chromium-win32.png
├── __snapshots__/                          # Documentation copies
│   ├── idle-overview.png
│   ├── search-mode.png
│   ├── focus-search.png
│   └── focus-programmatic.png
└── helpers.js                              # Shared test helpers
```

**Note:** Playwright's `toHaveScreenshot` writes baselines to `*-snapshots/` by default (next to the test file). The `__snapshots__/` directory contains documentation copies of the same PNGs. Both should be committed.

---

## Troubleshooting

### "A snapshot doesn't exist, writing actual"
The baseline doesn't exist yet. Run with `UPDATE_SNAPSHOTS=true` to generate it.

### Test times out
Increase the timeout or check that the server is running:
```bash
curl -s http://127.0.0.1:4174/index.html | head -5
```

### focus-programmatic skips
No field-node is visible in the initial view. This is expected — the test gracefully skips when the node isn't available. The snapshot won't be generated for this state.

### Anti-aliasing differences
Different OS/GPU combinations produce slightly different anti-aliasing. The test tolerates up to 1% pixel difference (`maxDiffPixelRatio: 0.01`). If you're on a new machine, update the baseline once.
