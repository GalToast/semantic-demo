// shapes-table.mjs — canned (carrier, model) error shapes for Phase-4 adversarial harness
// Keyed by composite `${carrier}/${model}` covering all carriers cited in spec.

export const SHAPES_TABLE = new Map([
  // kilo family
  ['kilo/glm-5.2',          { statusCode: 200, body: { ok: true, content: 'glm-5.2 happy', model_id: 'glm-5.2' } }],
  ['kilo/glm-5.1',          { statusCode: 200, body: { ok: true, content: 'glm-5.1 fallback', model_id: 'glm-5.1' } }],
  ['kilo/deepseek-chat',    { statusCode: 402, body: { title: 'Paid Model - Credits Required', message: 'Add credits to continue, or switch to a free model', balance: -0.00003, buyCreditsUrl: 'https://kilo.example.com/buy', model_id: 'deepseek-chat' } }],
  ['kilo/step-3.7-flash:free', { statusCode: 200, body: { ok: true, content: 'step-3.7 happy', model_id: 'step-3.7-flash:free' } }],
  // openrouter family
  ['openrouter/glm-5.2',     { statusCode: 404, body: { message: 'Not found', code: 404, model_id: 'glm-5.2' } }],
  ['openrouter/glm-5.1',     { statusCode: 404, body: { message: 'Insufficient credits', code: 402, model_id: 'glm-5.1' } }],
  ['openrouter/deepseek-chat', { statusCode: 429, body: { message: 'Rate limited', code: 429, model_id: 'deepseek-chat' } }],
  // neuralwatt family
  ['neuralwatt/glm-5.2',    { statusCode: 402, body: { message: 'Insufficient credit balance', type: 'insufficient_credits', code: 'credit_balance_exhausted', model_id: 'glm-5.2' } }],
  ['neuralwatt/deepseek-chat', { statusCode: 402, body: { message: 'Insufficient credit balance', type: 'insufficient_credits', code: 'credit_balance_exhausted', model_id: 'deepseek-chat' } }],
  // poolside family
  ['poolside/laguna-s-2.1:free', { statusCode: 429, body: { message: 'Provider returned error', code: 429, metadata: { raw: 'poolside/laguna-s-2.1:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits...', provider_name: 'Poolside', is_byok: false }, model_id: 'laguna-s-2.1:free' } }],
  ['poolside/glm-5.2',      { statusCode: 200, body: { ok: true, content: 'glm-5.2 happy poolside', model_id: 'glm-5.2' } }],
  // nvidia family (first-byte veil target)
  ['nvidia/glm-5.2',        { statusCode: 200, body: { ok: true, content: 'glm-5.2 happy nvidia', model_id: 'glm-5.2' }, delayMs: 6000 }],
  ['nvidia/laguna-xs-2.1',  { statusCode: 200, body: { ok: true, content: 'xs-2.1 happy', model_id: 'laguna-xs-2.1' } }],
  // opencode-zen family
  ['opencode-zen/glm-5.2',  { statusCode: 401, body: { error: 'Unauthorized', message: 'CreditsError: Add credits', creditsUrl: 'https://opencode-zen.example.com/buy', model_id: 'glm-5.2' } }],
  ['opencode-zen/laguna-xs-2.1', { statusCode: 200, body: { ok: true, content: 'xs-2.1 happy zen', model_id: 'laguna-xs-2.1' } }],
  // zydit family
  ['zydit/deepseek-chat',   { statusCode: 502, body: { message: 'Upstream stream failed before output', willRetry: true, model_id: 'deepseek-chat' } }],
  ['zydit/laguna-s-2.1:free',{ statusCode: 200, body: { ok: true, content: 'laguna-s-2.1 happy zydit', model_id: 'laguna-s-2.1:free' } }],
  // extra combos to exceed 12
  ['neuralwatt/laguna-s-2.1:free', { statusCode: 429, body: { message: 'Rate limited', code: 429, model_id: 'laguna-s-2.1:free' } }],
  ['opencode-zen/step-3.7-flash:free', { statusCode: 200, body: { ok: true, content: 'step-3.7 happy zen', model_id: 'step-3.7-flash:free' } }],
  ['zydit/glm-5.2',         { statusCode: 502, body: { message: 'Upstream stream failed before output', willRetry: true, model_id: 'glm-5.2' } }],
]);

/** Lookup keyed path helper. */
export function lookupShape(carrier, model) {
  return SHAPES_TABLE.get(`${carrier}/${model}`) || null;
}

export const CARRIERS = {
  kilo: 'kilo',
  openrouter: 'openrouter',
  neuralwatt: 'neuralwatt',
  poolside: 'poolside',
  nvidia: 'nvidia',
  'opencode-zen': 'opencode-zen',
  zydit: 'zydit',
};

export const SHAPE_KEYS = Array.from(SHAPES_TABLE.keys());
