import fs from 'fs'

const PATH = 'src/lib/journey/thread-inspector.ts'
let s = fs.readFileSync(PATH, 'utf8')

// 1. Replace all legacyState as any with legacyState
s = s.replace(/\(legacyState as any\)/g, 'legacyState')
s = s.replace(/\(legacyState\.navState as any\)/g, 'legacyState.navState')

// 2. Replace inspector as any with typed alternative
// We define an interface for the DOM element with custom properties
const domInterface = `interface InspectorElement extends HTMLElement {
    _pointerEnterListener?: EventListener
    _pointerLeaveListener?: EventListener
}
`

// Add the interface after the imports (before first function)
if (!s.includes('interface InspectorElement')) {
    s = s.replace(/(export function|function [a-zA-Z]+\()/, domInterface + '$1')
}

// Replace inspector as any casts with typed casts
s = s.replace(/\(inspector as any\)/g, '(inspector as unknown as InspectorElement)')

// 3. Replace } as any) at line endings with just })
s = s.replace(/}\s*as\s+any\)/g, '})')

fs.writeFileSync(PATH, s)
console.log('Done')
