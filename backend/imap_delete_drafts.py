import argparse
import imaplib
import os
import email
from email.utils import parseaddr


def get_windows_user_env(name: str) -> str | None:
    if os.name != "nt":
        return None
    try:
        import winreg  # type: ignore

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
            return str(value) if value else None
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Delete specific drafts via IMAP (Robust).")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--folder", default="INBOX.Drafts")
    parser.add_argument("--targets", nargs='+', required=True, help="List of recipient emails to delete drafts for.")
    args = parser.parse_args()

    password = os.getenv(args.pass_env)
    if not password:
        password = get_windows_user_env(args.pass_env)
    if not password:
        print(f"Error: Missing password in env var: {args.pass_env}.")
        return

    targets = {t.lower().strip() for t in args.targets}

    try:
        client = imaplib.IMAP4_SSL(args.host, args.port)
        client.login(args.user, password)
        
        status, _ = client.select(args.folder)
        if status != "OK":
            print(f"Failed to select folder {args.folder}")
            return

        status, data = client.search(None, "ALL")
        if status != "OK":
            print("Failed to search folder")
            return

        ids = data[0].split()
        deleted_count = 0

        for msg_id in ids:
            # Fetch To header only
            status, msg_data = client.fetch(msg_id, "(BODY.PEEK[HEADER.FIELDS (TO)])")
            if status != "OK" or not msg_data:
                continue
            
            raw_headers = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw_headers = chunk[1]
                    break
            
            if not raw_headers:
                continue

            msg = email.message_from_bytes(raw_headers)
            to_header = msg.get("To", "")
            
            # parseaddr returns ('Name', 'email@domain.com')
            _, email_to = parseaddr(to_header)
            email_to = email_to.lower().strip()
            
            if email_to in targets:
                print(f"Match: {email_to} (ID: {msg_id.decode()}). Deleting...")
                client.store(msg_id, '+FLAGS', r'(\Deleted)')
                deleted_count += 1

        if deleted_count > 0:
            client.expunge()
            print(f"Successfully deleted {deleted_count} drafts.")
        else:
            print("No matching drafts found.")
            
        client.logout()
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
