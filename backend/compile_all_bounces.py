"""
Compile ALL bounces from multiple sources:
1. Leads index.csv (OutreachStatus = bounced)
2. Leads index.csv (email contains "(bounced") 
3. Bounce reports in reports/
4. IMAP inbox scans
5. Hostinger bounce exports
"""
import csv
import json
import re
from datetime import datetime
from pathlib import Path

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")

REPO_ROOT = Path(".")
INDEX_PATH = REPO_ROOT / "leads" / "index.csv"
ALL_BOUNCES_PATH = REPO_ROOT / "outreach" / "logs" / "all-bounced-comprehensive.json"


def extract_email_from_field(email_field: str) -> list[str]:
    """Extract email addresses from a field that may contain notes."""
    if not email_field:
        return []
    # Extract primary email (before any notes like "(bounced)")
    emails = EMAIL_RE.findall(email_field)
    return [e.lower() for e in emails]


def load_bounces_from_index() -> dict[str, dict]:
    """Load bounces from leads/index.csv."""
    bounces = {}
    
    with INDEX_PATH.open(newline="", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            outreach_status = (row.get("OutreachStatus") or "").strip().lower()
            email_field = (row.get("Email") or "").strip()
            lead_id = row.get("LeadID", "")
            name = row.get("Name", "")
            
            # Check if marked as bounced in status
            if outreach_status == "bounced":
                emails = extract_email_from_field(email_field)
                for email in emails:
                    if email and email not in bounces:
                        bounces[email] = {
                            "email": email,
                            "lead_id": lead_id,
                            "name": name,
                            "source": "index_outreach_status",
                            "notes": f"OutreachStatus=bounced"
                        }
            
            # Check if email field contains "(bounced" or "bounced;"
            if "(bounced" in email_field.lower() or "bounced;" in email_field.lower():
                emails = extract_email_from_field(email_field)
                for email in emails:
                    if email and email not in bounces:
                        bounces[email] = {
                            "email": email,
                            "lead_id": lead_id,
                            "name": name,
                            "source": "index_email_note",
                            "notes": "Email field contains 'bounced'"
                        }
    
    return bounces


def load_bounces_from_reports() -> dict[str, dict]:
    """Load bounces from report files."""
    bounces = {}
    reports_dir = REPO_ROOT / "reports"
    
    # Search for bounce-related reports
    for report_file in reports_dir.glob("*bounce*.md"):
        try:
            content = report_file.read_text(encoding="utf-8", errors="ignore")
            # Look for email patterns
            for match in EMAIL_RE.finditer(content):
                email = match.group(1).lower()
                if email not in bounces:
                    bounces[email] = {
                        "email": email,
                        "source": f"report:{report_file.name}",
                        "notes": "Found in bounce report"
                    }
        except Exception as e:
            print(f"Error reading {report_file.name}: {e}")
    
    return bounces


def load_bounces_from_tmp_csvs() -> dict[str, dict]:
    """Load bounces from tmp CSV exports."""
    bounces = {}
    tmp_dir = REPO_ROOT / "tmp"
    
    for csv_file in tmp_dir.glob("bounced_recipients*.csv"):
        try:
            with csv_file.open(newline="", encoding="utf-8", errors="ignore") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    recipient = (row.get("recipient") or "").strip().lower()
                    if recipient and recipient not in bounces:
                        bounces[recipient] = {
                            "email": recipient,
                            "source": f"tmp:{csv_file.name}",
                            "notes": f"Status: {row.get('status', 'unknown')}"
                        }
        except Exception as e:
            print(f"Error reading {csv_file.name}: {e}")
    
    return bounces


def load_bounces_from_imap_json() -> dict[str, dict]:
    """Load bounces from IMAP JSON exports."""
    bounces = {}
    tmp_dir = REPO_ROOT / "tmp"
    
    for json_file in tmp_dir.glob("all_bounces_from_imap*.csv"):
        try:
            with json_file.open(newline="", encoding="utf-8", errors="ignore") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    recipient = (row.get("recipient") or "").strip().lower()
                    if recipient and recipient not in bounces:
                        bounces[recipient] = {
                            "email": recipient,
                            "source": f"imap:{json_file.name}",
                            "notes": row.get("bounce_type", "unknown")
                        }
        except Exception as e:
            print(f"Error reading {json_file.name}: {e}")
    
    # Also check outreach/logs
    imap_json = REPO_ROOT / "outreach" / "logs" / "all-bounced-emails.json"
    if imap_json.exists():
        try:
            data = json.loads(imap_json.read_text(encoding="utf-8"))
            for item in data:
                email = (item.get("email") or "").lower()
                if email and email not in bounces:
                    bounces[email] = {
                        "email": email,
                        "source": "imap_outlook_logs",
                        "notes": item.get("bounce_type", "unknown")
                    }
        except Exception as e:
            print(f"Error reading all-bounced-emails.json: {e}")
    
    return bounces


def main():
    print("Compiling ALL bounces from all sources...\n")
    
    all_bounces = {}
    
    # Source 1: Index OutreachStatus
    print("1. Scanning leads/index.csv (OutreachStatus=bounced)...")
    index_bounces = load_bounces_from_index()
    print(f"   Found {len(index_bounces)} bounces in index")
    all_bounces.update(index_bounces)
    
    # Source 2: Reports
    print("2. Scanning reports/ for bounce mentions...")
    report_bounces = load_bounces_from_reports()
    print(f"   Found {len(report_bounces)} bounces in reports")
    # Add new ones only
    for email, data in report_bounces.items():
        if email not in all_bounces:
            all_bounces[email] = data
    
    # Source 3: TMP CSV exports
    print("3. Scanning tmp/ for bounce CSVs...")
    tmp_bounces = load_bounces_from_tmp_csvs()
    print(f"   Found {len(tmp_bounces)} bounces in tmp files")
    for email, data in tmp_bounces.items():
        if email not in all_bounces:
            all_bounces[email] = data
    
    # Source 4: IMAP JSON
    print("4. Scanning for IMAP bounce exports...")
    imap_bounces = load_bounces_from_imap_json()
    print(f"   Found {len(imap_bounces)} bounces in IMAP data")
    for email, data in imap_bounces.items():
        if email not in all_bounces:
            all_bounces[email] = data
    
    # Deduplicate and merge sources
    print(f"\n{'='*60}")
    print(f"TOTAL UNIQUE BOUNCED EMAILS: {len(all_bounces)}")
    print(f"{'='*60}")
    
    # Convert to list
    bounce_list = []
    for email, data in all_bounces.items():
        bounce_list.append(data)
    
    # Sort by email
    bounce_list.sort(key=lambda x: x["email"])
    
    # Save
    ALL_BOUNCES_PATH.parent.mkdir(parents=True, exist_ok=True)
    ALL_BOUNCES_PATH.write_text(json.dumps(bounce_list, indent=2), encoding="utf-8")
    
    print(f"\nSaved to: {ALL_BOUNCES_PATH}")
    print(f"Total bounces: {len(bounce_list)}")
    
    # Show sample
    print(f"\nSample bounced emails:")
    for item in bounce_list[:20]:
        print(f"  - {item['email']} ({item.get('source', 'unknown')})")
    if len(bounce_list) > 20:
        print(f"  ... and {len(bounce_list) - 20} more")


if __name__ == "__main__":
    main()