"""
Update outreach/exports/sent-items.json from the latest Hostinger IMAP sent export.

This converts the IMAP export format to the simpler sent-items.json format
used for outreach deduplication.
"""
import json
from datetime import datetime
from pathlib import Path
import re

REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
SENT_ITEMS_PATH = REPO_ROOT / "outreach" / "exports" / "sent-items.json"

# Email regex for extracting addresses
EMAIL_RE = re.compile(r'([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})')


def find_latest_sent_index() -> Path | None:
    """Find the most recent hostinger_sent_index_*.json file."""
    files = sorted(TMP_DIR.glob("hostinger_sent_index_*.json"))
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def parse_imap_date(date_str: str) -> str:
    """Convert IMAP date to readable format."""
    if not date_str:
        return "Unknown date"
    try:
        # Try parsing common IMAP date formats
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return date_str[:30] if len(date_str) > 30 else date_str


def convert_imap_to_sent_items(imap_data: dict) -> list[dict]:
    """Convert IMAP export format to sent-items.json format."""
    sent_items = []
    
    for page in imap_data.get("pages", []):
        items = page.get("items", [])
        for item in items:
            to_field = item.get("to", "") or item.get("text", "")
            subject = item.get("subject", "")
            date_str = item.get("date", "")
            
            # Extract primary recipient email
            emails = EMAIL_RE.findall(to_field)
            if not emails:
                continue
            
            primary_email = emails[0]
            when = parse_imap_date(date_str)
            
            sent_items.append({
                "email": primary_email,
                "subject": subject.strip() if subject else "(no subject)",
                "when": when
            })
    
    # Sort by email for easier lookup
    sent_items.sort(key=lambda x: x["email"].lower())
    return sent_items


def dedupe_items(items: list[dict]) -> list[dict]:
    """Dedupe by the repo's historical sent-items key shape."""
    email_set = set()
    merged = []
    for item in items:
        key = (item["email"].lower(), item["subject"][:50].lower())
        if key not in email_set:
            email_set.add(key)
            merged.append(item)
    return merged


def main():
    # Find latest IMAP export
    latest_path = find_latest_sent_index()
    if not latest_path:
        print("ERROR: No hostinger_sent_index_*.json found in tmp/")
        return
    
    print(f"Using IMAP export: {latest_path.name}")
    
    # Load IMAP data
    imap_data = json.loads(latest_path.read_text(encoding="utf-8"))
    total_items = sum(p.get("count", 0) for p in imap_data.get("pages", []))
    print(f"IMAP export contains: {total_items} items")
    
    # Convert format
    sent_items = convert_imap_to_sent_items(imap_data)
    deduped_imap_items = dedupe_items(sent_items)
    print(f"Converted to raw sent rows: {len(sent_items)}")
    print(f"Deduped IMAP rows for sent-items.json shape: {len(deduped_imap_items)}")
    
    # Load existing sent-items if present
    existing_items = []
    if SENT_ITEMS_PATH.exists():
        existing_items = json.loads(SENT_ITEMS_PATH.read_text(encoding="utf-8"))
        print(f"Existing sent-items.json has: {len(existing_items)} items")
    
    # Merge: keep all IMAP items first, using the historical sent-items dedupe key.
    email_set = set()
    merged = []

    for item in deduped_imap_items:
        key = (item["email"].lower(), item["subject"][:50].lower())
        if key not in email_set:
            email_set.add(key)
            merged.append(item)
    
    # Add existing items that aren't in IMAP export
    for item in existing_items:
        key = (item["email"].lower(), item["subject"][:50].lower())
        if key not in email_set:
            email_set.add(key)
            merged.append(item)
    
    # Sort by email
    merged.sort(key=lambda x: x["email"].lower())
    
    # Write updated file
    SENT_ITEMS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SENT_ITEMS_PATH.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    
    print(f"\n[OK] Updated {SENT_ITEMS_PATH}")
    print(f"   Total entries: {len(merged)}")
    print(f"   Raw IMAP rows: {len(sent_items)}")
    print(f"   Deduped IMAP rows: {len(deduped_imap_items)}")
    print(f"   From existing (not in IMAP after dedupe): {len(merged) - len(deduped_imap_items)}")
    
    # Show sample
    print("\nSample entries:")
    for item in merged[:5]:
        print(f"  - {item['email']}: {item['subject'][:60]}")


if __name__ == "__main__":
    main()
