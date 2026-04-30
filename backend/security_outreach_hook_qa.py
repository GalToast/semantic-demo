#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class ClaimFamily:
    key: str
    patterns: tuple[str, ...]


CLAIM_FAMILIES: tuple[ClaimFamily, ...] = (
    ClaimFamily("hsts", ("strict-transport-security", "strict transport security", "hsts", "force https")),
    ClaimFamily("csp", ("content-security-policy", "content security policy", "csp", "script injection")),
    ClaimFamily("x_frame_options", ("x-frame-options", "clickjacking", "frame embedding", "iframe")),
    ClaimFamily("x_content_type_options", ("x-content-type-options", "mime sniffing", "mime-sniff", "mime sniff")),
    ClaimFamily("referrer_policy", ("referrer-policy", "referrer policy", "referrer leakage")),
    ClaimFamily("permissions_policy", ("permissions-policy", "permissions policy", "browser features")),
    ClaimFamily("spf", ("spf", "sender policy framework", "email spoofing")),
    ClaimFamily("dmarc", ("dmarc", "email authentication")),
    ClaimFamily("mixed_content", ("mixed content", "http resource", "insecure asset")),
    ClaimFamily("tls_certificate", ("certificate", "ssl", "tls", "hostname mismatch", "self-signed", "cert expires", "certificate expires")),
    ClaimFamily("csrf", ("csrf", "cross-site request forgery")),
    ClaimFamily("cookies", ("cookie", "session", "httponly", "samesite", "secure flag")),
    ClaimFamily("admin_login", ("wp-login", "admin login", "login endpoint", "admin surface")),
    ClaimFamily("payment", ("payment flow", "checkout", "credit card", "stripe", "square", "paypal")),
    ClaimFamily("robots_or_sitemap", ("robots.txt", "sitemap")),
    ClaimFamily("console_noise", ("console error", "runtime error", "failed to load resource", "404")),
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="QA a security-outreach draft against the lead's latest securityOutreach hook."
    )
    parser.add_argument("--lead-id", help="Lead ID. If omitted, infer from draft filename.")
    parser.add_argument("--draft-file", help="Path to draft file to QA.")
    parser.add_argument("--draft-text", help="Raw draft text to QA instead of reading a file.")
    parser.add_argument("--audit-json", help="Optional explicit audit JSON path.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    return parser


def infer_lead_id_from_path(path: Path | None) -> str | None:
    if not path:
        return None
    match = re.match(r"^(\d+)-", path.name)
    return match.group(1) if match else None


def load_draft_text(args: argparse.Namespace) -> tuple[str, Path | None]:
    if args.draft_text:
        return args.draft_text, None
    if not args.draft_file:
        raise SystemExit("Provide --draft-file or --draft-text.")
    draft_path = Path(args.draft_file)
    if not draft_path.is_absolute():
        draft_path = REPO_ROOT / draft_path
    if not draft_path.exists():
        raise SystemExit(f"Draft file not found: {draft_path}")
    return draft_path.read_text(encoding="utf-8", errors="ignore"), draft_path


def candidate_audit_paths(lead_id: str) -> Iterable[Path]:
    yield from REPO_ROOT.glob(f"audit-{lead_id}.json")
    yield from REPO_ROOT.glob(f"ops/audit-review-batch-*/**/audit-{lead_id}.json")
    yield from REPO_ROOT.glob(f"ops/audit-review-*/**/audit-{lead_id}.json")
    yield from REPO_ROOT.glob(f"leads/profiles/**/evidence/audit-{lead_id}.json")


def resolve_audit_json(lead_id: str, explicit_path: str | None) -> Path:
    if explicit_path:
        path = Path(explicit_path)
        if not path.is_absolute():
            path = REPO_ROOT / path
        if not path.exists():
            raise SystemExit(f"Audit JSON not found: {path}")
        return path

    matches = [path for path in candidate_audit_paths(lead_id) if path.exists()]
    if not matches:
        raise SystemExit(f"Could not locate audit JSON for lead {lead_id}.")
    return max(matches, key=lambda path: path.stat().st_mtime_ns)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def classify_claim_families(text: str) -> set[str]:
    lowered = text.lower()
    found: set[str] = set()
    for family in CLAIM_FAMILIES:
        if any(pattern in lowered for pattern in family.patterns):
            found.add(family.key)
    return found


def family_labels(keys: Iterable[str]) -> list[str]:
    known = {family.key: family.key for family in CLAIM_FAMILIES}
    return [known[key] for key in sorted(set(keys)) if key in known]


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    draft_text, draft_path = load_draft_text(args)
    lead_id = args.lead_id or infer_lead_id_from_path(draft_path)
    if not lead_id:
        raise SystemExit("Could not determine lead ID. Pass --lead-id explicitly.")

    audit_path = resolve_audit_json(lead_id, args.audit_json)
    payload = load_json(audit_path)

    outreach = payload.get("securityOutreach") or {}
    primary_hook = outreach.get("primaryHook")
    verified_hooks = list(outreach.get("verifiedHooks") or [])
    probable_hooks = list(outreach.get("probableHooks") or [])

    supported_families = set()
    for message in [primary_hook, *verified_hooks, *probable_hooks]:
        if message:
            supported_families.update(classify_claim_families(message))

    primary_families = classify_claim_families(primary_hook or "")
    draft_families = classify_claim_families(draft_text)

    unsupported_families = draft_families - supported_families
    missing_primary = bool(primary_hook) and bool(primary_families) and primary_families.isdisjoint(draft_families)
    mentions_security_claim = bool(draft_families)
    issues: list[str] = []
    status = "pass"

    if not mentions_security_claim:
        status = "warn"
        issues.append("Draft does not appear to mention any recognizable security claim.")

    if missing_primary:
        status = "fail"
        issues.append("Draft does not mention the current primary security hook.")

    if unsupported_families:
        status = "fail"
        issues.append(
            "Draft mentions unsupported security claim families: "
            + ", ".join(family_labels(unsupported_families))
        )

    supported_non_primary = draft_families & supported_families - primary_families
    if supported_non_primary and missing_primary:
        issues.append(
            "Draft leans on weaker supported claim families instead of the primary hook: "
            + ", ".join(family_labels(supported_non_primary))
        )
    elif supported_non_primary and status == "pass" and not (draft_families & primary_families):
        status = "warn"
        issues.append(
            "Draft mentions supported but non-primary security claim families: "
            + ", ".join(family_labels(supported_non_primary))
        )

    result = {
        "status": status,
        "leadId": str(lead_id),
        "auditJson": str(audit_path.relative_to(REPO_ROOT)),
        "draftFile": str(draft_path.relative_to(REPO_ROOT)) if draft_path else None,
        "primaryHook": primary_hook,
        "verifiedHooks": verified_hooks,
        "probableHooks": probable_hooks,
        "supportedFamilies": family_labels(supported_families),
        "primaryFamilies": family_labels(primary_families),
        "draftFamilies": family_labels(draft_families),
        "issues": issues,
    }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Lead: {lead_id}")
        print(f"Audit JSON: {result['auditJson']}")
        print(f"Primary hook: {primary_hook or 'None'}")
        print(f"Status: {status.upper()}")
        print(f"Supported claim families: {', '.join(result['supportedFamilies']) or 'none'}")
        print(f"Draft claim families: {', '.join(result['draftFamilies']) or 'none'}")
        if issues:
            print("Issues:")
            for issue in issues:
                print(f"- {issue}")
        else:
            print("Issues: none")

    return 0 if status == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
