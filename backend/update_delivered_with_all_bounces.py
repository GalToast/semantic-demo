"""
Update delivered-emails.json to exclude ALL bounces from ALL sources.
"""
import json
from pathlib import Path

REPO_ROOT = Path(".")
SENT_PATH = REPO_ROOT / "outreach" / "exports" / "sent-items.json"
DELIVERED_PATH = REPO_ROOT / "outreach" / "exports" / "delivered-emails.json"
BOUNCES_PATH = REPO_ROOT / "outreach" / "logs" / "all-bounced-comprehensive.json"


def main():
    # Load all bounces from all sources
    with BOUNCES_PATH.open() as f:
        bounces = json.load(f)
    bounced_emails = set(b['email'].lower() for b in bounces)
    print(f"Bounces: {len(bounced_emails)}")
    
    # Load all sent
    with SENT_PATH.open() as f:
        sent = json.load(f)
    print(f"Sent entries: {len(sent)}")
    
    # Filter to delivered
    delivered = []
    seen = set()
    for item in sent:
        email = item['email'].lower()
        if email in bounced_emails:
            continue
        if email in seen:
            continue
        seen.add(email)
        delivered.append(item)
    
    # Sort by email
    delivered.sort(key=lambda x: x['email'].lower())
    
    # Save
    DELIVERED_PATH.write_text(json.dumps(delivered, indent=2))
    
    print(f"Delivered (unique): {len(delivered)}")
    print(f"File: {DELIVERED_PATH}")


if __name__ == "__main__":
    main()