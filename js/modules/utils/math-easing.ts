/**
 * math-easing.ts — thin re-export shim
 *
 * Canonical source moved to @lib/utils/math-easing.ts (Wave 11 T1a).
 * This shim preserves backward compatibility for js/ importers.
 */
export {
    parseFiniteNumber,
    easeInOutSine,
    easeInOutCubic,
    quadraticBezierComponent,
    easeOutBack,
    easeOutQuint,
    clampNumber,
} from '@lib/utils/math-easing';
