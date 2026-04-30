from __future__ import annotations

import argparse
import json
import re
import time
from dataclasses import dataclass, asdict
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.request import Request, urlopen


REPO_ROOT = Path(".")
UA = "Mozilla/5.0 (compatible; McCulloughDigitalResearchBot/1.0; +https://mccullough.digital)"

JUNK_DOMAINS = {
    "fastpeoplesearch.com",
    "truepeoplesearch.com",
    "spokeo.com",
    "whitepages.com",
    "beenverified.com",
    "radaris.com",
    "peekyou.com",
    "peoplefinders.com",
    "addresses.com",
}


def fetch(url: str, timeout: int = 25) -> str:
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read(600_000)
    return raw.decode("utf-8", errors="replace")


def ddg_search(query: str, timeout: int = 25) -> list[str]:
    url = f"https://duckduckgo.com/html/?q={quote_plus(query)}"
    html = fetch(url, timeout=timeout)
    hrefs = re.findall(r'class="result__a"[^>]+href="([^"]+)"', html)
    out: list[str] = []
    for h in hrefs:
        h = h.replace("&amp;", "&")
        if h.startswith("//"):
            h = "https:" + h
        if "duckduckgo.com/l/" in h or "duckduckgo.com/l/?" in h:
            try:
                qs = parse_qs(urlparse(h).query)
                uddg = qs.get("uddg", [""])[0]
                if uddg:
                    out.append(unquote(uddg))
                    continue
            except Exception:
                pass
        out.append(h)
    seen = set()
    uniq: list[str] = []
    for u in out:
        if not u or u in seen:
            continue
        seen.add(u)
        uniq.append(u)
    return uniq


def seems_junk(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return True
    if host in JUNK_DOMAINS:
        return True
    return False


def read_header_value(text: str, label: str) -> str:
    m = re.search(rf"^{re.escape(label)}:\s*(.+)$", text, flags=re.MULTILINE)
    return (m.group(1).strip() if m else "").strip()


@dataclass(frozen=True)
class Target:
    lead_id: int
    name: str
    profile_path: str
    address: str
    batch: str
    candidates: list[str]


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate a social-sweep target list from a move report.")
    ap.add_argument("--report", required=True, help="reports/disqualify-...md path")
    ap.add_argument("--out", default="", help="Output JSON path (tmp/...)")
    ap.add_argument("--timeout", type=int, default=25)
    ap.add_argument("--sleep", type=float, default=0.8)
    ap.add_argument("--limit", type=int, default=0, help="Optional limit (0=all).")
    ap.add_argument(
        "--write-every",
        type=int,
        default=10,
        help="Write partial JSON output every N processed leads (for long runs).",
    )
    args = ap.parse_args()

    report_path = Path(args.report)
    if not report_path.exists():
        raise SystemExit(f"Missing: {report_path.as_posix()}")

    today = date.today().isoformat()
    out_path = Path(args.out) if args.out else Path("tmp") / f"social-sweep-targets-{today}.json"

    # Parse: - 217 NAME: MOVE -> `leads/disqualified/.../profile.md`
    rows: list[tuple[int, str, str]] = []
    for line in report_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"^- (\d+)\s+(.+?):\s+MOVE ->\s+`([^`]+)`\s*$", line.strip())
        if not m:
            continue
        lead_id = int(m.group(1))
        name = m.group(2).strip()
        prof = m.group(3).strip()
        rows.append((lead_id, name, prof))

    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    targets: list[Target] = []
    for idx, (lead_id, name, prof) in enumerate(rows, start=1):
        profile_path = Path(prof)
        if not profile_path.exists():
            # Keep entry but without candidates so we can see missing cases.
            targets.append(
                Target(
                    lead_id=lead_id,
                    name=name,
                    profile_path=prof,
                    address="",
                    batch="",
                    candidates=[],
                )
            )
            continue

        text = profile_path.read_text(encoding="utf-8", errors="ignore")
        address = read_header_value(text, "Address")
        batch = read_header_value(text, "Batch")

        # Query strategy: prioritize social properties.
        base = f"\"{name}\""
        if address and "," in address:
            # Use city/state fragment when present.
            city_state = ",".join(address.split(",")[1:]).strip()
            base = f"\"{name}\" {city_state}"
        elif address:
            base = f"\"{name}\" {address}"

        # Keep this lightweight: 2-3 queries per lead is enough for our purpose.
        queries = [
            f"{base} site:facebook.com",
            f"{base} site:instagram.com",
            f"{base} facebook",
        ]

        found: list[str] = []
        for q in queries:
            time.sleep(args.sleep)
            try:
                urls = ddg_search(q, timeout=args.timeout)[:6]
            except Exception:
                continue
            for u in urls:
                if seems_junk(u):
                    continue
                host = (urlparse(u).hostname or "").lower()
                if not host:
                    continue
                # Keep only "social-ish" properties for this sweep.
                if any(
                    s in host
                    for s in (
                        "facebook.com",
                        "instagram.com",
                        "etsy.com",
                        "linkedin.com",
                        "contra.com",
                        "eventeny.com",
                        "threads.com",
                    )
                ):
                    if u not in found:
                        found.append(u)
            if len(found) >= 6:
                break

        targets.append(
            Target(
                lead_id=lead_id,
                name=name,
                profile_path=prof,
                address=address,
                batch=batch,
                candidates=found[:6],
            )
        )

        if args.write_every and idx % args.write_every == 0:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps([asdict(t) for t in targets], indent=2), encoding="utf-8")
            print(f"> Progress: {idx}/{len(rows)} (partial written: {out_path.as_posix()})")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps([asdict(t) for t in targets], indent=2), encoding="utf-8")
    print(f"Wrote: {out_path.as_posix()}")
    print(f"Targets: {len(targets)}")
    print(f"With candidates: {sum(1 for t in targets if t.candidates)}")


if __name__ == "__main__":
    main()
