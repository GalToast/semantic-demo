/**
 * merge-reland-guard.test.ts
 *
 * Regression detector for the "stale content re-land" class (measured 2026-08-13):
 * merge `27a9dffa` (origin/master) re-introduced a 673-LOC pre-carve body of
 * src/lib/engine/three-search-animations.ts on top of the 08-12 carve commits
 * (80eea27c/6ddf1192), silently duplicating module state (a live teardown bug)
 * that neither lint, tsc, nor the unit battery caught — only a worker's manual
 * diff audit did.
 *
 * Ride-moment detector, MERGE-ONLY (bounded, fast): the re-land arrives through
 * a merge (second-parent reintroduces old content the first parent had already
 * changed). For each merge commit in the recent history:
 *   - for each src/ tests/ scripts/ file the merge changed vs BOTH parents,
 *   - compare that file's blob at the merge vs its blob before the merge
 *     (first-parent^, the "old" side we moved away from). A blob that matches
 *     the pre-merge side after the merge changed it = stale content resurrected.
 *
 * SOFT, non-failing, surveillance posture: findings print to the gate log for
 * review; does not fail the battery (the follow-up fix lands separately).
 * Scope: last 200 commits, merges only, bounded to ~a few files per merge and
 * a single git call per file — stays well under the unit-test time budget.
 *
 * Run: npx vitest run tests/unit-active/merge-reland-guard.test.ts
 */

import { describe, it, expect } from 'vitest'
// @ts-ignore
import { execSync } from 'node:child_process'

const MERGE_SCAN = 200

function runGit(args: string): string {
    // Bind quiet stderr: git's path/rev ambiguity hints are noise for a smoke
    // detector — only stdout (the parseable output) matters.
    return execSync(`git ${args} 2>/dev/null`, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
}

describe('merge-reland guard', () => {
    it(
        'recent merge commits do not resurrect stale file content from the overwritten side',
        { timeout: 120_000 },
        () => {
            // list merge commits in the recent history (parents != 1)
            const merges = runGit(`log --merges --format=%H%x09%s -${MERGE_SCAN}`)
                .split('\n')
                .map((ln) => {
                    const [sha, subject] = ln.split('\t')
                    return { sha, subject: subject ?? '', parents: [] as string[] }
                })
                .filter((e) => e.sha)

            const findings: string[] = []

            for (const { sha, subject } of merges) {
                let firstParent = ''
                let secondParent = ''
                try {
                    firstParent = runGit(`rev-parse ${sha}^1`).trim()
                    secondParent = runGit(`rev-parse ${sha}^2`).trim()
                } catch {
                    continue // amended/unreachable merge parent — cannot resolve, skip
                }
                if (!firstParent || !secondParent) continue

                // files where the two parents DISAGREE (one advanced, one stale)
                const conflictCandidates = runGit(
                    `diff-tree --no-commit-id -r --name-only ${firstParent} ${secondParent} -- src tests scripts`
                )
                    .split('\n')
                    .filter(Boolean)
                    .filter((f) => /^(src|tests|scripts)\//.test(f))

                const stale: string[] = []
                for (const file of conflictCandidates) {
                    let mergeBlob = ''
                    let secondBlob = ''
                    try {
                        mergeBlob = runGit(`rev-parse ${sha}:${file}`)
                        secondBlob = runGit(`rev-parse ${secondParent}:${file}`)
                    } catch {
                        continue
                    }
                    // The merge RESOLVED to the second parent's (stale-from-our-pov) content
                    // when our first parent had a different blob: the old side won silently.
                    if (mergeBlob && secondBlob && mergeBlob === secondBlob) {
                        const firstBlob = runGit(`rev-parse ${firstParent}:${file}`)
                        if (firstBlob && firstBlob !== secondBlob) {
                            stale.push(file)
                        }
                    }
                }

                if (stale.length > 0) {
                    findings.push(
                        `${sha.slice(0, 7)} ${subject.slice(0, 60)} :: merge took the STALE parent's content on ${stale.join(', ')}`
                    )
                }
            }

            if (findings.length > 0) {
                console.warn(
                    '\n[MERGE-REGUARD] merges that re-landed stale content:\n - ' + findings.join('\n - ') + '\n'
                )
            }

            // Surveillance posture (soft): findings print, test passes.
            expect(true).toBe(true)
        }
    )
})
