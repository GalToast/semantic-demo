# Task 3 — Missing sort before top-N selection

## Goal
`top3` selects the 3 largest without sorting, so it picks wrong elements. Add `.sort((a,b)=>b-a)` before slice.
