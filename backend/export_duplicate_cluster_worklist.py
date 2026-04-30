from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"


def main() -> None:
    parser = argparse.ArgumentParser(description="Export actionable duplicate entity clusters for review.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument("--limit", type=int, default=100, help="Maximum clusters to export")
    parser.add_argument(
        "--csv",
        default=str(REPO_ROOT / "tmp" / f"leadops-duplicate-cluster-worklist-{datetime.now().strftime('%Y-%m-%d')}.csv"),
        help="CSV output path",
    )
    parser.add_argument(
        "--md",
        default=str(REPO_ROOT / "reports" / f"leadops-duplicate-cluster-worklist-{datetime.now().strftime('%Y-%m-%d')}.md"),
        help="Markdown output path",
    )
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    csv_path = Path(args.csv).resolve()
    md_path = Path(args.md).resolve()

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    clusters = [dict(row) for row in con.execute(
        """
        SELECT
            cluster_id,
            cluster_basis,
            cluster_key,
            canonical_lead_id,
            canonical_lead_name,
            member_count,
            resolved_noncanonical_members,
            unresolved_noncanonical_members,
            member_lead_ids_json,
            member_names_json,
            priority_score
        FROM leadops_v_duplicate_entity_clusters_actionable
        ORDER BY priority_score DESC, member_count DESC, cluster_basis ASC, cluster_key ASC
        LIMIT ?
        """,
        (args.limit,),
    ).fetchall()]

    rows: list[dict[str, object]] = []
    for cluster in clusters:
        member_ids = json.loads(cluster["member_lead_ids_json"])
        member_names = json.loads(cluster["member_names_json"])
        for lead_id, member_name in zip(member_ids, member_names):
            lead_row = con.execute(
                """
                SELECT
                    lead_id,
                    name,
                    status,
                    outreach_status,
                    email,
                    website,
                    updated,
                    profile_path
                FROM leadops_leads
                WHERE lead_id = ?
                """,
                (lead_id,),
            ).fetchone()
            review_row = con.execute(
                """
                SELECT decision, reason
                FROM leadops_v_latest_review_decision
                WHERE lead_id = ?
                """,
                (lead_id,),
            ).fetchone()
            is_canonical = 1 if lead_id == cluster["canonical_lead_id"] else 0
            latest_review_decision = review_row["decision"] if review_row else ""
            latest_review_reason = review_row["reason"] if review_row else ""
            is_resolved_duplicate = (
                0
                if is_canonical
                else 1
                if latest_review_decision in {
                    "hold_duplicate_cluster",
                    "already_contacted",
                    "keep_held",
                    "exclude_cluster",
                }
                else 0
            )
            rows.append(
                {
                    "cluster_id": cluster["cluster_id"],
                    "cluster_basis": cluster["cluster_basis"],
                    "cluster_key": cluster["cluster_key"],
                    "priority_score": cluster["priority_score"],
                    "member_count": cluster["member_count"],
                    "resolved_noncanonical_members": cluster["resolved_noncanonical_members"],
                    "unresolved_noncanonical_members": cluster["unresolved_noncanonical_members"],
                    "canonical_lead_id": cluster["canonical_lead_id"],
                    "canonical_lead_name": cluster["canonical_lead_name"],
                    "lead_id": lead_row["lead_id"] if lead_row else lead_id,
                    "name": lead_row["name"] if lead_row else member_name,
                    "status": lead_row["status"] if lead_row else "",
                    "outreach_status": lead_row["outreach_status"] if lead_row else "",
                    "email": lead_row["email"] if lead_row else "",
                    "website": lead_row["website"] if lead_row else "",
                    "updated": lead_row["updated"] if lead_row else "",
                    "profile_path": lead_row["profile_path"] if lead_row else "",
                    "latest_review_decision": latest_review_decision,
                    "latest_review_reason": latest_review_reason,
                    "is_canonical": is_canonical,
                    "is_resolved_duplicate": is_resolved_duplicate,
                }
            )
    con.close()

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "cluster_id",
                "cluster_basis",
                "cluster_key",
                "priority_score",
                "member_count",
                "resolved_noncanonical_members",
                "unresolved_noncanonical_members",
                "canonical_lead_id",
                "canonical_lead_name",
                "lead_id",
                "name",
                "status",
                "outreach_status",
                "email",
                "website",
                "updated",
                "profile_path",
                "latest_review_decision",
                "latest_review_reason",
                "is_canonical",
                "is_resolved_duplicate",
            ],
        )
        writer.writeheader()
        writer.writerows([row for row in rows if not row["is_resolved_duplicate"]])

    lines = [
        "# LeadOps Duplicate Cluster Worklist",
        "",
        f"- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- Database: `{db_path}`",
        f"- Clusters: {len(clusters)}",
        f"- Rows: {len(rows)}",
        "",
    ]

    for cluster in clusters:
        lines.append(
            f"## Cluster `{cluster['cluster_id']}` | `{cluster['cluster_basis']}` | "
            f"`{cluster['cluster_key']}` | members: {cluster['member_count']}"
        )
        lines.append("")
        lines.append(
            f"- Canonical: `{cluster['canonical_lead_id']}` {cluster['canonical_lead_name']} "
            f"(priority `{cluster['priority_score']}`)"
        )
        lines.append(
            f"- Unresolved non-canonical members: `{cluster['unresolved_noncanonical_members']}` "
            f"| Resolved non-canonical members: `{cluster['resolved_noncanonical_members']}`"
        )
        for row in rows:
            if row["cluster_id"] != cluster["cluster_id"] or row["is_resolved_duplicate"]:
                continue
            prefix = "*" if row["is_canonical"] else "-"
            lines.append(
                f"{prefix} `{row['lead_id']}` {row['name']} | `{row['status']}` / `{row['outreach_status']}` | "
                f"`{row['email']}` | `{row['website']}`"
            )
            if row["latest_review_decision"]:
                lines.append(
                    f"  latest review: `{row['latest_review_decision']}`"
                    + (f" | {row['latest_review_reason']}" if row["latest_review_reason"] else "")
                )
        lines.append("")

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"CSV={csv_path}")
    print(f"MD={md_path}")
    print(f"CLUSTERS={len(clusters)}")
    print(f"ROWS={len([row for row in rows if not row['is_resolved_duplicate']])}")


if __name__ == "__main__":
    main()
