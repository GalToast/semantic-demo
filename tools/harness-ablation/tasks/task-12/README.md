# task-12 — Rounding bug

**Goal:** Fix `round2(x)` in `src/task.js` so it rounds to 2 decimal places correctly.

**Repro:** `node test/test.js` (expect FAIL)

**Expected:** `round2(1.005)` -> `1.01` (banker's not needed; standard rounding); `round2(2.5)` -> `2.5`; `round2(0.1+0.2)` -> `0.3`; `round2(-1.005)` -> `-1.01` (optional; test only positive)

Bug: naive `Math.round(x*100)/100` fails for `1.005` (gives `1` due to float repr). Fix: add epsilon or use toFixed carefully (but toFixed has its own quirks — prefer `Math.round((x + Number.EPSILON) * 100) / 100`).