# task-9 — Async race / stale value

**Goal:** Fix `fetchUser(id)` in `src/task.js` so it returns the value from the LAST call, not a stale one. It's a mock: `slow(id)` resolves after a delay.

**Repro:** `node test/test.js` (expect FAIL)

**Expected:** calling `fetchUser(1)` then quickly `fetchUser(2)` (where 2 resolves faster) should yield `2` for the second await. The test waits for both and checks the second result is 2.

Bug: the async fn captures `id` in a closure but uses a shared `current` variable that the later call overwrites, OR resolves with a stale captured value. The fix: resolve with the call's own id (no shared mutable state).