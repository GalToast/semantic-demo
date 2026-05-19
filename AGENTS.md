# Agents - semantic-demo (mccullough.cloud/semantic-demo)

## Project Overview
3D semantic mycelium visualization for exploring Montgomery County TX business relationships.

## Key Files
| Path | Role |
|---|---|
| `js/modules/app.js` | Main entry; imports all modules |
| `js/modules/demo-controller.js` | First-visit trigger + state machine |
| `js/modules/micro-demo.js` | 9-second guided choreography |
| `js/state.js` | Single source of truth for all global state |
| `js/modules/lifecycle.js` | App orchestration, view handoff, window bindings |
| `js/modules/loading-ui.js` | Loading phases, overlay hide, deferred hydration |
| `js/modules/scene-reveal.js` | Scene reveal progress and resize/body viewport hooks |

## Two Demo Specs (Know Which You're Editing)
- **SPEC.MYCO-DEMO-CONTROLLER.md** - trigger guard logic, state transitions, storage schema for `demo-controller.js`
- **MICRO-DEMO-SPEC.md** - camera choreography, timing, node selection for `micro-demo.js`

These are independent files. `demo-controller.js` manages "should the demo run?"; `micro-demo.js` manages "what does the demo do?". Both are imported by `app.js`.

## State Machine Reference

### demo-controller.js (`js/modules/demo-controller.js`)
```
idle -> eligible -> running -> completing -> done
                  |
                  v
              cancelled -> done
```
No paused state. User interaction = immediate cancel.

### micro-demo.js (`js/modules/micro-demo.js`)
```
IDLE -> GLIDING -> ARRIVED -> CARD_VISIBLE -> PULLBACK -> WIDE_VIEW -> RETURNING -> COMPLETE
                                                                          |
                                                                          v
                                                                     CANCELLED
```
Phase timing targets: GLIDING 1400ms, ARRIVED immediate, CARD_VISIBLE 1800ms hold, PULLBACK 1200ms, RETURNING 1000ms.

## Storage
- `localStorage.moco_mycelium_demo_v1` - lifetime per-browser flag (set by demo-controller on completion/cancel)
- `sessionStorage` - NOT used by current demo-controller (contrast with MICRO-DEMO-SPEC which uses sessionStorage)

## Quick Dev Commands
```bash
npm run build         # esbuild bundle to dist/bundle.js
npm run lint          # ESLint js/modules/
npm run qa:contract:all  # DOM/layout assertions (fast)
npm run qa:surface:all   # Visual screenshot audit
npm run test:microdemo   # Micro-demo verification
```

## Debug Flags
- `?demo=force` - re-trigger demo even if already seen
- `?nodemo=1` - suppress demo entirely

## Edit Safety
- Keep edits inside the assigned slice; do not opportunistically reformat or clean unrelated files.
- Treat `js/state.js`, `js/modules/app.js`, `js/modules/journey.js`, `js/modules/lifecycle.js`, and deploy scripts as high-risk surfaces that need explicit ownership and targeted tests.
- CSS is split into 17 ordered modules in `css/`; the root `semantic-demo.css` is an import manifest.
- Do not move the app root until `deploy.sh` and `deploy.ps1` no longer depend on the sibling `../js/scanner.js` path.
