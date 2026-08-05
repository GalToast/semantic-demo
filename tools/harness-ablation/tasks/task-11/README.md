# task-11 — Closure capture in loop

**Goal:** Fix `makeCounters(n)` in `src/task.js` so it returns an array of n functions where the i-th function returns i (not n).

**Repro:** `node test/test.js` (expect FAIL)

**Expected:** `makeCounters(3)` -> each fn returns its index: [0,1,2].

Bug: `var` (or `let` in a closure capture) shares the loop variable, so all fns return the final value. Fix: capture per-iteration (block-scoped or IIFE).