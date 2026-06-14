/**
 * data-mapper.ts
 *
 * Utilities for mapping raw positional data records to structured point objects.
 */

import { DATA_COLUMNS, type RawDatum } from '@lib/utils/data-schema';

function cleanOptionalValue(value: string | undefined | null): string | null {
    if (value === undefined || value === null || value === '' || value === 'NULL') return null;
    return value;
}

function parseFiniteNumber(value: string | undefined | null): number | null {
    const num = parseFloat(value as string);
    return Number.isFinite(num) ? num : null;
}

/**
 * Normalizes a slug-style business name to a clean display name.
 */
export function normalizeSlugName(name: string | null): string | null {
    if (!name || typeof name !== 'string') return name;
    if (!/^(\d+-)?[a-z]+(-[a-z]+)+$/.test(name)) {
        return name;
    }
    name = name.replace(/^\d+-/, '');
    name = name.replace(/-/g, ' ');
    return name.replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Structured point object derived from a raw positional record. */
export interface MappedPoint {
    cluster: number;
    name: string | null;
    what: string;
    city: string;
    lead_id: string | null;
    lat: number | null;
    lng: number | null;
    website: string | null;
    email: string | null;
    phone: string | null;
    trivia: string | null;
    status: string;
    naics: string | null;
}

/**
 * Maps a single raw positional array record to a structured point object.
 */
export function mapRawRecordToPoint(p: RawDatum | unknown): MappedPoint | null {
    if (!Array.isArray(p)) return null;
    const arr = p as string[];

    return {
        cluster: arr.length > DATA_COLUMNS.CLUSTER ? (parseInt(arr[DATA_COLUMNS.CLUSTER], 10) || 0) : 0,
        name: arr.length > DATA_COLUMNS.NAME ? normalizeSlugName(cleanOptionalValue(arr[DATA_COLUMNS.NAME])) : null,
        what: arr.length > DATA_COLUMNS.WHAT ? cleanOptionalValue(arr[DATA_COLUMNS.WHAT]) || 'Montgomery County business' : 'Montgomery County business',
        city: arr.length > DATA_COLUMNS.CITY ? cleanOptionalValue(arr[DATA_COLUMNS.CITY]) || 'Montgomery County' : 'Montgomery County',
        lead_id: arr.length > DATA_COLUMNS.LEAD_ID ? arr[DATA_COLUMNS.LEAD_ID] : null,
        lat: arr.length > DATA_COLUMNS.LAT ? parseFiniteNumber(arr[DATA_COLUMNS.LAT]) : null,
        lng: arr.length > DATA_COLUMNS.LNG ? parseFiniteNumber(arr[DATA_COLUMNS.LNG]) : null,
        website: arr.length > DATA_COLUMNS.WEBSITE ? cleanOptionalValue(arr[DATA_COLUMNS.WEBSITE]) : null,
        email: arr.length > DATA_COLUMNS.EMAIL ? cleanOptionalValue(arr[DATA_COLUMNS.EMAIL]) : null,
        phone: arr.length > DATA_COLUMNS.PHONE ? cleanOptionalValue(arr[DATA_COLUMNS.PHONE]) : null,
        trivia: arr.length > DATA_COLUMNS.TRIVIA ? cleanOptionalValue(arr[DATA_COLUMNS.TRIVIA]) : null,
        status: arr.length > DATA_COLUMNS.STATUS ? cleanOptionalValue(arr[DATA_COLUMNS.STATUS]) || 'active' : 'active',
        naics: arr.length > DATA_COLUMNS.NAICS ? cleanOptionalValue(arr[DATA_COLUMNS.NAICS]) : null
    };
}

/** Coordinate data extracted for WebGL buffers. */
export interface RawCoordinates {
    x: number;
    y: number;
    z: number;
    cluster: number;
}

/**
 * Extracts coordinate data from a raw record for WebGL buffers.
 */
export function extractRawCoordinates(p: RawDatum | unknown): RawCoordinates {
    const arr = Array.isArray(p) ? (p as string[]) : [];
    return {
        x: arr.length > DATA_COLUMNS.X ? parseFiniteNumber(arr[DATA_COLUMNS.X]) ?? 0 : 0,
        y: arr.length > DATA_COLUMNS.Y ? parseFiniteNumber(arr[DATA_COLUMNS.Y]) ?? 0 : 0,
        z: arr.length > DATA_COLUMNS.Z ? parseFiniteNumber(arr[DATA_COLUMNS.Z]) ?? 0 : 0,
        cluster: arr.length > DATA_COLUMNS.CLUSTER ? (parseInt(arr[DATA_COLUMNS.CLUSTER], 10) || 0) : 0
    };
}
