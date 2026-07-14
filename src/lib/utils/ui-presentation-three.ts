/**
 * @lib/utils/ui-presentation-three.ts — Three.js-dependent helpers extracted
 * from ui-presentation.ts so the main bundle does not pull in Three.js.
 *
 * These functions are consumed only by engine/lifecycle code, not by Svelte
 * components on the critical path.
 */

import { Color } from 'three';

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
