/**
 * @vitest-environment jsdom
 *
 * CameraControlsRestore — resume-timing field ownership test.
 *
 * Post-W11-T6: autoRotateResumeTimer, autoRotateResumeDueAt, and
 * autoRotateSoftResumeStartedAt live only on the CameraControlsRestore
 * class, NOT on appState. This test verifies both facts.
 */
import { describe, expect, it } from 'vitest'
import { cameraControlsRestore } from '@lib/engine/camera-controls-restore.svelte.ts'
import { appState } from '@lib/state/app.svelte.ts'

describe('cameraControlsRestore — resume-timing field ownership', () => {
    it('autoRotateResumeTimer is writable and readable on cameraControlsRestore', () => {
        const fakeTimer = setTimeout(() => {}, 0)
        cameraControlsRestore.autoRotateResumeTimer = fakeTimer
        expect(cameraControlsRestore.autoRotateResumeTimer).toBe(fakeTimer)
        clearTimeout(fakeTimer)
        cameraControlsRestore.autoRotateResumeTimer = null
    })

    it('autoRotateResumeDueAt is writable and readable on cameraControlsRestore', () => {
        const dueAt = Date.now() + 5000
        cameraControlsRestore.autoRotateResumeDueAt = dueAt
        expect(cameraControlsRestore.autoRotateResumeDueAt).toBe(dueAt)
        cameraControlsRestore.autoRotateResumeDueAt = 0
    })

    it('autoRotateSoftResumeStartedAt is writable and readable on cameraControlsRestore', () => {
        const stamp = Date.now()
        cameraControlsRestore.autoRotateSoftResumeStartedAt = stamp
        expect(cameraControlsRestore.autoRotateSoftResumeStartedAt).toBe(stamp)
        cameraControlsRestore.autoRotateSoftResumeStartedAt = 0
    })

    it('appState does NOT own autoRotateResumeTimer', () => {
        expect(appState).not.toHaveProperty('autoRotateResumeTimer')
    })

    it('appState does NOT own autoRotateResumeDueAt', () => {
        expect(appState).not.toHaveProperty('autoRotateResumeDueAt')
    })

    it('appState does NOT own autoRotateSoftResumeStartedAt', () => {
        expect(appState).not.toHaveProperty('autoRotateSoftResumeStartedAt')
    })

    it('appState still owns autoRotate and autoRotateSuspended', () => {
        expect(appState).toHaveProperty('autoRotate')
        expect(appState).toHaveProperty('autoRotateSuspended')
    })
})
