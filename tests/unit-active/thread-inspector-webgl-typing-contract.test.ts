/**
 * thread-inspector-webgl-typing-contract.test.ts
 *
 * Locks in the type-safety posture of src/lib/journey/thread-inspector-webgl.ts
 * after the W46-D4-era tightening pass that drove `any` occurrences from
 * ~35 down to a documented minimum (the unavoidable `state = appState as any`
 * escape hatch for engine-bridge fields, plus 3 narrow writes against the
 * appState.inspectedStrandDiagnostics field).
 *
 * Catches the regression class where someone re-introduces `as any` casts
 * at the Three.js boundary because "the typing gap is annoying" — a tradeoff
 * decision that should be deliberate, not accidental.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEBGL_PATH = resolve(import.meta.dirname, '../../src/lib/journey/thread-inspector-webgl.ts');

function readSource(): string {
    return readFileSync(WEBGL_PATH, 'utf-8');
}

function countAnyOccurrences(src: string): number {
    // Matches the four `any`-shaped patterns the file uses:
    //   `: any` (type annotation)
    //   `as any` (cast)
    //   `<any>` (generic arg)
    //   ` any[]` (array type)
    const re = /: any\b| as any\b|<any>| any\[\]/g;
    return (src.match(re) || []).length;
}

describe('thread-inspector-webgl typing posture (lock-in)', () => {
    let src: string;

    beforeAll(() => {
        src = readSource();
    });

    it('uses <=8 `any` occurrences total (was 35 pre-tightening)', () => {
        // Budget rationale: 1 for `state = appState as any` (engine bridge),
        // 3 for `(state as any).inspectedStrandDiagnostics = ...` writes,
        // and up to a few for the FOCUS_*_MOTIFS accessors. Anything beyond
        // this means someone re-introduced casts at the Three.js boundary.
        const count = countAnyOccurrences(src);
        expect(count).toBeLessThanOrEqual(8);
    });

    it('does not blanket-disable eslint any-warning for the file', () => {
        // The pre-tightening file had `/* eslint-disable @typescript-eslint/no-explicit-any */`
        // at the top, suppressing lint warnings on every line. Re-adding it
        // would defeat the purpose of the typing pass.
        expect(src).not.toMatch(/eslint-disable\s+@typescript-eslint\/no-explicit-any/);
    });

    it('exports the InspectionState interface for cross-module typing', () => {
        // The InspectionState interface is the typed contract for the runtime
        // inspection state shape that syncInspectedStrandOverlay consumes.
        // Removing it would force the caller back to `any`.
        expect(src).toMatch(/export\s+interface\s+InspectionState\s*\{/);
        expect(src).toMatch(/active:\s*boolean/);
        expect(src).toMatch(/index:\s*number/);
        expect(src).toMatch(/focusedIndex:\s*number/);
    });

    it('uses typed Three.js imports at the boundary, not `as any` casts', () => {
        // The typed imports the file should declare (proves we narrowed
        // away from `as any` for Three.js objects).
        expect(src).toMatch(/import\s*\{[^}]*\bObject3D\b[^}]*\}\s*from\s*['"]three['"]/);
        expect(src).toMatch(/import\s*\{[^}]*\bScene\b[^}]*\}\s*from\s*['"]three['"]/);
        // The function signatures should use these types instead of `any`.
        expect(src).toMatch(/writeInspectedStrandPositions\(lineObject:\s*LineSegments\)/);
        expect(src).toMatch(/createInspectedStrandLine\([^)]*\):\s*LineSegments/);
    });

    it('imports ThreadEdge from focus-pocket-geometry to type curve-point calls', () => {
        // The old code passed `edge as any` to getFocusThreadCurvePoint. The
        // typed call site passes `edge as ThreadEdge`. The type must be
        // imported.
        expect(src).toMatch(/import\s*\{[^}]*\btype\s+ThreadEdge\b[^}]*\}\s*from\s*['"][^'"]*focus-pocket-geometry['"]/);
    });

    it('uses `instanceof` instead of `isLineSegments` / `isSprite` duck-typing', () => {
        // The old code used `child.isLineSegments` (a runtime duck-type check
        // that requires `as any`). The typed version uses `instanceof LineSegments`
        // which typechecks at compile time.
        expect(src).toMatch(/instanceof\s+LineSegments/);
        expect(src).toMatch(/instanceof\s+Sprite/);
        expect(src).not.toMatch(/\.isLineSegments\b/);
        expect(src).not.toMatch(/\.isSprite\b/);
    });
});
