/** Circuit-breaker two-realm registry — Sprint-1 V2 failover.
 *  Gap #7 (two-realm breaker: perKey + perCarrierModel)
 *  Gap #14 (breaker atomicity — mutex single-flight)
 *
 *  Carrier-shape library mapping (from tmp/kimi-nvidia-bench-2026-07-24.md,
 *  "Updated CONFIRMED gap-#11 carrier-shape library (7 classes)"):
 *    Realm A (transient / perKey):
 *      - transient_unknown_connection
 *      - transient_upstream_stream_failed_before_output
 *    Realm B (permanent / perCarrierModel):
 *      - permanent_unknown_id
 *      - permanent_no_payment_method
 *      - permanent_credit_balance_exhausted
 *      - permanent_404_unavailable_for_free_with_paid_redirect
 *    Not carrier-side (caller-side classifier only):
 *      - dispatcher_unsupported_model_prefix (does NOT enter either realm)
 */

/** @description Per-key transient cooldown (realm A — gap #7) */
export interface PerKeyEntry {
  cooldownUntilMs: number; // absolute epoch ms when cooldown expires
  reason: string;           // last-cause retained
}

/** @description Per-(carrier,model) permanent breaker (realm B — gap #7) */
export interface PerCarrierModelEntry {
  breakerTrippedAtMs: number; // epoch ms when permanent breaker tripped (TTL ∞)
  shape: string;              // gap-#11 carrier error shape classification
  reason: string;             // retained cause
}

/** @description Single-flight mutex handle — gap #14 atomicity */
export interface LockHandle {
  release(): void;
}

/** Default transient cooldown TTL (~60 s for realm A per spec). */
export const TRANSIENT_COOLDOWN_DEFAULT_MS = 60_000;

/** Two-realm circuit breaker with atomic single-flight mutex.
 *  Gap #7 — perKey (realm A, transient) + perCarrierModel (realm B, permanent).
 *  Gap #14 — mutex single-flight per (carrier,model) pair.
 */
export class CircuitBreaker {
  // Realm A (transient / perKey): key = some per-request key identifier
  private perKey: Map<string, PerKeyEntry>;

  // Realm B (permanent / perCarrierModel): key = "${carrier}|${model}"
  private perCarrierModel: Map<string, PerCarrierModelEntry>;

  // Gap #14 — single-flight mutex: current holder per (carrier,model) pair.
  // Only ONE holder at a time; concurrent callers receive null.
  private currentLockHolders: Map<string, LockHandle>;

  // Gap #14 — promise waiters tracking (documented per spec; lock-and-wait-free variant)
  private lockWaiters: Map<string, Promise<LockHandle>>;

  constructor() {
    this.perKey = new Map();
    this.perCarrierModel = new Map();
    this.currentLockHolders = new Map();
    this.lockWaiters = new Map();
  }

  /**
   * Acquire breaker lock for a (carrier, model) pair.
   * Gap #14 — atomic single-flight mutex.
   * This is the lock-and-wait-free (return-null) variant of single-flight:
   * if another caller already holds the lock, return null immediately
   * so callers don't queue; callers must handle null (skip / retry later).
   *
   * Lock key format: "${carrier}|${model}".
   *
   * @param carrier — upstream carrier identifier
   * @param model   — model id (e.g. "kimi-k2.6")
   * @returns LockHandle if acquired, or null if already held by another caller
   */
  async acquireBreakerLock(carrier: string, model: string): Promise<LockHandle | null> {
    const lockKey = `${carrier}|${model}`;

    // If a holder already exists for this pair → single-flight: return null.
    const existingHolder = this.currentLockHolders.get(lockKey);
    if (existingHolder !== undefined && existingHolder !== null) {
      return null;
    }

    // Build a release handle that deletes the holder entry.
    // This implements the "await-safe" contract: release just deletes entry.
    let released = false;
    const handle: LockHandle = {
      release: (): void => {
        if (released) return;
        released = true;
        this.currentLockHolders.delete(lockKey);
      },
    };

    // Install holder (atomic write; no await needed for the write itself,
    // but function remains async per contract).
    this.currentLockHolders.set(lockKey, handle);

    return handle;
  }

  /**
   * Gap #7 — realm B lookup.
   * Check whether the permanent breaker is tripped for (carrier, model).
   * No lock needed for read (per spec: read-side needs no mutex).
   */
  isCarrierModelBroken(carrier: string, model: string): boolean {
    const key = `${carrier}|${model}`;
    return this.perCarrierModel.has(key);
  }

  /**
   * Gap #7 — realm A transient cooldown peek.
   * Returns remaining ms in cooldown, or null if none active / expired.
   */
  peekTransientCooldown(carrier: string, key: string): number | null {
    const entry = this.perKey.get(key);
    if (!entry) return null;
    const remaining = entry.cooldownUntilMs - Date.now();
    if (remaining <= 0) {
      // Cooldown expired — clean it up to avoid stale reads.
      this.perKey.delete(key);
      return null;
    }
    return remaining;
  }

  /**
   * Gap #7 — realm B permanent breaker trip.
   * CONTRACT (per spec): caller MUST await acquireBreakerLock first
   * and hold the LockHandle before calling this. If the caller doesn't
   * hold the lock, behavior is undefined (race on breaker transition).
   */
  async tripPermanentBreaker(
    carrier: string,
    model: string,
    shape: string,
    reason: string,
  ): Promise<void> {
    const key = `${carrier}|${model}`;
    // Permanent breaker TTL is ∞; store breakerTrippedAtMs as epoch ms.
    this.perCarrierModel.set(key, {
      breakerTrippedAtMs: Date.now(),
      shape,
      reason,
    });
  }

  /**
   * Gap #7 — realm A transient cooldown mark.
   * CONTRACT (per spec): caller MUST await acquireBreakerLock first
   * and hold the LockHandle before calling this.
   */
  async markTransientCooldown(
    carrier: string,
    key: string,
    reason: string,
    ttlMs = TRANSIENT_COOLDOWN_DEFAULT_MS,
  ): Promise<void> {
    this.perKey.set(key, {
      cooldownUntilMs: Date.now() + ttlMs,
      reason,
    });
  }

  /**
   * Admin hot-toggle (gap #6 e2e smoke phase 5) — clear permanent breaker
   * for a (carrier, model) pair so the route can be re-tested live.
   * Contract: same as tripPermanentBreaker; caller holds the mutex.
   */
  async clearCarrierModel(carrier: string, model: string): Promise<void> {
    const key = `${carrier}|${model}`;
    this.perCarrierModel.delete(key);
  }
}

/** Module singleton — gap #7 / #14 two-realm breaker registry. */
export const breaker = new CircuitBreaker();
