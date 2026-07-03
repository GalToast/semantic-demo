/**
 * @lib/business/humanize.ts — Convert business-record slugs to human-readable names
 *
 * `BusinessRecord.name` is a slug like `"519-angel-fire-coffee"`. The human
 * legal name lives in `public_note` as the first line `"Legal name: ANGEL FIRE
 * COFFEE"`. Display sites that use `record.name` raw show the slug (ugly, looks
 * like a URL fragment); this module produces the human form.
 *
 * Resolution order:
 *   1. `public_note` first line matches `/Legal name:\s*(.+?)$/m` →
 *      return the captured name TRIMMED, preserving original casing (e.g.
 *      `ANGEL FIRE COFFEE`). County records use ALL CAPS for legal names;
 *      that IS the intended human display form — do NOT title-case.
 *   2. Otherwise, fallback: replace `-` with spaces and Title Case each word.
 *      Keep the leading `lead_id` prefix in place.
 *   3. Empty / missing → `"Unknown"`.
 */

import type { BusinessRecord } from '@lib/types/business'

const LEGAL_NAME_RE = /^[ \t]*Legal name:[ \t]*(.+?)[ \t]*$/m

/**
 * Parse the `Legal name: <NAME>` line from the first line of `public_note`.
 * Returns `null` if no match. Whitespace around the captured name is trimmed;
 * the inner casing is preserved exactly as the county wrote it.
 */
export function parseLegalName(publicNote: string | null | undefined): string | null {
    if (!publicNote) return null
    const match = publicNote.match(LEGAL_NAME_RE)
    if (!match) return null
    const name = (match[1] ?? '').trim()
    return name.length > 0 ? name : null
}

/**
 * Title Case a slug like `519-angel-fire-coffee` → `519 Angel Fire Coffee`.
 * Lead_id-style numeric prefixes (leading digits in the first word) are kept
 * as-is; the rest of each word is title-cased character-by-character.
 */
export function titleCaseSlug(slug: string): string {
    if (!slug) return ''
    return slug
        .split('-')
        .filter((part) => part.length > 0)
        .map((part) => {
            // Keep leading runs of digits as-is, title-case the rest of the word.
            const m = /^(\d+)(.*)$/.exec(part)
            if (m) {
                const digits = m[1] ?? ''
                const rest = m[2] ?? ''
                const titled = rest.length === 0 ? '' : rest.charAt(0).toUpperCase() + rest.slice(1).toLowerCase()
                return digits + titled
            }
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        })
        .join(' ')
}

/**
 * Resolve a BusinessRecord to its human display name.
 *
 *   humanizeBusinessName({
 *       public_note: 'Legal name: ANGEL FIRE COFFEE\n- Industry: X',
 *       name: '519-angel-fire-coffee',
 *   })  // → 'ANGEL FIRE COFFEE'
 *
 *   humanizeBusinessName({
 *       public_note: '',
 *       name: '519-angel-fire-coffee',
 *   })  // → '519 Angel Fire Coffee'
 *
 *   humanizeBusinessName({ public_note: '', name: '' })  // → 'Unknown'
 */
export function humanizeBusinessName(record: Pick<BusinessRecord, 'name' | 'public_note'>): string {
    const legal = parseLegalName(record?.public_note)
    if (legal) return legal
    const slugFallback = titleCaseSlug(record?.name ?? '')
    return slugFallback.length > 0 ? slugFallback : 'Unknown'
}
