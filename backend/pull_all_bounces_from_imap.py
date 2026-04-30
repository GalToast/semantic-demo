"""
Pull ALL bounce messages from IMAP (inbox + junk) and extract recipient addresses.

This gives you the complete historical record of bounces, not just recent exports.
"""
import csv
import email
import imaplib
import json
import os
import re
from datetime import date
from pathlib import Path

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
SELF_EMAILS = {"fred@mccullough.digital"}

REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
BOUNCE_CSV_PATH = REPO_ROOT / "tmp" / f"all_bounces_from_imap_{date.today().isoformat()}.csv"
BOUNCE_JSON_PATH = REPO_ROOT / "outreach" / "logs" / "all-bounced-emails.json"


def get_windows_user_env(name: str) -> str | None:
    if os.name != "nt":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
            return str(value) if value else None
    except Exception:
        return None


def scan_mailbox_for_bounces(client, mailbox: str) -> list[dict]:
    """Scan a mailbox for bounce messages and extract recipient addresses."""
    status, _ = client.select(mailbox, readonly=True)
    if status != "OK":
        print(f"  Cannot select {mailbox}, skipping")
        return []
    
    # Search for common bounce terms
    ids = set()
    for term in ("Undelivered", "Delivery Status Notification", "Mail delivery failed", "Undeliverable", "Returned mail", "failure notice"):
        try:
            token = f'"{term}"' if " " in term else term
            status, data = client.search(None, "TEXT", token)
            if status == "OK" and data and data[0]:
                ids.update(data[0].split())
        except Exception as e:
            print(f"  Search error for '{term}': {e}")
            continue
    
    if not ids:
        print(f"  No bounces found in {mailbox}")
        return []
    
    print(f"  Found {len(ids)} potential bounce messages in {mailbox}")
    
    bounces = []
    for msg_id in ids:
        try:
            status, msg_data = client.fetch(msg_id, "(BODY.PEEK[HEADER.FIELDS (TO FROM SUBJECT DATE)])")
            if status != "OK" or not msg_data:
                continue
            
            raw = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                continue
            
            message = email.message_from_bytes(raw)
            to_field = message.get("To", "")
            subject = message.get("Subject", "")
            date_hdr = message.get("Date", "")
            
            # Extract all emails from To field and body
            recipient_emails = EMAIL_RE.findall(to_field)
            
            for email_addr in recipient_emails:
                email_addr_lower = email_addr.lower()
                if email_addr_lower in SELF_EMAILS:
                    continue
                
                # Determine bounce type from subject
                bounce_type = "unknown"
                subject_lower = subject.lower()
                if "undelivered" in subject_lower:
                    bounce_type = "undelivered"
                elif "delivery status" in subject_lower:
                    bounce_type = "dsn"
                elif "mail delivery failed" in subject_lower:
                    bounce_type = "failed"
                elif "returned mail" in subject_lower:
                    bounce_type = "returned"
                
                bounces.append({
                    "recipient": email_addr,
                    "recipient_lower": email_addr_lower,
                    "subject": subject,
                    "date": date_hdr,
                    "mailbox": mailbox,
                    "bounce_type": bounce_type
                })
                
        except Exception as e:
            print(f"  Error processing message {msg_id}: {e}")
            continue
    
    print(f"  Extracted {len(bounces)} bounces from {mailbox}")
    return bounces


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Pull all bounces from IMAP inbox and junk.")
    parser.add_argument("--imap-user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--dry-run", action="store_true", help="Don't save files")
    args = parser.parse_args()
    
    # Get password
    password = os.getenv(args.pass_env) or os.getenv("IMAP_PASSWORD")
    if not password:
        password = get_windows_user_env(args.pass_env) or get_windows_user_env("IMAP_PASSWORD")
    if not password:
        raise SystemExit(f"Missing {args.pass_env} env var")
    
    print(f"Connecting to {args.host} as {args.imap_user}...")
    
    client = imaplib.IMAP4_SSL(args.host, 993)
    try:
        client.login(args.imap_user, password)
        print("Connected!")
        
        # Scan inbox and junk
        all_bounces = []
        all_bounces.extend(scan_mailbox_for_bounces(client, "INBOX"))
        all_bounces.extend(scan_mailbox_for_bounces(client, "INBOX.Junk"))
        
        # Also try other common junk folder names
        for folder in ["INBOX.Spam", "Junk", "Spam", "INBOX.Trash"]:
            try:
                all_bounces.extend(scan_mailbox_for_bounces(client, folder))
            except:
                pass
        
    finally:
        try:
            client.logout()
        except:
            pass
    
    # Deduplicate by recipient email
    unique_bounces = {}
    for bounce in all_bounces:
        email_lower = bounce["recipient_lower"]
        if email_lower not in unique_bounces:
            unique_bounces[email_lower] = bounce
    
    print(f"\n{'='*60}")
    print(f"TOTAL BOUNCES FOUND: {len(all_bounces)}")
    print(f"UNIQUE BOUNCED RECIPIENTS: {len(unique_bounces)}")
    print(f"{'='*60}")
    
    if args.dry_run:
        print("\nDry run - not saving files")
        return
    
    # Save CSV
    BOUNCE_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with BOUNCE_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["recipient", "subject", "date", "mailbox", "bounce_type"])
        writer.writeheader()
        for bounce in unique_bounces.values():
            writer.writerow({
                "recipient": bounce["recipient"],
                "subject": bounce["subject"][:100],
                "date": bounce["date"],
                "mailbox": bounce["mailbox"],
                "bounce_type": bounce["bounce_type"]
            })
    
    # Save JSON
    bounce_list = [{"email": k, **v} for k, v in unique_bounces.items()]
    BOUNCE_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    BOUNCE_JSON_PATH.write_text(json.dumps(bounce_list, indent=2), encoding="utf-8")
    
    print(f"\nFiles saved:")
    print(f"  CSV: {BOUNCE_CSV_PATH}")
    print(f"  JSON: {BOUNCE_JSON_PATH}")
    
    # Show sample
    print(f"\nSample bounced emails:")
    for i, (email, bounce) in enumerate(list(unique_bounces.items())[:20]):
        print(f"  - {email}: {bounce['subject'][:50]}")
    if len(unique_bounces) > 20:
        print(f"  ... and {len(unique_bounces) - 20} more")


if __name__ == "__main__":
    main()