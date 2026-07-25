/**
 * Normalize tmp/model-tier-matrix.json capabilityMatrix tiers into
 * v2-failover-overlay-compatible flat array.
 *
 * Drops WARM_CADAVER entries; keeps T0 + CONDITIONAL + SEASONAL.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('tmp/model-tier-matrix.json', 'utf8'));
const cm = raw.capabilityMatrix;

// Tier → reliability mapping
const tierReliability = {
  T0: 'HIGH',
  CONDITIONAL_LENGTH_LIMITED: 'MEDIUM',
  CONDITIONAL: 'MEDIUM',
  CONDITIONAL_SLOW_THROUGHPUT: 'MEDIUM',
  CONDITIONAL_RATE_LIMITED: 'MEDIUM',
  SEASONAL_HEALTHY: 'MEDIUM',
};

function getRoutingTier(entry) {
  if (entry.tier === 'T0') return 'T0';
  const s = entry.status || '';
  if (s.startsWith('CONDITIONAL')) return 'CONDITIONAL';
  if (s.startsWith('SEASONAL')) return 'SEASONAL';
  return 'WARM_CADAVER';
}

function getFailMode(entry) {
  // Only for CONDITIONAL entries
  const status = entry.status || '';
  if (status.includes('LENGTH_LIMITED')) return 'content_truncated';
  if (status.includes('SLOW')) return 'slow_throughput';
  if (status.includes('RATE_LIMITED')) return 'rate_limited';
  if (status === 'CONDITIONAL') return 'partial_compatibility';
  return undefined;
}

function normalizeEntry(entry) {
  const routingTier = getRoutingTier(entry);

  // Quality scores — use what's available or defaults
  const visionDefault = 0;
  const toolUseDefault = 1;
  const codeDefault = 2;

  let visionScore, toolUseScore, codeScore;

  if ('vision' in entry) {
    visionScore = entry.vision ? 1 : visionDefault;
  } else if (routingTier === 'CONDITIONAL') {
    visionScore = 0; // CONDITIONAL entries default to no-vision
  } else {
    visionScore = visionDefault;
  }

  if ('toolUse' in entry) {
    toolUseScore = entry.toolUse ? 1 : toolUseDefault;
  } else if (routingTier === 'CONDITIONAL') {
    toolUseScore = toolUseDefault;
  } else {
    toolUseScore = toolUseDefault;
  }

  if ('code' in entry) {
    codeScore = entry.code ? 2 : codeDefault;
  } else if (routingTier === 'CONDITIONAL') {
    codeScore = codeDefault;
  } else {
    codeScore = codeDefault;
  }

  const qualityPerCapability = {
    vision: visionScore,
    toolUse: toolUseScore,
    code: codeScore,
    default: codeDefault,
  };

  // Context window — default 128k unless T0 says otherwise
  const ctxWindow = entry.contextWindow ?? 128000;

  // Streaming — default true unless entry says false
  const streamingSmooth = entry.streamingSmooth ?? true;

  // Tool execution reliability
  const reliability = tierReliability[entry.status] ?? tierReliability[routingTier] ?? 'MEDIUM';

  // Carrier type — "agnes" is auto, others are their own route ID
  const carrierType = entry.carrier === 'agnes' ? 'auto' : entry.carrier;

  return {
    modelId: entry.id,
    routeId: entry.carrier,
    carrierType: carrierType,
    contextWindowLimit: ctxWindow,
    qualityPerCapability: qualityPerCapability,
    streamingSmooth: streamingSmooth,
    toolExecutionReliability: reliability,
    routingTier: routingTier,
    // Optional auto-derived
    canVision: qualityPerCapability.vision > 0,
    canToolUse: qualityPerCapability.toolUse > 0,
    canCode: qualityPerCapability.code > 0,
    longContext: ctxWindow >= 32000,
    streamingSafe: streamingSmooth,
    // Route-specific metadata
    ...(entry.qualified && { qualified: entry.qualified }),
    ...(entry.status !== entry.tier && entry.status && { status: entry.status }),
    ...((routingTier === 'CONDITIONAL') && { failMode: getFailMode(entry) }),
    ...((routingTier === 'SEASONAL' && entry.seasonalStatus) && { seasonalStatus: entry.seasonalStatus }),
  };
}

// Collect entries in tier order: T0 → CONDITIONAL → SEASONAL
const kept = [];
const dropped = [];

for (const entry of cm.t0 ?? []) {
  kept.push(normalizeEntry({ ...entry, tier: 'T0' }));
}
for (const entry of cm.conditional ?? []) {
  kept.push(normalizeEntry(entry));
}
for (const entry of cm.seasonal ?? []) {
  kept.push(normalizeEntry(entry));
}
for (const entry of cm.warmCadavers ?? []) {
  dropped.push(entry.id);
}

// Write output
writeFileSync(
  'tmp/v2-overlay-matrix.json',
  JSON.stringify(kept, null, 2) + '\n',
  'utf8',
);

console.log(`Done. ${kept.length} entries written, ${dropped.length} WARM_CADAVER dropped.`);

// Quick sanity check
if (kept.length !== 8) {
  console.error(`ERROR: expected 8 entries, got ${kept.length}`);
  process.exit(1);
}
if (dropped.length !== 11) {
  console.error(`WARNING: expected 11 dropped, got ${dropped.length}`);
}

// Verify no WARM_CADAVER survived
const hasWarm = kept.some(e => e.routingTier === 'WARM_CADAVER');
if (hasWarm) {
  console.error('ERROR: WARM_CADAVER entries found in output!');
  process.exit(1);
}

console.log('All checks passed.');
