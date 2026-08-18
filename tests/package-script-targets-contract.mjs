/**
 * package-script-targets-contract.mjs
 *
 * Verifies that package.json scripts do not point at missing local test/script
 * files. It also blocks new untracked script targets while tolerating the
 * current broad dirty-worktree baseline explicitly listed below.
 */

import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

const ALLOWED_UNTRACKED_TARGETS = new Set([])

const REQUIRED_SCRIPT_INCLUDES = [
    {
        scriptName: 'qa:release-mobile-ownership:headed',
        fragments: [
            'node scripts/qa.mjs visual --states=11-mobile-selected-card-map-trail,24-mobile-map-focus-search,17-mobile-thread-inspector --headed',
            'node scripts/qa.mjs playthrough --real-route-visual --headed',
            'npm run check:script-targets'
        ]
    }
]

function normalizePath(value) {
    return value.replaceAll('\\', '/').replace(/^\.\/+/, '')
}

function trackedFiles() {
    try {
        return new Set(
            execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map(normalizePath)
        )
    } catch {
        return null
    }
}

function scriptTargets(command) {
    const targets = new Set()
    const targetPattern = /(?:^|[\s"'=])((?:\.\/)?(?:tests|scripts)[/\\][^\s"'&|;()<>]+?\.(?:mjs|js|cjs|spec\.js))/g
    for (const match of command.matchAll(targetPattern)) {
        // Glob targets (e.g. tests/3d-*.spec.js — Playwright patterns) are not files
        if (/[*[]/.test(match[1])) continue
        targets.add(normalizePath(match[1]))
    }
    return [...targets]
}

function npmRunReferences(command) {
    return [...command.matchAll(/(?:^|[\s&|;()])npm\s+run\s+([^\s&|;()]+)/g)].map((match) => match[1])
}

const tracked = trackedFiles()
const failures = []
const staleAllowlist = []
const inspected = []
const inspectedNpmRefs = []

for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
    for (const target of scriptTargets(command)) {
        inspected.push({ scriptName, target })
        if (!fs.existsSync(target)) {
            failures.push(`${scriptName} points at missing local target: ${target}`)
            continue
        }
        if (tracked && !tracked.has(target) && !ALLOWED_UNTRACKED_TARGETS.has(target)) {
            failures.push(`${scriptName} points at untracked local target not in baseline: ${target}`)
        }
    }
    for (const referencedScript of npmRunReferences(command)) {
        inspectedNpmRefs.push({ scriptName, referencedScript })
        if (!packageJson.scripts?.[referencedScript]) {
            failures.push(`${scriptName} runs missing npm script: ${referencedScript}`)
        }
    }
}

for (const { scriptName, fragments } of REQUIRED_SCRIPT_INCLUDES) {
    const command = packageJson.scripts?.[scriptName]
    if (!command) {
        failures.push(`Missing required QA script: ${scriptName}`)
        continue
    }
    for (const fragment of fragments) {
        if (!command.includes(fragment)) {
            failures.push(`${scriptName} must include ${fragment}`)
        }
    }
}

if (tracked) {
    for (const target of ALLOWED_UNTRACKED_TARGETS) {
        if (tracked.has(target)) staleAllowlist.push(target)
    }
}

if (staleAllowlist.length) {
    failures.push(`Remove tracked files from ALLOWED_UNTRACKED_TARGETS: ${staleAllowlist.join(', ')}`)
}

if (failures.length) {
    console.error('Package script target contract FAILED:')
    for (const failure of failures) console.error(`  x ${failure}`)
    console.error(`\nInspected ${inspected.length} local script target(s).`)
    process.exit(1)
}

console.log(
    `Package script target contract OK: ${inspected.length} local target(s) and ${inspectedNpmRefs.length} npm run reference(s) are valid; no new untracked script targets.`
)
