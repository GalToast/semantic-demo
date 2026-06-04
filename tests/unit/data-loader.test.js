import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { state } from '../../js/state.js'
import { loadData } from '../../js/modules/data-loader.js'

// Mock the UI functions that are called at the end of loadData
vi.mock('../../js/modules/cluster-filter.js', () => ({
    updateClusterList: vi.fn(),
    populateCityFilter: vi.fn()
}));
vi.mock('../../js/modules/ui-renderers.js', () => ({
    buildLegend: vi.fn()
}));
vi.mock('../../js/modules/search-state.js', () => ({
    applyFilters: vi.fn()
}));

describe('data-loader', () => {
    beforeEach(() => {
        // Reset state for test isolation
        state.dataLoadAttempt = 0;
        state.points = [];
        state.pointIndexByLeadId = new Map();
        state.projectedNeighborGrid = null;
        state.projectedNeighborCache = new Map();

        // Mock document.getElementById so it doesn't throw
        vi.spyOn(document, 'getElementById').mockReturnValue({
            textContent: ''
        });

        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    describe('Data Mapping', () => {
        it('should correctly map raw JSON arrays to point objects', async () => {
            const mockRawData = [
                // x, y, z, cluster, name, what, city, lead_id, lat, lng, website, email, phone, trivia, status
                [1.5, 2.5, 3.5, 'Test Cluster', 'Test Name', 'Test What', 'Test City', 'lead_1', 30.0, -95.0, 'test.com', 'test@test.com', '555-1234', 'Trivia!', 'active'],
                // Partial data row
                [0, 0, 0, 'Cluster2', 'Name2', '', '', 'lead_2']
            ];

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockRawData)
            });

            await loadData();

            expect(state.points).toHaveLength(2);

            // Check full row
            const p1 = state.points[0];
            expect(state.rawPositionsBuffer[0]).toBe(1.5);
            expect(p1.name).toBe('Test Name');
            expect(p1.what).toBe('Test What');
            expect(p1.status).toBe('active');

            // Check partial row default values
            const p2 = state.points[1];
            expect(p2.name).toBe('Name2');
            expect(p2.what).toBe('Montgomery County business'); // Default fallback
            expect(p2.city).toBe('Montgomery County'); // Default fallback
            expect(p2.status).toBe('active'); // Default fallback
            expect(p2.website).toBeNull();

            // Check index mapping
            expect(state.pointIndexByLeadId.get('lead_1')).toBe(0);
            expect(state.pointIndexByLeadId.get('lead_2')).toBe(1);
        });

        it('should accept normalized point payloads from the data worker', async () => {
            const workerPoints = [{
                x: 4,
                y: 5,
                z: 6,
                cluster: 'Worker Cluster',
                name: 'Worker Name',
                what: 'Worker loaded record',
                city: 'Conroe',
                lead_id: 'worker_1',
                lat: 30.1,
                lng: -95.2,
                website: null,
                email: null,
                phone: null,
                trivia: null,
                status: 'active'
            }];

            const workerPositions = new Float32Array([4, 5, 6]);
            const workerClusters = new Uint16Array([1]);

            class FakeWorker {
                constructor(url) {
                    this.url = url;
                    this.listeners = new Set();
                }

                addEventListener(type, handler) {
                    if (type === 'message') this.listeners.add(handler);
                }

                removeEventListener(type, handler) {
                    if (type === 'message') this.listeners.delete(handler);
                }

                postMessage(message) {
                    if (message.type !== 'LOAD_RECORDS') return;
                    queueMicrotask(() => {
                        this.listeners.forEach((handler) => handler({
                            data: {
                                type: 'LOAD_RECORDS_SUCCESS',
                                payload: {
                                    points: workerPoints,
                                    pointIndexByLeadId: { worker_1: 0 },
                                    positionsBuffer: workerPositions,
                                    clustersBuffer: workerClusters
                                }
                            }
                        }));
                    });
                }
            }

            vi.stubGlobal('Worker', FakeWorker);
            // Bug Sweep 33: the worker path now also fetches enrichment
            // in parallel, so global.fetch IS called once (for the
            // enrichment). The data.dat fetch is done by the worker.
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({})
            });

            await loadData();

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch.mock.calls[0][0]).toMatch(/leadEnrichment\.public\.json/);
            expect(state.points).toEqual(workerPoints);
            expect(state.pointIndexByLeadId.get('worker_1')).toBe(0);
        });
    });

    describe('Error Handling and Retries', () => {
        it('should retry on fetch failure up to 3 times', async () => {
            let fetchAttempts = 0;
            global.fetch = vi.fn().mockImplementation(() => {
                fetchAttempts++;
                return Promise.resolve({ ok: false, status: 500 });
            });

            const loadPromise = expect(loadData()).rejects.toThrow('Unable to load county records after 3 attempts. Last error: Failed to fetch data: 500');

            await vi.runAllTimersAsync();

            await loadPromise;
            // Bug Sweep 33: 3 retries for data.dat + 1 parallel call
            // for the enrichment (which is caught and ignored).
            expect(fetchAttempts).toBe(4);
        });

        it('should throw specific error for malformed JSON', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.reject(new Error('Unexpected token'))
            });

            const loadPromise = expect(loadData()).rejects.toThrow(/Invalid JSON in data.dat: Unexpected token/);

            await vi.runAllTimersAsync();

            await loadPromise;
        });
    });
});
