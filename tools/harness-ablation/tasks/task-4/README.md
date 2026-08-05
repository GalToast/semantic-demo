# Task 4 — Off-by-boundary array access

## Goal
`lastN` returns elements with off-by-boundary index (`arr.length - 2` instead of `arr.length - 1` for last element). Fix boundary.

## Repro
`node test/test.js`

Expected: `lastN([10, 20, 30], 2)` returns `[20, 30]`. `lastN([5], 1)` returns `[5]`.
