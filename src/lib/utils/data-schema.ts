/**
 * @lib/utils/data-schema.ts — Canonical schema for data.dat array-of-arrays format
 *
 * The data.dat file uses a positional array format to minimize payload size.
 * This schema maps those indices to named fields used throughout the application.
 *
 * SYNC_REQUIRED: Keep in sync with js/workers/data-worker.js
 *
 * Port of js/modules/utils/data-schema.ts
 */

/** Column index map for raw positional records in data.dat */
export const DATA_COLUMNS = {
  X: 0,
  Y: 1,
  Z: 2,
  CLUSTER: 3,
  NAME: 4,
  WHAT: 5,
  CITY: 6,
  LEAD_ID: 7,
  LAT: 8,
  LNG: 9,
  WEBSITE: 10,
  EMAIL: 11,
  PHONE: 12,
  TRIVIA: 13,
  STATUS: 14,
  NAICS: 15,
} as const;

/** Type for a single raw positional record from data.dat (array of strings). */
export type RawDatum = string[];

/** Type for a column index key. */
export type DataColumnKey = keyof typeof DATA_COLUMNS;
