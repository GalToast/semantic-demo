/**
 * Canonical bundle-budget policy shared by the hard ceiling and trend gates.
 * Keep the policy numbers in one place so the checks cannot silently drift.
 */

export const BUNDLE_CEILINGS_KB = Object.freeze({
    jsRaw: 1902,
    jsGzip: 566,
    cssRaw: 59.5,
    cssGzip: 11.1
})

export const BUNDLE_TREND_LIMITS_KB = Object.freeze({
    totalJs: 32,
    modeTransition: 16
})
