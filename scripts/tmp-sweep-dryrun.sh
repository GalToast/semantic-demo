#!/usr/bin/env bash
# tmp-sweep-dryrun.sh — list what a tmp/ TTL purge WOULD delete (dry-run only).
# Usage: bash scripts/tmp-sweep-dryrun.sh [age-days]
# Default age: 14 days. NEVER deletes anything — prints candidate list + stats.
set -u

AGE="${1:-14}"
REPO=/c/Users/HP/repos/semantic-explorer
cd "$REPO" || exit 2

# 1. Protected set: files referenced by live code/docs (tmp/X paths that exist).
#    Node prints the list to STDOUT — avoids the Git-Bash /tmp vs Node C:/tmp
#    path mismatch (observed: Node wrote to C:/tmp, bash read /tmp).
node --input-type=module -e "
import fs from 'node:fs'
import path from 'node:path'
const refs = new Set()
const walk = (p) => { let e; try { e = fs.readdirSync(p, {withFileTypes:true}) } catch { return }
  for (const f of e) { const fp = path.join(p, f.name)
    if (f.isDirectory()) { if (!['node_modules','.svelte-kit','dist'].includes(f.name)) walk(fp) }
    else if (/\.(ts|svelte|js|mjs|md|json)$/.test(fp)) { try { const t = fs.readFileSync(fp,'utf8')
      for (const m of t.matchAll(/tmp\/[A-Za-z0-9._\/-]+/g)) refs.add(m[0]) } catch {} } } }
for (const d of ['src','scripts','docs']) walk(d)
for (const r of refs) { try { if (fs.statSync(r).isFile()) console.log(r) } catch {} }
" >/tmp/protected-tmp-refs.txt
# 2. Git-tracked tmp files (pre-ignore evidence-bank).
git ls-files tmp/ >/tmp/tracked-tmp.txt

# 3. Candidate scan: old files, excluding protected + tracked. Single find pass.
echo "=== TMP PURGE DRY-RUN (age > ${AGE}d, protects live-refs + git-tracked) ==="
find tmp -type f -mtime +"${AGE}" -printf '%s %p\n' 2>/dev/null |
	while read -r sz f; do
		grep -qxF "$f" /tmp/protected-tmp-refs.txt 2>/dev/null && continue
		grep -qxF "$f" /tmp/tracked-tmp.txt 2>/dev/null && continue
		echo "$sz $f"
	done | sort -rn >/tmp/tmp-candidates-size.txt

cands=$(wc -l </tmp/tmp-candidates-size.txt)
sz=$(awk '{s+=$1} END{print s+0}' /tmp/tmp-candidates-size.txt)
echo "Candidates: $cands files, $((sz / 1048576)) MB"
echo "--- top 25 largest candidates ---"
head -25 /tmp/tmp-candidates-size.txt | awk '{printf "%8.0fKB  %s\n", $1/1024, substr($0,index($0,$2))}'
echo "--- by extension ---"
cut -d' ' -f2- /tmp/tmp-candidates-size.txt | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -8
echo
echo "Protected: $(wc -l </tmp/protected-tmp-refs.txt) live-ref files | Tracked: $(wc -l </tmp/tracked-tmp.txt)"
# Keep raw candidate paths for potential reuse.
cut -d' ' -f2- /tmp/tmp-candidates-size.txt >/tmp/tmp-candidates.txt
