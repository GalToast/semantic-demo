import { state } from '../state.js';

const DEFAULT_CLUSTER_RGB = '78 205 196';

function parseHexColor(hexColor) {
    const normalized = String(hexColor || '').trim().replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16)
    };
}

function getPointClusterIndex(point) {
    const cluster = Number(point?.cluster);
    return Number.isFinite(cluster) ? Math.abs(Math.trunc(cluster)) : null;
}

export function applyClusterUiAccent(element, point = null) {
    if (!element) return null;

    const clusterIndex = getPointClusterIndex(point);
    const colors = Array.isArray(state.COLORS) ? state.COLORS : [];
    const hexColor = clusterIndex !== null && colors.length ? colors[clusterIndex % colors.length] : null;
    const rgb = parseHexColor(hexColor);
    const rgbValue = rgb ? `${rgb.r} ${rgb.g} ${rgb.b}` : DEFAULT_CLUSTER_RGB;

    element.style.setProperty('--cluster-rgb', rgbValue);
    if (clusterIndex === null) {
        delete element.dataset.clusterAccent;
        delete element.dataset.clusterColor;
    } else {
        element.dataset.clusterAccent = String(clusterIndex);
        element.dataset.clusterColor = String(hexColor || '');
    }

    return rgbValue;
}

