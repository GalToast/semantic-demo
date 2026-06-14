import { describe, it, expect } from 'vitest';
import { normalizeSlugName, mapRawRecordToPoint } from '../../js/modules/utils/data-mapper.js';
import { DATA_COLUMNS } from '../../src/lib/utils/data-schema';

describe('normalizeSlugName', () => {

    // ── Slug names that MUST be normalized ─────────────────────────────────

    it('normalizes a simple hyphenated slug', () => {
        expect(normalizeSlugName('hampton-inn-and-suites')).toBe('Hampton Inn And Suites');
    });

    it('strips a leading numeric prefix from a slug', () => {
        expect(normalizeSlugName('2-hampton-inn-and-suites')).toBe('Hampton Inn And Suites');
    });

    it('strips a multi-digit numeric prefix', () => {
        expect(normalizeSlugName('519-angel-fire-coffee')).toBe('Angel Fire Coffee');
    });

    it('normalizes a three-part slug', () => {
        expect(normalizeSlugName('the-coffee-shop')).toBe('The Coffee Shop');
    });

    it('normalizes a slug with many parts', () => {
        expect(normalizeSlugName('pine-valley-roofing-and-construction')).toBe('Pine Valley Roofing And Construction');
    });

    // ── Already-clean names that MUST be left unchanged ────────────────────

    it('leaves a clean uppercase name unchanged', () => {
        expect(normalizeSlugName("BLOOMIN' BREWS COFFEE LLC")).toBe("BLOOMIN' BREWS COFFEE LLC");
    });

    it('leaves a clean title-case name unchanged', () => {
        expect(normalizeSlugName('Alpha Corp')).toBe('Alpha Corp');
    });

    it('leaves a name with a leading digit (but not slug format) unchanged', () => {
        expect(normalizeSlugName('1845 SOLUTIONS')).toBe('1845 SOLUTIONS');
    });

    it('leaves a name with a genuine hyphen (uppercase) unchanged', () => {
        expect(normalizeSlugName('WELL-KNOWN ROOFING CO')).toBe('WELL-KNOWN ROOFING CO');
    });

    it('leaves a single-word name unchanged', () => {
        expect(normalizeSlugName('Caterpillar')).toBe('Caterpillar');
    });

    it('leaves null unchanged', () => {
        expect(normalizeSlugName(null)).toBeNull();
    });

    it('leaves undefined unchanged', () => {
        expect(normalizeSlugName(undefined)).toBeUndefined();
    });

    it('leaves an empty string unchanged', () => {
        expect(normalizeSlugName('')).toBe('');
    });

    // ── Corpus seed examples from the original TODO ────────────────────────

    it('handles the exact seed example from the TODO comment', () => {
        // This was the motivating example in TODO(data-regen)
        expect(normalizeSlugName('2-hampton-inn-and-suites')).toBe('Hampton Inn And Suites');
    });
});

describe('mapRawRecordToPoint (slug normalization)', () => {

    it('normalizes a slug name in the mapped output', () => {
        const row = [];
        row[DATA_COLUMNS.X] = 0.5;
        row[DATA_COLUMNS.Y] = 0.6;
        row[DATA_COLUMNS.Z] = 0.7;
        row[DATA_COLUMNS.CLUSTER] = 1;
        row[DATA_COLUMNS.NAME] = '2-hampton-inn-and-suites';

        const point = mapRawRecordToPoint(row);
        expect(point).not.toBeNull();
        expect(point.name).toBe('Hampton Inn And Suites');
    });

    it('leaves a clean name unchanged through the mapper', () => {
        const row = [];
        row[DATA_COLUMNS.X] = 0.5;
        row[DATA_COLUMNS.Y] = 0.6;
        row[DATA_COLUMNS.Z] = 0.7;
        row[DATA_COLUMNS.CLUSTER] = 1;
        row[DATA_COLUMNS.NAME] = 'BLOOMIN BREWS COFFEE LLC';

        const point = mapRawRecordToPoint(row);
        expect(point).not.toBeNull();
        expect(point.name).toBe('BLOOMIN BREWS COFFEE LLC');
    });

    it('handles a null name through the mapper', () => {
        const row = [];
        row[DATA_COLUMNS.X] = 0.5;
        row[DATA_COLUMNS.Y] = 0.6;
        row[DATA_COLUMNS.Z] = 0.7;
        row[DATA_COLUMNS.CLUSTER] = 1;
        row[DATA_COLUMNS.NAME] = null;

        const point = mapRawRecordToPoint(row);
        expect(point).not.toBeNull();
        expect(point.name).toBeNull();
    });
});
