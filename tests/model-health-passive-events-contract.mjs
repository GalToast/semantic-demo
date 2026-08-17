/* Contract test for scripts/model-health-passive-events.mjs
 * Verifies the passive worker-event normalizer feeding `workerProof` into the
 * evidence ledger (scripts/model-health-ledger.mjs).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { normalizeWorkerEvents } from '../scripts/model-health-passive-events.mjs'
import { buildLedger } from '../scripts/model-health-ledger.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, '../scripts/model-health-passive-events.mjs'), 'utf8')

const NOW = new Date('2026-08-16T12:00:00.000Z').getTime()

// 1. module exposes the pure normalizer (named + default) and nothing else
{
  assert.equal(typeof normalizeWorkerEvents, 'function')
  const mod = await import('../scripts/model-health-passive-events.mjs')
  assert.equal(typeof mod.normalizeWorkerEvents, 'function')
  assert.equal(typeof mod.default, 'function')
  assert.equal(mod.default, mod.normalizeWorkerEvents)
}

// 2. pure module: no network, timers, persistence, or filesystem writes
{
  assert.equal(SRC.includes('setTimeout'), false)
  assert.equal(SRC.includes('setInterval'), false)
  assert.equal(SRC.includes('setImmediate'), false)
  assert.equal(SRC.includes('fetch('), false)
  assert.equal(SRC.includes('fetch ('), false)
  assert.equal(SRC.includes('XMLHttpRequest'), false)
  assert.equal(SRC.includes('writeFile'), false)
  assert.equal(SRC.includes('appendFile'), false)
  assert.equal(/require\(['"]node:fs['"]\)/.test(SRC), false)
  assert.equal(SRC.includes('fs'), false)
}

// 3. a settled worker completion becomes exactly one worker-proof record
{
  const out = normalizeWorkerEvents({
    target: 'laptop',
    route: '/kilo/v1',
    modelId: 'alpha',
    status: 'settled',
    observedAt: '2026-08-16T11:50:00.000Z',
    source: 'external_subagent',
    harness: 'external_subagent',
    workerId: 'w-1'
  })

  assert.equal(out.length, 1)
  const p = out[0]
  assert.equal(p.target, 'laptop')
  assert.equal(p.route, '/kilo/v1')
  assert.equal(p.modelId, 'alpha')
  assert.equal(p.observedAt, '2026-08-16T11:50:00.000Z')
  assert.equal(p.status, 'worker-proven')
  assert.equal(p.source, 'external_subagent')
  assert.equal(p.harness, 'external_subagent')
  assert.equal(p.directChatProof, false)
  assert.equal(p.workerId, 'w-1')
}

// 4. variadic + nested arrays are flattened and each accepted record returned
{
  const a = { target: 'laptop', route: '/kilo/v1', modelId: 'a', status: 'success', observedAt: '2026-08-16T11:50:00.000Z' }
  const b = { target: 'phone', route: '/agnes/v1', model: 'b', status: 'completed', observedAt: '2026-08-16T11:51:00.000Z' }
  const c = { target: 'laptop', route: '/kilo/v1', requested_model: 'c', status: 'done', observedAt: '2026-08-16T11:52:00.000Z' }

  const out = normalizeWorkerEvents(a, [b, [c]])
  assert.equal(out.length, 3)
  assert.deepEqual(out.map((p) => p.modelId).sort(), ['a', 'b', 'c'])
  // requested_model / model aliases normalized into modelId
  assert.equal(out.find((p) => p.modelId === 'b').route, '/agnes/v1')
  assert.equal(out.find((p) => p.modelId === 'c').modelId, 'c')
}

// 5. missing model identity is dropped (no guessing)
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', status: 'settled', observedAt: '2026-08-16T11:50:00.000Z'
  })
  assert.equal(out.length, 0)
}

// 6. missing route identity is dropped (no guessing)
{
  const out = normalizeWorkerEvents({
    target: 'laptop', modelId: 'alpha', status: 'settled', observedAt: '2026-08-16T11:50:00.000Z'
  })
  assert.equal(out.length, 0)
}

// 7. missing target identity is dropped (no guessing)
{
  const out = normalizeWorkerEvents({
    route: '/kilo/v1', modelId: 'alpha', status: 'settled', observedAt: '2026-08-16T11:50:00.000Z'
  })
  assert.equal(out.length, 0)
}

// 8. malformed records are ignored (null, primitive, array, non-object)
{
  const out = normalizeWorkerEvents(null, undefined, 42, 'worker', [1, 2, 3], { not: 'an object but is' })
  assert.equal(out.length, 0)
}

// 9. records with sensitive keys are dropped, never redacted-then-kept
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
    observedAt: '2026-08-16T11:50:00.000Z', headers: { authorization: 'Bearer x' }
  })
  assert.equal(out.length, 0)
}

// 10. records with secret-like strings are dropped
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
    observedAt: '2026-08-16T11:50:00.000Z', note: 'sk-abcdefghijklmnop'
  })
  assert.equal(out.length, 0)
}

// 11. a mere "running" status is NOT proven worker evidence
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'running', observedAt: '2026-08-16T11:50:00.000Z'
  })
  assert.equal(out.length, 0)
}

// 12. catalog visibility is NOT proven worker evidence
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog_visible', observedAt: '2026-08-16T11:50:00.000Z'
  })
  assert.equal(out.length, 0)
}

// 13. assistant self-identification is NOT proven worker evidence
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'self-identified', observedAt: '2026-08-16T11:50:00.000Z'
  })
  assert.equal(out.length, 0)
}

// 14. direct-chat completions are rejected (they are not worker proof)
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
    observedAt: '2026-08-16T11:50:00.000Z', source: 'chat', directChatProof: true
  })
  assert.equal(out.length, 0)
}

// 15. non-2xx statusCode rejects the record even when status reads success
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'success', statusCode: 500, observedAt: '2026-08-16T11:50:00.000Z'
  })
  assert.equal(out.length, 0)
}

// 16. unparseable observedAt drops the record
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled', observedAt: 'not-a-date'
  })
  assert.equal(out.length, 0)
}

// 17. output is secret-free even when input carried extra fields
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
    observedAt: '2026-08-16T11:50:00.000Z', token: 'sk-abcdefghijklmnop', password: 'hunter2'
  })
  assert.equal(out.length, 0) // dropped whole record because it carried secrets
}

// 18. normalized status maps to the ledger's "proven" classification
{
  const out = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha',
    status: 'completed', completedAt: '2026-08-16T11:50:00.000Z', source: 'external_subagent'
  })
  assert.equal(out.length, 1)
  assert.equal(out[0].status, 'worker-proven')
}

// 19. explicit source/harness metadata is preserved in output
{
  const out = normalizeWorkerEvents({
    target: 'phone', route: '/agnes/v1', modelId: 'beta',
    status: 'success', observedAt: '2026-08-16T11:50:00.000Z',
    source: 'worker-health', harness: 'worker-health', sessionId: 's-9'
  })
  assert.equal(out[0].source, 'worker-health')
  assert.equal(out[0].harness, 'worker-health')
  assert.equal(out[0].sessionId, 's-9')
}

// 20. input is not mutated by normalization
{
  const input = {
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'settled',
    observedAt: '2026-08-16T11:50:00.000Z', source: 'external_subagent'
  }
  const snapshot = JSON.parse(JSON.stringify(input))
  normalizeWorkerEvents(input)
  assert.deepEqual(input, snapshot)
}

// 21. integration: normalized worker proof feeds the ledger as deployable
{
  const workerProof = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha',
    status: 'settled', observedAt: '2026-08-16T11:50:00.000Z', source: 'external_subagent'
  })

  const ledger = buildLedger({
    catalog: [{ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog-visible', observedAt: '2026-08-16T11:59:00.000Z' }],
    routeHealth: [{ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog_visible', statusCode: 200, observedAt: '2026-08-16T11:59:00.000Z' }],
    workerProof,
    now: NOW
  })

  const key = 'laptop\u0000/kilo/v1\u0000alpha'
  assert.equal(ledger.entries[key].rails.workerProof.status, 'worker-proven')
  assert.equal(ledger.entries[key].deployability, 'deployable')
}

// 22. worker proof alone (no chat) is still deployable per ledger reason
{
  const workerProof = normalizeWorkerEvents({
    target: 'laptop', route: '/kilo/v1', modelId: 'alpha',
    status: 'success', observedAt: '2026-08-16T11:50:00.000Z'
  })
  const ledger = buildLedger({
    catalog: [{ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog-visible', observedAt: '2026-08-16T11:59:00.000Z' }],
    routeHealth: [{ target: 'laptop', route: '/kilo/v1', modelId: 'alpha', status: 'catalog_visible', statusCode: 200, observedAt: '2026-08-16T11:59:00.000Z' }],
    workerProof,
    now: NOW
  })
  const key = 'laptop\u0000/kilo/v1\u0000alpha'
  assert.equal(ledger.entries[key].deployabilityReason, 'fresh-worker-proven')
}

console.log('model-health-passive-events-contract: ok')
