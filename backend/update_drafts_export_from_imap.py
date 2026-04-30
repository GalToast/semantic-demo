"""
Update outreach/exports/drafts.json from the latest Hostinger IMAP drafts export.

This converts the IMAP draft index format to the simpler drafts.json format used
across the repo.
"""

from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
DRAFTS_PATH = REPO_ROOT / "outreach" / "exports" / "drafts.json"


def find_latest_drafts_index() -> Path | None:
    files = sorted(TMP_DIR.glob("hostinger_drafts_index_*.json"))
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def convert_imap_to_drafts_export(imap_data: dict) -> dict:
    items_out = []
    for page in imap_data.get("pages", []):
        for item in page.get("items", []):
            recipient = (item.get("to") or "").strip()
            subject = (item.get("subject") or "").strip()
            msg_date = (item.get("date") or "").strip()
            text = f"{recipient}, Draft\n{subject}\n{msg_date}".strip()
            items_out.append(
                {
                    "uid": str(item.get("id", "")),
                    "subject": subject,
                    "to": recipient,
                    "from": (item.get("from") or "").strip(),
                    "date": msg_date,
                    "body": "",
                    "href": "",
                    "text": text,
                }
            )
    return {"value": items_out}


def main() -> None:
    latest_path = find_latest_drafts_index()
    if not latest_path:
        print("ERROR: No hostinger_drafts_index_*.json found in tmp/")
        return

    print(f"Using IMAP export: {latest_path.name}")
    imap_data = json.loads(latest_path.read_text(encoding="utf-8"))
    total_items = sum(int(page.get("count", 0) or len(page.get("items", []))) for page in imap_data.get("pages", []))
    print(f"IMAP export contains: {total_items} items")

    drafts_export = convert_imap_to_drafts_export(imap_data)
    converted = len(drafts_export["value"])
    print(f"Converted to drafts.json rows: {converted}")

    DRAFTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    DRAFTS_PATH.write_text(json.dumps(drafts_export, indent=2), encoding="utf-8")

    print(f"\n[OK] Updated {DRAFTS_PATH}")
    print(f"   Total entries: {converted}")
    print("\nSample entries:")
    for item in drafts_export["value"][:5]:
        print(f"  - {item['to']}: {item['subject'][:60]}")


if __name__ == "__main__":
    main()
