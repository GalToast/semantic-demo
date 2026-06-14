import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isDebugProbesEnabled, registerDiagnosticProbe } from '../../js/modules/diagnostic-adapter.js';
import { setWebGLContextRestoreHandler, restoreWebGLContext } from '../../js/modules/webgl-restore-adapter';
import { setSearchContainerState, setSearchGlowState, setMobileSearchSheetMode, clearMobileSearchSheetState } from '../../js/modules/search-panel-adapter.js';

describe('Adapters', () => {

    describe('diagnostic-adapter.js', () => {
        let originalWindow;

        beforeEach(() => {
            originalWindow = global.window;
        });

        afterEach(() => {
            global.window = originalWindow;
        });

        it('should enable debug probes on localhost by default', () => {
            global.window = { location: { hostname: 'localhost' } };
            expect(isDebugProbesEnabled()).toBe(true);
        });

        it('should respect explicit window.__DEBUG_PROBES__ flag', () => {
            global.window = { __DEBUG_PROBES__: false, location: { hostname: 'localhost' } };
            expect(isDebugProbesEnabled()).toBe(false);

            global.window = { __DEBUG_PROBES__: true, location: { hostname: 'production.com' } };
            expect(isDebugProbesEnabled()).toBe(true);
        });

        it('should register probe to window if enabled', () => {
            global.window = { location: { hostname: 'localhost' } };
            const probeFn = () => {};
            registerDiagnosticProbe('_testProbe', probeFn);
            expect(global.window._testProbe).toBe(probeFn);
        });
    });

    describe('webgl-restore-adapter.js', () => {
        it('should manage and execute restore handler', async () => {
            const mockHandler = vi.fn().mockReturnValue('restored');

            // Should resolve to false if no handler
            setWebGLContextRestoreHandler(null);
            expect(await restoreWebGLContext()).toBe(false);

            // Should call handler and resolve to true
            setWebGLContextRestoreHandler(mockHandler);
            const result = await restoreWebGLContext();
            expect(result).toBe(true);
            expect(mockHandler).toHaveBeenCalledTimes(1);
        });
    });

    describe('search-panel-adapter.js', () => {
        let mockSearchContainer;

        beforeEach(() => {
            mockSearchContainer = {
                classList: {
                    toggle: vi.fn()
                }
            };
            // Clear specific dataset keys
            delete document.body.dataset.mobileSearchSheet;
            delete document.body.dataset.mobileSearchSheetUser;
            delete document.body.dataset.panelSurfaceDetail;
            delete document.body.dataset.panelSurface;
            delete document.body.dataset.searchGlow;

            vi.spyOn(document, 'querySelector').mockImplementation((sel) => {
                if (sel === '.search-container') return mockSearchContainer;
                return null;
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('setSearchContainerState should toggle classes based on args', () => {
            setSearchContainerState({ searching: true, hasQuery: false });
            expect(mockSearchContainer.classList.toggle).toHaveBeenCalledWith('searching', true);
            expect(mockSearchContainer.classList.toggle).toHaveBeenCalledWith('has-query', false);
        });

        it('setSearchGlowState should toggle body dataset searchGlow', () => {
            setSearchGlowState(true);
            expect(document.body.dataset.searchGlow).toBe('active');
            setSearchGlowState(false);
            expect(document.body.dataset.searchGlow).toBe('inactive');
        });

        it('setMobileSearchSheetMode should set dataset correctly', () => {
            setMobileSearchSheetMode('expanded');
            expect(document.body.dataset.mobileSearchSheet).toBe('expanded');
            expect(document.body.dataset.panelSurfaceDetail).toBe('expanded');
            expect(document.body.dataset.mobileSearchSheetUser).toBeUndefined();

            setMobileSearchSheetMode('peek', { userInitiated: true });
            expect(document.body.dataset.mobileSearchSheet).toBe('peek');
            expect(document.body.dataset.mobileSearchSheetUser).toBe('true');
        });

        it('clearMobileSearchSheetState should remove mobile sheet keys', () => {
            document.body.dataset.mobileSearchSheet = 'expanded';
            document.body.dataset.mobileSearchSheetUser = 'true';
            document.body.dataset.panelSurface = 'search';

            clearMobileSearchSheetState();

            expect(document.body.dataset.mobileSearchSheet).toBeUndefined();
            expect(document.body.dataset.mobileSearchSheetUser).toBeUndefined();
            expect(document.body.dataset.panelSurfaceDetail).toBe('none');
        });
    });
});
