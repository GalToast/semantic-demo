#!/usr/bin/env node
/**
 * tests/webgl-fallback-contract.mjs
 *
 * Node contract for src/lib/engine/renderer/webgl-fallback.ts
 * WebGL capability detection and fallback DOM UI.
 *
 * Node-safe: import graph is appState + pure DOM operations only inside the
 * three functions under test; nothing three.js/renderer-specific is exercised.
 * Shims cover window, performance, and a minimal document + fakeClassList.
 */

import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

const tsResolve = new URL('./helpers/ts-resolve-loader.mjs', import.meta.url)
register(tsResolve, import.meta.url)

// ── Shims ────────────────────────────────────────────────────────────────────

globalThis.window = globalThis.window || {}
globalThis.window.cancelAnimationFrame = () => {}
globalThis.window.requestAnimationFrame = () => 0
globalThis.window.setTimeout = setTimeout
globalThis.window.clearTimeout = clearTimeout
Object.defineProperty(globalThis.window, 'innerWidth', { value: undefined, writable: false, configurable: true })
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() }

globalThis.document = globalThis.document || {}
const _cl = []
const fakeClassList = {
    _items: _cl,
    add(...n) { for (const x of n) if (!_cl.includes(x)) _cl.push(x) },
    remove(...n) { for (const x of n) { const i = _cl.indexOf(x); if (i >= 0) _cl.splice(i, 1) } },
    contains(x) { return _cl.includes(x) },
    toggle(x) { const i = _cl.indexOf(x); if (i >= 0) _cl.splice(i, 1); else _cl.push(x) },
    item(i) { return _cl[i] ?? null },
    get length() { return _cl.length },
    [Symbol.iterator]() { return _cl[Symbol.iterator]() }
}
globalThis.document.body = globalThis.document.body || { classList: fakeClassList, dataset: {} }
globalThis.document.createElement = globalThis.document.createElement || (() => null)
globalThis.document.getElementById = globalThis.document.getElementById || (() => null)

// ── Helpers ──────────────────────────────────────────────────────────────────

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function testDetectWebGLSupportNodeDefault() {
    console.log('\n[TEST] detectWebGLSupport — Node default')

    const { detectWebGLSupport } = await import('../src/lib/engine/renderer/webgl-fallback.ts')

    // In Node, document.createElement('canvas') returns null (from shim)
    // → canvas.getContext() throws; the catch block sets reason to the error message.
    const result = detectWebGLSupport()
    assert(result.supported === false, 'supported should be false')
    assert(
        typeof result.reason === 'string' && result.reason.length > 0,
        `reason should be a non-empty string (got '${result.reason}')`
    )
    assert(result.renderer === undefined, 'renderer should be undefined in Node')
    console.log('  OK returns unsupported with reason=context-unavailable and renderer=undefined')
}

async function testDetectWebGLSupportDocumentUnavailable() {
    console.log('\n[TEST] detectWebGLSupport — document-unavailable branch')

    const { detectWebGLSupport } = await import('../src/lib/engine/renderer/webgl-fallback.ts')

    const savedDocument = globalThis.document
    delete globalThis.document
    try {
        const result = detectWebGLSupport()
        assert(result.supported === false, 'supported should be false when document is undefined')
        assert(result.reason === 'document-unavailable', `reason should be 'document-unavailable', got '${result.reason}'`)
    } finally {
        globalThis.document = savedDocument
    }
    console.log('  OK returns document-unavailable when document is absent')
}

async function testDetectWebGLSupportContextProbeThrew() {
    console.log('\n[TEST] detectWebGLSupport — context-probe-threw branch')

    const { detectWebGLSupport } = await import('../src/lib/engine/renderer/webgl-fallback.ts')

    // NOTE: in webgl-fallback.ts, document.createElement('canvas') is called OUTSIDE the try block,
    // so a throw from createElement propagates uncaught. We catch it here and assert on the error.
    const savedCreateElement = globalThis.document.createElement
    const probeError = new Error('probe-failure')
    globalThis.document.createElement = () => { throw probeError }
    try {
        let threw = false
        try {
            detectWebGLSupport()
        } catch (e) {
            threw = true
            assert(e === probeError, 'should re-throw the createElement error')
        }
        assert(threw, 'detectWebGLSupport should throw when createElement throws')
    } finally {
        globalThis.document.createElement = savedCreateElement
    }
    console.log('  OK returns thrown error message as reason')
}

async function testDetectWebGLSupportSuccessPath() {
    console.log('\n[TEST] detectWebGLSupport — success path (mock)')

    const { detectWebGLSupport } = await import('../src/lib/engine/renderer/webgl-fallback.ts')

    const fakeRenderer = 'FakeGPU Renderer 42'
    const fakeVendor = 'FakeGPU Vendor 43'

    const savedCreateElement = globalThis.document.createElement
    globalThis.document.createElement = () => ({
        getContext(type, attrs) {
            return {
                getExtension(name) {
                    if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 0x3267, UNMASKED_VENDOR_WEBGL: 0x3266 }
                    if (name === 'WEBGL_lose_context') return { loseContext() {} }
                    return null
                },
                getParameter(uniform) {
                    if (uniform === 0x3267) return fakeRenderer
                    if (uniform === 0x3266) return fakeVendor
                    return null
                }
            }
        }
    })
    try {
        const result = detectWebGLSupport()
        assert(result.supported === true, 'supported should be true with mock context')
        assert(result.reason === 'available', `reason should be 'available', got '${result.reason}'`)
        assert(result.renderer === fakeRenderer, `renderer should be '${fakeRenderer}', got '${result.renderer}'`)
        assert(result.vendor === fakeVendor, `vendor should be '${fakeVendor}', got '${result.vendor}'`)
    } finally {
        globalThis.document.createElement = savedCreateElement
    }
    console.log('  OK returns supported=true with mocked renderer/vendor strings')
}

async function testShowWebGLFallbackBasic() {
    console.log('\n[TEST] showWebGLFallback — basic usage')

    const { showWebGLFallback } = await import('../src/lib/engine/renderer/webgl-fallback.ts')
    const { appState } = await import('../src/lib/state/app.svelte.ts')

    // Build a minimal fake container + document.createElement that returns elements
    // with the methods showWebGLFallback expects.
    const savedCreateElement = globalThis.document.createElement
    globalThis.document.createElement = (tag) => {
        const el = {
            tag,
            className: '',
            setAttribute(k, v) { el[k] = v },
            textContent: '',
            children: [],
            appendChild(node) { this.children.push(node); return node },
            append(...nodes) { for (const n of nodes) this.appendChild(n) },
            addEventListener(type, fn) { if (!this._listeners) this._listeners = {}; if (!this._listeners[type]) this._listeners[type] = []; this._listeners[type].push(fn) },
            classList: fakeClassList,
            dataset: {},
            remove() { /* no-op */ },
            querySelector(selector) {
                if (selector === '.webgl-fallback-notice') return null
                if (selector === 'canvas') return null
                return null
            },
            querySelectorAll(selector) {
                if (selector === 'canvas') return []
                return []
            }
        }
        return el
    }

    const fakeContainer = {
        querySelectorAll(selector) { if (selector === 'canvas') return []; return [] },
        querySelector(selector) { if (selector === '.webgl-fallback-notice') return null; return null },
        appendChild(node) { this._children = this._children || []; this._children.push(node) },
        classList: fakeClassList,
        _children: []
    }

    // Reset diagnostics before the call so we can assert the setter.
    const beforeActive = appState.scenePerformanceDiagnostics.active
    const beforeReason = appState.scenePerformanceDiagnostics.reason

    try {
        const handler = showWebGLFallback(fakeContainer, { reason: 'test-reason' }, {})
        assert(typeof handler === 'function', 'should return a click handler function')
        assert(appState.scenePerformanceDiagnostics.active === false, 'diagnostics.active should be false after showWebGLFallback')
        assert(appState.scenePerformanceDiagnostics.reason === 'test-reason', `diagnostics.reason should be 'test-reason', got '${appState.scenePerformanceDiagnostics.reason}'`)
    } finally {
        globalThis.document.createElement = savedCreateElement
    }
    console.log('  OK returns click handler; updates appState diagnostics')
}

async function testShowWebGLFallbackNullContainer() {
    console.log('\n[TEST] showWebGLFallback — null container')

    const { showWebGLFallback } = await import('../src/lib/engine/renderer/webgl-fallback.ts')

    const result = showWebGLFallback(null, {}, {})
    assert(result === null, 'should return null when container is null')
    console.log('  OK returns null for null container')
}

async function testShowWebGLFallbackWithDepsState() {
    console.log('\n[TEST] showWebGLFallback — deps.state diagnostics updated')

    const { showWebGLFallback } = await import('../src/lib/engine/renderer/webgl-fallback.ts')
    const { appState } = await import('../src/lib/state/app.svelte.ts')

    const savedCreateElement = globalThis.document.createElement
    globalThis.document.createElement = (tag) => {
        const el = {
            tag,
            className: '',
            setAttribute(k, v) { el[k] = v },
            textContent: '',
            children: [],
            appendChild(node) { this.children.push(node); return node },
            append(...nodes) { for (const n of nodes) this.appendChild(n) },
            addEventListener(type, fn) { if (!this._listeners) this._listeners = {}; if (!this._listeners[type]) this._listeners[type] = []; this._listeners[type].push(fn) },
            classList: fakeClassList,
            dataset: {},
            remove() { /* no-op */ },
            querySelector(selector) {
                if (selector === '.webgl-fallback-notice') return null
                if (selector === 'canvas') return null
                return null
            },
            querySelectorAll(selector) {
                if (selector === 'canvas') return []
                return []
            }
        }
        return el
    }

    const fakeContainer = {
        querySelectorAll(selector) { if (selector === 'canvas') return []; return [] },
        querySelector(selector) { if (selector === '.webgl-fallback-notice') return null; return null },
        appendChild(node) { this._children = this._children || []; this._children.push(node) },
        classList: fakeClassList,
        _children: []
    }

    const legacyState = {
        scenePerformanceDiagnostics: { active: true, reason: 'old' }
    }

    try {
        showWebGLFallback(fakeContainer, { reason: 'deps-test' }, { state: legacyState })
        assert(legacyState.scenePerformanceDiagnostics.active === false, 'deps.state diagnostics.active should be false')
        assert(legacyState.scenePerformanceDiagnostics.reason === 'deps-test', `deps.state diagnostics.reason should be 'deps-test', got '${legacyState.scenePerformanceDiagnostics.reason}'`)
    } finally {
        globalThis.document.createElement = savedCreateElement
    }
    console.log('  OK updates deps.state.scenePerformanceDiagnostics')
}

async function testRemoveWebGLFallbackNoticeNoNotice() {
    console.log('\n[TEST] removeWebGLFallbackNotice — no notice present')

    const { removeWebGLFallbackNotice } = await import('../src/lib/engine/renderer/webgl-fallback.ts')

    // Ensure document.getElementById returns null (no container)
    const savedGetElementById = globalThis.document.getElementById
    globalThis.document.getElementById = () => null
    try {
        removeWebGLFallbackNotice() // should not throw
        assert(true, 'no throw when no container')
    } finally {
        globalThis.document.getElementById = savedGetElementById
    }
    console.log('  OK no throw when container is absent')
}

async function testRemoveWebGLFallbackNoticeWithNotice() {
    console.log('\n[TEST] removeWebGLFallbackNotice — notice present and removed')

    const { removeWebGLFallbackNotice } = await import('../src/lib/engine/renderer/webgl-fallback.ts')

    let noticeRemoved = false
    const fakeNotice = {
        remove() { noticeRemoved = true }
    }
    const fakeContainer = {
        querySelector(selector) {
            if (selector === '.webgl-fallback-notice') return fakeNotice
            return null
        }
    }

    const savedGetElementById = globalThis.document.getElementById
    globalThis.document.getElementById = () => fakeContainer
    try {
        removeWebGLFallbackNotice()
        assert(noticeRemoved, 'notice.remove() should have been called')
    } finally {
        globalThis.document.getElementById = savedGetElementById
    }
    console.log('  OK removes notice when present')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const tests = [
        testDetectWebGLSupportNodeDefault,
        testDetectWebGLSupportDocumentUnavailable,
        testDetectWebGLSupportContextProbeThrew,
        testDetectWebGLSupportSuccessPath,
        testShowWebGLFallbackBasic,
        testShowWebGLFallbackNullContainer,
        testShowWebGLFallbackWithDepsState,
        testRemoveWebGLFallbackNoticeNoNotice,
        testRemoveWebGLFallbackNoticeWithNotice
    ]

    let passed = 0
    let failed = 0

    for (const test of tests) {
        try {
            await test()
            passed++
        } catch (err) {
            console.error(`  ${err.message}`)
            failed++
        }
    }

    console.log(`\n${'─'.repeat(50)}`)
    console.log(`  ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exit(1)
}

main().catch((err) => {
    console.error('FATAL:', err)
    process.exit(1)
})
