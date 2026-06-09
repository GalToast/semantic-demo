# Contract test fix progress 2020-06-09

## Status: 47/72 → 50+/72 passing

### Root cause
TS migration changed `.js` import paths to `.ts` in 120 source files. Contract assertion needles still reference `.js` paths. Also, some exports changed from `export function X` to `export { X }`, and `window._ti` debug namespace was retired.

### Fixes applied (in order)
1. `source-path.mjs` — prefer `.ts` over `.js` (helped 1 contract)
2. Bulk `.js` → `.ts` in 58 contract files (helped 17 contracts)
3. `cluster-filter-city-filter-side-effect` — import needle too specific
4. `cluster-filter-dewindowing` — getFunctionBody regex needed TS return type support
5. `journey-compass-state` — action type changed from 'open-map' to 'enter-inside'
6. `demo-camera-retirement` — checks for .js files that are now .ts
7. `keyboard-help-aria` — property names changed (panel._autoDismissTimer → (panel as any)._autoDismissTimer)
8. `journey-window-surface` — window._ti retired, functions exported directly
9. `thread-inspector-dewindowing` — window._ti retired, functions exported directly
10. `scene-reveal` — onWindowResize import paths (.js → .ts)
11. `scene-reveal-camera-dewindowing` — import paths (.js → .ts)
12. `three-setup-zero-caller` — window.THREE retired
13. `legend-bindings.js` → `legend-bindings.ts` in 2 contracts

### Remaining failures (~25)
- journey-thread-inspector
- journey-walk-thread-neighbor-timer
- journey-focus-ui-extraction
- window-bridge-gaps
- residual-window-bridge-inventory
- lifecycle-search-panel-ownership
- lifecycle-journey-quick-dewindowing
- view-controller-ownership
- state-mutator-ownership
- keyboard-reset-ownership
- search-state-ui-adapter
- exploration-modes
- webgl-restore-dewindowing
- three-setup-init-dewindowing
- cancel-animate-dewindowing
- three-setup-loop-dewindowing
- scene-atmosphere
- motion-state
- selected-card-dom-ownership
- mobile-chrome-ownership (just failed)

### Pattern for remaining fixes
Each contract checks specific import patterns between TS modules. Need to:
1. Read the contract to find the assertion needle
2. Read the actual TS source to find what's really there
3. Update the needle to match

### Key learnings
- `findstr /C:"Error:"` doesn't catch all errors — some output "FAIL" or "ASSERTION FAILED" differently
- `findstr /C:"FAIL"` catches most but not all
- Running contracts directly is more reliable than piping through findstr
- The `getFunctionBody()` helper regex needs TS return type support: change `new RegExp(\`export function ${fnName}\\s*\\([^)]*\\)\\s*\\{\`, 's')` to `new RegExp(\`export function ${fnName}\\s*\\([^)]*\\)\\s*(?::\\s*[^})]*)?\\s*\\{\`)`
