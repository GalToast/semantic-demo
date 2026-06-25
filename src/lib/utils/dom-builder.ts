/**
 * @lib/utils/dom-builder.ts — Lightweight, secure DOM element factory
 *
 * Prevents XSS by using programmatic node creation and text node escaping.
 *
 * Port of
 */

/** A valid child for the `el` and `setChildren` helpers. */
export type DomChild =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | DomChild[];

/** An event handler attached via `on[Event]` attribute keys. */
export type DomEventHandler = (event: Event) => void;

/** Attributes accepted by `el()`. */
export type DomAttributes = Record<
  string,
  | string
  | number
  | boolean
  | DomEventHandler
  | Record<string, unknown>
  | null
  | undefined
>;

const SVG_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'ellipse',
  'text',
  'g',
  'use',
]);

function isNodeLike(value: unknown): value is Node {
  const NodeCtor = globalThis.Node;
  return typeof NodeCtor === 'function' && value instanceof NodeCtor;
}

/**
 * Creates a DOM element with the given tag, attributes, and children.
 *
 * @param tag - The HTML tag name (e.g., 'div', 'button').
 * @param attributes - Key-value pairs of attributes to set.
 *   - Special keys:
 *     - 'dataset': An object of data-attributes (e.g., { index: 1 } becomes data-index="1").
 *     - 'on[Event]': A function to be added as an event listener (e.g., onclick: fn).
 *     - 'className': Alias for 'class'.
 * @param children - Child nodes or text content.
 * @returns The created element.
 */
export function el(
  tag: string,
  attributes: DomAttributes = {},
  ...children: DomChild[]
): HTMLElement | SVGElement {
  const isSvg = SVG_TAGS.has(tag);
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
        node.addEventListener(eventName, value as EventListener);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(node.style, value);
      } else {
        node.setAttribute(key, value === true ? '' : String(value));
      }
    });
  }

  const appendChild = (child: DomChild): void => {
    if (child === null || child === undefined || child === false) return;

    if (isNodeLike(child)) {
      node.appendChild(child);
    } else if (Array.isArray(child)) {
      child.forEach((nestedChild) => appendChild(nestedChild));
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
 * @param parent - The parent element to clear and repopulate.
 * @param children - Child nodes or text content.
 */
export function setChildren(parent: HTMLElement, ...children: DomChild[]): void {
  if (!parent) return;
  parent.replaceChildren(); // Modern API to clear children efficiently
  const appendChild = (child: DomChild): void => {
    if (child === null || child === undefined || child === false) return;
    if (isNodeLike(child)) {
      parent.appendChild(child);
    } else if (Array.isArray(child)) {
      child.forEach((nestedChild) => appendChild(nestedChild));
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  };
  children.forEach(appendChild);
}
