// gap #9 — in-memory carrier affine key map (prefers keys that recently succeeded
// on a particular (routeId, modelId) pair) + shared cooldown registry.
// Shared by KeyAffinityMap.recordTransientFailure and gap #7 realm A breaker.

export interface AffineKeyRecord {
  keyId: string;
  lastUsedAt: number;
  recentSuccessCount: number;
}

export type AffineKeyList = AffineKeyRecord[];

/** Map<routeId x modelId -> AffineKeyList> — head = most-preferred (recently 200). */
export class KeyAffinityMap {
  private store: Map<string, AffineKeyList>;

  constructor() {
    this.store = new Map();
  }

  private keyFor(routeId: string, modelId: string): string {
    return `${routeId}\0${modelId}`;
  }

  /** Preference-ordered key list for (routeId, modelId); head = best.
   *  Never excludes cooling-down keys — caller consults KeyCooldownRegistry
   *  to skip / promote fresh keys. Affinity is NON-OWNING preference only. */
  getPreferredKeySequence(routeId: string, modelId: string): AffineKeyList {
    const list = this.store.get(this.keyFor(routeId, modelId));
    if (!list) return [];
    return list.slice();
  }

  /** After a 200 success on `keyId` for that (routeId, modelId):
   *  Promotes `keyId` to head AND bumps its recentSuccessCount. */
  recordSuccess(routeId: string, modelId: string, keyId: string): void {
    const k = this.keyFor(routeId, modelId);
    let list = this.store.get(k);
    if (!list) {
      list = [];
      this.store.set(k, list);
    }
    let record = list.find(r => r.keyId === keyId);
    if (!record) {
      record = { keyId, lastUsedAt: Date.now(), recentSuccessCount: 0 };
      list.unshift(record);
    } else {
      record.recentSuccessCount += 1;
      record.lastUsedAt = Date.now();
    }
    // Stable re-sort: success count DESC, then lastUsed DESC.
    list.sort((a, b) => {
      if (b.recentSuccessCount !== a.recentSuccessCount) {
        return b.recentSuccessCount - a.recentSuccessCount;
      }
      return b.lastUsedAt - a.lastUsedAt;
    });
    this.store.set(k, list);
  }

  /** Transient failure (429 / 502 / 503 / 504) on `keyId`:
   *  Demotes `keyId` to tail (lowest preference), decrements count,
   *  resets timestamp; triggers shared KeyCooldownRegistry. */
  recordTransientFailure(
    routeId: string,
    modelId: string,
    keyId: string,
    cooldownMs: number,
    registry: KeyCooldownRegistry,
    reason: string,
  ): void {
    const k = this.keyFor(routeId, modelId);
    let list = this.store.get(k);
    if (!list) {
      list = [];
      this.store.set(k, list);
    }
    let record = list.find(r => r.keyId === keyId);
    if (!record) {
      record = { keyId, lastUsedAt: Date.now(), recentSuccessCount: 0 };
      list.push(record);
    } else {
      record.recentSuccessCount = Math.max(0, record.recentSuccessCount - 1);
      record.lastUsedAt = Date.now();
      // Move this record to tail: remove from current position.
      const idx = list.indexOf(record);
      if (idx >= 0) list.splice(idx, 1);
      list.push(record);
    }
    // Single shared TTL bookkeeping — no double-cooldown.
    registry.coolDownKey(routeId, keyId, reason, cooldownMs);
    this.store.set(k, list);
  }

  /** Clear affinity for (routeId, modelId) — called when the per-carrier breaker
   *  goes permanent. */
  clearForRouteModel(routeId: string, modelId: string): void {
    this.store.delete(this.keyFor(routeId, modelId));
  }

  /** Debug + test count of distinct (routeId, modelId) entries. */
  size(): number {
    return this.store.size;
  }
}

/** Shared cooldown registry — same TTL bookkeeping for gap #7 realm A breaker
 *  and KeyAffinityMap transient-failure cooldown. Single source of truth. */
export interface KeyCooldownRegistry {
  /** Idempotent: fresh call resets TTL. */
  coolDownKey(routeId: string, keyId: string, reason: string, ttlMs: number): void;

  remainingCooldownMs(routeId: string, keyId: string): number;

  isCoolingDown(routeId: string, keyId: string): boolean;

  releaseKey(routeId: string, keyId: string): void;

  clearForRoute(routeId: string): void;

  activeCooldownCount(): number;
}

export class InMemoryKeyCooldownRegistry implements KeyCooldownRegistry {
  private store: Map<string, { expiresAt: number; reason: string }>;

  constructor() {
    this.store = new Map();
  }

  private registryKey(routeId: string, keyId: string): string {
    return `${routeId}\0${keyId}`;
  }

  coolDownKey(routeId: string, keyId: string, reason: string, ttlMs: number): void {
    this.store.set(this.registryKey(routeId, keyId), {
      expiresAt: Date.now() + ttlMs,
      reason,
    });
  }

  remainingCooldownMs(routeId: string, keyId: string): number {
    const entry = this.store.get(this.registryKey(routeId, keyId));
    if (!entry) return 0;
    const remaining = entry.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  isCoolingDown(routeId: string, keyId: string): boolean {
    return this.remainingCooldownMs(routeId, keyId) > 0;
  }

  releaseKey(routeId: string, keyId: string): void {
    this.store.delete(this.registryKey(routeId, keyId));
  }

  clearForRoute(routeId: string): void {
    const prefix = `${routeId}\0`;
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
      }
    }
  }

  activeCooldownCount(): number {
    const now = Date.now();
    let count = 0;
    for (const entry of this.store.values()) {
      if (entry.expiresAt > now) count += 1;
    }
    return count;
  }
}
