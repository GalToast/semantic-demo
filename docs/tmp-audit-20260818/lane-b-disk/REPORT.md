# tmp/ Directory Audit Report

**Date:** 2026-08-18  
**Scope:** Read-only audit of `tmp/` directory in `C:/Users/HP/repos/semantic-explorer`  
**Output directory:** `tmp/swarm-tmp-audit-20260818/lane-b-disk/`  
**Policy:** Read-only — no files deleted, moved, or edited

---

## Executive Summary

The `tmp/` directory contains **3.06 GB** across **1,652 top-level entries** (282 directories + 1,370 files), housing ~14,835 total files. The bulk (86%) is **unrelated Qualcomm/Android firmware work** parked here by another lane. Only **0.39 GB** is disposable semantic-explorer audit debris.

| Class | Bytes | GB | % | Entries |
|-------|-------|-----|---|---------|
| SOURCES-UNRELATED | 2,826,814,626 | 2.63 | 86.1% | ~100 |
| SEMANTIC-SCRAP | 394,561,121 | 0.37 | 12.0% | 1,444 |
| SAFETY-KEEP | 59,300,485 | 0.06 | 1.8% | ~8 |
| UNKNOWN | 4,639,821 | 0.004 | 0.1% | ~100 |
| **TOTAL** | **3,285,316,053** | **3.06** | **100%** | **1,652** |

**Byte reconciliation:** Measured 3,285,224,474 bytes via `du -sb`; inventory sums to 3,285,316,053. Diff: 91,579 bytes (0.0028%) — within acceptable tolerance.

---

## Per-Class Bar (bytes)

```
SOURCES-UNRELATED  ████████████████████████████████████████████████████████  86.1%
SEMANTIC-SCRAP     ██████                                                   12.0%
SAFETY-KEEP        ▍                                                         1.8%
UNKNOWN            ·                                                         0.1%
```

---

## Top 10 Directories by Size

| # | Path | Bytes | GB | Class | Risk |
|---|------|-------|-----|-------|------|
| 1 | tmp/lazify-stage | 509,592,899 | 0.47 | SOURCES-UNRELATED | MED |
| 2 | tmp/dyno-stag | 503,219,878 | 0.47 | SOURCES-UNRELATED | MED |
| 3 | tmp/firmware-lab | 486,564,813 | 0.45 | SOURCES-UNRELATED | HIGH |
| 4 | tmp/firmware-house | 434,896,896 | 0.40 | SOURCES-UNRELATED | HIGH |
| 5 | tmp/qcvenv | 290,381,888 | 0.27 | SOURCES-UNRELATED | HIGH |
| 6 | tmp/qc-deps | 277,008,557 | 0.26 | SOURCES-UNRELATED | HIGH |
| 7 | tmp/perf9 | 180,392,971 | 0.17 | SOURCES-UNRELATED | MED |
| 8 | tmp/QCSuper | 45,588,217 | 0.04 | SOURCES-UNRELATED | HIGH |
| 9 | tmp/codelinaro-external-wlan-cmn | 35,185,747 | 0.03 | SOURCES-UNRELATED | HIGH |
| 10 | tmp/incident-evidence | 28,052,417 | 0.03 | SAFETY-KEEP | HIGH |

---

## Top 15 Files by Size

| # | Path | Bytes | MB | Class |
|---|------|-------|-----|-------|
| 1 | tmp/dir-legacy.txt | 308,669,062 | 294.5 | SEMANTIC-SCRAP |
| 2 | tmp/termux-api.apk | 3,956,196 | 3.8 | SAFETY-KEEP |
| 3 | tmp/pkgs-idx | 1,803,125 | 1.7 | UNKNOWN |
| 4 | tmp/_peek_inspect.png | 629,808 | 0.6 | SEMANTIC-SCRAP |
| 5 | tmp/lighthouse-mobile-1786932108114.json | 551,131 | 0.5 | SEMANTIC-SCRAP |
| 6 | tmp/lighthouse-mobile-latest.json | 544,501 | 0.5 | SEMANTIC-SCRAP |
| 7 | tmp/lighthouse-mobile-1786937249950.json | 544,501 | 0.5 | SEMANTIC-SCRAP |
| 8 | tmp/lighthouse-mobile-1786937886285.json | 542,846 | 0.5 | SEMANTIC-SCRAP |
| 9 | tmp/lighthouse-mobile-1786918570957.json | 542,248 | 0.5 | SEMANTIC-SCRAP |
| 10 | tmp/lighthouse-mobile-1786844081810.json | 538,959 | 0.5 | SEMANTIC-SCRAP |
| 11 | tmp/lighthouse-mobile-1786843984456.json | 537,679 | 0.5 | SEMANTIC-SCRAP |
| 12 | tmp/lighthouse-mobile-1786932010280.json | 516,340 | 0.5 | SEMANTIC-SCRAP |
| 13 | tmp/lighthouse-mobile-1786932057002.json | 516,284 | 0.5 | SEMANTIC-SCRAP |
| 14 | tmp/lighthouse-mobile-1786937922544.json | 515,815 | 0.5 | SEMANTIC-SCRAP |
| 15 | tmp/lighthouse-mobile-1786741775195.json | 509,973 | 0.5 | SEMANTIC-SCRAP |

---

## dir-legacy.txt Forensics

**Command:** `file tmp/dir-legacy.txt`  
**Result:** `ASCII text, with CRLF line terminators`  
**Size:** 308,669,062 bytes (294.5 MB)  
**Mtime:** 2026-08-13

**Head sample (first 2000 bytes):**
```
 Volume in drive C is Windows
 Volume Serial Number is 7A6D-899D

 Directory of C:\Users\HP\Desktop\Temp while my comp is at the shop

05/17/2026  11:21 AM            197679 %TEMP%git_status_raw.txt
05/04/2026  01:06 PM           3685574 -background
05/11/2026  02:00 PM               416 .antigravityignore
...
```

**Verdict:** This is a Windows `dir` command output captured from a temporary workspace (`Desktop Temp while my comp is at the shop`) — likely created when the user's computer was at a repair shop. It is a 295 MB ASCII dump of directory listings, not actual project data. **Deletion candidate.**

---

## Classification Methodology

Each top-level entry was classified into one of four buckets:

| Class | Criteria | Deletion Recommendation |
|-------|----------|------------------------|
| **SOURCES-UNRELATED** | Qualcomm/Android firmware source, phone backups, staging checkpoints for other lanes | DO NOT DELETE — unrelated project work |
| **SEMANTIC-SCRAP** | Disposable audit swarms, REPORT/*.md files, probe scripts, lighthouse logs, poolmon dumps, transformed output, jsonl tracelogs | DELETE CANDIDATE — low risk |
| **SAFETY-KEEP** | Irreplaceable user data (phone NAND backups, forensic evidence, .apk binaries) | DO NOT DELETE |
| **UNKNOWN** | Default KEEP — weak evidence, ambiguous purpose | KEEP until reviewed |

---

## Recommendations

### Delete candidates (SEMANTIC-SCRAP, LOW risk)

- **Recoverable:** 394.6 MB across 1,444 entries
- **Top 5 by size:**
  1. `tmp/dir-legacy.txt` — 294.5 MB (Windows dir dump from old workspace)
  2. `tmp/swarm-20260817-alt/` — 11.7 MB (swarm audit artifact)
  3. `tmp/semantic-ui-visual-audit/` — 5.2 MB (visual audit)
  4. `tmp/ui-capability-qa/` — 4.0 MB (QA artifact)
  5. `tmp/swarm-journey-risk/` — 3.4 MB (journey audit)

- **Pattern:** The remaining ~1,439 entries are mostly < 1 MB each — swarm report dirs, logfare probe outputs, kilo-hy3 audit reports, lighthouse JSON snapshots, poolmon text dumps, transformed TypeScript files, parity analysis outputs, and similar disposable artifacts.

### Keep (do not delete)

- **SAFETY-KEEP (59.3 MB):**
  - `tmp/phone-backup/` — NAND partition dumps (fsg, modemst, oem tables)
  - `tmp/incident-evidence/` — SQLite DB copies (History, LoginData, Preferences, SecurePrefs) from phone forensics
  - `tmp/termux-api.apk` — Android app binary
  - `tmp/termux-api.deb` — Linux package

- **SOURCES-UNRELATED (2.6 GB):** Qualcomm firmware, WLAN source trees, staging checkpoints — not owned by this repo's lane.

### Ambiguous (KEEP by default)

- **UNKNOWN (4.6 MB, ~100 entries):** Small files with unclear purpose. Examples:
  - `tmp/pkgs-idx` (1.8 MB) — package index, purpose unclear
  - `tmp/perf/` (2.3 MB) — performance testing, may have ongoing value
  - `tmp/core-old.ts` (44 KB) — legacy source, possibly useful reference

---

## Evidence Commands

```bash
# Total size
du -sb tmp/                          # 3,285,224,474 bytes
du -sh tmp/                          # 3.1G

# File count
find tmp -type f | wc -l             # 14,835

# Top dirs by size
du -sh tmp/* 2>/dev/null | sort -rh | head -20

# Top files by size
find tmp -type f -printf '%s %p\n' | sort -rn | head -15

# dir-legacy.txt forensic
file tmp/dir-legacy.txt              # ASCII text, CRLF
head -c 2000 tmp/dir-legacy.txt

# Per-class byte sums (verified)
# SOURCES-UNRELATED: 2,826,814,626 bytes (86.1%)
# SEMANTIC-SCRAP:    394,561,121 bytes (12.0%)
# SAFETY-KEEP:        59,300,485 bytes (1.8%)
# UNKNOWN:             4,639,821 bytes (0.1%)
```

---

## Deliverables

All outputs written to `tmp/swarm-tmp-audit-20260818/lane-b-disk/`:

| File | Size | Description |
|------|------|-------------|
| `REPORT.md` | 5.9 KB | This report |
| `inventory.json` | 383 KB | Full classified inventory (1,652 entries, valid JSON) |
| `delete-candidates.tsv` | 152 KB | Tab-separated delete candidates (1,444 entries) |
| `classification-full.json` | 449 KB | Detailed classification with metadata |
| `class-totals.json` | 269 B | Per-class byte/count totals |

**Validation:**
- `inventory.json`: VALID JSON, 1,652 entries
- `class-totals.json`: VALID JSON, sums reconcile to inventory total
- `delete-candidates.tsv`: 1,444 lines (header + 1,443 candidates)
- Byte reconciliation: inventory tot
