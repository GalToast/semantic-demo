/**
 * Browser-level semantic-thread worker fault injection.
 *
 * The test keeps the production Worker boundary intact. It only rewrites the
 * built worker response in the browser context, then uses a tiny control route
 * to make the first worker fail and the retry worker return a valid fixture.
 */

import { test, expect } from '@playwright/test'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')
const APP_PATH = process.env.TEST_APP_PATH || '/dist/svelte/index.html'
const POINT_COUNT = 8406

const WORKER_FAULT_HOOK = `
;(() => {
    const originalOnMessage = self.onmessage
    self.onmessage = async (event) => {
        if (event.data?.type === 'LOAD_THREADS') {
            const controlResponse = await fetch('/__semantic-thread-fault-control')
            const mode = await controlResponse.text()

            if (mode === 'error') {
                self.postMessage({
                    type: 'ERROR',
                    requestId: event.data.requestId,
                    payload: { message: 'Injected semantic thread worker failure' }
                })
                return
            }

            if (mode === 'success') {
                const nodes = {}
                for (let index = 0; index < ${POINT_COUNT}; index += 1) {
                    nodes[String(index)] = {
                        neighbors: index === 0 ? [{ lead_id: 'lead-2' }] : []
                    }
                }

                self.postMessage({
                    type: 'LOAD_THREADS_SUCCESS',
                    requestId: event.data.requestId,
                    payload: {
                        neighborEntries: [
                            [
                                'lead-1',
                                {
                                    leadId: 'lead-1',
                                    name: 'Injected worker fixture',
                                    city: 'Conroe',
                                    status: 'active',
                                    signalScore: 1,
                                    neighbors: [
                                        {
                                            leadId: 'lead-2',
                                            score: 1,
                                            semanticScore: 1,
                                            sameCity: true,
                                            sameStatus: true,
                                            bridgeScore: 0,
                                            signalScore: 1,
                                            threadType: 'local_semantic_neighbor',
                                            relationshipRole: 'semantic_similarity',
                                            relationshipAxis: 'test',
                                            roleReason: 'browser fault fixture',
                                            reason: 'browser fault fixture'
                                        }
                                    ]
                                }
                            ]
                        ],
                        artifactName: 'semantic_threads_ui.dat',
                        bundle: { nodes }
                    }
                })
                return
            }

            if (mode === 'timeout') return
        }

        return originalOnMessage(event)
    }
})()
`

async function installSemanticThreadFaultHarness(page, modes) {
    const context = page.context()
    const telemetry = {
        workerAssetPatched: 0,
        controlCalls: 0,
        workerUrls: []
    }

    page.on('worker', (worker) => telemetry.workerUrls.push(worker.url()))

    await context.route('**/assets/data-worker-*.js', async (route) => {
        const response = await route.fetch()
        const body = await response.text()

        if (!body.includes('onmessage')) {
            await route.fulfill({ response })
            return
        }

        telemetry.workerAssetPatched += 1
        const headers = { ...response.headers() }
        delete headers['content-length']
        delete headers['content-encoding']
        await route.fulfill({
            status: response.status(),
            headers,
            body: `${body}\n${WORKER_FAULT_HOOK}`
        })
    })

    await context.route('**/__semantic-thread-fault-control', async (route) => {
        const mode = modes[telemetry.controlCalls] || modes.at(-1) || 'error'
        telemetry.controlCalls += 1
        await route.fulfill({ status: 200, contentType: 'text/plain', body: mode })
    })

    await context.route('**/data/semantic_space_layout_manifest.json*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                generated_at: '2026-08-06',
                method: 'browser-fault-fixture',
                rows: POINT_COUNT,
                edges: 1,
                thread_path: 'semantic_threads_ui.dat',
                data_path: 'data.dat'
            })
        })
    })

    return telemetry
}

async function waitForSemanticThreadReady(page) {
    await page.waitForFunction(
        () => {
            const state = window.__LEGACY_APP_STATE__
            return (
                state?.semanticThreadsStatus === 'ready' &&
                state?.semanticSpaceLayoutStatus === 'ready' &&
                state?.semanticThreadArtifactName === 'semantic_threads_ui.dat'
            )
        },
        { timeout: 35_000 }
    )
}

test('real worker error is recovered by the retry worker', async ({ page }) => {
    test.setTimeout(45_000)

    const telemetry = await installSemanticThreadFaultHarness(page, ['error', 'success'])

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE_URL}${APP_PATH}?anchor=0&nodemo=1`, { waitUntil: 'domcontentloaded' })
    await waitForSemanticThreadReady(page)

    const state = await page.evaluate(() => {
        const value = window.__LEGACY_APP_STATE__
        return {
            status: value?.semanticThreadsStatus,
            layoutStatus: value?.semanticSpaceLayoutStatus,
            retryAttempt: value?.semanticThreadsRetryAttempt,
            neighborCount: value?.semanticNeighborMapByLeadId?.size ?? 0
        }
    })

    expect(telemetry.workerAssetPatched).toBeGreaterThan(0)
    expect(telemetry.controlCalls).toBe(2)
    expect(telemetry.workerUrls.filter((url) => url.includes('data-worker')).length).toBeGreaterThanOrEqual(2)
    expect(state).toEqual({
        status: 'ready',
        layoutStatus: 'ready',
        retryAttempt: 0,
        neighborCount: 1
    })
})

test('worker construction failure recovers without a main-thread fallback', async ({ page }) => {
    test.setTimeout(45_000)

    await page.addInitScript(() => {
        const NativeWorker = window.Worker
        let attempts = 0
        window.__SEMANTIC_WORKER_CONSTRUCTOR_ATTEMPTS__ = () => attempts
        window.Worker = class extends NativeWorker {
            constructor(...args) {
                attempts += 1
                if (attempts === 1) throw new Error('Injected Worker constructor failure')
                super(...args)
            }
        }
    })

    const telemetry = await installSemanticThreadFaultHarness(page, ['success'])

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE_URL}${APP_PATH}?anchor=0&nodemo=1`, { waitUntil: 'domcontentloaded' })
    await waitForSemanticThreadReady(page)

    const state = await page.evaluate(() => {
        const value = window.__LEGACY_APP_STATE__
        return {
            status: value?.semanticThreadsStatus,
            layoutStatus: value?.semanticSpaceLayoutStatus,
            retryAttempt: value?.semanticThreadsRetryAttempt,
            neighborCount: value?.semanticNeighborMapByLeadId?.size ?? 0,
            constructorAttempts: window.__SEMANTIC_WORKER_CONSTRUCTOR_ATTEMPTS__?.() ?? 0
        }
    })

    expect(state.constructorAttempts).toBeGreaterThanOrEqual(2)
    expect(telemetry.workerAssetPatched).toBeGreaterThan(0)
    expect(telemetry.controlCalls).toBe(1)
    expect(telemetry.workerUrls.filter((url) => url.includes('data-worker')).length).toBeGreaterThanOrEqual(1)
    expect(state).toMatchObject({
        status: 'ready',
        layoutStatus: 'ready',
        retryAttempt: 0,
        neighborCount: 1
    })
})

test('worker timeout settles as failed and schedules one retry', async ({ page }) => {
    test.setTimeout(20_000)

    await page.addInitScript(() => {
        const nativeSetTimeout = window.setTimeout
        window.setTimeout = (callback, delay, ...args) =>
            nativeSetTimeout(callback, delay === 180_000 ? 25 : delay, ...args)
    })

    const telemetry = await installSemanticThreadFaultHarness(page, ['timeout'])

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE_URL}${APP_PATH}?anchor=0&nodemo=1`, { waitUntil: 'domcontentloaded' })

    await page.waitForFunction(
        () => {
            const state = window.__LEGACY_APP_STATE__
            return state?.semanticThreadsStatus === 'failed' && state?.semanticSpaceLayoutStatus === 'failed'
        },
        { timeout: 8_000 }
    )

    await page.waitForTimeout(150)

    const state = await page.evaluate(() => {
        const value = window.__LEGACY_APP_STATE__
        return {
            status: value?.semanticThreadsStatus,
            layoutStatus: value?.semanticSpaceLayoutStatus,
            retryAttempt: value?.semanticThreadsRetryAttempt,
            retryTimerPending: Boolean(value?.semanticThreadsRetryTimer),
            error: value?.semanticSpaceLayoutError || ''
        }
    })

    expect(telemetry.workerAssetPatched).toBeGreaterThan(0)
    expect(telemetry.controlCalls).toBe(1)
    expect(telemetry.workerUrls.filter((url) => url.includes('data-worker')).length).toBeGreaterThanOrEqual(1)
    expect(state.status).toBe('failed')
    expect(state.layoutStatus).toBe('failed')
    expect(state.retryAttempt).toBe(1)
    expect(state.retryTimerPending).toBe(true)
    expect(state.error).toContain('Worker-based thread loading failed')
})
