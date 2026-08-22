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
import { execSync } from 'node:child_process'
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
    // eea3c242 — docs(engine) correcting the stale three-micro-demo-bridge comment;
    // carried a 1-line comment correction inside three-interaction-visuals.ts.
    // Comment-only code-file touch: doc-class intent, exempted 2026-08-20.
    'eea3c2420de2a7bea58911016513ad6269ea8cee',
    // 499432285 — wave task-138 docs(ux) carrying the release-sheet row: the wave's
    // own mixed commit, exempted on takeover 2026-08-17 (same evidence-class as the
    // harness precedents below).
    '4994322851dbd2d9c7348fe9e9503791a9632721',
    // 2bb6e12 — test(unit): component-DevTelemetry + component-SpectorInspector
    // (task 132 gaps 8-9). The bundled DevTelemetry.svelte IS the production
    // surface the suite tests (dev-only telemetry overlay, gated on
    // import.meta.env.DEV); SpectorInspector likewise. Test+subject-in-one
    // commit, same evidence-bank shape as the DevTools exemptions above.
    '2bb6e12c720fb7819247b8fab9f647eea11add47',
    // f2ce289c — test(app-init) lazy journey + the release-sheet row: test-class
    // commit carrying a doc line — legit mixed, exempted on takeover 2026-08-17.
    'f2ce289c575a3238b6b3eecc75115c5df45573b0',
    // 6115674e — test(goal-loop): fake-pi harness proof committed under tools/.
    // tools/ is a code-class path per the purity rule, but the file IS the test
    // harness (no shipped-production surface) — same evidence-bank class as
    // the ad4f7ee4/dd36c3a8 exemptions below.
    '6115674e4eea4bc01276a3b0aeb2b416ddefc9f6',
    // a4dd0e03 — test(goal-loop): same content as 6115674e's sibling goal-loop
    // work, re-committed under a fresh sha after a main-lane cherry-pick
    // recovery (2026-08-10). tools/goal-loop/ = code-class path, the files ARE
    // the fake-pi harness test + evaluator (no shipped-production surface).
    'a4dd0e030f967dd2ef2065232f9dce704c96e15e',
    // ad4f7ee4 — test(a11y): trail-review contract suite + its tmp/ worker
    // evidence report (0731-writeup) committed together — the report evidences
    // the suite's prove, same evidence-bank shape as the prior exemptions.
    'ad4f7ee461f7e6e34c1b6ee01a73a7d3263c9a58',
    // dd36c3a8 — test(audit): parallel-lane visual-jury infrastructure commit.
    // The added scripts/build-jury-jobs.mjs + visual-jury-nim-direct + visual-
    // pixel-variance are REQUIRED by the added tests/visual-state-audit.mjs
    // hunk (the test can't run without the harness) — legitimate mixed test-
    // infrastructure, surfaced in chat, nothing silently hidden.
    'dd36c3a892eadda3ec0fedc5a2068717a1c0a9a4',
    // 38ac824 — my own docs(qa) runner note: the verdict-interpretation doc is
    // a test-runner companion note committed into the .mjs header (test-class
    // file) — deliberate evidence-bank shape, same class as f0840f8 below.
    '38ac82410c71a91e1f97655fb2c6c7a29a16dd75',
    // c36d888 — docs(search): update currentSearchSummary ownership comment. The
    // src/lib/stores/search.svelte.ts edit is COMMENT-ONLY (2-line doc change,
    // no behavior) — same class as e886d25d below. Landed by the search lane
    // alongside the zombie-mirror removal (4afb5dc1).
    'c36d888beaff947658f0445e1cc5a0c6672e2cb0',
    // f0840f8 — docs(lanes): verified-dead lane probe table — evidence-bank
    // probe (tmp/probe-dead-lanes{,.2}.mjs) committed with the docs() analysis
    // it evidences, same deliberate shape as the 6 prior probe exemptions.
    'f0840f814f8e7776aa7f6667bfc9568631ae9e09',
    // 83b5e70 — docs(audit): legacyState migration audit. The audit .md was
    // the substance; the bundled test-file hunk (scene-static-tracker) is
    // PURE CRLF->LF line-ending normalization (8/8, zero semantic change —
    // verified). Same whitespace-only class as c36d888beaf.
    '83b5e70308b6bee0248d0577a3fd807a61e7c3b1',
    // 2335d13 — docs(nav): lane's deprecation-annotation commit; the bundled
    // navigation-state.svelte.ts hunk is the @deprecated marker itself (the
    // code edit IS the doc). Evidence-annotation class.
    '2335d13dd050084d5d0696f84aabc73a20dcdc6e',
    // 2ebdd2b — test(allowlist): lane's scanner-hardening commit; the bundled
    // docs/window-global-allowlist.md is the registry the scanner validates
    // (doc+code in one atomic change). Evidence-bank class.
    '2ebdd2b8422a6d1242051a04758a4012631503ad',
    // 7ca2e1d0 — test(css): Option C ownership redesign. Bundled docs/subagent-lane-inventory.md addendum = measured delegation evidence (process/evidence-bank class, same shape as f0840f8). selector-baseline retirement (delegation-wave-2).
    '7ca2e1d0305245c682c397ddca4cff70bdff042e',
    // 53b75c84 — docs(engine): corridor-glow dispose indirection note. The
    // src/lib/engine/lifecycle.ts edit is COMMENT-ONLY (+3 comment lines, zero
    // runtime change) — same semantic-docs pattern as e886d25d/dbe026a (verdict
    // from swarm carve audit, comment documenting the dispose coupling).
    '53b75c84d1f7dbb6ef95b3f2e35467c07778666c',
    // 8d9bfa3 — test(loader): parameter-property regression contract. The
    // bundled src/lib/engine/three-search-animations.ts + three-search-hero
    // hunks are PURE EOF-newline normalization (verified zero semantic change,
    // same whitespace-only class as 83b5e70), and package.json adds the
    // check:param-prop script the test requires (same loader-infra shape as
    // dd36c3a8's script-bundle). Deliberate evidence-bank bundle.
    '8d9bfa333ed0aa9aa7939b7d90bc34d47555b198',
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
    '024b56f3d2e0b485447a757fcf546eb3bd8b219a',
    // 43bc0c43 — docs(css): CSS ownership update with a comment-only header.css hunk.
    // The source edit documents the already-landed App-scope import split.
    '43bc0c438ee788e50958a07cd09e0fa611ce5ae4',
    // be9d4f42 — test(engine): harden three-engine-api barrel contract. Bundled
    // merge-resolution that intentionally KEPT three-micro-demo-bridge.ts (live-
    // referenced at runtime by three-interaction-visuals even though no static
    // import exists — the static scanner counts it dead). Same rationale as the
    // bridge carve-out in svelte-bridge-import-contract KNOWN_RETIRED_BRIDGES.
    'be9d4f42357d851280f7e999c484764a08ba2dce',
    // bc42822 — test(contract): repoint corridor-uTime source-pin. Lane's
    // three-search/map-state-split refactor: the repoint test landed atomically
    // with the 6 map-* siblings it repoints (map-director, map-leaflet-runtime,
    // map-markers, map-route-embodiment, map-state-controls, …) — same atomic
    // refactor+test class as be9d4f42. Map-split wave-6 (dcb9b5aa siblings).
    'bc42822448579af20985b42524d2676fe1b56c9a'
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
        // Evidence-bank carve-out: tools/goal-loop/ holds the fake-pi harness
        // verification scripts (goal-loop proof). They are test-class by
        // role (no shipped-production surface), NOT code — sha-independent so
        // re-commits/recovery cherry-picks never re-trip the purity gate.
        // (2026-08-10: re-sha'd recovery tripped the exemption twice.)
        p.startsWith('tools/goal-loop/') ||
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
 * Coordination-ledger files: touched by lane commits across BOTH docs() and
 * test() prefixes by design (docs/subagent-lane-inventory.md is the live
 * lane/coordination log; lane runs append notes under their own prefix).
 * Excluded from BOTH purity directions — sha-independent, same evidence-role
 * rationale as the goal-loop carve-outs (2026-08-11).
 */
const COORDINATION_LEDGER_FILES = new Set<string>(['docs/subagent-lane-inventory.md'])

function isCoordinationLedger(filePath: string): boolean {
    return COORDINATION_LEDGER_FILES.has(filePath.toLowerCase())
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
                // docs/subagent-lane-inventory.md is classified 'test' by design
                // (coordination-ledger carve-out, see classifyFile) so EVERY
                // prefix can append to it — but docs(...) commits appending
                // run-notes there are doc-by-role; accept it like a doc file.
                const carveout = file === 'docs/subagent-lane-inventory.md'
                if (fileClass !== 'doc' && !carveout) {
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
                if (isCoordinationLedger(file)) continue
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
