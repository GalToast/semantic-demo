/**
 * js/modules/utils/geo-data.ts
 *
 * Geolocation validation, point visibility filtering, 3D scatter offsets,
 * and search tokenization logic.
 */

import * as THREE from 'three';
import { state } from '../../state.js';
import { cleanOptionalValue, escapeHtml } from './dom-formatters.js';
import type { Point, ActiveFilters } from '../../../types/state.js';

export function pointHasGeocode(point: Point): boolean {
    if (!point) return false;
    const lat = point.lat;
    const lng = point.lng;

    const isValidLat = Number.isFinite(lat) && lat! >= 25.0 && lat! <= 37.0;
    const isValidLng = Number.isFinite(lng) && lng! >= -107.0 && lng! <= -93.0;

    return isValidLat && isValidLng;
}

export function normalizeCityForFilter(city: string | null | undefined): string {
    const clean = cleanOptionalValue(city);
    if (!clean || /[0-9]/.test(clean) || clean.includes('(') || clean.length > 28 || clean.toLowerCase() === 'montgomery county') {
        return 'Other / Unparsed';
    }
    const lower = clean.toLowerCase();
    if (lower === 'cleveland' || lower === 'clevland') return 'Cleveland';
    if (lower === 'cut and shoot') return 'Cut and Shoot';
    if (lower === 'coldspring' || lower === 'cold spring') return 'Cold Spring';

    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export function isPointVisible(index: number, points: Point[], activeClusterFilter: number | null, activeFilters: ActiveFilters): boolean {
    if (index < 0 || index >= points.length) return false;
    const point = points[index]!;
    const pointCluster = Number.isFinite(Number(point.cluster)) ? Number(point.cluster) : 0;
    if (activeClusterFilter !== null && pointCluster !== activeClusterFilter) return false;
    if (activeFilters.status !== 'all' && point.status !== activeFilters.status) return false;
    if (activeFilters.city !== 'all' && normalizeCityForFilter(point.city) !== activeFilters.city) return false;
    if (activeFilters.website && !point.website) return false;
    if (activeFilters.email && !point.email) return false;
    if (activeFilters.geocoded && !pointHasGeocode(point)) return false;
    return true;
}

export function calculateSignalScore(point: Point): number {
    if (!point) return 0;
    let score = 0;
    if (point.website) score += 1.35;
    if (point.email) score += 1.0;
    if (point.phone) score += 0.45;
    if (pointHasGeocode(point)) score += 1.25;
    if (point.status === 'active') score += 0.55;
    if (point.trivia) score += 0.35;
    return score;
}

export function highlightMatch(text: string | null | undefined, query: string | null | undefined): string {
    if (!text) return '';
    const safeText = String(text);
    const safeQuery = query === null || query === undefined ? '' : String(query);
    if (!safeQuery) return escapeHtml(safeText);
    const idx = safeText.toLowerCase().indexOf(safeQuery.toLowerCase());
    if (idx === -1) return escapeHtml(safeText);
    const escapedMatch = escapeHtml(safeText.substring(idx, idx + safeQuery.length));
    const escapedPrefix = escapeHtml(safeText.substring(0, idx));
    const escapedSuffix = escapeHtml(safeText.substring(idx + safeQuery.length));
    return (
        escapedPrefix +
        '<mark class="search-result-match">' +
        escapedMatch +
        '</mark>' +
        escapedSuffix
    );
}

export function tokenizeSearchText(text: string | null | undefined, stopWords?: Set<string>): string[] {
    if (!stopWords) stopWords = new Set();
    return [
        ...new Set(
            (
                String(text || '')
                    .normalize('NFC')
                    .toLowerCase()
                    .match(/[\p{L}0-9]+/gu) || []
            )
                .filter(Boolean)
                .filter((token) => token.length > 1 && !stopWords!.has(token))
        )
    ];
}

export function countTokenMatches(fieldTokens: string[], queryTokens: string[]): { exact: number; prefix: number } | 0 {
    if (!fieldTokens || !queryTokens) return 0;
    let exact = 0;
    let prefix = 0;
    if (!queryTokens || !Array.isArray(queryTokens)) return 0;
    queryTokens.forEach((token) => {
        if (fieldTokens.includes(token)) exact += 1;
        else if (fieldTokens.some((entry) => entry.startsWith(token) || token.startsWith(entry))) prefix += 1;
    });
    return { exact, prefix };
}

interface Vec3 { x: number; y: number; z: number; }

export function computeOverviewScatterOffsets(sourcePoints: Point[], threshold = 0.055): Vec3[] {
    if (!Array.isArray(sourcePoints) || sourcePoints.length < 2) {
        return Array.from({ length: (sourcePoints && sourcePoints.length) || 0 }, () => ({ x: 0, y: 0, z: 0 }));
    }
    const offsets: Vec3[] = Array.from({ length: sourcePoints.length }, () => ({ x: 0, y: 0, z: 0 }));
    const seededUnit = (index: number, salt: number = 0): number => {
        const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
        return x - Math.floor(x);
    };

    const parent: number[] = Array.from({ length: sourcePoints.length }, (_, i) => i);
    const find = (i: number): number => {
        while (parent[i] !== i) {
            const next = parent[i]!;
            parent[i] = parent[next]!;
            i = next;
        }
        return i;
    };
    const unite = (a: number, b: number): void => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[rb] = ra;
    };

    const cellSize = threshold;
    const grid = new Map<string, number[]>();
    const cellKey = (x: number, y: number, z: number): string =>
        `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;

    const rawBuf: Float32Array | null = state.rawPositionsBuffer as Float32Array | null;
    const hasRawBuffer: boolean = rawBuf !== null && rawBuf.length >= sourcePoints.length * 3;
    const getPosition = (index: number): Vec3 => {
        const point = sourcePoints[index]! || ({} as Point);
        if (hasRawBuffer) {
            return {
                x: state.rawPositionsBuffer![index * 3],
                y: state.rawPositionsBuffer![index * 3 + 1],
                z: state.rawPositionsBuffer![index * 3 + 2]
            };
        }
        return {
            x: Number.isFinite(point.x) ? point.x! : 0,
            y: Number.isFinite(point.y) ? point.y! : 0,
            z: Number.isFinite(point.z) ? point.z! : 0
        };
    };

    sourcePoints.forEach((_, index) => {
        const { x, y, z } = getPosition(index);
        const key = cellKey(x, y, z);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(index);
    });

    for (let i = 0; i < sourcePoints.length; i++) {
        const point = getPosition(i);
        const px = point.x;
        const py = point.y;
        const pz = point.z;

        const cx = Math.floor(px / cellSize);
        const cy = Math.floor(py / cellSize);
        const cz = Math.floor(pz / cellSize);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
                    if (!bucket) continue;
                    for (const otherIndex of bucket) {
                        if (otherIndex <= i) continue;
                        const other = getPosition(otherIndex);
                        const ddx = px - other.x;
                        const ddy = py - other.y;
                        const ddz = pz - other.z;
                        if (Math.hypot(ddx, ddy, ddz) <= threshold) {
                            unite(i, otherIndex);
                        }
                    }
                }
            }
        }
    }

    const groups = new Map<number, number[]>();
    for (let i = 0; i < sourcePoints.length; i++) {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root)!.push(i);
    }

    const worldUp = new THREE.Vector3(0, 1, 0);
    const fallbackAxis = new THREE.Vector3(1, 0, 0);
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        group.sort((a, b) => a - b);

        const centroid = new THREE.Vector3();
        group.forEach((index) => {
            const position = getPosition(index);
            centroid.x += position.x;
            centroid.y += position.y;
            centroid.z += position.z;
        });
        centroid.multiplyScalar(1 / group.length);

        const normal =
            centroid.lengthSq() > 1e-8 ? centroid.clone().normalize() : new THREE.Vector3(0, 0, 1);
        let tangentA = new THREE.Vector3().crossVectors(normal, worldUp);
        if (tangentA.lengthSq() < 1e-8) {
            tangentA = new THREE.Vector3().crossVectors(normal, fallbackAxis);
        }
        tangentA.normalize();
        const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();

        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const maxRadius = Math.min(0.082, 0.016 + Math.sqrt(group.length) * 0.0072);
        const minRadius = Math.min(maxRadius * 0.58, 0.012 + group.length * 0.00045);
        const phase = seededUnit(group[0]!, group.length) * Math.PI * 2;
        const rawOffsets: { index: number; radial: THREE.Vector3 }[] = [];
        const groupOffsetCenter = new THREE.Vector3();

        group.forEach((index, order) => {
            const rank = (order + 0.5) / group.length;
            const irregularity = (seededUnit(index, 3.7) - 0.5) * 0.28;
            const radiusEase = Math.sqrt(rank);
            const radius = Math.min(Math.max(
                minRadius + (maxRadius - minRadius) * radiusEase + irregularity * maxRadius,
                minRadius),
                maxRadius
            );
            const angle = phase + order * goldenAngle + (seededUnit(index, 5.1) - 0.5) * 0.86;
            const lift = (seededUnit(index, 8.4) - 0.5) * Math.min(0.032, maxRadius * 0.42);
            const radial = tangentA
                .clone()
                .multiplyScalar(Math.cos(angle) * radius)
                .add(tangentB.clone().multiplyScalar(Math.sin(angle) * radius))
                .add(normal.clone().multiplyScalar(lift));
            rawOffsets.push({ index, radial });
            groupOffsetCenter.add(radial);
        });

        groupOffsetCenter.multiplyScalar(1 / rawOffsets.length);
        rawOffsets.forEach(({ index, radial }) => {
            radial.sub(groupOffsetCenter);
            offsets[index] = { x: radial.x, y: radial.y, z: radial.z };
        });
    }

    return offsets;
}
