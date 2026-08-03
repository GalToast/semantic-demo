import { describe, it, expect, beforeEach } from 'vitest'
import { el, setChildren, type DomChild, type DomAttributes } from '../../src/lib/utils/dom-builder'

describe('dom-builder', () => {
    beforeEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild)
        }
    })

    describe('el()', () => {
        it('creates a simple div element with no attributes or children', () => {
            const div = el('div')
            expect(div).toBeInstanceOf(HTMLElement)
            expect(div.tagName).toBe('DIV')
            expect(div.children.length).toBe(0)
            expect(div.attributes.length).toBe(0)
        })

        it('creates an element with className attribute', () => {
            const div = el('div', { className: 'test-class' })
            expect(div.getAttribute('class')).toBe('test-class')
        })

        it('creates an element with class attribute (alias for className)', () => {
            const div = el('div', { class: 'another-class' })
            expect(div.getAttribute('class')).toBe('another-class')
        })

        it('creates an element with dataset attributes', () => {
            const div = el('div', { dataset: { index: 1, name: 'test' } })
            expect(div.dataset.index).toBe('1')
            expect(div.dataset.name).toBe('test')
        })

        it('creates an element with event listeners', () => {
            const handler = vi.fn()
            const button = el('button', { onclick: handler })
            button.click()
            expect(handler).toHaveBeenCalled()
        })

        it('creates an element with style object', () => {
            const div = el('div', { style: { color: 'red', fontSize: '14px' } })
            expect(div.style.color).toBe('red')
            expect(div.style.fontSize).toBe('14px')
        })

        it('creates an element with regular attributes', () => {
            const input = el('input', { type: 'text', id: 'test-input', disabled: true })
            expect(input.getAttribute('type')).toBe('text')
            expect(input.getAttribute('id')).toBe('test-input')
            expect(input.getAttribute('disabled')).toBe('')
        })

        it('creates an element with text child', () => {
            const div = el('div', {}, 'Hello World')
            expect(div.textContent).toBe('Hello World')
            expect(div.children.length).toBe(0)
        })

        it('creates an element with number child (converted to string)', () => {
            const div = el('div', {}, 42)
            expect(div.textContent).toBe('42')
        })

        it('creates an element with boolean true child', () => {
            const div = el('div', {}, true)
            expect(div.textContent).toBe('true')
        })

        it('creates an element with boolean false child (not rendered)', () => {
            const div = el('div', {}, false)
            expect(div.textContent).toBe('')
            expect(div.children.length).toBe(0)
        })

        it('creates an element with null/undefined children (not rendered)', () => {
            const div1 = el('div', {}, null)
            const div2 = el('div', {}, undefined)
            expect(div1.textContent).toBe('')
            expect(div2.textContent).toBe('')
        })

        it('creates an element with multiple children', () => {
            const div = el('div', {}, 'First', 'Second', 'Third')
            expect(div.textContent).toBe('FirstSecondThird')
        })

        it('creates an element with nested array children', () => {
            const div = el('div', {}, ['First', 'Second'], ['Third', 'Fourth'])
            expect(div.textContent).toBe('FirstSecondThirdFourth')
        })

        it('creates an element with mixed children types', () => {
            const span = document.createElement('span')
            span.textContent = 'Span content'
            const div = el('div', {}, 'Text', span, 42, true, null, undefined)
            expect(div.textContent).toBe('TextSpan content42true')
            expect(div.children.length).toBe(1)
            expect(div.children[0]).toBe(span)
        })

        it('creates an SVG element when tag is in SVG_TAGS', () => {
            const svg = el('svg', { width: 100, height: 100 })
            expect(svg).toBeInstanceOf(SVGElement)
            expect(svg.tagName).toBe('svg')
            expect(svg.getAttribute('width')).toBe('100')
        })

        it('creates SVG path element', () => {
            const path = el('path', { d: 'M10 10', fill: 'none' })
            expect(path).toBeInstanceOf(SVGElement)
            expect(path.tagName).toBe('path')
            expect(path.getAttribute('d')).toBe('M10 10')
        })

        it('creates SVG circle element', () => {
            const circle = el('circle', { cx: 50, cy: 50, r: 40 })
            expect(circle).toBeInstanceOf(SVGElement)
            expect(circle.tagName).toBe('circle')
            expect(circle.getAttribute('cx')).toBe('50')
        })

        it('ignores null/undefined/false attributes', () => {
            const div = el('div', { 
                id: 'test',
                'data-null': null,
                'data-undefined': undefined,
                'data-false': false,
                'data-valid': 'value'
            })
            expect(div.getAttribute('id')).toBe('test')
            expect(div.getAttribute('data-null')).toBeNull()
            expect(div.getAttribute('data-undefined')).toBeNull()
            expect(div.getAttribute('data-false')).toBeNull()
            expect(div.getAttribute('data-valid')).toBe('value')
        })

        it('handles complex nested structure', () => {
            const container = el('div', { class: 'container' }, 
                el('h1', { class: 'title' }, 'Title'),
                el('p', { class: 'content' }, 'Paragraph text'),
                el('ul', { class: 'list' }, 
                    el('li', {}, 'Item 1'),
                    el('li', {}, 'Item 2'),
                    el('li', {}, 'Item 3')
                )
            )
            expect(container.children.length).toBe(3)
            expect(container.children[0].tagName).toBe('H1')
            expect(container.children[1].tagName).toBe('P')
            expect(container.children[2].tagName).toBe('UL')
            expect(container.children[2].children.length).toBe(3)
        })
    })

    describe('setChildren()', () => {
        it('clears existing children and adds new text child', () => {
            const div = document.createElement('div')
            div.appendChild(document.createTextNode('Old content'))
            div.appendChild(document.createElement('span'))
            
            expect(div.children.length).toBe(1)
            expect(div.textContent).toContain('Old content')
            
            setChildren(div, 'New content')
            
            expect(div.children.length).toBe(0)
            expect(div.textContent).toBe('New content')
        })

        it('clears existing children and adds new element child', () => {
            const div = document.createElement('div')
            const oldSpan = document.createElement('span')
            oldSpan.textContent = 'Old'
            div.appendChild(oldSpan)
            
            const newSpan = document.createElement('span')
            newSpan.textContent = 'New'
            
            setChildren(div, newSpan)
            
            expect(div.children.length).toBe(1)
            expect(div.children[0]).toBe(newSpan)
            expect(div.textContent).toBe('New')
        })

        it('handles null parent gracefully', () => {
            expect(() => setChildren(null as unknown as HTMLElement, 'content')).not.toThrow()
        })

        it('handles multiple children', () => {
            const div = document.createElement('div')
            const span1 = document.createElement('span')
            span1.textContent = 'First'
            const span2 = document.createElement('span')
            span2.textContent = 'Second'
            
            setChildren(div, span1, 'Text', span2)
            
            expect(div.children.length).toBe(2)
            expect(div.textContent).toBe('FirstTextSecond')
        })

        it('handles nested array children', () => {
            const div = document.createElement('div')
            const span1 = document.createElement('span')
            span1.textContent = 'A'
            const span2 = document.createElement('span')
            span2.textContent = 'B'
            
            setChildren(div, [span1, 'Text1'], [span2, 'Text2'])
            
            expect(div.children.length).toBe(2)
            expect(div.textContent).toBe('AText1BText2')
        })

        it('ignores null/undefined/false children', () => {
            const div = document.createElement('div')
            const span = document.createElement('span')
            span.textContent = 'Visible'
            
            setChildren(div, null, undefined, false, span, true, 'text')
            
            expect(div.children.length).toBe(1)
            expect(div.textContent).toBe('Visibletruetext')
        })

        it('completely replaces children when called multiple times', () => {
            const div = document.createElement('div')
            
            const span1 = document.createElement('span')
            span1.textContent = 'First'
            setChildren(div, span1)
            expect(div.children.length).toBe(1)
            expect(div.textContent).toBe('First')
            
            const span2 = document.createElement('span')
            span2.textContent = 'Second'
            setChildren(div, span2)
            expect(div.children.length).toBe(1)
            expect(div.textContent).toBe('Second')
            expect(div.children[0]).toBe(span2)
        })
    })

    describe('DomChild type', () => {
        it('accepts Node instances', () => {
            const div = document.createElement('div')
            const span: DomChild = document.createElement('span')
            setChildren(div, span)
            expect(div.children[0]).toBe(span)
        })

        it('accepts strings', () => {
            const div = document.createElement('div')
            const text: DomChild = 'Hello'
            setChildren(div, text)
            expect(div.textContent).toBe('Hello')
        })

        it('accepts numbers', () => {
            const div = document.createElement('div')
            const num: DomChild = 42
            setChildren(div, num)
            expect(div.textContent).toBe('42')
        })

        it('accepts booleans', () => {
            const div = document.createElement('div')
            const bool: DomChild = true
            setChildren(div, bool)
            expect(div.textContent).toBe('true')
        })

        it('accepts null and undefined', () => {
            const div = document.createElement('div')
            setChildren(div, null, undefined)
            expect(div.textContent).toBe('')
        })

        it('accepts arrays of DomChild', () => {
            const div = document.createElement('div')
            const children: DomChild = ['Text', 42, true]
            setChildren(div, children)
            expect(div.textContent).toBe('Text42true')
        })
    })

    describe('DomAttributes type', () => {
        it('accepts string attributes', () => {
            const attrs: DomAttributes = { id: 'test', name: 'input' }
            const div = el('div', attrs)
            expect(div.getAttribute('id')).toBe('test')
            expect(div.getAttribute('name')).toBe('input')
        })

        it('accepts number attributes', () => {
            const attrs: DomAttributes = { tabindex: 1, 'data-count': 5 }
            const div = el('div', attrs)
            expect(div.getAttribute('tabindex')).toBe('1')
            expect(div.getAttribute('data-count')).toBe('5')
        })

        it('accepts boolean attributes', () => {
            const attrs: DomAttributes = { disabled: true, hidden: false }
            const div = el('div', attrs)
            expect(div.getAttribute('disabled')).toBe('')
            expect(div.getAttribute('hidden')).toBeNull()
        })

        it('accepts event handlers', () => {
            const handler = vi.fn()
            const attrs: DomAttributes = { onclick: handler }
            const button = el('button', attrs)
            button.click()
            expect(handler).toHaveBeenCalled()
        })

        it('accepts object attributes', () => {
            const attrs: DomAttributes = { dataset: { key: 'value' }, style: { color: 'red' } }
            const div = el('div', attrs)
            expect(div.dataset.key).toBe('value')
            expect(div.style.color).toBe('red')
        })

        it('accepts null and undefined attributes', () => {
            const attrs: DomAttributes = { id: null, name: undefined, value: 'test' }
            const div = el('div', attrs)
            expect(div.getAttribute('id')).toBeNull()
            expect(div.getAttribute('name')).toBeNull()
            expect(div.getAttribute('value')).toBe('test')
        })
    })
})