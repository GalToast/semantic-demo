// @ts-check
/**
 * dom-builder.js
 *
 * Lightweight, secure DOM element factory to replace innerHTML string concatenation.
 * Prevents XSS by using programmatic node creation and text node escaping.
 */

/**
 * @typedef {Node|string|number|boolean|null|undefined|Array<unknown>} DomChild
 * @typedef {(event: Event) => void} DomEventHandler
 * @typedef {Record<string, string|number|boolean|DomEventHandler|Record<string, unknown>|null|undefined>} DomAttributes
 */

/**
 * @param {unknown} value
 * @returns {value is Node}
 */
function isNodeLike(value) {
    const NodeCtor = globalThis.Node;
    return typeof NodeCtor === 'function' && value instanceof NodeCtor;
}

/**
 * Creates a DOM element with the given tag, attributes, and children.
 *
 * @param {string} tag - The HTML tag name (e.g., 'div', 'button').
 * @param {DomAttributes} [attributes={}] - Key-value pairs of attributes to set.
 *   - Special keys:
 *     - 'dataset': An object of data-attributes (e.g., { index: 1 } becomes data-index="1").
 *     - 'on[Event]': A function to be added as an event listener (e.g., onclick: fn).
 *     - 'className': Alias for 'class'.
 * @param {...DomChild} children - Child nodes or text content.
 * @returns {HTMLElement|SVGElement} The created element.
 */
export function el(tag, attributes = {}, ...children) {
    const isSvg = ['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'text', 'g', 'use'].includes(tag);
    const node = isSvg
        ? document.createElementNS('http://www.w3.org/2000/svg', tag)
        : document.createElement(tag);

    if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;

            if (key === 'className' || key === 'class') {
                node.setAttribute('class', String(value));
            } else if (key === 'dataset' && typeof value === 'object') {
                Object.entries(value).forEach(([dKey, dVal]) => {
                    node.dataset[dKey] = String(dVal);
                });
            } else if (key.startsWith('on') && typeof value === 'function') {
                const eventName = key.slice(2).toLowerCase();
                node.addEventListener(eventName, /** @type {EventListener} */ (value));
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(node.style, value);
            } else {
                node.setAttribute(key, value === true ? '' : String(value));
            }
        });
    }

    /** @param {DomChild} child */
    const appendChild = (child) => {
        if (child === null || child === undefined || child === false) return;

        if (isNodeLike(child)) {
            node.appendChild(child);
        } else if (Array.isArray(child)) {
            child.forEach((nestedChild) => appendChild(/** @type {DomChild} */ (nestedChild)));
        } else {
            node.appendChild(document.createTextNode(String(child)));
        }
    };

    children.forEach(appendChild);

    return node;
}

/**
 * Utility to clear an element and append new children in one step.
 *
 * @param {HTMLElement} parent
 * @param {...DomChild} children
 */
export function setChildren(parent, ...children) {
    if (!parent) return;
    parent.replaceChildren(); // Modern API to clear children efficiently
    /** @param {DomChild} child */
    const appendChild = (child) => {
        if (child === null || child === undefined || child === false) return;
        if (isNodeLike(child)) {
            parent.appendChild(child);
        } else if (Array.isArray(child)) {
            child.forEach((nestedChild) => appendChild(/** @type {DomChild} */ (nestedChild)));
        } else {
            parent.appendChild(document.createTextNode(String(child)));
        }
    };
    children.forEach(appendChild);
}
