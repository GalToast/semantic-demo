// Shared 3D-runtime error capture for the Playwright 3D inventory.
//
// Reconstructed from its call sites because the file was absent from the
// working tree while four 3D specs import it:
//   tests/3d-hover-affordance.spec.js
//   tests/3d-focus-desktop-click.spec.js
//   tests/3d-touch-parity.spec.js
//   tests/3d-real-pointer-playthrough.spec.js
//
// The contract demanded by those call sites is exact and is the only behavior
// implemented here (no product-specific allowlist is invented — none is
// evidenced by the call sites or sibling specs such as
// adversarial-state-fuzz.spec.js / deep-link-focus-card-hit-journey.spec.js,
// which also assert `expect(errors, ...).toEqual([])`):
//
//   const capture = capture3dRuntimeErrors(page)   // page: a Playwright Page
//   assertNoUnexpected3dRuntimeErrors(expect, capture, title)
//   capture.detach()                                // stops listening
//
// NOTE: The browser-free admission checker (scripts/verify-3d-test-admission.mjs)
// only verifies that this module's import resolves; it never executes this code
// or launches a browser.

/**
 * Begin capturing pageerror and console.error events on a Playwright page.
 * @param {import('@playwright/test').Page} page
 * @returns {{ errors: Array<{type:string, message:string}>, detach: () => void }}
 */
export function capture3dRuntimeErrors(page) {
  const errors = []

  const onPageError = (err) => {
    errors.push({ type: 'pageerror', message: err?.message ?? String(err) })
  }
  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      errors.push({ type: 'console', message: msg.text() })
    }
  }

  page.on('pageerror', onPageError)
  page.on('console', onConsole)

  return {
    errors,
    detach() {
      page.off('pageerror', onPageError)
      page.off('console', onConsole)
    }
  }
}

/**
 * Assert that no runtime errors were captured during the window.
 * @param {(actual:unknown, message?:string) => any} expectFn Playwright `expect`
 * @param {{ errors: Array<{type:string, message:string}> }} capture result of capture3dRuntimeErrors
 * @param {string} title label included in the assertion message
 */
export function assertNoUnexpected3dRuntimeErrors(expectFn, capture, title) {
  if (typeof expectFn !== 'function') {
    throw new Error('assertNoUnexpected3dRuntimeErrors requires the Playwright expect function as first arg')
  }
  expectFn(capture?.errors ?? [], title).toEqual([])
}
