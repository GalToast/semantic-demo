# Nonblocking probe workflow (measured 2026-08-06)

The user's standing complaint: waiting minutes on tool calls is unacceptable. The
cost structure this session:

- **Cold probe boot = 60–90s** (Playwright chromium launch + app splash + engine warm),
  and I was sleep-polling it every turn. That's the real blocker — not the model.
- `bash` detaches at ~15s by design (harness). `pi_background_jobs wait` is 30s-capped.
- Every browser check that cold-boots costs a minute of wall time.

## The fix: `tmp/probe-hub.mjs` (persistent Playwright page server)

- ONE chromium stays alive on :8911; holds a warm **desktop** page (booted via the
  fast `?nodemo=1&q=coffee` deep-link which skips splash) and a warm **mobile** page.
- Ops are small registered functions that run INSIDE the warm page and return JSON:
  - `POST /op {op:"searchNames", q, n}` → top-N rendered search names (~1-3s)
  - `POST /op {op:"state"}` → surface/canvas/viewport/reduced-motion truth (~400ms)
  - `POST /op {op:"motionHost", args:{selector}}` → computed animation on a host
- So a normal probe answer = curl → JSON, in seconds, not minutes. Add new ops to
  `OPS` in `tmp/probe-hub.mjs` (they're plain functions running in page context).
- Start it once: `node tmp/probe-hub.mjs [appUrl] [port]` in background, leave
  running for the session. `POST /reset` or `/shutdown` when done.

## Hard-won probe insights this session (stateful boot quirks)

- Desktop deep-link boot SKIPS the splash (engineReady fires immediately per
  `parseUrlParams().isDeepLink`) — that's why desktop warm is fast. Mobile keeps
  splash → the CTA click is the slow part.
- Search results frequently DIDN'T render on cold desktop boot (`itemCount: 0`
  gremlin) — the hub's warm page fixes this by booting ONCE and reusing the state.
- When a probe printed `itemCount: 0`, it was usually render-race, NOT a product bug.
  Always confirm with a second method (DOM waitForSelector, not timeout math).

## Nonblocking discipline (rules that make this fast)

1. Any command >15s → `background:true` immediately, do NOT wait on it inline.
2. While a background gate runs → pick up parallel-safe work (docs, commits,
   memory, next-probe prep). Check the result exactly when it's due — never
   sleep-poll (>1 poll = design smell).
3. Batch independent tool calls in one block.
4. Prefer the hub for UI truth — it's the only way probe cycles are <10s.
5. A probe that needs a NEW browser boot is a signal to add an op to the hub
   instead of launching another chromium.