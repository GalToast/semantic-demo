import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('idb-service.ts — transaction timeout resilience', () => {
  const originalIndexedDB = globalThis.indexedDB;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.indexedDB = originalIndexedDB;
  });

  it('should export a 5-second timeout constant', async () => {
    // The constant is defined in the TS source; verify via the compiled JS export.
    // If vitest resolves to the .ts source directly, the export should be present.
    const mod = await import('../../js/modules/idb-service.ts');
    // Check both possible export names (named export or compiled away)
    const timeout = mod.TRANSACTION_TIMEOUT_MS ?? mod.default?.TRANSACTION_TIMEOUT_MS;
    expect(timeout).toBe(5000);
  });

  it('should reject when initDB times out (simulated hung open)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Build a fake open request that never resolves
    const hungRequest = {};
    Object.defineProperty(hungRequest, 'onsuccess', {
      set() { /* swallow */ },
      get() { return null; },
    });
    Object.defineProperty(hungRequest, 'onerror', {
      set() { /* swallow */ },
      get() { return null; },
    });
    Object.defineProperty(hungRequest, 'onupgradeneeded', {
      set() { /* swallow */ },
      get() { return null; },
    });

    globalThis.indexedDB = {
      open: vi.fn(() => hungRequest),
      deleteDatabase: vi.fn(),
    };

    // Must import a fresh module so dbPromise is null
    vi.resetModules();
    const { initDB } = await import('../../js/modules/idb-service.ts');

    const promise = initDB();

    // The 5000ms timeout should fire and reject
    vi.advanceTimersByTime(5200);

    await expect(promise).rejects.toThrow('IndexedDB open timed out');
  });

  it('should reject and reset dbPromise when a get() transaction hangs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Build a DB mock whose transaction never completes (hung)
    const hungStore = {
      get: vi.fn(() => ({})), // request object — onsuccess never fires
    };
    const hungTransaction = {
      objectStore: vi.fn(() => hungStore),
      oncomplete: null,
      onerror: null,
      onabort: null,
      abort: vi.fn(),
    };
    const fakeDB = {
      transaction: vi.fn(() => hungTransaction),
      objectStoreNames: { contains: vi.fn(() => true) },
    };

    // Working open that resolves immediately
    const openResult = { result: fakeDB };
    globalThis.indexedDB = {
      open: vi.fn(() => ({
        addEventListener: vi.fn(),
        set onsuccess(fn) {
          if (fn) Promise.resolve().then(() => fn({ target: openResult }));
        },
        set onerror(_fn) { /* noop */ },
        set onupgradeneeded(_fn) { /* noop */ },
      })),
      deleteDatabase: vi.fn(),
    };

    vi.resetModules();
    const { get, TRANSACTION_TIMEOUT_MS } = await import('../../js/modules/idb-service.ts');

    // Verify the timeout constant is 5s
    expect(TRANSACTION_TIMEOUT_MS).toBe(5000);

    const promise = get('test-key');

    // Advance past the timeout — the hung transaction should be aborted
    vi.advanceTimersByTime(5200);

    await expect(promise).rejects.toThrow(/timed out|aborted/i);
  });
});
