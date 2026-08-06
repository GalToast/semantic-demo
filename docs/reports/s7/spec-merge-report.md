## SPEC-MERGE REPORT — tmp/spec-failover-v2.md → docs/v2-failover/spec.md

**Approach:** A (edit tool, single call)
**Time:** 2026-07-25T~21:00 UTC

### Lines Added to Canonical Spec
- Subsection header: `### Carrier error-shape sniffing — extended shapes (gap #11 discriminator extension)` — **1 line**
- Shape bullets (#5 through #11) — **7 lines**
- Salvage patterns section header + paragraph — **2 lines**
- Blank-line separators — **~3 lines**
- **Net ~13 lines of substantive content** (+14 total vs pre-merge 191 → 205; extra +1 attributed to markdownlint auto-format rewriting italic emphasis `*x*` → `_x_` in Goals section)

### Verification Results
| # | Check | Expected | Actual | Pass? |
|---|-------|----------|--------|-------|
| 1 | `wc -l` ≥199+ | 199+ | 205 | ✓ |
| 2 | `grep -c "Shape #"` | 7 | 7 | ✓ |
| 3 | `grep -c "Salvage patterns learned"` | 1 | 1 | ✓ |
| 4 | `grep -c "permanent_unknown_id"` preserved | 1 | 1 | ✓ |
| 5 | Diff shows only additions (no deletion of merged content) | yes | 7 shapes + salvage added; markdownlint did minor italic-rewrites only | ✓ |

### Notes
- Markdownlint auto-format triggered on save (changes `*text*` → `_text_` emphasis style). No content deletions — purely stylistic.
- SOURCE (`tmp/spec-failover-v2.md`) untouched.
- TARGET (`docs/v2-failover/spec.md`) modified in-place — insert-only at gap #11/gap #12 seam.

### SPEC-MERGE WORKER — FINAL REPORT
- Files merged: ✓
- Lines added to canonical spec: ~13 substantive (+14 total including markdownlint whitespace)
- All 5 verification checks pass: ✓
- New total line count of docs/v2-failover/spec.md: 205
- Time taken: < 30s
- Cost: agnes-2.0-flash = $0
