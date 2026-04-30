#!/usr/bin/env python3
"""
Build outreach priority ranking from merged Lighthouse metrics + audit findings.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


SEVERITY_WEIGHT = {
    "critical": 45.0,
    "high": 30.0,
    "medium": 20.0,
    "low": 10.0,
}


def fnum(value: str) -> float | None:
    if value is None:
        return None
    v = str(value).strip()
    if not v:
        return None
    try:
        return float(v)
    except Exception:
        return None


def issue_weight(issue: str) -> float:
    i = (issue or "").lower()
    if "tls" in i or "handshake" in i:
        return 24.0
    if "insecure form" in i or "http transport" in i:
        return 22.0
    if "admin/login" in i:
        return 20.0
    if "https redirect" in i:
        return 18.0
    if "missing core security headers" in i:
        return 15.0
    if "missing key security headers" in i:
        return 12.0
    if "form page lacks key hardening headers" in i:
        return 12.0
    if "no major passive findings" in i:
        return 4.0
    return 8.0


def performance_pain(perf: float | None) -> float:
    if perf is None:
        return 18.0
    if perf < 30:
        return 40.0
    if perf < 50:
        return 30.0
    if perf < 70:
        return 18.0
    if perf < 85:
        return 8.0
    return 2.0


def lcp_pain(lcp_ms: float | None) -> float:
    if lcp_ms is None:
        return 8.0
    if lcp_ms > 8000:
        return 30.0
    if lcp_ms > 6000:
        return 24.0
    if lcp_ms > 4000:
        return 16.0
    if lcp_ms > 2500:
        return 8.0
    return 2.0


def angle(issue: str, severity: str, perf: float | None, lcp_ms: float | None) -> str:
    sev = (severity or "").lower()
    i = (issue or "").lower()
    if sev in {"critical", "high"} and "no major passive findings" not in i:
        return "Security-first: urgent trust/risk hardening"
    if (perf is not None and perf < 50) or (lcp_ms is not None and lcp_ms > 6000):
        return "Performance-first: mobile speed/CWV lift"
    if "no major passive findings" in i:
        return "Optimization-first: preventive hardening + conversion polish"
    return "Trust-first: baseline hardening + UX reliability"


def main() -> int:
    ap = argparse.ArgumentParser(description="Build outreach priority ranking.")
    ap.add_argument("--findings-csv", required=True)
    ap.add_argument("--lighthouse-csv", required=True)
    ap.add_argument("--out-csv", required=True)
    args = ap.parse_args()

    findings_csv = Path(args.findings_csv)
    lighthouse_csv = Path(args.lighthouse_csv)
    out_csv = Path(args.out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    findings = list(csv.DictReader(findings_csv.open(encoding="utf-8-sig")))
    lh = list(csv.DictReader(lighthouse_csv.open(encoding="utf-8-sig")))

    n = min(len(findings), len(lh))
    rows: list[dict] = []
    for i in range(n):
        f = findings[i]
        l = lh[i]
        perf = fnum(l.get("performance"))
        lcp = fnum(l.get("lcp_ms"))
        sev = (f.get("severity") or "").strip()
        issue = (f.get("primary_issue") or "").strip()

        sec = SEVERITY_WEIGHT.get(sev.lower(), 8.0) + issue_weight(issue)
        perf_component = performance_pain(perf)
        lcp_component = lcp_pain(lcp)
        total = round(sec + perf_component + lcp_component, 1)

        rows.append(
            {
                "priority_rank": 0,
                "priority_score": total,
                "name": f.get("name", ""),
                "email": f.get("email", ""),
                "website": f.get("website", ""),
                "severity": sev,
                "primary_issue": issue,
                "angle": angle(issue, sev, perf, lcp),
                "performance": "" if perf is None else round(perf, 1),
                "lcp_ms": "" if lcp is None else round(lcp, 1),
                "accessibility": l.get("accessibility", ""),
                "best_practices": l.get("best_practices", ""),
                "seo": l.get("seo", ""),
                "subject_hint": f.get("subject_hint", ""),
                "profile_path": f.get("profile_path", ""),
            }
        )

    rows.sort(key=lambda r: (-float(r["priority_score"]), str(r["name"]).lower()))
    for idx, r in enumerate(rows, start=1):
        r["priority_rank"] = idx

    fieldnames = [
        "priority_rank",
        "priority_score",
        "name",
        "email",
        "website",
        "severity",
        "primary_issue",
        "angle",
        "performance",
        "lcp_ms",
        "accessibility",
        "best_practices",
        "seo",
        "subject_hint",
        "profile_path",
    ]
    with out_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    print(f"rows={len(rows)}")
    print(f"out_csv={out_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

