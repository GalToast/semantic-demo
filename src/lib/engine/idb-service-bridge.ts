/**
 * @lib/engine/idb-service-bridge.ts — Bridge to the legacy IDB service.
 *
 * The IDB service module is currently in `js/modules/`. The semantic-search
 * cache port in `src/lib/search/cache.ts` is the sole remaining consumer; the
 * bridge keeps the cross-boundary import explicit and narrow until the IDB
 * service itself is ported in a future wave.
 */

export * from '../utils/idb-service';
