import fs from 'node:fs'
import path from 'node:path'

const SEMDEMO_ROOT = path.resolve(process.cwd())

const THREAD_INSPECTOR_FILES = [
    'src/lib/journey/thread-inspector-state.ts',
    'src/lib/journey/thread-inspector-webgl.ts',
    'src/lib/journey/thread-inspector-render.ts',
    // W10 adapter-fold: thread-inspector-adapter.ts inlined into adapters.ts
    'src/lib/orchestration/adapters.ts'
]

const threadInspectorSrc = THREAD_INSPECTOR_FILES.map((p) => {
    try {
        return fs.readFileSync(path.join(SEMDEMO_ROOT, p), 'utf-8')
    } catch {
        return ''
    }
}).join('\n')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

function assertNotContains(haystack, needle, label) {
    assert(!haystack.includes(needle), `${label}: source should NOT contain "${needle}", but it was found`)
}

function main() {
    console.log('============================================================')
    console.log('thread-inspector-dewindowing-contract.mjs')
    console.log('Contract test: thread-inspector backward-compatible window surface')
    console.log('============================================================')

    // TEST 1: window.exploreThreadNeighbor direct assignment removed
    console.log('\n[TEST] window.exploreThreadNeighbor direct assignment removed (Wave70)')
    assertNotContains(
        threadInspectorSrc,
        'window.exploreThreadNeighbor = exploreThreadNeighbor',
        'window.exploreThreadNeighbor direct assignment removed'
    )
    assert(
        threadInspectorSrc.includes('export function exploreThreadNeighbor'),
        'exploreThreadNeighbor exported directly from thread-inspector split files'
    )
    console.log('  OK window.exploreThreadNeighbor removed; function exported directly')

    // TEST 2: window._ti retired
    console.log('\n[TEST] window._ti debug namespace retired during TS migration')
    assert(!threadInspectorSrc.includes('window._ti'), 'window._ti debug namespace remains retired')
    console.log('  OK window._ti retired')

    // TEST 3: No other window.* direct assignments
    console.log('\n[TEST] No window.* direct assignments in thread-inspector split files')
    const re = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*/g
    const matches = []
    let match
    while ((match = re.exec(threadInspectorSrc)) !== null) {
        matches.push(match[0])
    }
    assert(matches.length === 0, `thread-inspector split files: unexpected window.* assignments: ${matches.join(', ')}`)
    console.log('  OK no window.* direct assignments')

    // TEST 4: No dynamic window[key] assignments
    console.log('\n[TEST] No wildcard or dynamic window[key] assignments')
    assert(!/window\[.*\]\s*=/.test(threadInspectorSrc), 'No dynamic window[key] assignment pattern found')
    assert(!threadInspectorSrc.includes('Object.assign(window'), 'No Object.assign(window, ...) pattern')
    console.log('  OK no wildcard or dynamic window assignments')

    console.log('\n============================================================')
    console.log('ALL TESTS PASSED')
    console.log('============================================================')
}

main()
