# Trailing debug probes (kept for the session; rerun when touching trail layout)

- `tmp/trail-diagnose.js` — full computed-style + matched-rules dump for `#btn-prev-node`.
- `tmp/btn-rule-chain.js` — cascade-ordered list of every matching rule for the button.
- `tmp/tray-snapshot.js` — flex children of the trail tray + ancestor chain.
- `tmp/btn-width-test.js` — inline `width:84px` A/B (empirically proved flex-basis sizing was the clip cause).
- `tmp/probe-trail-fixed.mjs` — both-viewport clip check (`?record=519`, need build + fresh browser).
- `tmp/probe-clip-check.mjs` / `tmp/probe-btn-style.mjs` — geometry dumps.

## Lesson (2026-08-06, verified empirically)
- `min-width: max-content` + `flex-basis: auto` does NOT floor a flex item in Chrome 135-era if the
  ancestor `.focus-stage-journey` grid has `overflow:hidden`: the base resolves to the clipped box
  (~54px). The reliable fix is an **explicit `width: max-content` + `flex: 0 0 auto`** (no max-width).
- `.trail-btn` is an inline-flex button; global `.focus-stage-action-btn { flex: 1 1 0 }` makes it
  share-tray equally; scoped `flex:0 0 auto` + `width:max-content` defeats that.