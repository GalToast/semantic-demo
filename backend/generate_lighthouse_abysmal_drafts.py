#!/usr/bin/env python3
"""
Generate outreach draft artifacts for abysmal Lighthouse performers.

Inputs:
- A Lighthouse summary CSV with at least:
  name,email,website,status,performance,lcp_ms,tti_ms

Outputs:
- Queue CSV of abysmal leads
- Per-lead HTML + plain-text draft files
- Draft index CSV with subject + file paths
"""

from __future__ import annotations

import argparse
import csv
import re
from datetime import date
from pathlib import Path


LOGO_URL = "https://mccullough.digital/wp-content/uploads/2025/09/cropped-MD_cat_logo_transparent.png"
BRAND_URL = "https://mccullough.digital"
SENDER_NAME = "Fred McCullough"
SENDER_TITLE = "McCullough Digital"
SENDER_PHONE = "(832) 422-8441"
SENDER_PHONE_HREF = "+18324228441"
MAILING_ADDRESS = "15342 Holly Lane"
OPT_OUT = 'If you do not want future outreach, reply with "opt out" and I will not follow up.'


def slugify(value: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return s[:90] or "lead"


def fmt_intish(value: float) -> str:
    return str(int(value)) if value == int(value) else f"{value:.1f}"


def company_display(name: str) -> str:
    return re.sub(r"^Lead Profile:\s*", "", (name or "").strip(), flags=re.I)


def build_subject(name: str, score: float) -> str:
    return f"Quick mobile performance note for {company_display(name)} ({fmt_intish(score)}/100)"


def build_preheader(score: float) -> str:
    return f"Quick heads-up: mobile performance tested around {fmt_intish(score)} out of 100."


def build_plain_text(name: str, website: str, score: float, lcp_ms: float, tti_ms: float) -> str:
    lcp_s = round(lcp_ms / 1000.0, 1)
    tti_s = round(tti_ms / 1000.0, 1)
    lines = [
        f"Hi {company_display(name)} team,",
        "",
        f"I'm local here in Conroe, and I took a quick look at {website}.",
        "",
        (
            f"I ran Lighthouse checks using DevTools throttling, simulating average 5G mobile speeds, and the homepage scored around "
            f"{fmt_intish(score)}/100 for performance."
        ),
        f"LCP was around {lcp_s}s and interactive time was around {tti_s}s.",
        "",
        "On slower or congested mobile connections, that can translate to noticeable delay before the page feels fully usable.",
        "As a benchmark, around 53% of mobile visitors leave if a page takes longer than 3 seconds to load.",
        "",
        "If helpful, I can send a short 3-step fix order your team can apply right away.",
        "",
        SENDER_NAME,
        SENDER_TITLE,
        BRAND_URL,
        SENDER_PHONE,
        "",
        "Advertisement: This is a business outreach email from McCullough Digital.",
        f"Phone: {SENDER_PHONE}",
        f"Mailing address: {MAILING_ADDRESS}",
        OPT_OUT,
        "",
    ]
    return "\n".join(lines)


def build_html_deluxe(name: str, website: str, score: float, lcp_ms: float, tti_ms: float) -> str:
    lcp_s = round(lcp_ms / 1000.0, 1)
    tti_s = round(tti_ms / 1000.0, 1)
    subject = build_subject(name, score)
    preheader = build_preheader(score)
    team = company_display(name)
    site = website
    score_txt = fmt_intish(score)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:#040816;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;line-height:1px;font-size:1px;color:#040816;">
    {preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#040816;background-image:radial-gradient(circle at 14% 12%, #14264a 0%, #040816 56%);">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%;max-width:620px;background:#0A1226;border:1px solid #1E2536;border-radius:14px;">
          <tr>
            <td style="padding:20px 24px 12px 24px;border-bottom:1px solid #1E2536;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td valign="middle" style="width:68px;">
                    <img
                      src="{LOGO_URL}"
                      width="48"
                      alt="McCullough Digital"
                      style="display:block;height:auto;border:0;outline:none;text-decoration:none;"
                    >
                  </td>
                  <td valign="middle" style="font-family:Manrope,'Segoe UI',Arial,sans-serif;">
                    <div style="margin:0;font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:#9DACD6;">McCullough Digital</div>
                    <div style="margin-top:6px;font-size:21px;line-height:1.2;font-weight:700;color:#EAF2FF;">Quick mobile performance note</div>
                  </td>
                  <td valign="middle" align="right" style="padding-left:12px;width:1%;white-space:nowrap;">
                    <span style="display:inline-block;padding:7px 12px 6px 12px;border:1px solid #00E5FF;border-radius:999px;font-family:Manrope,'Segoe UI',Arial,sans-serif;font-size:10.5px;letter-spacing:.09em;line-height:1;text-transform:uppercase;color:#00E5FF;white-space:nowrap;vertical-align:middle;">
                      mobile performance
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 24px 0 24px;">
              <div style="height:1px;font-size:1px;line-height:1px;background:linear-gradient(90deg,#00E5FF 0%,#FF00E0 100%);">&nbsp;</div>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 24px 8px 24px;font-family:Nunito,Manrope,'Segoe UI',Arial,sans-serif;color:#C5D8F2;font-size:15px;line-height:1.65;">
              <p style="margin:0 0 14px 0;color:#EAF2FF;">Hi {team} team,</p>

              <p style="margin:0 0 14px 0;">
                I took a quick look at
                <a href="{site}" style="color:#00E5FF;text-decoration:underline;">{site}</a>
                from a mobile user perspective.
              </p>

              <p style="margin:0 0 14px 0;">
                I ran Lighthouse checks using DevTools throttling, simulating average 5G mobile speeds, and the homepage scored
                <strong style="color:#EAF2FF;">{score_txt} out of 100</strong> for performance.
                LCP was around <strong style="color:#EAF2FF;">{lcp_s:.1f} seconds</strong>, and interactive time was around
                <strong style="color:#EAF2FF;">{tti_s:.1f} seconds</strong>.
              </p>

              <p style="margin:0 0 14px 0;">
                On slower or congested mobile connections, that can translate to noticeable delay before the page feels fully usable.
              </p>

              <p style="margin:0 0 14px 0;">
                As a benchmark, around <strong style="color:#EAF2FF;">53% of mobile visitors leave</strong> if a page takes longer than 3 seconds to load.
              </p>

              <p style="margin:0 0 14px 0;">
                If helpful, I can send a short 3-step fix order your team can apply right away.
              </p>

              <p style="margin:0;color:#EAF2FF;">{SENDER_NAME}</p>
              <p style="margin:0;">
                <a href="{BRAND_URL}" style="color:#00E5FF;text-decoration:underline;">{SENDER_TITLE}</a>
              </p>
              <p style="margin:0;">
                <a href="tel:{SENDER_PHONE_HREF}" style="color:#00E5FF;text-decoration:underline;">{SENDER_PHONE}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 24px 24px 24px;border-top:1px solid #1E2536;font-family:Nunito,'Segoe UI',Arial,sans-serif;color:#9DACD6;font-size:12px;line-height:1.55;">
              <p style="margin:0 0 4px 0;">
                Advertisement: This is a business outreach email from McCullough Digital.
              </p>
              <p style="margin:0 0 4px 0;">Phone: {SENDER_PHONE}</p>
              <p style="margin:0 0 4px 0;">Mailing address: {MAILING_ADDRESS}</p>
              <p style="margin:0;">{OPT_OUT}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def build_html_plain_styled(name: str, website: str, score: float, lcp_ms: float, tti_ms: float) -> str:
    lcp_s = round(lcp_ms / 1000.0, 1)
    tti_s = round(tti_ms / 1000.0, 1)
    subject = build_subject(name, score)
    preheader = build_preheader(score)
    team = company_display(name)
    site = website
    score_txt = fmt_intish(score)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;line-height:1px;font-size:1px;color:#f3f5f8;">
    {preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#ffffff;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#ffffff;">
          <tr>
            <td style="padding:0;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.72;">
              <p style="margin:0 0 16px 0;">Hi {team} team,</p>

              <p style="margin:0 0 16px 0;">
                I'm local here in Conroe, and I took a quick look at
                <a href="{site}" style="color:#1254a1;text-decoration:underline;">{site}</a>.
              </p>

              <p style="margin:0 0 16px 0;">
                I ran Lighthouse checks using DevTools throttling, simulating average 5G mobile speeds, and the homepage landed at <strong style="color:#183153;">{score_txt} out of 100</strong> for performance.
                LCP was around <strong style="color:#183153;">{lcp_s:.1f} seconds</strong>, and interactive time was around <strong style="color:#183153;">{tti_s:.1f} seconds</strong>.
              </p>

              <p style="margin:0 0 16px 0;">
                On slower or congested mobile connections, that can translate to noticeable delay before the page feels fully usable.
                As a benchmark, around <strong style="color:#183153;">53% of mobile visitors leave</strong> if a page takes longer than 3 seconds to load.
              </p>

              <p style="margin:0 0 16px 0;">
                If useful, reply with <strong>send it</strong> and I'll send the first few things I'd fix.
              </p>

              <p style="margin:22px 0 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#31425b;">
                {SENDER_NAME}<br>
                <a href="{BRAND_URL}" style="color:#1254a1;text-decoration:underline;">{SENDER_TITLE}</a><br>
                <a href="tel:{SENDER_PHONE_HREF}" style="color:#1254a1;text-decoration:underline;">{SENDER_PHONE}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 0 0 0;font-family:'Segoe UI',Arial,sans-serif;color:#68758a;font-size:12px;line-height:1.65;border-top:1px solid #eceff3;">
              <p style="margin:0 0 4px 0;">
                Advertisement: This is a business outreach email from McCullough Digital.
              </p>
              <p style="margin:0 0 4px 0;">Phone: {SENDER_PHONE}</p>
              <p style="margin:0 0 4px 0;">Mailing address: {MAILING_ADDRESS}</p>
              <p style="margin:0;">{OPT_OUT}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def build_html(
    name: str,
    website: str,
    score: float,
    lcp_ms: float,
    tti_ms: float,
    template_style: str,
) -> str:
    if template_style == "deluxe":
        return build_html_deluxe(name, website, score, lcp_ms, tti_ms)
    return build_html_plain_styled(name, website, score, lcp_ms, tti_ms)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Generate draft pack for abysmal Lighthouse leads.")
    ap.add_argument(
        "--lighthouse-csv",
        default="reports/performance/lighthouse-mid5g-deep-audit-100-2026-03-05-final-merged.csv",
    )
    ap.add_argument(
        "--max-performance",
        type=float,
        default=None,
        help="Include rows with performance <= this value.",
    )
    ap.add_argument(
        "--min-lcp-ms",
        type=float,
        default=None,
        help="Include rows with LCP >= this value (ms).",
    )
    ap.add_argument(
        "--min-tti-ms",
        type=float,
        default=None,
        help="Include rows with TTI >= this value (ms).",
    )
    ap.add_argument(
        "--label",
        default="",
        help="Optional output label (used in output file/folder names).",
    )
    ap.add_argument(
        "--out-queue-csv",
        default="",
    )
    ap.add_argument(
        "--out-drafts-dir",
        default="",
    )
    ap.add_argument(
        "--template-style",
        choices=["plain-styled", "deluxe"],
        default="plain-styled",
        help="HTML template style to emit for generated drafts.",
    )
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    in_csv = Path(args.lighthouse_csv)

    max_perf = args.max_performance
    min_lcp = args.min_lcp_ms
    min_tti = args.min_tti_ms

    # Backward-compatible default behavior.
    if max_perf is None and min_lcp is None and min_tti is None:
        max_perf = 40.0

    parts = []
    if max_perf is not None:
        parts.append(f"perf-le-{int(max_perf) if max_perf.is_integer() else max_perf}")
    if min_lcp is not None:
        parts.append(f"lcp-ge-{int(min_lcp) if min_lcp.is_integer() else min_lcp}ms")
    if min_tti is not None:
        parts.append(f"tti-ge-{int(min_tti) if min_tti.is_integer() else min_tti}ms")
    criteria_label = args.label.strip() or "-".join(parts) or "custom"
    stamp = date.today().isoformat()

    out_queue = Path(args.out_queue_csv) if args.out_queue_csv else Path(
        f"outreach/queues/lighthouse-target-{criteria_label}-{stamp}.csv"
    )
    out_drafts_dir = Path(args.out_drafts_dir) if args.out_drafts_dir else Path(
        f"outreach/drafts/lighthouse-target-{criteria_label}-{stamp}"
    )

    out_drafts_dir.mkdir(parents=True, exist_ok=True)
    out_queue.parent.mkdir(parents=True, exist_ok=True)

    with in_csv.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    kept = []
    for r in rows:
        if (r.get("status") or "").strip().lower() != "ok":
            continue
        email = (r.get("email") or "").strip()
        website = (r.get("website") or "").strip()
        perf_raw = (r.get("performance") or "").strip()
        if not email or not website or not perf_raw:
            continue
        try:
            perf = float(perf_raw)
            lcp_ms = float((r.get("lcp_ms") or "0").strip() or 0.0)
            tti_ms = float((r.get("tti_ms") or "0").strip() or 0.0)
        except ValueError:
            continue
        include = True
        if max_perf is not None and perf > max_perf:
            include = False
        if min_lcp is not None and lcp_ms < min_lcp:
            include = False
        if min_tti is not None and tti_ms < min_tti:
            include = False

        if include:
            kept.append(
                {
                    "idx": r.get("idx", "").strip(),
                    "name": r.get("name", "").strip(),
                    "email": email,
                    "website": website,
                    "performance": perf,
                    "lcp_ms": lcp_ms,
                    "tti_ms": tti_ms,
                }
            )

    kept.sort(key=lambda x: (x["performance"], x["name"].lower()))

    queue_fields = ["idx", "name", "email", "website", "performance", "lcp_ms", "tti_ms"]
    with out_queue.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=queue_fields)
        w.writeheader()
        for row in kept:
            w.writerow(row)

    index_rows = []
    for row in kept:
        slug = slugify(f"{row['idx']}-{company_display(row['name'])}")
        html_name = f"{slug}.html"
        txt_name = f"{slug}.txt"
        html_path = out_drafts_dir / html_name
        txt_path = out_drafts_dir / txt_name
        subject = build_subject(row["name"], row["performance"])

        html_path.write_text(
            build_html(
                row["name"],
                row["website"],
                row["performance"],
                row["lcp_ms"],
                row["tti_ms"],
                args.template_style,
            ),
            encoding="utf-8",
        )
        txt_path.write_text(
            build_plain_text(row["name"], row["website"], row["performance"], row["lcp_ms"], row["tti_ms"]),
            encoding="utf-8",
        )

        index_rows.append(
            {
                "idx": row["idx"],
                "name": row["name"],
                "email": row["email"],
                "website": row["website"],
                "subject": subject,
                "performance": fmt_intish(row["performance"]),
                "lcp_ms": f"{row['lcp_ms']:.1f}",
                "tti_ms": f"{row['tti_ms']:.1f}",
                "html_file": str(html_path).replace("\\", "/"),
                "txt_file": str(txt_path).replace("\\", "/"),
            }
        )

    index_csv = out_drafts_dir / "draft-index.csv"
    with index_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "idx",
                "name",
                "email",
                "website",
                "subject",
                "performance",
                "lcp_ms",
                "tti_ms",
                "html_file",
                "txt_file",
            ],
        )
        w.writeheader()
        for row in index_rows:
            w.writerow(row)

    print(f"input_rows={len(rows)}")
    print(f"criteria=max_performance<={max_perf} min_lcp_ms>={min_lcp} min_tti_ms>={min_tti}")
    print(f"abysmal_rows={len(kept)}")
    print(f"queue_csv={out_queue}")
    print(f"drafts_dir={out_drafts_dir}")
    print(f"draft_index_csv={index_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
