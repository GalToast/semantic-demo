export const PER_KEY_CONCURRENCY_CAP = 3;

export type KeySlotState = 'idle' | 'busy' | 'broken';

export interface AcquiredKeyHandle {
  carrierKey: string;
  routeId: string;
  acquiredAt: number;
  release(): Promise<void>;
}

export class KeyConcurrencyCapReachedError extends Error {
  readonly carrierKey: string;
  readonly activeCount: number;
  readonly cap: number;

  constructor(carrierKey: string, activeCount: number, cap: number) {
    super(
      `Key concurrency cap reached for "${carrierKey}" ` +
      `(${activeCount}/${cap} slots in use)`
    );
    this.name = 'KeyConcurrencyCapReachedError';
    this.carrierKey = carrierKey;
    this.activeCount = activeCount;
    this.cap = cap;
  }
}

// ── internal state ──

const activeSlots = new Map<string, Set<string>>();
const breakerChains = new Map<string, Promise<unknown>>();

// ── breaker lock (gap #14) ──

export async function withBreakerLock<T>(
  region: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = breakerChains.get(region) ?? Promise.resolve();

  const next = previous.then(
    () => fn(),
    () => fn(), // previous rejection must not block the queue
  );

  breakerChains.set(region, next);

  try {
    return await next;
  } finally {
    // Clean up only if we are still the tail; otherwise a later call
    // already overwrote us and will do its own cleanup.
    const current = breakerChains.get(region);
    if (current === next) {
      breakerChains.delete(region);
    }
  }
}

// ── helpers ──

function ensureSet(carrierKey: string): Set<string> {
  let set = activeSlots.get(carrierKey);
  if (!set) {
    set = new Set<string>();
    activeSlots.set(carrierKey, set);
  }
  return set;
}

function removeSlot(carrierKey: string, routeId: string): void {
  const set = activeSlots.get(carrierKey);
  if (!set) return;
  set.delete(routeId);
  if (set.size === 0) {
    activeSlots.delete(carrierKey);
  }
}

// ── public API ──

export async function acquireKey(
  carrierKey: string,
  routeId: string,
): Promise<AcquiredKeyHandle> {
  return withBreakerLock('per-key-acquire', async () => {
    const set = ensureSet(carrierKey);
    const activeCount = set.size;

    if (activeCount >= PER_KEY_CONCURRENCY_CAP) {
      throw new KeyConcurrencyCapReachedError(
        carrierKey,
        activeCount,
        PER_KEY_CONCURRENCY_CAP,
      );
    }

    set.add(routeId);

    const handle: AcquiredKeyHandle = {
      carrierKey,
      routeId,
      acquiredAt: Date.now(),
      release: async () => {
        await releaseKey(carrierKey, routeId);
      },
    };

    return handle;
  });
}

export async function releaseKey(
  carrierKey: string,
  routeId: string,
): Promise<void> {
  return withBreakerLock('per-key-acquire', async () => {
    removeSlot(carrierKey, routeId);
  });
}

export function getActiveKeyCount(carrierKey: string): number {
  return activeSlots.get(carrierKey)?.size ?? 0;
}

export async function withKey<T>(
  carrierKey: string,
  routeId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const handle = await acquireKey(carrierKey, routeId);
  try {
    return await fn();
  } finally {
    await handle.release();
  }
}
