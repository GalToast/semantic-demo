"""
Create a clean "successfully delivered" email list by subtracting bounces from sent.

This ensures we don't count bounced emails as "contacted" - those leads need
re-contact via alternative methods (contact forms, alternate emails, etc.)
"""
import csv
import json
import re
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
SENT_ITEMS_PATH = REPO_ROOT / "outreach" / "exports" / "sent-items.json"
DELIVERED_LIST_PATH = REPO_ROOT / "outreach" / "exports" / "delivered-emails.json"
BOUNCE_LIST_PATH = REPO_ROOT / "outreach" / "logs" / "bounced-emails.json"

EMAIL_RE = re.compile(r'([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})')


def find_latest_bounce_csv() -> Path | None:
    """Find the most recent bounced_recipients_*.csv file."""
    files = sorted(TMP_DIR.glob("bounced_recipients_*.csv"))
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def load_sent_emails() -> list[dict]:
    """Load sent-items.json."""
    if not SENT_ITEMS_PATH.exists():
        return []
    return json.loads(SENT_ITEMS_PATH.read_text(encoding="utf-8"))


def load_bounced_emails() -> set[str]:
    """Load bounced emails from latest CSV export."""
    bounced = set()
    
    # Try CSV first
    latest_csv = find_latest_bounce_csv()
    if latest_csv:
        print(f"Loading bounces from: {latest_csv.name}")
        with latest_csv.open(newline="", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f)
            for row in reader:
                recipient = row.get("recipient", "").strip()
                if recipient:
                    bounced.add(recipient.lower())
    
    # Also check tmp JSON bounce files
    for bounce_file in TMP_DIR.glob("bounced_recipients_with_leads_*.csv"):
        print(f"Also loading: {bounce_file.name}")
        with bounce_file.open(newline="", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f)
            for row in reader:
                email = row.get("email", "").strip() or row.get("Bounced Email", "").strip()
                if email:
                    bounced.add(email.lower())
    
    return bounced


def main():
    # Load sent emails
    sent_items = load_sent_emails()
    if not sent_items:
        print("ERROR: No sent-items.json found")
        return
    
    print(f"Loaded {len(sent_items)} sent email entries")
    
    # Load bounced emails
    bounced_emails = load_bounced_emails()
    print(f"Found {len(bounced_emails)} bounced email addresses")
    
    # Separate delivered vs bounced
    delivered = []
    actually_bounced = []
    
    for item in sent_items:
        email = item.get("email", "").lower()
        if email in bounced_emails:
            actually_bounced.append(item)
        else:
            delivered.append(item)
    
    # Deduplicate delivered by email (keep most recent)
    email_map = {}
    for item in delivered:
        email = item["email"].lower()
        if email not in email_map:
            email_map[email] = item
    
    unique_delivered = list(email_map.values())
    unique_delivered.sort(key=lambda x: x["email"].lower())
    
    # Write delivered list
    DELIVERED_LIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    DELIVERED_LIST_PATH.write_text(json.dumps(unique_delivered, indent=2), encoding="utf-8")
    
    # Write bounced list with details
    bounce_details = []
    for item in actually_bounced:
        email = item["email"].lower()
        if email in bounced_emails:
            bounce_details.append({
                "email": email,
                "subject": item.get("subject", ""),
                "when": item.get("when", "Unknown"),
                "status": "bounced"
            })
    
    # Deduplicate bounces
    bounce_map = {}
    for item in bounce_details:
        email = item["email"]
        if email not in bounce_map:
            bounce_map[email] = item
    
    unique_bounced = list(bounce_map.values())
    unique_bounced.sort(key=lambda x: x["email"])
    
    BOUNCE_LIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    BOUNCE_LIST_PATH.write_text(json.dumps(unique_bounced, indent=2), encoding="utf-8")
    
    # Summary
    print("\n" + "="*60)
    print("EMAIL DELIVERY SUMMARY")
    print("="*60)
    print(f"Total sent entries: {len(sent_items)}")
    print(f"Unique recipients sent: {len(set(i['email'].lower() for i in sent_items))}")
    print(f"Bounced: {len(unique_bounced)}")
    print(f"Successfully delivered: {len(unique_delivered)}")
    print(f"\nDelivered rate: {len(unique_delivered) / len(set(i['email'].lower() for i in sent_items)) * 100:.1f}%")
    print("="*60)
    print(f"\nFiles created:")
    print(f"  - {DELIVERED_LIST_PATH}")
    print(f"  - {BOUNCE_LIST_PATH}")
    
    # Show sample bounces
    if unique_bounced:
        print(f"\nSample bounced emails (need re-contact):")
        for item in unique_bounced[:10]:
            print(f"  - {item['email']}: {item['subject'][:50]}")
        if len(unique_bounced) > 10:
            print(f"  ... and {len(unique_bounced) - 10} more")


if __name__ == "__main__":
    main()
