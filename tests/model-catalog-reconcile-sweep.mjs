#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
    extractModelIds,
    formatMarkdown,
    normalizeModelId,
    normalizeRoutePath,
    parseArgs,
    reconcileRuntimeCatalogue
} from '../scripts/reconcile-model-catalog.mjs'

let passed = 0
let failures = 0

function pass(message) {
    passed += 1
    console.log('  ✓ ' + message)
}

function check(value, message) {
    try {
        assert.ok(value)
        pass(message)
    } catch (error) {
        failures += 1
        console.error('  ✗ ' + message + ': ' + error.message)
    }
}

function equal(actual, expected, message) {
    try {
        assert.equal(actual, expected)
        pass(message)
    } catch (error) {
        failures += 1
        console.error('  ✗ ' + message + ': ' + error.message)
    }
}

console.log('\n=== runtime model-catalogue reconciliation ===')

equal(normalizeModelId(' Qwen/Qwen3.8-27B '), 'qwen/qwen3.8-27b', 'model IDs compare case-insensitively')
equal(normalizeRoutePath('http://127.0.0.1:8788/modelscope/v1/models'), '/modelscope/v1', 'route path strips models suffix')
assert.deepEqual(extractModelIds({ data: [{ id: 'b' }, { model: 'a' }, 'b'] }), ['a', 'b'])
pass('model IDs extract from OpenAI and string catalogues')
assert.deepEqual(parseArgs(['--format=json', '--max-age-ms=42', '--strict']).format, 'json')
equal(parseArgs(['--format=json', '--max-age-ms=42', '--strict']).maxAgeMs, 42, 'CLI freshness budget parses')
equal(parseArgs(['--format=json', '--max-age-ms=42', '--strict']).strict, true, 'CLI strict flag parses')

const now = Date.parse('2026-08-21T17:00:00.000Z')
const fresh = now - 1000
const stale = now - 20 * 60 * 1000
const local = 'http://127.0.0.1:8788'

const manifest = {
    schema_version: 1,
    generated_at: new Date(fresh).toISOString(),
    providers: [
        {
            provider: 'modelscope',
            base_url: local + '/modelscope/v1',
            catalog_status: 'ok',
            checked_at: new Date(fresh).toISOString(),
            models: [
                { id: 'DeepSeek-V4-Pro-0813', status: 'active', last_checked_at: new Date(fresh).toISOString() },
                { id: 'Qwen/Qwen3.8-27B', status: 'active', last_checked_at: new Date(fresh).toISOString() }
            ]
        },
        {
            provider: 'freeinference',
            base_url: 'https://freeinference.org/v1',
            catalog_status: 'ok',
            checked_at: new Date(fresh).toISOString(),
            models: [{ id: 'deepseek-v4-flash', status: 'active' }]
        }
    ]
}

const cache = {
    _v: 2,
    entries: {
        [local + '/catalog']: {
            url: local + '/catalog',
            fetchedAt: fresh,
            body: {
                routes: [
                    {
                        providerId: 'modelscope',
                        routePrefix: '/modelscope/v1',
                        baseUrl: local + '/modelscope/v1',
                        status: { keys: 2, activeKeys: 2, blockingCoolingRecords: 0, routeBackoff: false }
                    },
                    {
                        providerId: 'stale-provider',
                        routePrefix: '/stale/v1',
                        baseUrl: local + '/stale/v1',
                        status: { keys: 1, activeKeys: 1, blockingCoolingRecords: 0, routeBackoff: false }
                    },
                    {
                        providerId: 'degraded-provider',
                        routePrefix: '/degraded/v1',
                        baseUrl: local + '/degraded/v1',
                        status: {
                            keys: 1,
                            activeKeys: 1,
                            providerCoolingRecords: 1,
                            recentFailures: [{ model: 'degraded-model', status: 504 }, { status: 429 }],
                            routeBackoff: false
                        }
                    }
                ]
            }
        },
        [local + '/modelscope/v1/models']: {
            url: local + '/modelscope/v1/models',
            fetchedAt: fresh,
            body: { data: [{ id: 'deepseek-v4-pro-0813' }, { id: 'Qwen/Qwen3.8-27B' }, { id: 'new-upstream-model' }] }
        },
        [local + '/stale/v1/models']: {
            url: local + '/stale/v1/models',
            fetchedAt: stale,
            body: { data: [{ id: 'old-model' }] }
        },
        [local + '/degraded/v1/models']: {
            url: local + '/degraded/v1/models',
            fetchedAt: fresh,
            body: { data: [{ id: 'degraded-model' }, { id: 'healthy-sibling-model' }] }
        }
    }
}

const pickerSources = [
    {
        id: 'models.json',
        path: 'models.json',
        payload: {
            providers: {
                modelscope: {
                    baseUrl: local + '/modelscope/v1',
                    apiKey: 'secret-must-not-appear',
                    models: [
                        { id: 'DeepSeek-V4-Pro-0813' },
                        { id: 'picker-only-model' }
                    ]
                }
            }
        }
    },
    {
        id: 'model-providers.json',
        path: 'model-providers.json',
        payload: {
            modelProviders: {
                openai: [{ id: 'Qwen/Qwen3.8-27B', baseUrl: local + '/modelscope/v1' }]
            }
        }
    }
]

const report = reconcileRuntimeCatalogue({
    manifest,
    cache,
    pickerSources,
    now,
    maxAgeMs: 10 * 60 * 1000
})

const modelscope = report.routes.find((route) => route.routePath === '/modelscope/v1')
const staleRoute = report.routes.find((route) => route.routePath === '/stale/v1')
const pressureRoute = report.routes.find((route) => route.routePath === '/degraded/v1')
const externalRoute = report.routes.find((route) => route.routePath === '/v1')

equal(modelscope?.healthState, 'cataloged', 'fresh declared route is cataloged')
equal(modelscope?.cacheModelCount, 3, 'cache model count is preserved')
equal(modelscope?.manifestModelCount, 2, 'manifest model count is preserved')
equal(modelscope?.pickerModelCount, 3, 'picker model count merges both registries')
equal(staleRoute?.healthState, 'catalog_stale', 'stale route is explicit')
equal(pressureRoute?.healthState, 'cataloged', 'recent failures do not degrade the entire route')
equal(report.summary.healthCounts.degraded || 0, 0, 'report never emits provider-wide degraded health state')
equal(pressureRoute?.routePressure.modelSpecificFailureCount, 1, 'model-specific failure count is isolated')
equal(pressureRoute?.routePressure.unknownScopeFailureCount, 1, 'unknown-scope failure count is isolated')
equal(pressureRoute?.modelHealth.find((model) => model.id === 'degraded-model')?.state, 'recent_failure', 'failed model is marked specifically')
equal(pressureRoute?.modelHealth.find((model) => model.id === 'healthy-sibling-model')?.state, 'cataloged', 'healthy sibling remains independently cataloged')
check(report.issues.some((issue) => issue.code === 'model_recent_failure' && issue.modelId === 'degraded-model'), 'model-specific failure issue is emitted')
check(report.issues.some((issue) => issue.code === 'route_unknown_scope_failure' && issue.routePath === '/degraded/v1'), 'unknown-scope pressure is explicit')
equal(externalRoute?.healthState, 'manifest_only', 'external manifest route is not mislabelled unconfigured')
check(report.issues.some((issue) => issue.code === 'cache_model_missing_from_manifest' && issue.modelId === 'new-upstream-model'), 'new upstream model is flagged for manifest refresh')
check(report.issues.some((issue) => issue.code === 'picker_model_missing_from_cache' && issue.modelId === 'picker-only-model'), 'picker-only model is flagged for cache drift')
check(report.issues.some((issue) => issue.code === 'route_catalog_stale' && issue.routePath === '/stale/v1'), 'stale route issue includes route path')
check(!JSON.stringify(report).includes('secret-must-not-appear'), 'reconciliation report is secret-free')
check(formatMarkdown(report).includes('| /modelscope/v1 | modelscope | cataloged |'), 'markdown includes route state')
equal(report.policy.cataloguePresenceIsNotChatProof, true, 'report preserves catalogue-versus-chat invariant')

console.log('\n=== runtime model-catalogue reconciliation COMPLETE ===')
console.log('Passed: ' + passed + ', Failed: ' + failures)
if (failures) process.exit(1)
