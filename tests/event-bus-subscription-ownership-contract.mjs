/**
 * event-bus-subscription-ownership-contract.mjs
 *
 * Fast static contract: verifies that every module-level event-bus subscription
 * in the five targeted files uses subscribeKeyed() with a stable, unique,
 * descriptive ownership key — never a plain subscribe().
 *
 * Also verifies that initLegendEventBusSubscriptions() is idempotent: repeated
 * calls use the same keys, so subscriber count does not increase.
 *
 * Runs in Node — pure source parsing, no browser, no module import.
 */

import fs from 'fs'
import path from 'path'

const REPO_ROOT = path.resolve(process.cwd())
const SRC = (file) => path.join(REPO_ROOT, 'src', file)

const TARGET_FILES = [
    'lib/engine/focus-pocket-size-mesh.ts',
    'lib/journey/journey.ts',
    'lib/journey/semantic-overlay.ts',
    'lib/journey/legend-ui.ts',
    'lib/ui/cluster-labels.ts'
]

const EXPECTED_KEYS = new Map([
    ['focus-pocket-size-mesh.ts', ['focus-pocket-size-mesh:STATE_RESET']],
    ['journey.ts', ['journey:CAMERA_NODE_FOCUSED']],
    ['semantic-overlay.ts', ['semantic-overlay:CAMERA_NODE_FOCUSED']],
    ['legend-ui.ts', ['legend-ui:VIEW_CHANGED', 'legend-ui:STATE_RESET']],
    ['cluster-labels.ts', ['cluster-labels:VIEW_CHANGED']]
])

let failures = 0

function assert(cond, msg) {
    if (!cond) {
        console.error(`  FAIL: ${msg}`)
        failures++
    } else {
        console.log(`  PASS: ${msg}`)
    }
}

function testNoPlainSubscribe(filePath) {
    const src = fs.readFileSync(SRC(filePath), 'utf8')
    // Find all module-level subscribe() calls (not inside comments)
    // Strategy: find lines with subscribe( that are NOT subscribeKeyed(
    const lines = src.split('\n')
    let inMultilineComment = false
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes('/*')) inMultilineComment = true
        if (line.includes('*/')) {
            inMultilineComment = false
            continue
        }
        if (inMultilineComment) continue
        // Skip single-line comments
        const codeOnly = line.replace(/\/\/.*$/, '').trim()
        // Match subscribe( but not subscribeKeyed(
        if (/\bsubscribe\s*\(/.test(codeOnly) && !/\bsubscribeKeyed\s*\(/.test(codeOnly)) {
            assert(false, `${filePath}:${i + 1} — plain subscribe() found: "${line.trim()}"`)
        }
    }
}

function testHasSubscribeKeyed(filePath) {
    const src = fs.readFileSync(SRC(filePath), 'utf8')
    const expectedKeys = EXPECTED_KEYS.get(path.basename(filePath)) || []

    // Find all subscribeKeyed('key', ...) calls
    const keyPattern = /subscribeKeyed\s*\(\s*['"]([^'"]+)['"]/g
    const foundKeys = []
    let match
    while ((match = keyPattern.exec(src)) !== null) {
        foundKeys.push(match[1])
    }

    for (const expectedKey of expectedKeys) {
        assert(
            foundKeys.includes(expectedKey),
            `${filePath}: expected subscribeKeyed key '${expectedKey}'; found keys: [${foundKeys.join(', ')}]`
        )
    }

    // No extra/unexpected subscribeKeyed calls on the targeted files
    // (relaxed: allow extras, but warn)
    for (const foundKey of foundKeys) {
        if (!expectedKeys.includes(foundKey)) {
            console.log(`  NOTE: ${filePath} has extra key '${foundKey}' (not in expected set)`)
        }
    }
}

function testAllKeysUnique() {
    const allKeys = []
    for (const keys of EXPECTED_KEYS.values()) {
        allKeys.push(...keys)
    }
    const seen = new Set()
    for (const key of allKeys) {
        if (seen.has(key)) {
            assert(false, `Duplicate key '${key}' across files`)
        } else {
            seen.add(key)
        }
    }
    assert(seen.size === allKeys.length, `All ${allKeys.length} keys are unique`)
}

function testKeyNamingConvention() {
    const allKeys = []
    for (const keys of EXPECTED_KEYS.values()) {
        allKeys.push(...keys)
    }
    const convention = /^[a-z0-9.-]+:[A-Z_]+$/
    for (const key of allKeys) {
        assert(
            convention.test(key),
            `Key '${key}' matches the owner:EVENT_NAME convention`
        )
    }
}

function testLegendInitIdempotent() {
    // Verify initLegendEventBusSubscriptions() uses subscribeKeyed so
    // repeated calls replace rather than duplicate.
    const src = fs.readFileSync(SRC('lib/journey/legend-ui.ts'), 'utf8')
    // Extract the init function body by finding the function declaration and
    // matching balanced braces.
    const funcMatch = src.match(/export function initLegendEventBusSubscriptions\(\)[^{]*\{/)
    if (!funcMatch) {
        assert(false, 'Could not find initLegendEventBusSubscriptions declaration')
        return
    }
    const startIdx = funcMatch.index + funcMatch[0].length
    // Walk balanced braces from startIdx
    let depth = 1
    let endIdx = startIdx
    for (let i = startIdx; i < src.length && depth > 0; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') depth--
        if (depth === 0) { endIdx = i; break }
    }
    const body = src.slice(startIdx, endIdx)
    // Every subscribe* call inside init must be subscribeKeyed
    // (skip lines that are subscribeKeyed; flag any line with plain subscribe())
    const lines = body.split('\n')
    const plainLines = lines.filter((l) => /\bsubscribe\s*\(/.test(l) && !/subscribeKeyed\s*\(/.test(l))
    assert(
        plainLines.length === 0,
        `initLegendEventBusSubscriptions uses only subscribeKeyed (plain calls: ${plainLines.join(' | ')})`
    )
    // Must contain subscribeKeyed with stable keys
    const keyedCalls = body.match(/subscribeKeyed\s*\(\s*'([^']+)'/g) || []
    assert(keyedCalls.length >= 2, `initLegendEventBusSubscriptions has ${keyedCalls.length} subscribeKeyed calls (expected >= 2)`)
    // Keys must be stable strings (not computed)
    for (const call of keyedCalls) {
        const keyMatch = call.match(/'([^']+)'/)
        assert(!!keyMatch, `subscribeKeyed call in initLegendEventBusSubscriptions uses a literal key: ${call}`)
    }
}

// Also verify legend-ui.ts exposes initLegendEventBusSubscriptions in exports
function testLegendInitExported() {
    const src = fs.readFileSync(SRC('lib/journey/legend-ui.ts'), 'utf8')
    // Can't check exports in a static source-level way easily, but we know from
    // reading the file — verify it has an export function
    const hasExport = /\bexport\s+function\s+initLegendEventBusSubscriptions\b/.test(src)
    assert(hasExport, 'legend-ui.ts exports initLegendEventBusSubscriptions')
}

console.log('=== Event-Bus Subscription Ownership Contract ===\n')

console.log('1. No plain module-level subscribe() in targeted files')
for (const file of TARGET_FILES) {
    testNoPlainSubscribe(file)
}

console.log('\n2. Every targeted subscription uses subscribeKeyed with expected keys')
for (const file of TARGET_FILES) {
    testHasSubscribeKeyed(file)
}

console.log('\n3. All keys are unique')
testAllKeysUnique()

console.log('\n4. Keys follow owner:EVENT_NAME convention')
testKeyNamingConvention()

console.log('\n5. initLegendEventBusSubscriptions is idempotent (subscribeKeyed)')
testLegendInitIdempotent()

console.log('\n6. initLegendEventBusSubscriptions is exported')
testLegendInitExported()

console.log(`\n=== Results: ${failures} failure(s) ===`)
process.exitCode = failures > 0 ? 1 : 0
