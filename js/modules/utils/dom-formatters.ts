/**
 * dom-formatters.ts
 *
 * Utilities for HTML sanitization, string manipulation, and business logic formatting.
 */

export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function cleanPublicNoteText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '';
    return String(value)
        .replace(/^legal name:\s*/i, '')
        .replace(/;.*$/, '')
        .replace(/\n.*$/, '')
        .replace(/\*\*/g, '')
        .replace(/\|/g, ' ')
        .replace(/^#{1,4}\s+/gm, '')
        .replace(/-{3,}/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[-*]+\s*/, '')
        .replace(/`+/g, '')
        .trim()
        .replace(/\s+([,.;:!?])/g, '$1');
}

export function isPrivateResearchNote(value: unknown): boolean {
    const text = String(value || '').toLowerCase();
    if (!text) return false;
    return [
        'disqualified:',
        'duplicate of lead',
        'double outreach',
        'qualified candidate',
        'during research',
        'public direct email',
        'public contact email',
        'same public contact info',
        'canonical record',
        'no active business presence',
        'contact info found',
        'residential address',
        'keeping a single canonical record'
    ].some((marker) => text.includes(marker));
}

export function sanitizePublicFacingNote(value: unknown): string {
    const text = cleanPublicNoteText(value);
    if (!text || isPrivateResearchNote(text)) return '';
    return text;
}

export interface BusinessNamePresentation {
    display: string;
    raw: string | null;
    showRaw: boolean;
}

export function getBusinessNamePresentation(name: unknown): BusinessNamePresentation {
    if (name === null || name === undefined) {
        return { display: 'Unknown business', raw: null, showRaw: false };
    }

    let raw = String(name)
        .trim()
        .replace(/^Lead\s+Profile:\s*/i, '');
    raw = raw.replace(/^\d{3,6}[-_]+/, '');
    if (!raw) {
        return { display: 'Unknown business', raw: null, showRaw: false };
    }

    const slugLike = !/\s/.test(raw) && /[-_]/.test(raw);
    let text = raw;

    if (slugLike) {
        text = text.replace(/[-_]+/g, ' ');
    } else {
        text = text.replace(/_+/g, ' ');
    }

    text = text.replace(/([a-z])([A-Z])/g, '$1 $2');

    const attachedSuffixes = ['PLLC', 'LLLP', 'LLC', 'LLP', 'CORP', 'INC', 'LTD', 'PLC', 'LP', 'PC', 'PA', 'CO'];
    attachedSuffixes.forEach((suffix) => {
        text = text.replace(new RegExp(`([A-Za-z])(${suffix})(?=$|\b|[.,])`, 'g'), `$1 $2`);
    });

    const preserveUpper = new Set([
        'LLC',
        'LLP',
        'LP',
        'INC',
        'LTD',
        'CORP',
        'CO',
        'PLC',
        'PLLC',
        'PC',
        'PA',
        'TX',
        'USA',
        'DBA',
        'CPA',
        'DDS',
        'MD',
        'DO',
        'POA',
        'HOA',
        'HVAC',
        'AC'
    ]);

    const display =
        text
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(Boolean)
            .map((token) => {
                const parts = token.match(/^([^A-Za-z0-9&]*)([A-Za-z0-9&'.]+)([^A-Za-z0-9&]*)$/);
                if (!parts) return token;
                const [, prefix, core, suffix] = parts as [string, string, string, string];
                const upper = core.toUpperCase();

                let normalizedCore = core;
                if (preserveUpper.has(upper) || /^[A-Z]{2,4}$/.test(core)) {
                    normalizedCore = upper;
                } else if (/^\d+[A-Za-z]+$/.test(core)) {
                    normalizedCore = core.toLowerCase();
                } else if (/^[a-z][a-z0-9&'.]*$/.test(core) || /^[A-Z][A-Z0-9&'.]{3,}$/.test(core)) {
                    normalizedCore = core
                        .toLowerCase()
                        .replace(/(^|['(])([a-z])/g, (_, separator: string, char: string) => `${separator}${char.toUpperCase()}`);
                }

                return `${prefix}${normalizedCore}${suffix}`;
            })
            .join(' ') || 'Unknown business';

    const cleanedDisplay = display.replace(/^Lead\s+Profile:\s*/i, '').trim();
    const rawComparable = raw.replace(/\s+/g, ' ').trim().toLowerCase();
    const displayComparable = cleanedDisplay.replace(/\s+/g, ' ').trim().toLowerCase();
    const showRaw = rawComparable !== displayComparable && (slugLike || /[_-]/.test(raw) || /[A-Z]{5,}/.test(raw));

    return { display: cleanedDisplay, raw, showRaw };
}

export function formatBusinessName(name: unknown): string {
    return getBusinessNamePresentation(name).display;
}

export function cleanOptionalValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (['unknown', 'not found', 'none', 'none detected', 'n/a', 'null'].includes(text.toLowerCase())) {
        return null;
    }
    return text;
}

export function stripTerminalPunctuation(text: string = ''): string {
    const clean = cleanOptionalValue(text);
    if (clean === null) return '';
    return clean.replace(/[.\s]+$/g, '');
}

export function getPublicRecordStatusLabel(status: unknown): string {
    const normalized = String(status || 'active')
        .trim()
        .toLowerCase();
    if (normalized === 'disqualified') return 'Archive layer';
    return 'County record';
}
