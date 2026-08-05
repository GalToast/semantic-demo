# Task 1 — Off-by-one array sum

## Goal
Fix `sumEvenIndices()` so it sums elements at even indices (0, 2, 4...) not odd.

## Repro
`node -e "console.log(require('./src/task.js').sumEvenIndices([1,2,3,4]))"` returns 3 (expected 6: 1+3? Wait — let's make it simple). Actually: buggy sums odd indices. Fix to sum even indices.

Expected: `sumEvenIndices([10, 20, 30, 40, 50])` = 10 + 30 + 50 = 90.
