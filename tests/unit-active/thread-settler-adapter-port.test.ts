/**
 * thread-settler-adapter-port.test.ts — Cross-seam caller tests for
 * traverseNeighbor + previewInsideNextThread (Ticket 8)
 *
 * Asserts that the Svelte-track shim (thread-settler-adapter.ts) is the
 * import path for all callers of these two functions, rather than the
 * legacy @legacy/modules/journey-thread-settler path.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');

function readFile(relPath: string): string {
	return readFileSync(join(ROOT, relPath), 'utf-8');
}

describe('traverseNeighbor import routing', () => {
	const files = [
		'src/lib/orchestration/triggers.ts',
		'src/lib/journey/journey.ts',
		'src/lib/journey/thread-settler.ts',
		'js/modules/lifecycle.ts',
		'src/lib/orchestration/window-actions.ts',
	];

	for (const file of files) {
		it(`${file} does not import traverseNeighbor from @legacy/modules/journey-thread-settler`, () => {
			const src = readFile(file);
			// Check that there is no direct import of traverseNeighbor from the legacy path
			const legacyImportPattern = /import\s*\{[^}]*traverseNeighbor[^}]*\}\s*from\s*['"]@legacy\/modules\/journey-thread-settler['"]/;
			expect(src).not.toMatch(legacyImportPattern);
		});
	}

	it('js/modules/journey.ts imports traverseNeighbor from adapter, not journey-thread-settler', () => {
		const src = readFile('js/modules/journey.ts');
		const adapterImport = /import\s*\{[^}]*traverseNeighbor[^}]*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/journey\/thread-settler-adapter['"]/;
		expect(src).toMatch(adapterImport);
	});

	it('js/modules/bindings/journey-bindings.ts imports traverseNeighbor from adapter', () => {
		const src = readFile('js/modules/bindings/journey-bindings.ts');
		const adapterImport = /import\s*\{\s*traverseNeighbor\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/src\/lib\/journey\/thread-settler-adapter['"]/;
		expect(src).toMatch(adapterImport);
	});

	it('js/modules/bindings/utility-bindings.ts imports traverseNeighbor from adapter', () => {
		const src = readFile('js/modules/bindings/utility-bindings.ts');
		const adapterImport = /import\s*\{\s*traverseNeighbor\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/src\/lib\/journey\/thread-settler-adapter['"]/;
		expect(src).toMatch(adapterImport);
	});

	it('js/modules/keyboard-help.ts imports traverseNeighbor from adapter', () => {
		const src = readFile('js/modules/keyboard-help.ts');
		const adapterImport = /import\s*\{\s*traverseNeighbor\s*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/journey\/thread-settler-adapter['"]/;
		expect(src).toMatch(adapterImport);
	});

	it('js/modules/lifecycle.ts imports traverseNeighbor from adapter', () => {
		const src = readFile('js/modules/lifecycle.ts');
		const adapterImport = /import\s*\{\s*traverseNeighbor\s*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/journey\/thread-settler-adapter['"]/;
		expect(src).toMatch(adapterImport);
	});
});

describe('previewInsideNextThread import routing', () => {
	it('src/lib/journey/journey.ts imports previewInsideNextThread from adapter, not @legacy', () => {
		const src = readFile('src/lib/journey/journey.ts');
		const adapterImport = /import\s*\{[^}]*previewInsideNextThread[^}]*\}\s*from\s*['"]\.\/thread-settler-adapter['"]/;
		expect(src).toMatch(adapterImport);
	});

	it('js/modules/journey.ts imports previewInsideNextThread from adapter', () => {
		const src = readFile('js/modules/journey.ts');
		const adapterImport = /import\s*\{[^}]*previewInsideNextThread[^}]*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/journey\/thread-settler-adapter['"]/;
		expect(src).toMatch(adapterImport);
	});

	it('src/lib/journey/journey.ts does not import previewInsideNextThread from @legacy', () => {
		const src = readFile('src/lib/journey/journey.ts');
		const legacyImportPattern = /import\s*\{[^}]*previewInsideNextThread[^}]*\}\s*from\s*['"]@legacy\/modules\/journey-thread-settler['"]/;
		expect(src).not.toMatch(legacyImportPattern);
	});
});

describe('adapter exports delegating shims', () => {
	it('thread-settler-adapter.ts defines traverseNeighbor as a delegating function', () => {
		const src = readFile('src/lib/journey/thread-settler-adapter.ts');
		// Should have the delegating shim, not a re-export
		expect(src).toMatch(/export function traverseNeighbor\(step: number\)/);
		expect(src).toMatch(/_traverseNeighborImpl/);
	});

	it('thread-settler-adapter.ts defines previewInsideNextThread as a delegating function', () => {
		const src = readFile('src/lib/journey/thread-settler-adapter.ts');
		expect(src).toMatch(/export function previewInsideNextThread/);
		expect(src).toMatch(/_previewInsideNextThreadImpl/);
	});

	it('thread-settler-adapter.ts does not use bare re-export for traverseNeighbor', () => {
		const src = readFile('src/lib/journey/thread-settler-adapter.ts');
		const bareReExport = /export\s*\{\s*traverseNeighbor\s*\}\s*from\s*['"]@legacy/;
		expect(src).not.toMatch(bareReExport);
	});

	it('thread-settler-adapter.ts does not use bare re-export for previewInsideNextThread', () => {
		const src = readFile('src/lib/journey/thread-settler-adapter.ts');
		const bareReExport = /export\s*\{\s*previewInsideNextThread\s*\}\s*from\s*['"]@legacy/;
		expect(src).not.toMatch(bareReExport);
	});
});
