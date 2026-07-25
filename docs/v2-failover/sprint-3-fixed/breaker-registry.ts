/** Circuit-breaker two-realm registry — Sprint-3 correctness repair.
 *  Gap #7 (two-realm breaker: perKey + perCarrierModel)
 *  Gap #14 (breaker atomicity — mutex single-flight)
 */

/** @description Per-key transient cooldown (realm A — gap #7) */
export interface PerKeyEntry {
    cooldownUntilMs: number
    reason: string
}

/** @description Per-(carrier,model) permanent breaker (realm B — gap #7) */
export interface PerCarrierModelEntry {
    breakerTrippedAtMs: number
    shape: string
    reason: string
}

/** @description An owned single-flight mutex handle for one carrier/model pair. */
export interface LockHandle {
    release(): void
}

export class BreakerLockNotHeldError extends Error {
    constructor(lockKey: string) {
        super(`Breaker lock is not held by the supplied handle for "${lockKey}"`)
        this.name = 'BreakerLockNotHeldError'
    }
}

export class LockHandleAlreadyReleasedError extends Error {
    constructor(lockKey: string) {
        super(`Breaker lock handle for "${lockKey}" has already been released`)
        this.name = 'LockHandleAlreadyReleasedError'
    }
}

/** Default transient cooldown TTL (~60 s for realm A per spec). */
export const TRANSIENT_COOLDOWN_DEFAULT_MS = 60_000

interface LockWaiter {
    resolve(handle: LockHandle): void
}

/**
 * A keyed, synchronous flag mutex with an optional FIFO promise queue.
 *
 * `tryAcquire` performs its test-and-set without yielding, so JavaScript's
 * run-to-completion rule makes the immediate path atomic. `release` and queued
 * hand-off are deliberately implemented by this same primitive: ownership is
 * transferred before a queued promise is resolved, leaving no unlocked gap.
 */
class BreakerMutex {
    private readonly holders = new Map<string, LockHandle>()
    private readonly waiters = new Map<string, LockWaiter[]>()

    constructor(private readonly createHandle: (lockKey: string) => LockHandle) {}

    tryAcquire(lockKey: string): LockHandle | null {
        if (this.holders.has(lockKey)) return null

        const handle = this.createHandle(lockKey)
        this.holders.set(lockKey, handle)
        return handle
    }

    acquireQueued(lockKey: string): Promise<LockHandle> {
        const immediate = this.tryAcquire(lockKey)
        if (immediate) return Promise.resolve(immediate)

        return new Promise<LockHandle>((resolve) => {
            const queue = this.waiters.get(lockKey) ?? []
            queue.push({ resolve })
            this.waiters.set(lockKey, queue)
        })
    }

    isCurrentHolder(lockKey: string, handle: LockHandle): boolean {
        return this.holders.get(lockKey) === handle
    }

    release(lockKey: string, handle: LockHandle): void {
        if (!this.isCurrentHolder(lockKey, handle)) {
            throw new BreakerLockNotHeldError(lockKey)
        }

        const queue = this.waiters.get(lockKey)
        const next = queue?.shift()
        if (!next) {
            this.holders.delete(lockKey)
            this.waiters.delete(lockKey)
            return
        }

        if (queue?.length === 0) this.waiters.delete(lockKey)

        // Install the successor before resolving it: no third caller can steal
        // ownership between release and the queued waiter's continuation.
        const nextHandle = this.createHandle(lockKey)
        this.holders.set(lockKey, nextHandle)
        next.resolve(nextHandle)
    }
}

class OwnedLockHandle implements LockHandle {
    private isReleased = false

    constructor(
        readonly lockKey: string,
        private readonly releaseThroughMutex: (handle: OwnedLockHandle) => void
    ) {}

    release(): void {
        if (this.isReleased) {
            throw new LockHandleAlreadyReleasedError(this.lockKey)
        }

        // Mark first so a failed/re-entrant release can never be attempted twice.
        this.isReleased = true
        this.releaseThroughMutex(this)
    }
}

function lockKeyFor(carrier: string, model: string): string {
    return `${carrier}|${model}`
}

function isProductionRuntime(): boolean {
    const runtime = globalThis as typeof globalThis & {
        process?: { env?: { NODE_ENV?: string } }
    }
    return runtime.process?.env?.NODE_ENV === 'production'
}

/** Two-realm circuit breaker with atomic single-flight mutex. */
export class CircuitBreaker {
    private readonly perKey = new Map<string, PerKeyEntry>()
    private readonly perCarrierModel = new Map<string, PerCarrierModelEntry>()
    private readonly mutex: BreakerMutex

    constructor() {
        this.mutex = new BreakerMutex(
            (lockKey) =>
                new OwnedLockHandle(lockKey, (handle) => {
                    // All holder deletion / hand-off goes through the same mutex primitive.
                    this.mutex.release(lockKey, handle)
                })
        )
    }

    /**
     * Atomically try to acquire the breaker lock for `(carrier, model)`.
     *
     * This method is intentionally synchronous. Its test-and-set completes in one
     * event-loop turn, guaranteeing that exactly one concurrent caller receives a
     * handle. If held, `null` is returned immediately and no waiter is enqueued.
     * Existing `await breaker.acquireBreakerLock(...)` call sites remain valid
     * because JavaScript permits awaiting a non-Promise value.
     */
    acquireBreakerLock(carrier: string, model: string): LockHandle | null {
        return this.mutex.tryAcquire(lockKeyFor(carrier, model))
    }

    isCarrierModelBroken(carrier: string, model: string): boolean {
        return this.perCarrierModel.has(lockKeyFor(carrier, model))
    }

    /**
     * Read-only cooldown peek. Returns remaining milliseconds (including zero or
     * a negative value for an expired entry), or null when no entry exists.
     * This method never mutates registry state.
     */
    peekTransientCooldown(carrier: string, key: string): number | null {
        void carrier
        const entry = this.perKey.get(key)
        return entry ? entry.cooldownUntilMs - Date.now() : null
    }

    /** Explicitly remove expired transient cooldowns; returns the prune count. */
    pruneExpiredTransientCooldowns(nowMs = Date.now()): number {
        let pruned = 0
        for (const [key, entry] of this.perKey) {
            if (entry.cooldownUntilMs <= nowMs) {
                this.perKey.delete(key)
                pruned += 1
            }
        }
        return pruned
    }

    /** Trip realm B. The supplied handle must own this exact carrier/model lock. */
    async tripPermanentBreaker(
        handle: LockHandle,
        carrier: string,
        model: string,
        shape: string,
        reason: string
    ): Promise<void> {
        const key = lockKeyFor(carrier, model)
        if (!this.assertLockHeld(key, handle)) return

        this.perCarrierModel.set(key, {
            breakerTrippedAtMs: Date.now(),
            shape,
            reason
        })
    }

    /**
     * Mark realm A while holding a breaker lock. The handle's owned lock must
     * belong to the supplied carrier; its model scopes the concurrent dispatch.
     */
    async markTransientCooldown(
        handle: LockHandle,
        carrier: string,
        key: string,
        reason: string,
        ttlMs = TRANSIENT_COOLDOWN_DEFAULT_MS
    ): Promise<void> {
        const ownedKey = this.ownedLockKey(handle)
        if (!ownedKey || !ownedKey.startsWith(`${carrier}|`)) {
            this.handleMissingLock(ownedKey ?? `${carrier}|<unknown-model>`)
            return
        }
        if (!this.assertLockHeld(ownedKey, handle)) return

        this.perKey.set(key, {
            cooldownUntilMs: Date.now() + ttlMs,
            reason
        })
    }

    /**
     * Admin hot-toggle synchronized with the regular breaker path. This call
     * queues behind an active transition, clears while exclusively owning the
     * same lock, and releases afterward, so an in-flight trip cannot be lost by
     * an unsynchronized trip/clear/retrip interleaving.
     */
    async clearCarrierModel(carrier: string, model: string): Promise<void> {
        const key = lockKeyFor(carrier, model)
        const handle = await this.mutex.acquireQueued(key)
        try {
            this.perCarrierModel.delete(key)
        } finally {
            handle.release()
        }
    }

    private ownedLockKey(handle: LockHandle): string | null {
        return handle instanceof OwnedLockHandle ? handle.lockKey : null
    }

    private assertLockHeld(lockKey: string, handle: LockHandle): boolean {
        if (handle instanceof OwnedLockHandle && this.mutex.isCurrentHolder(lockKey, handle)) {
            return true
        }
        return this.handleMissingLock(lockKey)
    }

    private handleMissingLock(lockKey: string): false {
        const error = new BreakerLockNotHeldError(lockKey)
        if (!isProductionRuntime()) throw error

        // Production degrades by refusing the unsafe mutation rather than silently
        // proceeding and violating gap #14 atomicity.
        console.warn(`[breaker-registry] ${error.message}; mutation skipped`)
        return false
    }
}

/** Module singleton — gap #7 / #14 two-realm breaker registry. */
export const breaker = new CircuitBreaker()
