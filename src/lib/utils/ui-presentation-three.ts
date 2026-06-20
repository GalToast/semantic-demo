/**
 * @lib/utils/ui-presentation-three.ts — Three.js-dependent helpers extracted
 * from ui-presentation.ts so the main bundle does not pull in Three.js.
 *
 * These functions are consumed only by engine/lifecycle code, not by Svelte
 * components on the critical path.
 */

import { Camera, Vector3, MathUtils, Color } from 'three';

/**
 * Compute a zoom blend factor (0–1) from camera distance to orbit controls.
 */
export function getZoomBlend(
	camera: Camera | null,
	controls: { minDistance?: number; maxDistance?: number; target?: Vector3 } | null
): number {
	if (!camera || !controls) return 0.42;
	const minDistance = Number.isFinite(controls.minDistance as number)
		? (controls.minDistance as number)
		: 0.5;
	const maxDistance = Number.isFinite(controls.maxDistance as number)
		? (controls.maxDistance as number)
		: 8;
	const range = Math.max(0.001, maxDistance - minDistance);
	const target = controls.target ?? new Vector3();
	const distance = camera.position.distanceTo(target);
	return MathUtils.clamp((distance - minDistance) / range, 0, 1);
}

/**
 * Map a cluster index to a Three.js Color from a palette.
 */
export function getThreadCategoryColor(
	cluster: number | null | undefined,
	colors: readonly string[]
): Color {
	if (cluster === null || cluster === undefined || !Number.isFinite(cluster)) cluster = 0;
	if (!colors || colors.length === 0) return new Color('#888888');
	return new Color(colors[cluster % colors.length]);
}
