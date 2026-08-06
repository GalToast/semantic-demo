# Vision-Census Doc Audit — consolidated findings

Source: cline worker 1 (deepseek-v4-flash) analysis + main-lane independent verification.
Both methods agree; all counts below verified twice.

## Counts

| Doc claim (file/line) | Evidence-derived truth | Verdict |
|---|---|---|
| v1 sweep: "12 verified" (vision-lane-catalog.md §v1) | 12 PIXELS_OK at that stage | Consistent (historical layer) |
| v2 sweep: "17 verified" | 17 at that stage | Consistent (historical layer) |
| v3: "27 verified families" (line 60/70) | 36 PIXELS_OK lines / **33 unique ids** (case-norm) / 36 case-aware in evidence | **Understates live evidence** — 27-family was a mid-day snapshot, more lanes verified after |
| doc line 134 "beyond the 27 already counted" | — | consistent |
| ROUND-6 (line 189-190): pixtral-12b "NEW TOP LANE" + mistral-small-latest 3/5 | **NO PIXELS_OK rows for either id in ANY evidence JSONL** (zero rows matched "pixtral"/"small-latest") | **UNSUPPORTED** — walked-back claim, not evidenced |
| "inkling VERIFIED with a real screenshot" (line 11) | inkling has only HTTP_402/429/400 in evidence; **NO PIXELS_OK** | **UNSUPPORTED** (was verified pre-census by a different method (lanes); no probe evidence in the evidence pack) |
| groq qwen3.6-27b "PIXELS-READS x2" (lines 214/223/230) | no PIXELS_OK rows for the id in the evidence pack (probes recorded manual bridge runs, not filed) | **PARTIALLY SUPPORTED** — true from direct probe traces (prompt_tokens 788/794) but not in the machine pack |
| zydit-v3 diff: chatjimmy + diffusiongemma "NEW" | PIXELS_OK present in zydit-v1-tail.jsonl | Supported ✓ |

### Independent main-lane recompute (second method)
- PIXELS_OK lines: **36**
- unique ids (case-insensitive): **33** (36 − 3 case-dup pairs: `Qwen/Qwen7...Instruct` vs `qwen/qwen3-vl-...` & step variants)
- The 27-family register + mimo-v2.5-free + zydit-v1 chatjimmy/diffusiongemma + groq-lane = **33**, exactly matching.

## Key discrepancies (ranked)
1. **Doc says "27" but evidence holds 33 unique verified** — the register undercounts by 6. The "27 families" line was rewritten mid-session (v3), later discoveries (mimo@opencode-zen, groq-qwen3.6, chatjimmy, diffusiongemma, agnes-2.5 pair) never re-rolled the headline count.
2. **ROUND-6 claims pixtral-12b + mistral-small-latest verified — zero evidence rows.** Either the round was tested via a channel not JSONL-filed, or the claim is stale/unsupported. Needs a rerun or explicit footnote.
3. **inkling "VERIFIED with a real screenshot" vs probe-only 402/429/400** — the "verified" came from an earlier non-probe session; the census evidence pack can't back it. Not wrong, but unsupportable within the pack.

## OK
- 27-family list (28 ids incl. both cases) all have PIXELS_OK rows → internally sound.
- zydit-v1 tail "4 OK (chatjimmy, diffusiongemma NEW; step-3.7, ds-v4-pro replays)" → matches rows.
- mimo-v2.5-free @opencode-zen in evidence ✓.

## Recommendations
1. Add a single line to vision-lane-catalog.md: "Evidence-pack verified (unique, case-norm): **33** — 27-family + mimo + zydit-v1 pair + groq qwen3.6 (manual)."
2. Rerun or footnote ROUND-6 pixtral/mistral-small claims — currently unfuture-supportable by the pack.
3. Note inkling's pre-census verification channel explicitly beside the probe errors.