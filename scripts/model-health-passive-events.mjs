/* model-health-passive-events.mjs
 * Passive worker-event normalizer for the model-health evidence ledger.
 *
 * Accepts raw worker metadata / completion / event records (variadic, or arrays
 * of them) emitted by external_subagent workers and worker-health tooling, and
 * returns ONLY secret-free, identity-complete, settled worker-proof evidence
 * records ready to feed `buildLedger({ workerProof })`.
 *
 * Design invariants (verified by tests/model-health-passive-events-contract.mjs):
 *  - PURE: no network, timers, persistence, or filesystem writes.
 *  - Does NOT guess missing identity: a missing target / route / model => record
 *    is dropped, never fabricated.
 *  - Only settled / successful worker evidence is accepted. A mere "running"
 *    status, catalog visibility, or assistant self-identification is NOT proof.
 *  - Records carrying sensitive keys or secret-like strings are dropped (never
 *    redacted-then-kept), so the provenance chain stays secret-free.
 *  - Output is explicitly tagged as worker proof (directChatProof:false) with
 *    source + harness metadata, distinct from direct-chat proof.
 */

// Mirror the ledger's secret hygiene so dropped input never leaks downstream.
const SECRET_PATTERN = /(?:bearer\s+\S{12,}|sk-[a-z0-9]{16,}|rk-[a-z0-9]{16,}|pk-[a-z0-9]{16,}|AIza[a-z0-9]{20,}|gh[pousr]_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{20,})/i
const SENSITIVE_KEY = /^(?:api[_-]?key|authorization|cookie|credential|headers?|password|secret|token|private[_-]?key|options?|env)$/i

// Worker states that constitute *settled, successful* completion evidence.
// Anything else (running, pending, catalog-visible, self-identified, failed...)
// is NOT worker proof and is dropped.
const SETTLED_SUCCESS = new Set([
  'settled', 'success', 'successful', 'succeeded',
  'completed', 'complete', 'done', 'finished', 'ok'
])

// Values that must NEVER be mistaken for proven worker evidence even if they
// look "good". Catalog visibility, running, and self-identification are
// explicitly excluded.
const FORBIDDEN_STATUSES = new Set([
  'running', 'pending', 'queued', 'starting', 'started', 'initializing',
  'initialised', 'idle', 'active', 'busy', 'in_progress', 'in-progress',
  'catalog-visible', 'catalog_visible', 'visible',
  'self-identified', 'self_identified', 'identified', 'self-identifying',
  'healthy', 'live', 'online',
  'failed', 'error', 'errored', 'timeout', 'timed_out', 'cancelled',
  'canceled', 'aborted', 'rejected'
])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function pickString(record, ...keys) {
  for (const k of keys) {
    const v = record[k]
    if (typeof v === 'string') {
      const t = v.trim()
      if (t) return t
    }
  }
  return null
}

function toIso(value) {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  const ms = typeof d.getTime === 'function' ? d.getTime() : d.valueOf()
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

function containsSecret(value) {
  if (typeof value === 'string') return SECRET_PATTERN.test(value)
  if (!isPlainObject(value)) return false
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(k)) return true
    if (containsSecret(v)) return true
  }
  return false
}

function isDirectChat(record) {
  if (record.directChatProof === true) return true
  const src = pickString(record, 'source', 'origin', 'kind')
  if (!src) return false
  return /^(direct[-_]?chat|chat|main[-_]?lane|mainlane)$/i.test(src)
}

function normalizeStatus(raw) {
  if (typeof raw !== 'string') return null
  return raw.trim().toLowerCase().replaceAll('_', '-')
}

function normalizeOne(record) {
  if (!isPlainObject(record)) return null
  // Drop anything that could carry secrets; we never redact-then-keep.
  if (containsSecret(record)) return null

  const target = pickString(record, 'target', 'environment', 'device', 'host')
  const route = pickString(record, 'route', 'routePath', 'route_path')
  const modelId = pickString(record, 'modelId', 'model', 'requested_model', 'requestedModel')

  // Never guess missing identity.
  if (!target || !route || !modelId) return null

  // Reject direct-chat completions: those are not worker proof.
  if (isDirectChat(record)) return null

  const rawStatus = pickString(record, 'status', 'state', 'outcome')
  const status = normalizeStatus(rawStatus)
  if (!status) return null
  if (FORBIDDEN_STATUSES.has(status)) return null
  if (!SETTLED_SUCCESS.has(status)) return null

  const statusCode = Number(record.statusCode ?? record.code ?? record.httpStatus)
  if (Number.isFinite(statusCode) && statusCode >= 400) return null

  const observedAt = toIso(
    record.observedAt ??
      record.completedAt ??
      record.finishedAt ??
      record.timestamp ??
      record.ts ??
      record.time
  )
  if (!observedAt) return null

  const source = pickString(record, 'source', 'origin') || 'worker-event'
  const harness = pickString(record, 'harness') || 'external_subagent'

  const proof = {
    target,
    route,
    modelId,
    observedAt,
    status: 'worker-proven',
    source,
    harness,
    directChatProof: false
  }

  const workerId = pickString(record, 'workerId', 'id', 'worker_id')
  if (workerId) proof.workerId = workerId
  const sessionId = pickString(record, 'sessionId', 'session_id')
  if (sessionId) proof.sessionId = sessionId
  if (rawStatus) proof.rawStatus = rawStatus
  if (Number.isFinite(statusCode)) proof.statusCode = statusCode

  return proof
}

/**
 * Normalize one or more raw worker metadata / completion / event records into
 * secret-free worker-proof evidence for the evidence ledger.
 *
 * @param {...(object|Array)} records - variadic; each arg may be a single
 *   record or an array of records (arrays are flattened).
 * @returns {Array<object>} only the accepted, normalized worker-proof records.
 *   Malformed records, records missing identity, records with sensitive data,
 *   non-settled records, and direct-chat records are silently dropped.
 */
export function normalizeWorkerEvents(...records) {
  const flat = []
  const push = (item) => {
    if (Array.isArray(item)) {
      for (const inner of item) push(inner)
    } else if (item != null) {
      flat.push(item)
    }
  }
  for (const item of records) push(item)

  const accepted = []
  for (const record of flat) {
    const proof = normalizeOne(record)
    if (proof) accepted.push(proof)
  }
  return accepted
}

export default normalizeWorkerEvents
