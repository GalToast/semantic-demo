// envelope-contract.test.ts — parse-time verifier for the semantic point tuple
// (src/data.dat). Pure, no mocks: asserts the 16-column row contract + [0,1]^3
// coordinates + unique ids. Lives in tmp/perf9 pending lane adoption.
import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// vitest + CI both run from repo root → cwd-relative is stable.
const RAW = readFileSync(join(process.cwd(), 'src', 'data.dat'), 'utf8')
const ROWS = JSON.parse(RAW)

test('src/data.dat parses to a non-empty array of rows', () => {
  expect(Array.isArray(ROWS)).toBe(true)
  expect(ROWS.length).toBeGreaterThanOrEqual(8400)
})

test('every row is a 16-length tuple with [0,1]^3 coords', () => {
  for (const row of ROWS) {
    expect(row).toHaveLength(16)
    for (let c = 0; c < 3; c++) {
      expect(row[c]).toBeGreaterThanOrEqual(0)
      expect(row[c]).toBeLessThanOrEqual(1)
    }
  }
})

test('id column = col 7 (record index)', () => {
  const ids = ROWS.map((r) => r[7])
  expect(new Set(ids).size).toBe(ROWS.length)
  expect(ids.every((v) => Number.isInteger(v) && v >= 1)).toBe(true)
})

test('cluster column (col 3) is small-cardinality (0..20)', () => {
  const clusters = ROWS.map((r) => r[3])
  expect(new Set(clusters).size).toBeLessThanOrEqual(21)
  expect(clusters.every((v) => Number.isInteger(v) && v >= 0 && v <= 20)).toBe(true)
})

test('metadata columns carry non-empty name + category', () => {
  for (const row of ROWS) {
    expect(typeof row[4]).toBe('string')
    expect(row[4].length).toBeGreaterThan(0)
    expect(typeof row[5]).toBe('string')
  }
})