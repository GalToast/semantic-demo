/**
 * data-schema-contract.mjs
 *
 * Verifies that the data schema is consistent across main-thread and worker logic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DATA_COLUMNS } from '../js/modules/utils/data-schema.js';
import { mapRawRecordToPoint } from '../js/modules/utils/data-mapper.js';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const WORKER_PATH = path.join(SEMDEMO_ROOT, 'js/workers/data-worker.js');

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ---------------------------------------------------------------------------
// TEST 1: Schema Consistency
// ---------------------------------------------------------------------------

function testSchemaConsistency() {
    console.log('\n[TEST] Schema Consistency (Main vs Worker)');

    const workerSrc = fs.readFileSync(WORKER_PATH, 'utf-8');
    const workerSchemaMatch = workerSrc.match(/const DATA_COLUMNS = (\{[^}]+\});/);

    assert(workerSchemaMatch, 'Worker should contain DATA_COLUMNS definition');

    // Simple crude parse of the worker's DATA_COLUMNS
    const workerSchemaStr = workerSchemaMatch[1]
        .replace(/\/\/.*$/gm, '') // remove comments
        .replace(/\s+/g, '');    // remove whitespace

    Object.entries(DATA_COLUMNS).forEach(([key, value]) => {
        const expected = `${key}:${value}`;
        assert(workerSchemaStr.includes(expected), `Worker schema should include ${expected}`);
    });

    console.log('  OK Worker schema matches main-thread schema');
}

// ---------------------------------------------------------------------------
// TEST 2: Mapper Correctness
// ---------------------------------------------------------------------------

function testMapperCorrectness() {
    console.log('\n[TEST] Mapper Correctness');

    const sampleRow = [];
    sampleRow[DATA_COLUMNS.X] = 0.5;
    sampleRow[DATA_COLUMNS.Y] = 0.6;
    sampleRow[DATA_COLUMNS.Z] = 0.7;
    sampleRow[DATA_COLUMNS.CLUSTER] = 2;
    sampleRow[DATA_COLUMNS.NAME] = 'Test Business';
    sampleRow[DATA_COLUMNS.CITY] = 'Conroe';
    sampleRow[DATA_COLUMNS.LEAD_ID] = 'lead_123';
    sampleRow[DATA_COLUMNS.LAT] = 30.3;
    sampleRow[DATA_COLUMNS.LNG] = -95.4;
    sampleRow[DATA_COLUMNS.STATUS] = 'active';

    const point = mapRawRecordToPoint(sampleRow);

    assert(point.name === 'Test Business', 'Name should map correctly');
    assert(point.city === 'Conroe', 'City should map correctly');
    assert(point.lead_id === 'lead_123', 'Lead ID should map correctly');
    assert(point.lat === 30.3, 'Latitude should map correctly');
    assert(point.cluster === 2, 'Cluster should map correctly');
    assert(point.status === 'active', 'Status should map correctly');

    console.log('  OK Mapper correctly transforms raw row to point object');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
    console.log('============================================================');
    console.log('data-schema-contract.mjs');
    console.log('Contract test: data.dat schema consistency and mapping');
    console.log('============================================================');

    try {
        testSchemaConsistency();
        testMapperCorrectness();

        console.log('\n============================================================');
        console.log('ALL TESTS PASSED');
        console.log('============================================================');
        process.exit(0);
    } catch (err) {
        console.error('\nTEST FAILED:', err.message);
        process.exit(1);
    }
}

main();