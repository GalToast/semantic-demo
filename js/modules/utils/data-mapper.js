import { DATA_COLUMNS } from './data-schema.js';

/**
 * data-mapper.js
 *
 * Utilities for mapping raw positional data records to structured point objects.
 */

function cleanOptionalValue(value) {
    if (value === undefined || value === null || value === '' || value === 'NULL') return null;
    return value;
}

function parseFiniteNumber(value) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
}

/**
 * Normalizes a slug-style business name to a clean display name.
 *
 * The raw data.dat corpus seed contains slug-style names (all-lowercase
 * words joined by hyphens, sometimes with a numeric prefix like "2-")
 * that originate from URL-friendly identifiers rather than real business
 * names. This function detects and converts them.
 *
 * Examples:
 *   "2-hampton-inn-and-suites"  → "Hampton Inn And Suites"
 *   "519-angel-fire-coffee"    → "Angel Fire Coffee"
 *   "1845 SOLUTIONS"           → "1845 SOLUTIONS" (unchanged — not a slug)
 *   "BLOOMIN' BREWS COFFEE LLC" → unchanged
 *
 * @param {string|null} name Raw name value from data.dat
 * @returns {string|null} Normalized display name
 */
export function normalizeSlugName(name) {
    if (!name || typeof name !== 'string') return name;
    // Only process names matching slug pattern: optional digit hyphen prefix
    // followed by two or more lowercase words joined by hyphens.
    // This avoids mangling already-clean names with genuine hyphens
    // (e.g. "WELL-KNOWN CORP") or uppercase abbreviations.
    if (!/^(\d+-)?[a-z]+(-[a-z]+)+$/.test(name)) {
        return name;
    }
    // Strip leading number prefix (e.g. "2-", "519-")
    name = name.replace(/^\d+-/, '');
    // Replace hyphens with spaces
    name = name.replace(/-/g, ' ');
    // Title-case each word
    return name.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Maps a single raw positional array record to a structured point object.
 *
 * @param {Array} p Raw record from data.dat
 * @returns {Object} Structured point object
 */
export function mapRawRecordToPoint(p) {
    if (!Array.isArray(p)) return null;

    return {
        cluster: p.length > DATA_COLUMNS.CLUSTER ? (parseInt(p[DATA_COLUMNS.CLUSTER], 10) || 0) : 0,
        name: p.length > DATA_COLUMNS.NAME ? normalizeSlugName(cleanOptionalValue(p[DATA_COLUMNS.NAME])) : null,
        what: p.length > DATA_COLUMNS.WHAT ? cleanOptionalValue(p[DATA_COLUMNS.WHAT]) || 'Montgomery County business' : 'Montgomery County business',
        city: p.length > DATA_COLUMNS.CITY ? cleanOptionalValue(p[DATA_COLUMNS.CITY]) || 'Montgomery County' : 'Montgomery County',
        lead_id: p.length > DATA_COLUMNS.LEAD_ID ? p[DATA_COLUMNS.LEAD_ID] : null,
        lat: p.length > DATA_COLUMNS.LAT ? parseFiniteNumber(p[DATA_COLUMNS.LAT]) : null,
        lng: p.length > DATA_COLUMNS.LNG ? parseFiniteNumber(p[DATA_COLUMNS.LNG]) : null,
        website: p.length > DATA_COLUMNS.WEBSITE ? cleanOptionalValue(p[DATA_COLUMNS.WEBSITE]) : null,
        email: p.length > DATA_COLUMNS.EMAIL ? cleanOptionalValue(p[DATA_COLUMNS.EMAIL]) : null,
        phone: p.length > DATA_COLUMNS.PHONE ? cleanOptionalValue(p[DATA_COLUMNS.PHONE]) : null,
        trivia: p.length > DATA_COLUMNS.TRIVIA ? cleanOptionalValue(p[DATA_COLUMNS.TRIVIA]) : null,
        status: p.length > DATA_COLUMNS.STATUS ? cleanOptionalValue(p[DATA_COLUMNS.STATUS]) || 'active' : 'active',
        naics: p.length > DATA_COLUMNS.NAICS ? cleanOptionalValue(p[DATA_COLUMNS.NAICS]) : null
    };
}

/**
 * Extracts coordinate data from a raw record for WebGL buffers.
 *
 * @param {Array} p Raw record
 * @returns {Object} {x, y, z, cluster}
 */
export function extractRawCoordinates(p) {
    return {
        x: p.length > DATA_COLUMNS.X ? parseFiniteNumber(p[DATA_COLUMNS.X]) : 0,
        y: p.length > DATA_COLUMNS.Y ? parseFiniteNumber(p[DATA_COLUMNS.Y]) : 0,
        z: p.length > DATA_COLUMNS.Z ? parseFiniteNumber(p[DATA_COLUMNS.Z]) : 0,
        cluster: p.length > DATA_COLUMNS.CLUSTER ? (parseInt(p[DATA_COLUMNS.CLUSTER], 10) || 0) : 0
    };
}
