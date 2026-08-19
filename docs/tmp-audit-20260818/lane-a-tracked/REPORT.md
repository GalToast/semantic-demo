# tmp/ Tracked-File Audit — 2026-08-18

**Insight:** 43 files tracked under `tmp/` despite `tmp/` being in `.gitignore`. Only **5** have durable external references (docs or tests); the remaining 38 are scratch probes, one-shot tests, evidence JSONL, and worker-prompt templates with zero refs outside `tmp/`. Untracking the 38 shrinks the tracked set by 88% with no breakage.

## Method

- `git ls-files tmp` → 43 files
- Per file: `du -b` for bytes, `git log --diff-filter=A` for birth commit, `git grep -l -F <token>` for 1–2 distinctive tokens scoped to `.` excluding `tmp/`
- Kind taxonomy: `scratch-probe` (one-off .mjs/.js probe), `one-shot-test` (run-once test), `prompt-doc` (worker prompt template), `report-md` (markdown report), `evidence-jsonl` (JSONL event log), `fix-script` (durable shared utility)
- Verdict: **UNTRACK** (zero external refs) | **KEEP** (referenced from docs/tests) | **ASK** (ambiguous durability)

## Results Table

| File | Bytes | Birth Commit | Kind | Tracked Refs? | Verdict |
|------|-------|--------------|------|---------------|---------|
| tmp/0731-trail-contract-REPORT.md | 6015 | ad4f7ee4 2026-08-09 | report-md | none | UNTRACK |
| tmp/audit-dive-2026-08-06.jsonl | 6915 | dcbfb558 2026-08-06 | evidence-jsonl | none | UNTRACK |
| tmp/audit-dive-REPORT-WB.md | 6901 | dcbfb558 2026-08-06 | report-md | docs/free-lane-notes.md:166 | KEEP |
| tmp/audit-dive-bonus-2026-08-06.jsonl | 3907 | dcbfb558 2026-08-06 | evidence-jsonl | none | UNTRACK |
| tmp/audit-dive-bonus.mjs | 5686 | dcbfb558 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/audit-dive-probe.mjs | 13008 | dcbfb558 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/audit-inside-2026-08-06.jsonl | 21305 | dcbfb558 2026-08-06 | evidence-jsonl | none | UNTRACK |
| tmp/audit-reduced-motion.mjs | 1403 | 447b6a7d 2026-08-05 | one-shot-test | docs/free-lane-notes.md:151,190 | KEEP |
| tmp/baseline-emptyband.mjs | 734 | 7f96a41c 2026-08-06 | scratch-probe | none (innerHeight is generic JS) | UNTRACK |
| tmp/baseline-enc.json | 753 | 7f96a41c 2026-08-06 | evidence-jsonl | none | UNTRACK |
| tmp/btn-rule-chain.js | 787 | 02fe82bc 2026-08-06 | scratch-probe | none (r.style is generic) | UNTRACK |
| tmp/btn-width-test.js | 560 | 02fe82bc 2026-08-06 | scratch-probe | none (resolve( is generic) | UNTRACK |
| tmp/dive-slots.mjs | 2372 | dcbfb558 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/focus-rings2.found.jsonl | 788 | 7202db65 2026-08-05 | evidence-jsonl | none | UNTRACK |
| tmp/landmine-fix2-REPORT.md | 11543 | 5a3ab701 2026-08-11 | report-md | none | UNTRACK |
| tmp/mobile-band-verify.mjs | 1746 | 7f96a41c 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/parameter-property-REPORT.md | 5437 | 6c600b78 2026-08-11 | report-md | none (cause is generic) | UNTRACK |
| tmp/probe-dead-lanes.mjs | 2511 | f0840f81 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/probe-dead-lanes2.mjs | 2684 | f0840f81 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/probe-hover6.mjs | 1614 | ecadebd6 2026-08-05 | scratch-probe | none (splash is generic) | UNTRACK |
| tmp/probe-hub.mjs | 14842 | 23d9aa3c 2026-08-06 | fix-script | docs/probe-hub.md, docs/free-lane-notes.md:124 | KEEP |
| tmp/probe-inside-audit.mjs | 13763 | dcbfb558 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/probe-lib.mjs | 2470 | 7202db65 2026-08-05 | fix-script | docs/free-lane-notes.md:124, docs/probe-hub.md | KEEP |
| tmp/probe-live-map.mjs | 3479 | ecadebd6 2026-08-05 | scratch-probe | none (node:fs is generic) | UNTRACK |
| tmp/probe-micro.mjs | 2457 | ecadebd6 2026-08-05 | scratch-probe | none | UNTRACK |
| tmp/probe-sedge.mjs | 4005 | 7202db65 2026-08-05 | scratch-probe | none (@playwright/test is generic) | UNTRACK |
| tmp/probe-trail-dist.mjs | 1229 | 02fe82bc 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/probe-trail-fixed.mjs | 1506 | 7dd6ab16 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/rail-chain.mjs | 2806 | dcbfb558 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/rail-reach-check.mjs | 1953 | 024b56f3 2026-08-06 | one-shot-test | none | UNTRACK |
| tmp/rail-vs-trail.mjs | 2952 | af949871 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/sub-agent-dive-prompt.md | 3846 | 089d0017 2026-08-06 | prompt-doc | none (refs within content are tmp→tmp) | UNTRACK |
| tmp/sub-agent-emptyband-fix-prompt.md | 2725 | be585c9e 2026-08-06 | prompt-doc | none | UNTRACK |
| tmp/sub-agent-freshness-fix-prompt.md | 2617 | be585c9e 2026-08-06 | prompt-doc | none | UNTRACK |
| tmp/sub-agent-inside-prompt.md | 5165 | (same wave) | prompt-doc | none | UNTRACK |
| tmp/surface-contract-runner-notes.md | 5330 | eaffb497 2026-08-06 | report-md | tests/surface-contract-check.mjs:639 | KEEP |
| tmp/trail-debug-notes.md | 1165 | 7dd6ab16 2026-08-06 | report-md | none (tmp→tmp references only) | UNTRACK |
| tmp/trail-diagnose.js | 1637 | 02fe82bc 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/trail-where.mjs | 619 | af949871 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/tray-snapshot.js | 1221 | 02fe82bc 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/triage-worker-evidence.mjs | 2118 | 46f3ad6d 2026-08-06 | scratch-probe | none | UNTRACK |
| tmp/ui-issues-report-20260804.md | 6453 | d81f0beb 2026-08-06 | report-md | none | UNTRACK |
| tmp/vision-jury-findings-20260805.md | 6135 | ee3300f5 2026-08-05 | report-md | none | UNTRACK |

## Summary

- **KEEP: 5** — probe-hub.mjs, probe-lib.mjs, audit-reduced-motion.mjs, audit-dive-REPORT-WB.md, surface-contract-runner-notes.md
- **UNTRACK: 38** — all others
- **ASK: 0**

## Key Evidence Commands

```bash
# External refs for KEEP files
git grep -l -F 'tmp/probe-hub' -- . ':!tmp/*'   # → docs/probe-hub.md, docs/free-lane-notes.md
git grep -l -F 'tmp/probe-lib' -- . ':!tmp/*'    # → docs/free-lane-notes.md
git grep -l -F 'tmp/audit-reduced-motion' -- . ':!tmp/*'  # → docs/free-lane-notes.md
git grep -l -F 'tmp/audit-dive-REPORT-WB' -- . ':!tmp/*' # → docs/free-lane-notes.md
git grep -n -F 'surface-contract-runner-notes' tests/surface-contract-check.mjs  # → line 639 comment
```

## Next Action

Run `untrack-cmds.txt` (one `git rm --cached` per UNTRACK file) to untrack the 38 files. They remain on disk. The `tmp/` entry in `.gitignore` already prevents future tracking.
