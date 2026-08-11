# CSS Build Pipeline — Source vs Minified Output

**Updated:** 2026-07-10 · **Why this doc:** W5 ops report identified CSS serving confusion
as a verification fragility.

## Topology

The project has two CSS pipelines that coexist:

### 1. Svelte component CSS (Vite-managed)

- Source: `<style>` blocks inside `src/**/*.svelte`
- Build: Vite/Rolldown extracts, scopes, hashes, and minifies → `dist/svelte/assets/index-<hash>.css`
- Dev: Vite HMR injects scoped styles inline
- No confusion: Vite owns the entire lifecycle.

### 2. Root-level CSS files (legacy / manual)

- Source: `css/*.css`, `css/modules/*.css`, `semantic-demo.css`, `vector-explorer-pandora.css`
- Build: `copyRuntimeAssetsPlugin` (in `vite.config.ts`) copies these into `dist/svelte/css/`
  **with lightningcss minification** during `writeBundle`.
- Dev: `legacyRootAssetPlugin` `serveRootAssets` middleware serves them from the repo root
  (unminified) via Vite's connect middleware stack.
- QA server (port 8795): served preference now prefers `dist/svelte/css/*` when present,
  falling back to `css/*` (see `scripts/qa-server.mjs` `resolveDistPreferringPath`).

### Files affected

All of `css/*.css` and `css/modules/*.css` (27 files total) plus:

| Source file | Dist copy |
|---|---|
| `css/mobile_premium__surfaces.css` | `dist/svelte/css/mobile_premium__surfaces.css` |
| `css/mobile_premium__chrome.css` | `dist/svelte/css/mobile_premium__chrome.css` |
| `css/mobile_premium__focus-dive.css` | `dist/svelte/css/mobile_premium__focus-dive.css` |
| `css/mobile_premium__state.css` | `dist/svelte/css/mobile_premium__state.css` |
| `css/mobile_premium__idle.css` | `dist/svelte/css/mobile_premium__idle.css` |
| `css/mobile_premium__map.css` | `dist/svelte/css/mobile_premium__map.css` |
| `css/mobile_premium__narrow.css` | `dist/svelte/css/mobile_premium__narrow.css` |
| `css/modules/focus_stage.css` | `dist/svelte/css/modules/focus_stage.css` |
| `semantic-demo.css` | `dist/svelte/semantic-demo.css` |
| `vector-explorer-pandora.css` | `dist/svelte/vector-explorer-pandora.css` |
| All other `css/*.css` | `dist/svelte/css/*.css` |

## The Fragility (W5)

**Source → minified copy is one-directional.** The build reads source files from `css/`
and writes minified copies to `dist/svelte/css/`. There is no back-propagation. This means:

1. **Verification confusion:** Checks that inspect `dist/svelte/css/*.css` see minified
   output. Checks that hit the qa-server (pre-W5 fix) saw unminified source. The two
   differ in ways that can affect selector-matching tests, bundle-size assertions, and
   content-hash comparisons.

2. **Temp rebuilds drop the dist copy:** Because `vite.config.ts` sets
   `emptyOutDir: true`, every build wipes `dist/svelte/` before repopulating it. During
   the rebuild window (typically 4–15 seconds), the dist CSS files do not exist. If the
   qa-server is serving from `dist/svelte/`, requests for CSS files will 404 during that
   window.

3. **No mtime guard:** Before W5 fix, the qa-server had no mechanism to detect that the
   files it was serving had been rebuilt since startup.

## W5 Fix Applied

**File:** `scripts/qa-server.mjs`

1. `resolveDistPreferringPath()` — resolves URL paths preferring `dist/svelte/` when
   a matching file exists there, falling back to `ROOT`. This means after a rebuild,
   the qa-server automatically serves the latest minified CSS without a restart.

2. `serveFile()` mtime check — logs a warning when a requested file's mtime is newer
   than the server start time, alerting the operator that the file was modified
   mid-session.

## Suggested Workflows

| Situation | Correct action |
|---|---|
| Editing a CSS file in `css/*.css` | Run `npm run build:svelte` to see it in qa-server; or use Vite dev server (port 5173) for HMR |
| Running checks against qa-server | qa-server prefers `dist/svelte/` — rebuild first: `npm run build:svelte && npm run qa:server:ensure` |
| Verifying minified output | Read from `dist/svelte/css/*.css` directly, or serve from `dist/svelte/` |
| Debugging a CSS discrepancy | Check which server is being used: 5173 (dev, HMR, source CSS) vs 8795 (qa, prefers dist) vs production (dist only) |

## Non-goal

Unifying the dev and production CSS serving is out of scope. The Vite dev server
intentionally serves source CSS for HMR compatibility; the production deploy uses
minified copies. The two are functionally equivalent (lightningcss minification is
safe — it only removes whitespace, comments, and applies vendor-prefix optimization).
Any CSS rule that passes in dev will produce the same rendered result in production.
