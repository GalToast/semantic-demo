/**
 * @lib/demo/camera.ts — Camera animation cancellation for the micro-demo
 *
 * Cancels any in-progress overview camera animation by clearing the
 * pending requestAnimationFrame id. The snapshot/capture/animate helpers
 * (`captureOverviewCameraSnapshot`, `getOverviewCameraSnapshot`,
 * `animateCameraToOverview`) and their private helpers (`isThreeVector`,
 * `getDemoCameraPosition`, `getDemoControls`) were removed in the dead-code
 * round-2 sweep — 0 external consumers.
 */

let _overviewCameraRafId: number | null = null

export function cancelOverviewCameraAnimation(): void {
    if (_overviewCameraRafId !== null) {
        cancelAnimationFrame(_overviewCameraRafId)
        _overviewCameraRafId = null
    }
}
