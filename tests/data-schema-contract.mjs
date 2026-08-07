/**
 * data-schema-contract.mjs
 *
 * Verifies that the data schema is consistent across main-thread and worker logic.
 */

import fs from 'node:fs'
import path from 'node:path'
import { DATA_COLUMNS } from '../src/lib/utils/data-schema.ts'
import { normalizeSlugName, mapRawRecordToPoint } from '../src/lib/utils/data-mapper.ts'

const SEMDEMO_ROOT = path.resolve(process.cwd())
const WORKER_PATH = path.join(SEMDEMO_ROOT, 'src/lib/workers/data-worker.ts')

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
}

// ---------------------------------------------------------------------------
// TEST 1: Schema Consistency
// ---------------------------------------------------------------------------

function testSchemaConsistency() {
    console.log('\n[TEST] Schema Consistency (Main vs Worker)')

    const workerSrc = fs.readFileSync(WORKER_PATH, 'utf-8')

    // Worker uses PointRecord interface instead of DATA_COLUMNS constant.
    // Verify PointRecord exists and its field names cover all DATA_COLUMNS keys.
    const pointRecordMatch = workerSrc.match(/interface PointRecord \{([^}]+)\}/s)
    assert(pointRecordMatch, 'Worker should contain PointRecord interface definition')

    const pointRecordBody = pointRecordMatch[1]
    const workerFields = new Set(
        [...pointRecordBody.matchAll(/\b(\w+)\s*:/g)].map((m) => m[1])
    )

    // Map DATA_COLUMNS keys (uppercase) to PointRecord field names.
    // X, Y, Z are excluded — they go into positionsBuffer (Float32Array), not PointRecord.
    const keyToField = {
        CLUSTER: 'cluster', NAME: 'name', WHAT: 'what', CITY: 'city',
        LEAD_ID: 'lead_id', LAT: 'lat', LNG: 'lng', WEBSITE: 'website',
        EMAIL: 'email', PHONE: 'phone', TRIVIA: 'trivia', STATUS: 'status',
        NAICS: 'naics'
    }

    for (const [key, expectedField] of Object.entries(keyToField)) {
        assert(
            workerFields.has(expectedField),
            `Worker PointRecord should include field '${expectedField}' (for DATA_COLUMNS.${key})`
        )
    }

    // Verify the position buffer exists separately
    assert(
        workerSrc.includes('positionsBuffer'),
        'Worker should provide positionsBuffer for X/Y/Z coordinates'
    )

    console.log('  OK Worker PointRecord interface covers all DATA_COLUMNS keys')
}

// ---------------------------------------------------------------------------
// TEST 2: Mapper Correctness
// ---------------------------------------------------------------------------

function testMapperCorrectness() {
    console.log('\n[TEST] Mapper Correctness')

    const sampleRow = []
    sampleRow[DATA_COLUMNS.X] = 0.5
    sampleRow[DATA_COLUMNS.Y] = 0.6
    sampleRow[DATA_COLUMNS.Z] = 0.7
    sampleRow[DATA_COLUMNS.CLUSTER] = 2
    sampleRow[DATA_COLUMNS.NAME] = 'Test Business'
    sampleRow[DATA_COLUMNS.CITY] = 'Conroe'
    sampleRow[DATA_COLUMNS.LEAD_ID] = 'lead_123'
    sampleRow[DATA_COLUMNS.LAT] = 30.3
    sampleRow[DATA_COLUMNS.LNG] = -95.4
    sampleRow[DATA_COLUMNS.STATUS] = 'active'

    const point = mapRawRecordToPoint(sampleRow)

    assert(point.name === 'Test Business', 'Name should map correctly')
    assert(point.city === 'Conroe', 'City should map correctly')
    assert(point.lead_id === 'lead_123', 'Lead ID should map correctly')
    assert(point.lat === 30.3, 'Latitude should map correctly')
    assert(point.cluster === 2, 'Cluster should map correctly')
    assert(point.status === 'active', 'Status should map correctly')

    console.log('  OK Mapper correctly transforms raw row to point object')
}

// ---------------------------------------------------------------------------
// TEST 3: Slug Name Normalization (data-regen smell fix)
// ---------------------------------------------------------------------------

function testSlugNormalization() {
    console.log('\n[TEST] Slug Name Normalization')

    // Direct normalization tests
    assert(
        normalizeSlugName('2-hampton-inn-and-suites') === 'Hampton Inn And Suites',
        'Should strip numeric prefix and title-case slug'
    )
    assert(normalizeSlugName('519-angel-fire-coffee') === 'Angel Fire Coffee', 'Should handle multi-digit prefix')
    assert(
        normalizeSlugName('hampton-inn-and-suites') === 'Hampton Inn And Suites',
        'Should handle slug without prefix'
    )
    assert(normalizeSlugName('The Coffee Shop') === 'The Coffee Shop', 'Should not modify already-clean name')
    assert(
        normalizeSlugName('1845 SOLUTIONS') === '1845 SOLUTIONS',
        'Should not modify uppercase name with leading digits'
    )
    assert(normalizeSlugName(null) === null, 'Should return null for null input')

    // Mapper integration test
    const slugRow = []
    slugRow[DATA_COLUMNS.X] = 0.5
    slugRow[DATA_COLUMNS.Y] = 0.6
    slugRow[DATA_COLUMNS.Z] = 0.7
    slugRow[DATA_COLUMNS.CLUSTER] = 1
    slugRow[DATA_COLUMNS.NAME] = '2-hampton-inn-and-suites'
    const point = mapRawRecordToPoint(slugRow)
    assert(point.name === 'Hampton Inn And Suites', 'mapRawRecordToPoint should normalize slug names')

    // Clean name through mapper should be unaffected
    const cleanRow = []
    cleanRow[DATA_COLUMNS.X] = 0.5
    cleanRow[DATA_COLUMNS.Y] = 0.6
    cleanRow[DATA_COLUMNS.Z] = 0.7
    cleanRow[DATA_COLUMNS.CLUSTER] = 1
    cleanRow[DATA_COLUMNS.NAME] = 'Test Business'
    const cleanPoint = mapRawRecordToPoint(cleanRow)
    assert(cleanPoint.name === 'Test Business', 'mapRawRecordToPoint should not modify already-clean names')

    console.log('  OK Slug normalization works in mapper and as standalone function')
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
    console.log('============================================================')
    console.log('data-schema-contract.mjs')
    console.log('Contract test: data.dat schema consistency and mapping')
    console.log('============================================================')

    try {
        testSchemaConsistency()
        testMapperCorrectness()
        testSlugNormalization()

        console.log('\n============================================================')
        console.log('ALL TESTS PASSED')
        console.log('============================================================')
        process.exit(0)
    } catch (err) {
        console.error('\nTEST FAILED:', err.message)
        process.exit(1)
    }
}

main()
