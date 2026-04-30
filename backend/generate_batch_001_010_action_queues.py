from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
OUT_DIR = REPO_ROOT / "outreach" / "queues"


@dataclass(frozen=True)
class Row:
    lead_id: int
    name: str
    batch: str
    status: str
    outreach_status: str
    contact_path: str
    contact_search: str
    email: str
    phone: str
    website: str
    contact_form: str
    social: str
    disqualified: str
    profile: str


def _norm(v: str | None) -> str:
    return (v or "").strip()


def _is_yes(v: str) -> bool:
    return v.strip().lower() in {"yes", "true", "1"}


def _is_real_email(v: str) -> bool:
    v = v.strip()
    return bool(v) and "@" in v


def _is_unknown(v: str) -> bool:
    v = (v or "").strip().lower()
    return (not v) or v in {"unknown", "n/a", "na", "none", "not sure"}


def _researched(contact_search: str) -> bool:
    """
    True when we've already run a contact research pass and should not keep
    showing the lead in the "research needed" queues.
    """
    v = (contact_search or "").strip().lower()
    if not v:
        return False
    # Common header forms we use:
    # - checked YYYY-MM-DD
    # - not found (checked YYYY-MM-DD)
    return ("checked" in v) or ("not found" in v)


def _write_queue(path: Path, title: str, rows: list[Row]) -> None:
    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("Purpose: batch 001-010 focused action queue (draft-only planning; no sending).")
    lines.append(f"Last updated: {date.today().isoformat()}")
    lines.append(f"Total: {len(rows)}")
    lines.append("")
    lines.append("| LeadID | Name | Batch | Status | Outreach | Contact Path | Email | Phone | Website | Form | Social | Profile |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in rows:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(r.lead_id),
                    r.name or "unknown",
                    r.batch or "unknown",
                    r.status or "unknown",
                    r.outreach_status or "unknown",
                    r.contact_path or "unknown",
                    r.email or "",
                    r.phone or "",
                    r.website or "",
                    r.contact_form or "",
                    r.social or "",
                    r.profile or "",
                ]
            )
            + " |"
        )
    lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    if not INDEX_CSV.exists():
        raise SystemExit(f"Missing: {INDEX_CSV.as_posix()}")

    batches = {f"registered-entities-batch-{i:03d}" for i in range(1, 11)}

    rows: list[Row] = []
    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        for d in csv.DictReader(f):
            batch = _norm(d.get("Batch"))
            if batch not in batches:
                continue
            lead_id_raw = _norm(d.get("LeadID"))
            if not lead_id_raw.isdigit():
                continue
            rows.append(
                Row(
                    lead_id=int(lead_id_raw),
                    name=_norm(d.get("Name")),
                    batch=batch,
                    status=_norm(d.get("Status")),
                    outreach_status=_norm(d.get("OutreachStatus")),
                    contact_path=_norm(d.get("ContactPath")),
                    contact_search=_norm(d.get("ContactSearch")),
                    email=_norm(d.get("Email")),
                    phone=_norm(d.get("Phone")),
                    website=_norm(d.get("Website")),
                    contact_form=_norm(d.get("ContactForm")),
                    social=_norm(d.get("SocialMedia")),
                    disqualified=_norm(d.get("Disqualified")),
                    profile=_norm(d.get("ProfilePath")),
                )
            )

    qualified = [r for r in rows if not _is_yes(r.disqualified)]

    uncontacted = [r for r in qualified if (r.outreach_status or "").lower() == "uncontacted"]

    phone_only_uncontacted = [
        r for r in uncontacted if (r.contact_path or "").lower() == "phone-only"
    ]

    # "No contact" means there is no actionable digital contact method present.
    # This should not be conflated with "research needed" once a research pass has been done.
    no_contact_uncontacted_all = [
        r
        for r in uncontacted
        if (not _is_real_email(r.email))
        and (not r.phone)
        and (not r.contact_form)
        and (not r.social)
    ]

    # Research-needed queues: only include items we have NOT already researched.
    unknown_path_uncontacted = [
        r
        for r in uncontacted
        if (r.contact_path or "").lower() == "unknown" and (not _researched(r.contact_search))
    ]

    no_contact_uncontacted = [
        r
        for r in no_contact_uncontacted_all
        if (not _researched(r.contact_search))
    ]

    no_contact_exhausted = [
        r
        for r in no_contact_uncontacted_all
        if _researched(r.contact_search)
    ]

    # Draft-focused: these are the "write drafts / do research" buckets.
    email_uncontacted = [r for r in uncontacted if _is_real_email(r.email)]
    form_uncontacted = [
        r for r in uncontacted if (r.contact_path or "").lower() == "form" and r.contact_form
    ]
    social_uncontacted = [
        r
        for r in uncontacted
        if (r.contact_path or "").lower() == "social" and r.social
    ]

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    _write_queue(
        OUT_DIR / "batches-001-010-uncontacted-phone-only.md",
        "Batches 001-010: Uncontacted Phone-Only",
        sorted(phone_only_uncontacted, key=lambda r: r.lead_id),
    )
    _write_queue(
        OUT_DIR / "batches-001-010-uncontacted-email.md",
        "Batches 001-010: Uncontacted Email (Needs Draft or Send Check)",
        sorted(email_uncontacted, key=lambda r: r.lead_id),
    )
    _write_queue(
        OUT_DIR / "batches-001-010-uncontacted-form.md",
        "Batches 001-010: Uncontacted Contact-Form",
        sorted(form_uncontacted, key=lambda r: r.lead_id),
    )
    _write_queue(
        OUT_DIR / "batches-001-010-uncontacted-social.md",
        "Batches 001-010: Uncontacted Social",
        sorted(social_uncontacted, key=lambda r: r.lead_id),
    )
    _write_queue(
        OUT_DIR / "batches-001-010-uncontacted-contact-unknown.md",
        "Batches 001-010: Uncontacted (Contact Path Unknown)",
        sorted(unknown_path_uncontacted, key=lambda r: r.lead_id),
    )
    _write_queue(
        OUT_DIR / "batches-001-010-uncontacted-no-contact-research-needed.md",
        "Batches 001-010: Uncontacted (No Contact Methods Found)",
        sorted(no_contact_uncontacted, key=lambda r: r.lead_id),
    )
    _write_queue(
        OUT_DIR / "batches-001-010-uncontacted-no-contact-exhausted.md",
        "Batches 001-010: Uncontacted (No Contact Methods Found, Research Completed)",
        sorted(no_contact_exhausted, key=lambda r: r.lead_id),
    )

    print("Wrote queues under outreach/queues/:")
    print(f"- phone-only: {len(phone_only_uncontacted)}")
    print(f"- email: {len(email_uncontacted)}")
    print(f"- form: {len(form_uncontacted)}")
    print(f"- social: {len(social_uncontacted)}")
    print(f"- contact-unknown: {len(unknown_path_uncontacted)}")
    print(f"- no-contact: {len(no_contact_uncontacted)}")
    print(f"- no-contact-exhausted: {len(no_contact_exhausted)}")


if __name__ == "__main__":
    main()
