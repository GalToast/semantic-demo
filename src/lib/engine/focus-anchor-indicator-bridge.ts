/**
 * focus-anchor-indicator-bridge.ts
 *
 * Imperative bridge: re-exports canonical focus-anchor-indicator for legacy callers.
 * Canonical source: src/lib/journey/focus-anchor-indicator.ts
 */

export {
    createFocusAnchorIndicator,
    updateFocusAnchorIndicator,
    disposeFocusAnchorIndicator
} from '@lib/journey/focus-anchor-indicator';
