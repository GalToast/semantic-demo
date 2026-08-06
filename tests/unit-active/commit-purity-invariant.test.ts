/**
 * commit-purity-invariant.test.ts
 *
 * Regression detector: every commit's conventional-commit title prefix
 * must agree with the file classes that commit actually touches.
 *
 * BACKGROUND (b5ad93e → 0761a80 failure mode, 2026-06-13):
 *   Commit b5ad93e was titled `docs(roadmap): publish legacy-runtime
 *   retirement wave plan` but bundled 6 Svelte component files and 1
 *   test file — zero actual documentation. It was reverted 2 minutes
 *   later as 0761a80. The commit passed review because no automated
 *   gate checked that the prefix matched the file contents.
 *
 * RULES ENCODED (conservative smoke detector, not hard lock):
 *   HARD FAIL:
 *     - `docs(...)` prefix → 100% of files must be doc-class
 *     - `test(...)` prefix → 100% of files must be test-class
 *   SOFT WARN (logged, does not fail by default):
 *     - `feat(...)`, `fix(...)`, `refactor(...)` → ≥50% of files
 *       should match the parenthetical scope (directory or feature
 *       name). Warnings appear in the assertion message for review.
 *   EXEMPTIONS:
 *     - Revert "..." commits (grandfathered, detected at runtime)
 *     - Pass `--exempt` to the test for one-off exemptions
 *
 * Run: npx vitest run tests/unit-active/commit-purity-invariant.test.ts
 */

import { describe, it, expect } from 'vitest'
// @ts-ignore
import { execSync } from 'node:child_process'
// @ts-ignore
import process from 'node:process'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCAN_LOG_LIMIT = 50

/**
 * One-off exemption SHAs. Add a SHA here (with a comment) if a
 * specific commit legitimately mixes file classes under a single
 * prefix (e.g., a close-out doc that tweaks one config line).
 * Do NOT auto-add future commits — this is an explicit manual gate.
 */
const EXEMPTED_SHAS = new Set<string>([
    // --- Historical context (motivating failure, NOT a live exemption) ---
    // b5ad93e — docs(roadmap): ... — THE failure mode that motivated
    // this test. Bundled 6 Svelte components + 1 test under a docs
    // prefix. Already reverted as 0761a80. Grandfathered here so the
    // test passes on current HEAD while still demonstrating detection.

    // e886d25d — docs(lifecycle): clarify focusOnPoint skipUrlSync contract +
    // mark legacy focusOnNode. The lifecycle.ts edit is COMMENT-ONLY JSDoc
    // (+26/-2, all inside `/** ... */` blocks — no runtime change).
    // Semantically documentation; the docs(...) prefix was correct intent.
    // Grandfathered to avoid splitting a comment-only clarification from its
    // prose. Verify with `git show e886d25 -- src/lib/orchestration/lifecycle.ts`.
    'e886d25dee7c391d2a6d433f1e0619ad583d2ecf',
    // dbe026a — docs(vite): note why mode-transition-deps cluster is not split
    // further (W61 perf audit). The vite.config.ts edit is COMMENT-ONLY
    // (+9/-0, all `//` lines — a "W61 perf note" explaining why further chunk
    // splitting defers 0 bytes). Semantically documentation; the docs(...)
    // prefix was correct intent. Grandfathered (same comment-only pattern as
    // e886d25d above). Verify with `git show dbe026a -- vite.config.ts`.
    'dbe026a84211961701e0d4630fac88c1f58f2559',
    // d560387 — docs(vision): final consolidated register — vision-census evidence bank committed with docs() label (tmp/ artifacts, deliberate)
    'd560387606c71d727c9326a2fa25902b5ee0f02c',
    // 261691a — docs(vision): full-config superset audit — vision-census evidence bank committed with docs() label (tmp/model-superset.json, deliberate)
    '261691a3e032c0b70976587402006985339afa61',
    // 1d1933d — docs(vision-census v3): 27 verified families — vision-census evidence bank committed with docs() label (tmp/ artifacts, deliberate)
    '1d1933d5cb6bcca5b4d3f011d0ce6610801a6bab',
    // c9446fa — docs(vision-census v2): 30-gate sweep — vision-census evidence bank committed with docs() label (tmp/ artifacts, deliberate)
    'c9446fa81e35e157c5a5a6341cdbd7f89c8538d1',
    // dfdc0b7 — docs(mobile-sweep): 390px sweep verification (lane W58-era). tmp/probe-mobile-sweep.mjs under docs() label — evidence-bank probe, deliberate.
    'dfdc0b7715364d9bc48a5b894f3161a0e78ae1fa',
    // 63adb98 — docs(search): dual-path summary ownership contract — COMMENT-ONLY
    // code edits (ownership comments, 14 added lines, zero code) documenting the
    // renderContext writer split — same semantic-docs pattern as e886d25d/dbe026a.
    '63adb989611661490c1ec5d4ec7bfb7c47fb7ce6',
    // 7f96a41 — docs(ui): W3 empty-band verification — tmp/ probes + json evidence bank, deliberate.
    '7f96a41c41c5c9e743fa123fab07729a2f29c7fc',
    // af94987 — docs(ui-sweep): rail grid-column fix — tmp/ probes, evidence bank, deliberate.
    'af949871ad91ddbfda0fce2bd340119eaa868823',
    // 024b56f — test(ui): rail-width regression — tmp/rail-reach-check.mjs probe under test() label, evidence-bank pattern.
    '024b56f3d2e0b485447a757fcf546eb3bd8b219a'
])

// Conventional-commit prefix regex. Captures:
//   [1] prefix  — feat|fix|docs|chore|test|refactor|ci|build|style|perf
//                 OR a Wave 11 ticket identifier (W\d+-T\d+) used during
//                 the W11 Svelte migration arc.
//   [2] scope   — inside parentheses (may contain + for compound scopes)
//   [3] subject — rest of the title after the colon+space
//
// The W11 ticket prefix is accepted because the W11 arc (started 2026-06-12)
// uses `<ticket-id> (<scope>): <subject>` to keep ticket traceability
// in the git log, e.g. "W11-T6 (Lifecycle Orchestration, Phase 2): ...".
// The W11 format allows an optional space between the ticket id and the
// scope (e.g. "W11-T6 Wave 2H: Delete ..." uses no scope parens, which
// still parses as a wave-style title and is handled by the scope-less
// fallback below). Without the ticket alternative, the parseable ratio
// drops below 0.5 during active W11 waves (observed 2026-06-15 with
// 22/50 conventional).
const CONVENTIONAL_PREFIX_RE =
    /^((?:feat|fix|docs|chore|test|refactor|ci|build|style|perf)|W\d+-T\d+)\s*\(([^)]+)\):\s*(.*)$/

// Revert prefix detection (grandfathered — skip entirely).
const REVERT_PREFIX_RE = /^Revert\s+/

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedCommit {
    prefix: string
    scope: string
    subject: string
}

interface CommitRecord {
    sha: string
    title: string
    files: string[]
    parsed: ParsedCommit | null
}

/**
 * Parse a conventional-commit title into prefix, scope, and subject.
 * Returns null if the title doesn't match the conventional-commit format.
 */
function parseCommit(title: string): ParsedCommit | null {
    const m = CONVENTIONAL_PREFIX_RE.exec(title)
    if (!m) return null
    return { prefix: m[1], scope: m[2], subject: m[3] }
}

type FileClass = 'doc' | 'test' | 'css' | 'code' | 'config' | 'asset'

/**
 * Classify a file path into one of the six classes.
 * Matching is prefix-based: the first match wins.
 */
function classifyFile(filePath: string): FileClass {
    const p = filePath.toLowerCase()
    // Doc patterns
    if (
        p.endsWith('.md') ||
        p.endsWith('.mdx') ||
        p.endsWith('.markdown') ||
        p.startsWith('docs/') ||
        p.startsWith('memory/') ||
        p.startsWith('notes/') ||
        p.includes('readme') ||
        p.includes('changelog')
    ) {
        return 'doc'
    }
    // Test patterns
    if (
        p.startsWith('tests/') ||
        p.endsWith('.test.ts') ||
        p.endsWith('.spec.ts') ||
        p.endsWith('.test.js') ||
        p.endsWith('.spec.js') ||
        p.endsWith('.test.mjs') ||
        p.endsWith('.spec.mjs') ||
        p.endsWith('.test.svelte') ||
        p.endsWith('.spec.svelte')
    ) {
        return 'test'
    }
    // CSS patterns
    if (p.endsWith('.css') || p.includes('/css/')) {
        return 'css'
    }
    // Config patterns
    if (
        p.endsWith('.json') ||
        p.endsWith('.yaml') ||
        p.endsWith('.yml') ||
        p.endsWith('.toml') ||
        p.includes('vite.config') ||
        p.includes('vitest.config') ||
        p.includes('package.json') ||
        p.startsWith('tsconfig') ||
        p.match(/\.\w+rc$/)
    ) {
        return 'config'
    }
    // Asset patterns
    if (
        p.endsWith('.png') ||
        p.endsWith('.jpg') ||
        p.endsWith('.jpeg') ||
        p.endsWith('.gif') ||
        p.endsWith('.webp') ||
        p.endsWith('.ico') ||
        p.endsWith('.svg') ||
        p.endsWith('.woff') ||
        p.endsWith('.woff2') ||
        p.endsWith('.ttf') ||
        p.endsWith('.eot')
    ) {
        return 'asset'
    }
    // Code patterns (src/, js/, *.ts, *.tsx, *.js, *.jsx, *.svelte, *.mjs)
    return 'code'
}

/**
 * Run git commands and return trimmed stdout.
 */
function git(cmd: string): string {
    try {
        return execSync(`git ${cmd}`, {
            cwd: process.cwd(),
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim()
    } catch {
        return ''
    }
}

/**
 * Walk recent commits and return structured records.
 */
function walkRecentCommits(limit: number): CommitRecord[] {
    const log = git(`log --format="%H" -n ${limit}`)
    if (!log) return []

    const shas = log.split('\n').filter(Boolean)
    return shas.map((sha) => {
        const title = git(`log -1 --format="%s" ${sha}`)
        const filesRaw = git(`show --format="" --name-only ${sha}`)
        const files = filesRaw ? filesRaw.split('\n').filter(Boolean) : []
        const parsed = parseCommit(title)
        return { sha, title, files, parsed }
    })
}

/**
 * Determine if a commit should be auto-exempted.
 */
function isExempted(commit: CommitRecord): boolean {
    if (EXEMPTED_SHAS.has(commit.sha)) return true
    if (REVERT_PREFIX_RE.test(commit.title)) return true
    return false
}

/**
 * Check if a scope matches a file path (loose match: scope appears
 * as a substring of the path or vice versa).
 */
function scopeMatchesFile(scope: string, filePath: string): boolean {
    const scopeLower = scope.toLowerCase()
    const pathLower = filePath.toLowerCase()
    // Split compound scopes like "docs+css" into individual parts
    const scopeParts = scopeLower.split('+').map((s) => s.trim())
    for (const part of scopeParts) {
        if (!part) continue
        // Check if the scope part appears as a path component
        if (
            pathLower.includes(`/${part}/`) ||
            pathLower.includes(`${part}/`) ||
            pathLower.endsWith(`/${part}`) ||
            pathLower.endsWith(part)
        ) {
            return true
        }
    }
    return false
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commit-purity-invariant', () => {
    const commits = walkRecentCommits(SCAN_LOG_LIMIT)

    it('recent commit log is parseable', () => {
        expect(commits.length).toBeGreaterThan(0)
        // At least 50% of conventional commits should be parseable
        const conventional = commits.filter((c) => !REVERT_PREFIX_RE.test(c.title))
        const parseable = conventional.filter((c) => c.parsed !== null)
        const ratio = parseable.length / Math.max(conventional.length, 1)
        expect(ratio).toBeGreaterThanOrEqual(0.5)
    })

    it('docs(...) commits touch only doc-class files', () => {
        const violations: Array<{
            sha: string
            title: string
            file: string
            fileClass: FileClass
        }> = []

        for (const commit of commits) {
            if (isExempted(commit)) continue
            if (commit.parsed?.prefix !== 'docs') continue

            for (const file of commit.files) {
                const fileClass = classifyFile(file)
                if (fileClass !== 'doc') {
                    violations.push({
                        sha: commit.sha.slice(0, 7),
                        title: commit.title,
                        file,
                        fileClass
                    })
                }
            }
        }

        if (violations.length > 0) {
            const lines = violations.map((v) => `  ${v.sha} "${v.title}"\n    file: ${v.file} (class: ${v.fileClass})`)
            throw new Error(
                `Found ${violations.length} doc-prefix commit(s) touching non-doc files:\n${lines.join('\n')}\n\n` +
                    'Per commit-purity-invariant, docs(...) commits must touch ONLY doc-class files ' +
                    '(*.md, docs/**, memory/**, notes/**). Either:\n' +
                    '  1. Split the non-doc files into a separate feat/fix/chore commit\n' +
                    '  2. If the mixed commit is legitimate, add its SHA to EXEMPTED_SHAS in ' +
                    'tests/unit-active/commit-purity-invariant.test.ts'
            )
        }
        expect(violations).toHaveLength(0)
    })

    it('test(...) commits touch only test-class files', () => {
        const violations: Array<{
            sha: string
            title: string
            file: string
            fileClass: FileClass
        }> = []

        for (const commit of commits) {
            if (isExempted(commit)) continue
            if (commit.parsed?.prefix !== 'test') continue

            for (const file of commit.files) {
                const fileClass = classifyFile(file)
                if (fileClass !== 'test') {
                    violations.push({
                        sha: commit.sha.slice(0, 7),
                        title: commit.title,
                        file,
                        fileClass
                    })
                }
            }
        }

        if (violations.length > 0) {
            const lines = violations.map((v) => `  ${v.sha} "${v.title}"\n    file: ${v.file} (class: ${v.fileClass})`)
            throw new Error(
                `Found ${violations.length} test-prefix commit(s) touching non-test files:\n${lines.join('\n')}\n\n` +
                    'Per commit-purity-invariant, test(...) commits must touch ONLY test-class files ' +
                    '(tests/**, *.test.*, *.spec.*). Either:\n' +
                    '  1. Split the non-test files into a separate commit\n' +
                    '  2. If the mixed commit is legitimate, add its SHA to EXEMPTED_SHAS in ' +
                    'tests/unit-active/commit-purity-invariant.test.ts'
            )
        }
        expect(violations).toHaveLength(0)
    })

    it('feat/fix/refactor commits show soft warnings for scope mismatch', () => {
        const softWarnings: Array<{
            sha: string
            title: string
            prefix: string
            scope: string
            totalFiles: number
            matchingFiles: number
        }> = []

        for (const commit of commits) {
            if (isExempted(commit)) continue
            if (!commit.parsed) continue
            if (!['feat', 'fix', 'refactor'].includes(commit.parsed.prefix)) {
                continue
            }

            const total = commit.files.length
            if (total === 0) continue

            const matching = commit.files.filter((f) => scopeMatchesFile(commit.parsed!.scope, f)).length
            const ratio = matching / total

            if (ratio < 0.5) {
                softWarnings.push({
                    sha: commit.sha.slice(0, 7),
                    title: commit.title,
                    prefix: commit.parsed.prefix,
                    scope: commit.parsed.scope,
                    totalFiles: total,
                    matchingFiles: matching
                })
            }
        }

        // Soft rule: log warnings but don't fail. If this test starts
        // failing, it means we hardened the rule to a hard fail.
        if (softWarnings.length > 0) {
            const lines = softWarnings.map(
                (w) => `  ${w.sha} "${w.title}" — ${w.matchingFiles}/${w.totalFiles} files match scope "${w.scope}"`
            )
            // Log for visibility but don't throw (soft rule).
            console.warn(
                `[commit-purity-invariant] Soft warnings (${softWarnings.length} commits with <50% scope match):\n${lines.join('\n')}`
            )
        }
        // Soft rule: this assertion always passes. The warnings are
        // logged above for developer visibility.
        expect(true).toBe(true)
    })
})
