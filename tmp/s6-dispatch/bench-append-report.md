# BENCH-LOG-APPEND Report

**Lines appended:** 32 (header + 2 tables + verification section)
**New bench-log line count:** 139 (was 107)
**Script:** tmp/s6-dispatch/bench-append.mjs
**Sprint-5 rows appended:** 5 (all DONE, exit=0, $0 cost, agnes-2.0-flash)
**Sprint-6 rows appended:** 2 DONE (not running — both completed before script execution)
**W3–W8:** Skipped (pending S6 dispatches)

## Verified metadata.json timing

| Worker | Wall time | Exit | Tokens (IN/OUT/think) | Notes |
|---|---|---|---|---|
| ocw_74cf0f7f | 165s | 0 | 52K/640/81 | SPEC UPDATE gap11 shapes |
| ocw_29d1336e | 129s | 0 | 31K/644/304 | P5B INTEGRATION wire-overlay |
| ocw_c0f5fc91 | 218s | 0 | 79K/649/339 | TIER MATRIX UPDATE (19 entries) |
| ocw_6d15e780 | 112s | 0 | 42K/421/189 | SPEC MERGE into canonical |
| ocw_3ccb69ff | 102s | 0 | 56K/454/121 | BENCH DOCS UPDATE |
| ocw_d2602d70 | 185s | 0 | 48K(10K+36K cache)/481/28 | TIER MATRIX VERIFY (PASS-WITH-CAVEATS) |
| ocw_423eb0e3 | 287s | 0 | 76K/354/31 | ZYDIT SYNC INVESTIGATE (documented dual-sync issue) |

**Aggregate cost:** $0.00 (all agnes-2.0-flash via router-agnes)
**Time taken:** ~16 minutes total wall across all workers
**Cost:** agnes-2.0-flash = $0

BENCH-LOG-APPEND WORKER — FINAL REPORT
- Rows appended: 7
- New bench-log line count: 139
- Time taken / Cost: ~16min aggregate wall / $0 (agnes-2.0-flash)
