/**
 * node-window-shim.mjs
 *
 * Provides minimal window and document globals for Node-based contract tests.
 * Must be imported at the absolute top of the test file to precede other ESM imports.
 */

if (typeof global.window === 'undefined') {
    global.window = {
        location: { href: 'http://localhost' },
        addEventListener: () => {},
        removeEventListener: () => {},
        navigator: { clipboard: { writeText: async () => {} } },
        setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout,
        setInterval: global.setInterval,
        clearInterval: global.clearInterval,
        requestAnimationFrame: (cb) => setTimeout(cb, 0),
        performance: { now: () => Date.now() }
    };
}

if (typeof global.document === 'undefined') {
    global.document = {
        getElementById: () => ({ innerHTML: '', textContent: '', style: {}, appendChild: () => {}, querySelectorAll: () => [], addEventListener: () => {} }),
        body: { dataset: {} },
        documentElement: { dataset: {} },
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
    };
}

if (typeof global.sessionStorage === 'undefined') {
    global.sessionStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    };
}
