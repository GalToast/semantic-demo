// rail-status.ts — the banner truth-split decision (pure, testable).
//
// Story: the UI banner must stop conflating "API down" with "semantic lane down".
// Signals:
//   source     — 'api' (live round-trip ok) | 'fallback' (engine fell back to the
//               local index/mock — the pre-existing resultSource in search-engine.ts)
//   railAlive  — semantic_lane_health probe result (null while unknown)
//   degraded   — the search response's degraded flag (semantic scoring off)
//
// The truth table IS the unit test (rail-status.test.ts).

export type RailBanner =
  | { key: 'live'; copy: string }
  | { key: 'fallback'; copy: string }
  | { key: 'demo'; copy: string }

export function railBanner(
  source: 'api' | 'fallback',
  railAlive: boolean | null,
  degraded: boolean | null,
): RailBanner {
  if (source === 'fallback') {
    return { key: 'demo', copy: 'Demo data — live API unreachable' }
  }
  // source === 'api': live round-trip worked.
  if (railAlive === false || degraded === true) {
    return {
      key: 'fallback',
      copy: 'Live records · semantic lane warming (lexical fallback)',
    }
  }
  return { key: 'live', copy: 'Live search' }
}

/** One-shot, best-effort semantic-rail probe. Never blocks, never throws.
 *  Resolves true on rail-heartbeat, false on any failure/timeout. */
export async function probeSemanticRail(timeoutMs = 2500): Promise<boolean | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(
      `${location.pathname}?action=semantic_lane_health`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } },
    )
    clearTimeout(t)
    if (!res.ok) return false
    const body = await res.json().catch(() => null)
    if (body && typeof body === 'object') {
      const ok = (body as { ok?: boolean }).ok
      if (typeof ok === 'boolean') return ok
    }
    return true // 2xx without a health body — assume rail up (conservative)
  } catch {
    return false
  }
}