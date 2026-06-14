/**
 * dom-formatters.ts — thin re-export shim
 *
 * Canonical source moved to @lib/utils/dom-formatters.ts (Wave 11 T1a).
 * This shim preserves backward compatibility for js/ importers.
 */
export {
    escapeHtml,
    cleanPublicNoteText,
    isPrivateResearchNote,
    sanitizePublicFacingNote,
    getBusinessNamePresentation,
    formatBusinessName,
    cleanOptionalValue,
    stripTerminalPunctuation,
    getPublicRecordStatusLabel,
} from '@lib/utils/dom-formatters';
export type { BusinessNamePresentation } from '@lib/utils/dom-formatters';
