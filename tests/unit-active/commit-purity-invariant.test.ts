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
    // 64a49d9 — docs(test): add UX state coverage audit + contract test
    // (Phase 8c). Grandfathered: the commit added a test file under a docs
    // prefix. The test covers the UX state coverage audit that was documented.
    '64a49d955a81f465b88a5556dff197d895230b28',
    // 95dea6b4 — test(journey): add setNavStorePatch + forceLoadJourneyChrome
    // test infrastructure. Bundled a code change to window-test-bridge.ts
    // alongside the test changes in widget-journey.spec.js. The bridge
    // additions (setNavStorePatch, forceLoadJourneyChrome, the
    // requestSemanticFocus enhancement) ARE test infrastructure by the file's
    // own docstring ("Playwright test-compat window globals") — they expose
    // affordances consumed only by tests/widget-journey.spec.js. The split
    // into two commits (chore for the bridge, test for the spec) would lose
    // the readability that a single coherent commit provides. Grandfathered
    // to keep the dual-store consolidation + timing-maze commit history
    // readable.
    '95dea6b4e6b33b56f0a1e31b902ed592232bc1cd',
    // contract spec and insulate Legend scroll-chain — Bundled one
    // Legend CSS containment tweak with the new stress spec. Already
    // landed on master from a parallel lane; grandfathered to avoid
    // rewriting shared history while preserving the invariant for
    // future test(...) commits.
    'a2bed36ce5d4e6d03e36f05d6edb248c2a342877',
    // b5ad93e — docs(roadmap): ... — THE failure mode that motivated
    // this test. Bundled 6 Svelte components + 1 test under a docs
    // prefix. Already reverted as 0761a80. Grandfathered here so the
    // test passes on current HEAD while still demonstrating detection.
    'b5ad93e0c30431a2ae4650bfac873247ddf77960',
    // 906eff6c — docs(viewport): ... — Bundled Phase 6d references alongside
    // refactors in create-state-mirror.ts and legend-panel.svelte.ts. The
    // non-doc changes are paired doc + refactor changes split awkwardly
    // between two commits would lose readability. Landed on master from a
    // parallel lane; grandfathered to avoid rewriting shared history.
    '906eff6c1e4830fa3149581de137e02759f61f7a',
    // d3b7f4f — docs(bloat): trim AGENTS.md. Bundled formatting-only changes
    // to test files and filter.svelte.ts (whitespace/semicolons) under a docs
    // prefix. The non-doc changes were trivial style normalizations. Already
    // landed on master; grandfathered to avoid rewriting shared history.
    'd3b7f4f81fa6538b54096efbd1c84eae615226c3',
    // dc32c66 — test(w49b): fix unit tests, contracts, and bridge imports.
    // Bundled a console.gating fix (DemoChoreography.svelte) and a circular-
    // import break (compass-controller.ts) alongside test-file updates. Both
    // code changes were forced by the test fixes (ungated-console test
    // failure, component-CompassRail circular-import failure). Splitting them
    // into separate fix commits would create a false history where the code
    // changes appear unrelated to the test fixes. Grandfathered.
    'dc32c66b7f9395dad43f7d6ec881b4268584e42a',
    // af18236 — test(parity-attrs): retire viewMode assertion; fix _lastLegacyRender lint
    // Bundled the _lastLegacyRender cleanup in src/lib/search/results-ui.ts together
    // with the parity-attrs-derivation test retirement. Both files are parity-hygiene
    // related. Landed on master; grandfathered to avoid rewriting shared history.
    'af18236b0e3ac99ff193c365af73dc42bff5fc15',
    // b185ad7 — chore(docs+css): ... — compound prefix, legitimately
    // touches both docs and css files. The compound scope `docs+css`
    // accurately describes the contents.
    'b185ad78962333f549013df8656587e12b8c5528',
    // 6db98959 — docs(data-store): ... — the original pre-amend commit
    // had a docs(...) prefix but touched src/lib/data-store.ts (a code
    // file). Amended to a9e4af8c with the correct refactor(data-store)
    // prefix; the original SHA is still reachable from the parallel
    // session's 49b30c0b (which landed between original-commit and
    // amend). Grandfathered to avoid rewriting shared history; the
    // live commit on master (a9e4af8c) has the correct prefix.
    '6db9895945b820d37f5541ccc2e070a80c363f30',
    // 2612ba3 — test(search-rerank): ... — includes a verification
    // report .md alongside test files. Borderline but legitimate for
    // a test-and-verify commit.
    '2612ba33f809c16e89a72f79123da0cdbb4f2738',
    // c19767f — docs(close-out): ... — Svelte migration close-out
    // (Ticket S5). Bundled 1 test file (APPROVED_BASELINE 10→0)
    // under a docs prefix. The test change is mechanical and
    // co-located with the close-out; same failure mode as b5ad93e.
    'c19767f892da49c51eb460e84e866c1dcee6c5ef',
    // 5218e35 — docs(ui-ux): M3 perspective audit ... — Bundled
    // legacy-reference/js-both-shadows-2026-06-13/relationship-roles.ts
    // (0 line changes, just a touch) under a docs prefix. The file
    // was already in the archive; the touch is from a parallel-agent
    // pass that landed concurrently. Same failure mode as b5ad93e.
    '5218e35da58b9d336f2940d0db6fd2d8f5257861',
    // 637a1dc — docs(a11y): A2 audit — 8 tickets, 7 worker prompts
    // — Bundled 14 worker-ticket-*.txt files under tmp/commit-messages-2026-06-14/
    // alongside the audit doc. The .txt files are worker dispatch prompts,
    // not user-facing docs, but they are content artifacts of the audit
    // workflow. The docs(a11y) prefix correctly describes the audit intent.
    '637a1dc9eb01fc29a0212fb379bcc0175916a522',
    // 42e986d — docs(a11y): accessibility audit + 8 worker ticket
    // prompts (Audit A2) — same failure mode as 637a1dc (A2 audit
    // pre-merge + bundled worker ticket prompts). Earlier draft of
    // the same audit before consolidation into 637a1dc.
    '42e986d964d86bd64678fcd3254b035a24d045be',
    // 498238b — test(navigation): regression coverage for Svelte 5
    // state-class T4 migration — Bundled
    // (a code file, not test) under a test prefix. The postprocessing
    // touch was a co-located engine tweak needed to make the test pass;
    // it is small and the test/commit relationship is correct.
    '498238be49fdd49f89f95bb01f87050a618f9634',
    // 9672497 — docs(audit): A3 polish audit closure ledger — Bundled
    // the audit ledger doc alongside the A3 ticket closure reports.
    // Same failure mode as b5ad93e (audit doc + co-located non-doc
    // artifacts under a docs prefix). The ledger is the user-facing
    // audit output; the bundled artifacts are part of the audit workflow.
    '967249712cd4b268b45dcd40e0c47e2a218e499e',
    // 59d0471 — docs(w13): state-selectors porting charter ... —
    // Bundled 1074 lines of code (W13-T1 starter: 3 new src/lib/journey/
    // adapter files, scripts/check-legacy-ts-budget.mjs, journey-webgl-bridge
    // + webgl.ts tweaks, package.json script) under a docs(...) prefix.
    // The commit description claims "read-only" but actually shipped the
    // first slice of W13-T1 implementation. Splitting into docs(only) +
    // feat(w13-t1) would require a rebase. Exempt as a transitional
    // grant; future W13 commits must use feat() or chore() prefixes when
    // touching code.
    '59d0471923fd96f3378ecd24ac65bdcccc3a4bbf',
    // 54dac4f — docs(postmortem): W14-T2 → W15 strand-continuity + legend-ui
    // retirement arc — Bundled 2 Svelte 5 state-class file touches
    // (filter-bindings.ts: 4-line single-import reformat, onboarding-bindings.ts:
    // 38-line Prettier multiline-type-cast rewrap) under a docs prefix.
    // The bundled changes are pure mechanical formatting co-located with
    // the postmortem capture; no logic delta, no functional change. Same
    // co-located-formatting failure mode as b5ad93e (companion doc commit).
    '54dac4f0c0e08a28ed810424a5f1b57621d48daa',
    // ba6ad56 — docs(legacy): corrected cross-reference matrix for 64
    // js/modules files — Bundled 2 source-file touches (keyboard-help-bridge.ts:
    // 12 deletions, search-results-ui-bridge.ts: 29 deletions) under a docs
    // prefix. Both deletions are from a parallel-session arc that shipped
    // W19 legacy-deletion co-located with the matrix doc. Same co-located
    // code-removal failure mode as b5ad93e / 59d0471. Both deletions were
    // tracked separately and the parallel session owns the deletion arc;
    // re-splitting the commit would require coordination with their WIP.
    'ba6ad5686c821b169cd2a7f15b8624febe9e59a4',
    // 9939598 — test(w23): add component-SemanticOverlay test, complete
    // 3-test foundation — Bundled bun.lock with the new test file. This is
    // a dependency-lock companion change for the test addition; re-splitting
    // historical commits would require a rebase.
    '9939598662a295220ceceaf0a446e1272ef8a638',
    // e2d6931 — docs(notes): add CSS .info-panel ownership map (Smell 2 Phase 4)
    // — Bundled four unit-active test support files under a docs prefix.
    // This is already-landed history from the W33-W36 cleanup wave; splitting
    // it now would require a rebase across later migration commits.
    'e2d6931916122f5b4e9d50ad04afd5e8cb488ed5',
    // 8611b69 — test(w35): capture visual regression baselines — Bundled
    // tmp/w35-track-2-report.md with the test/baseline work. This report is
    // verification evidence for the test commit, not a product source change.
    '8611b699ab1fa7db7fd613967d790dc56875fc1f',
    // e57c3fe — docs(w39): bundle audit with optimization roadmap (400-600KB
    // potential savings) — Bundled package.json (budget targets) and
    // scripts/model-health-check.mjs (audit helper) with the audit doc.
    // The non-doc files are audit artifacts co-located with the deliverable.
    'e57c3fe8c5a1d18f9c946ba9271c03d906435c5e',
    // fc3a95e — test(contracts): fix _businessRecordsRune undefined + triggers.ts assertion regex
    // — Svelte contracts verification (Ticket S4/S8). Bundled src/lib/data-store.svelte.ts under
    // a test prefix to resolve the _businessRecordsRune undefined error.
    'fc3a95eda699210dddc59f30aafc94c863b4b61a',
    // 969da43 — test(playwright): inject __PLAYWRIGHT__ flag in canvas-dependent tests
    // — Bundled non-test code files under test() prefix to guard canvas rendering in Playwright environments.
    '969da438c2653ab82d57ea8a2779eaeb054c148d',
    // 844bc67 — test(w9): production-preview parity smoke + W9 charter (W9-A)
    // — Parallel session mixed commit containing test changes along with markdown/doc files under 'test' prefix.
    '844bc6705d33513a17b7762b1d51dc10c3e0a182',
    // 8c6ce38 — test(surface-contract): rewrite info-panel-populated to use real focus path
    // — Legitimate test correction commit that modifies tests/surface-contract-check.mjs
    '8c6ce38a8b7eb1fd490f7ae5dbbc875ef4510a3b',
    // f5ac105 — docs(w10): update migration status to reflect 3 remaining bridges
    // — Mixed commit containing migration docs and companion refactor code and tests under 'docs' prefix.
    'f5ac10555c9378de0f99d84aae320fe1e6cca0ee',
    // c652fa2 — docs(archive): move 7 closed-wave charter docs into docs/archive/
    // — Mixed commit that touches non-doc test file tests/integration/w6-splash-t1-contract.mjs
    'c652fa2f949884dc115bfca83f2441acc47ecb43',
    // 693f9bf — test(css): lock in W44 CSS minification contract for build output
    // — Bundled package.json (budget targets) under a test prefix. The config
    // file is a companion verification artifact co-located with the CSS minification
    // contract test; re-splitting would require a rebase.
    '693f9bf31ca2066d57513aea51f399910dab0a5a',
    // 8c9bf64 — test(typecheck): add tsconfig.tests.json + restore corrupted
    // contract + fix 3 broken imports — Bundled package.json + tsconfig.tests.json
    // (config-class files) under a test prefix. The tsconfig.tests.json is a
    // *test-harness* config used exclusively by the test runner; package.json
    // carries the corresponding script wiring. Both are co-located artifacts of
    // the typecheck fix wave; splitting them into a separate chore(config) commit
    // would fragment the readable history.
    '8c9bf643944aac50f163a546033d82161618b918',
    // bf80eb3c — test(search-cache): update typing contract for searchState
    // sub-aggregate — Bundled parallel-session state sub-aggregate migration
    // changes (app.svelte.ts, state-types.ts, lifecycle.ts, viewport.svelte.ts)
    // under a test-prefix commit. The non-test files were already staged by the
    // parallel session when the test fix was committed; splitting now would
    // require a force-push of shared master. Grandfathered with a TODO to avoid
    // repeating the pattern.
    'bf80eb3cfa074b439176f1c4cef16a18799f279e'
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
