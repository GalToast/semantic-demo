from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re
from typing import Optional

REPO_ROOT = Path(".")
LEADS_ROOT = REPO_ROOT / "leads"
BATCHES_DIR = LEADS_ROOT / "batches"
PROFILES_ROOT = LEADS_ROOT / "profiles"
DISQUALIFIED_ROOT = LEADS_ROOT / "disqualified"

TODAY = date.today().isoformat()

SECTION_RE = re.compile(r"^##\s+(registered-entities-batch-\d{3}-worklist\.md)\s*$")
MISSING_IDS_RE = re.compile(r"^Missing IDs:\s+(.+?)\s*$")


def range_dir_for_id(lead_id: int) -> str:
    start = (lead_id // 100) * 100
    end = start + 99
    return f"{start:03d}-{end:03d}"


def slugify(value: str) -> str:
    lowered = value.strip().lower()
    lowered = lowered.replace("&", " and ")
    lowered = re.sub(r"[^\w\s-]", "", lowered)
    lowered = re.sub(r"[\s_]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered)
    return lowered.strip("-") or "lead"


def normalize_missing_value(value: Optional[str]) -> str:
    if value is None:
        return "unknown"
    cleaned = re.sub(r"\s+", " ", value.strip())
    if cleaned.lower() in {"", "unknown", "not found", "n/a", "na", "none", "null"}:
        return "unknown"
    return cleaned


def has_real_email(value: str) -> bool:
    return "@" in value and " " not in value


def has_phone(value: str) -> bool:
    return bool(re.search(r"\d", value)) and value.lower() not in {"unknown", "not found"}


@dataclass
class WorklistItem:
    lead_id: int
    name: str
    source: str
    distance: str
    address: str
    email: str
    phone: str
    website: str
    naics: str
    note: str
    raw_line: str


def parse_worklist_item_line(line: str) -> Optional[WorklistItem]:
    """
    Supports:
      - [ ] 901. **NAME** | Source: ... | ... | Note: ...
      - [x] **608 - NAME** | Source: ... | Note: ...
    """
    original = line.rstrip("\n")

    m = re.match(r"^\s*-\s*\[[ xX]\]\s*(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$", original)
    if m:
        lead_id = int(m.group(1))
        name = m.group(2).strip()
        tail = m.group(3).strip()
        fields = parse_worklist_tail_fields(tail)
        return WorklistItem(
            lead_id=lead_id,
            name=name,
            source=normalize_missing_value(fields.get("source")),
            distance=normalize_missing_value(fields.get("distance (zip centroid)")),
            address=normalize_missing_value(fields.get("address")),
            email=normalize_missing_value(fields.get("email")),
            phone=normalize_missing_value(fields.get("phone")),
            website=normalize_missing_value(fields.get("website")),
            naics=normalize_missing_value(fields.get("naics")),
            note=normalize_missing_value(fields.get("note")),
            raw_line=original,
        )

    m = re.match(r"^\s*-\s*\[[ xX]\]\s*\*+\s*(\d+)\s*[-.]\s*(.+?)\*+\s*(.*)$", original)
    if m:
        lead_id = int(m.group(1))
        name = m.group(2).strip()
        tail = m.group(3).strip()
        fields = parse_worklist_tail_fields(tail)
        return WorklistItem(
            lead_id=lead_id,
            name=name,
            source=normalize_missing_value(fields.get("source")),
            distance=normalize_missing_value(fields.get("distance (zip centroid)")),
            address=normalize_missing_value(fields.get("address")),
            email=normalize_missing_value(fields.get("email")),
            phone=normalize_missing_value(fields.get("phone")),
            website=normalize_missing_value(fields.get("website")),
            naics=normalize_missing_value(fields.get("naics")),
            note=normalize_missing_value(fields.get("note")),
            raw_line=original,
        )

    return None


def parse_worklist_tail_fields(tail: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    if not tail:
        return fields
    parts = [part.strip() for part in tail.split("|")]
    for part in parts:
        if not part:
            continue
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        fields[key.strip().lower()] = value.strip()
    return fields


def should_disqualify_from_worklist_note(note: str) -> bool:
    lowered = note.lower()
    if "skipped" in lowered:
        return True
    if "disqual" in lowered:
        return True
    if "same as" in lowered:
        return True
    if "duplicate" in lowered:
        return True
    return False


def find_existing_profile_path(lead_id: int) -> Optional[Path]:
    rng = range_dir_for_id(lead_id)
    for base in [PROFILES_ROOT / rng, DISQUALIFIED_ROOT / rng]:
        if not base.exists():
            continue
        for entry in base.glob(f"{lead_id}-*/profile.md"):
            if not is_import_profile(entry):
                return entry
        # Some legacy dirs can be weird; try "endswith" id.
        for entry in base.glob("*/profile.md"):
            if entry.parent.name.startswith(f"{lead_id}-"):
                if not is_import_profile(entry):
                    return entry
    return None


def find_import_profile_path(lead_id: int) -> Optional[Path]:
    rng = range_dir_for_id(lead_id)
    for base in [PROFILES_ROOT / rng, DISQUALIFIED_ROOT / rng]:
        if not base.exists():
            continue
        for entry in base.glob(f"{lead_id}-*/profile.md"):
            if is_import_profile(entry):
                return entry
        for entry in base.glob("*/profile.md"):
            if entry.parent.name.startswith(f"{lead_id}-") and is_import_profile(entry):
                return entry
    return None


def is_import_profile(profile_md: Path) -> bool:
    try:
        text = profile_md.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return bool(re.search(r"^Source:\s*import\b", text, re.IGNORECASE | re.MULTILINE))


def rewrite_profile_source_from_worklist(profile_md: Path, new_source: str, apply: bool) -> bool:
    text = profile_md.read_text(encoding="utf-8", errors="ignore")
    if not re.search(r"^Source:\s*import\b", text, re.IGNORECASE | re.MULTILINE):
        return False
    if not new_source or new_source.lower() in {"unknown", "not found"}:
        new_source = "unknown"

    lines = text.splitlines()
    out: list[str] = []
    replaced = False
    for line in lines:
        if re.match(r"^\s*Source\s*:", line, re.IGNORECASE) and not replaced:
            out.append(f"Source: {new_source}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        # Insert after Batch line if possible, otherwise after title.
        inserted = False
        for i, line in enumerate(out):
            if re.match(r"^\s*Batch line\s*:", line, re.IGNORECASE):
                out.insert(i + 1, f"Source: {new_source}")
                inserted = True
                break
        if not inserted:
            for i, line in enumerate(out):
                if line.startswith("# "):
                    out.insert(i + 2, f"Source: {new_source}")
                    inserted = True
                    break
        replaced = inserted

    if replaced and apply:
        profile_md.write_text("\n".join(out) + "\n", encoding="utf-8")
    return replaced


def rewrite_profile_batch_fields(profile_md: Path, expected_batch: str, expected_lead_id: int, apply: bool) -> bool:
    """
    Ensure `Batch:` and `Batch line:` exist and match the worklist.
    This is intentionally lightweight to avoid reformatting older profiles.
    """
    text = profile_md.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    def is_label(line: str, label: str) -> bool:
        return bool(re.match(rf"^\s*{re.escape(label)}\s*:", line, re.IGNORECASE))

    changed = False
    has_batch = any(is_label(line, "Batch") for line in lines)
    has_batch_line = any(is_label(line, "Batch line") for line in lines)

    out: list[str] = []
    for line in lines:
        if is_label(line, "Batch"):
            new_line = f"Batch: {expected_batch}"
            if line.strip() != new_line:
                changed = True
            out.append(new_line)
            continue
        if is_label(line, "Batch line"):
            new_line = f"Batch line: {expected_lead_id}"
            if line.strip() != new_line:
                changed = True
            out.append(new_line)
            continue
        out.append(line)

    if not has_batch or not has_batch_line:
        # Insert after title (first "# ...") for predictability.
        insert_at = 0
        for i, line in enumerate(out):
            if line.startswith("# "):
                insert_at = i + 1
                break
        insert_lines: list[str] = []
        if not has_batch:
            insert_lines.append(f"Batch: {expected_batch}")
        if not has_batch_line:
            insert_lines.append(f"Batch line: {expected_lead_id}")
        if insert_lines:
            changed = True
            out[insert_at:insert_at] = insert_lines + [""]

    if changed and apply:
        profile_md.write_text("\n".join(out) + "\n", encoding="utf-8")
    return changed


def ensure_dir(path: Path, apply: bool) -> None:
    if path.exists():
        return
    if not apply:
        return
    path.mkdir(parents=True, exist_ok=True)


def write_text(path: Path, text: str, apply: bool) -> None:
    if not apply:
        return
    path.write_text(text, encoding="utf-8")


def create_stub_profile(
    item: WorklistItem,
    batch_slug: str,
    disqualified: bool,
    apply: bool,
) -> Path:
    lead_id = item.lead_id
    rng = range_dir_for_id(lead_id)
    slug = slugify(item.name)
    base = DISQUALIFIED_ROOT if disqualified else PROFILES_ROOT
    lead_dir = base / rng / f"{lead_id}-{slug}"
    profile_md = lead_dir / "profile.md"

    ensure_dir(lead_dir, apply=apply)

    email = item.email
    phone = item.phone
    website = item.website

    contact_path = "unknown"
    if has_real_email(email):
        contact_path = "email"
    elif has_phone(phone):
        contact_path = "phone-only"

    contact_search = "not started"
    if has_real_email(email) or has_phone(phone):
        contact_search = f"checked {TODAY}"

    status = "disqualified" if disqualified else "new"
    outreach_status = "uncontacted"

    note_bits = []
    if item.note.lower() not in {"unknown", "not found"}:
        note_bits.append(item.note)
    if disqualified and ("same as" in item.note.lower() or "duplicate" in item.note.lower()):
        note_bits.append("Duplicate entity in worklist; avoid double outreach.")
    notes_text = "\n".join(f"- {bit}" for bit in note_bits) if note_bits else "- Pending research."

    text = "\n".join(
        [
            f"# {item.name}",
            "",
            f"Status: {status}",
            f"Outreach status: {outreach_status}",
            f"Contact path: {contact_path}",
            "Social check: not started",
            f"Batch: {batch_slug}",
            f"Batch line: {lead_id}",
            f"Source: {item.source}",
            f"Address: {item.address}",
            f"Phone: {phone}",
            f"Email: {email}",
            f"Website: {website}",
            "Contact form: unknown",
            "Social media: unknown",
            f"NAICS: {item.naics}",
            f"Distance (zip centroid): {item.distance}",
            "Decision maker: unknown",
            f"Last updated: {TODAY}",
            f"Contact search: {contact_search}",
            "",
            "## Snapshot",
            "- Pending research.",
            "",
            "## Notes",
            notes_text,
            "",
        ]
    )

    if profile_md.exists():
        return profile_md

    write_text(profile_md, text, apply=apply)
    return profile_md


def update_worklist_line_with_profile(
    worklist_path: Path,
    lead_id: int,
    profile_rel: str,
    apply: bool,
) -> bool:
    lines = worklist_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    updated = False

    for i, line in enumerate(lines):
        item = parse_worklist_item_line(line)
        if not item or item.lead_id != lead_id:
            continue

        new_line = line
        # Ensure the checkbox is checked to reflect that a profile exists.
        new_line = re.sub(r"^(\s*-\s*)\[[ xX]\]", r"\1[x]", new_line)

        if "| Note:" in new_line:
            if "profile (" not in new_line:
                new_line = new_line + f"; profile ({profile_rel})"
        else:
            new_line = new_line + f" | Note: profile ({profile_rel})"

        if new_line != line:
            lines[i] = new_line
            updated = True
        break

    if updated and apply:
        worklist_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return updated


def parse_missing_by_batch(view_path: Path) -> dict[str, list[int]]:
    text = view_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    current: Optional[str] = None
    missing: dict[str, list[int]] = {}
    for line in text:
        m = SECTION_RE.match(line.strip())
        if m:
            current = m.group(1)
            missing.setdefault(current, [])
            continue
        if not current:
            continue
        m = MISSING_IDS_RE.match(line.strip())
        if not m:
            continue
        ids = []
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            if not part.isdigit():
                continue
            ids.append(int(part))
        missing[current].extend(ids)
    return {k: sorted(set(v)) for k, v in missing.items() if v}


def parse_missing_by_worklists(
    *,
    min_id: Optional[int] = None,
    max_id: Optional[int] = None,
) -> dict[str, list[int]]:
    """
    Build missing-ID inventory directly from worklists by checking whether a
    non-import profile exists for each lead ID. This is deterministic and does
    not depend on pre-generated view files.
    """
    missing: dict[str, list[int]] = {}

    for worklist_path in sorted(BATCHES_DIR.glob("registered-entities-batch-*-worklist.md")):
        ids: set[int] = set()
        for line in worklist_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            item = parse_worklist_item_line(line)
            if not item:
                continue
            lead_id = item.lead_id
            if min_id is not None and lead_id < min_id:
                continue
            if max_id is not None and lead_id > max_id:
                continue
            if find_existing_profile_path(lead_id):
                continue
            ids.add(lead_id)

        if ids:
            missing[worklist_path.name] = sorted(ids)

    return missing


def filter_missing_by_id_range(
    missing: dict[str, list[int]],
    *,
    min_id: Optional[int] = None,
    max_id: Optional[int] = None,
) -> dict[str, list[int]]:
    if min_id is None and max_id is None:
        return missing

    filtered: dict[str, list[int]] = {}
    for batch_name, ids in missing.items():
        kept = []
        for lead_id in ids:
            if min_id is not None and lead_id < min_id:
                continue
            if max_id is not None and lead_id > max_id:
                continue
            kept.append(lead_id)
        if kept:
            filtered[batch_name] = sorted(set(kept))
    return filtered


def derive_batch_slug_from_worklist_filename(filename: str) -> str:
    # registered-entities-batch-010-worklist.md -> registered-entities-batch-010
    return filename.replace("-worklist.md", "")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--view",
        default=str(LEADS_ROOT / "views" / "missing-profiles-by-batch.md"),
        help="Path to missing-profiles-by-batch.md",
    )
    parser.add_argument(
        "--from-worklists",
        action="store_true",
        help="Derive missing IDs directly from worklists instead of a view file.",
    )
    parser.add_argument("--min-id", type=int, default=None, help="Minimum lead ID (inclusive)")
    parser.add_argument("--max-id", type=int, default=None, help="Maximum lead ID (inclusive)")
    parser.add_argument("--apply", action="store_true", help="Write changes")
    args = parser.parse_args()

    if args.min_id is not None and args.max_id is not None and args.min_id > args.max_id:
        raise SystemExit("--min-id cannot be greater than --max-id")

    if args.from_worklists:
        missing = parse_missing_by_worklists(min_id=args.min_id, max_id=args.max_id)
    else:
        view_path = Path(args.view)
        if not view_path.exists():
            raise SystemExit(f"View not found: {view_path}")
        missing = parse_missing_by_batch(view_path)
        missing = filter_missing_by_id_range(missing, min_id=args.min_id, max_id=args.max_id)

    if not missing:
        print("No missing IDs found for the selected input/range.")
        return

    created = 0
    fixed_existing = 0
    updated_worklists = 0
    skipped_existing = 0
    unresolved = 0

    per_batch_created: dict[str, int] = defaultdict(int)
    per_batch_fixed_existing: dict[str, int] = defaultdict(int)
    per_batch_updated_worklists: dict[str, int] = defaultdict(int)
    per_batch_skipped_existing: dict[str, int] = defaultdict(int)
    unresolved_ids_by_batch: dict[str, list[int]] = defaultdict(list)

    for worklist_filename, ids in sorted(missing.items()):
        worklist_path = BATCHES_DIR / worklist_filename
        if not worklist_path.exists():
            print(f"Worklist missing on disk (skipping): {worklist_path}")
            unresolved += len(ids)
            unresolved_ids_by_batch[worklist_filename].extend(sorted(ids))
            continue

        worklist_lines = worklist_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        items_by_id: dict[int, WorklistItem] = {}
        for line in worklist_lines:
            item = parse_worklist_item_line(line)
            if not item:
                continue
            items_by_id[item.lead_id] = item

        batch_slug = derive_batch_slug_from_worklist_filename(worklist_filename)

        for lead_id in ids:
            existing = find_existing_profile_path(lead_id)
            if existing:
                if rewrite_profile_batch_fields(existing, batch_slug, lead_id, apply=args.apply):
                    fixed_existing += 1
                    per_batch_fixed_existing[worklist_filename] += 1
                # Always add the profile path note to the worklist to reduce ambiguity.
                profile_rel = existing.relative_to(REPO_ROOT).as_posix()
                if update_worklist_line_with_profile(
                    worklist_path=worklist_path,
                    lead_id=lead_id,
                    profile_rel=profile_rel,
                    apply=args.apply,
                ):
                    updated_worklists += 1
                    per_batch_updated_worklists[worklist_filename] += 1
                continue

            import_existing = find_import_profile_path(lead_id)

            item = items_by_id.get(lead_id)
            if not item:
                print(f"Could not find worklist line for {lead_id} in {worklist_filename}")
                unresolved += 1
                unresolved_ids_by_batch[worklist_filename].append(lead_id)
                continue

            # If the only matching folder is a legacy `Source: import` record, fix it in-place
            # so the registered-entities dataset has proper coverage without introducing a 2nd
            # directory that collides on the numeric LeadID.
            if import_existing:
                did_change = False
                if rewrite_profile_source_from_worklist(import_existing, item.source, apply=args.apply):
                    did_change = True
                if rewrite_profile_batch_fields(import_existing, batch_slug, lead_id, apply=args.apply):
                    did_change = True
                if did_change:
                    profile_rel = import_existing.relative_to(REPO_ROOT).as_posix()
                    if update_worklist_line_with_profile(
                        worklist_path=worklist_path,
                        lead_id=lead_id,
                        profile_rel=profile_rel,
                        apply=args.apply,
                    ):
                        updated_worklists += 1
                        per_batch_updated_worklists[worklist_filename] += 1
                    fixed_existing += 1
                    per_batch_fixed_existing[worklist_filename] += 1
                else:
                    skipped_existing += 1
                    per_batch_skipped_existing[worklist_filename] += 1
                continue

            disqualified = should_disqualify_from_worklist_note(item.note)
            profile_md = create_stub_profile(
                item=item,
                batch_slug=batch_slug,
                disqualified=disqualified,
                apply=args.apply,
            )
            created += 1
            per_batch_created[worklist_filename] += 1

            profile_rel = profile_md.relative_to(REPO_ROOT).as_posix()
            if update_worklist_line_with_profile(
                worklist_path=worklist_path,
                lead_id=lead_id,
                profile_rel=profile_rel,
                apply=args.apply,
            ):
                updated_worklists += 1
                per_batch_updated_worklists[worklist_filename] += 1

    print(f"apply: {args.apply}")
    print(f"from_worklists: {args.from_worklists}")
    print(f"min_id: {args.min_id}")
    print(f"max_id: {args.max_id}")
    print(f"created_profiles: {created}")
    print(f"fixed_existing: {fixed_existing}")
    print(f"worklist_lines_updated: {updated_worklists}")
    print(f"skipped_existing: {skipped_existing}")
    print(f"unresolved: {unresolved}")

    print("per_batch_created:")
    if per_batch_created:
        for batch_name in sorted(per_batch_created):
            print(f"  {batch_name}: {per_batch_created[batch_name]}")
    else:
        print("  (none)")

    print("per_batch_fixed_existing:")
    if per_batch_fixed_existing:
        for batch_name in sorted(per_batch_fixed_existing):
            print(f"  {batch_name}: {per_batch_fixed_existing[batch_name]}")
    else:
        print("  (none)")

    print("per_batch_worklist_updates:")
    if per_batch_updated_worklists:
        for batch_name in sorted(per_batch_updated_worklists):
            print(f"  {batch_name}: {per_batch_updated_worklists[batch_name]}")
    else:
        print("  (none)")

    print("per_batch_skipped_existing:")
    if per_batch_skipped_existing:
        for batch_name in sorted(per_batch_skipped_existing):
            print(f"  {batch_name}: {per_batch_skipped_existing[batch_name]}")
    else:
        print("  (none)")

    print("unresolved_ids_by_batch:")
    if unresolved_ids_by_batch:
        for batch_name in sorted(unresolved_ids_by_batch):
            ids = sorted(set(unresolved_ids_by_batch[batch_name]))
            csv_ids = ",".join(str(lead_id) for lead_id in ids)
            print(f"  {batch_name}: {csv_ids}")
    else:
        print("  (none)")


if __name__ == "__main__":
    main()
