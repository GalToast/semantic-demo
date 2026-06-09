---
name: TS_SHADOW_STRICTNESS_TRIAGE
description: Audit strict TS shadow files in a JS/TS migration to decide between @ts-nocheck, aliasing out of check, genuine type fixes, or deleting the shadow if a canonical src/ implementation already supersedes it.
source: auto-skill
extracted_at: '2026-06-09T03:42:55.836Z'
---

# Procedure

1. Map the import chain that pulls the shadow into typecheck.
2. Inspect the TS shadow and its JS source/any canonical TS port.
3. Run the relevant typechecker/build commands and inspect bundle output presence.
4. Decide based on:
   - whether the file is actually bundled/runtime reachable,
   - whether a better canonical alternative already exists in `src/`,
   - whether the cost of fixing types is justified vs the cost of removing it from strict checking,
   - **new:** whether the shadow is a `SHADOW_OF_SRC` (exact exported-symbol duplicate of a canonical `src/` file) — in that case, prefer deletion over `@ts-nocheck` to eliminate dead code rather than ignoring it.
