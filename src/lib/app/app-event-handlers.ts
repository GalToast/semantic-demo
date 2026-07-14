/**
 * @lib/app/app-event-handlers.ts — Event handlers for App.svelte
 *
 * Extracted from App.svelte to keep the root component thin.
 * Contains handler factories and standalone event callbacks.
 */

/**
 * Toggle audio mute state. Dynamically imports the audio module
 * to keep it out of the cold-load bundle.
 */
export async function toggleAudioMute(): Promise<void> {
    try {
        const { setAudioMuted, isAudioMuted } = await import('@lib/audio/audio-scape');
        setAudioMuted(!isAudioMuted());
    } catch {
        // Audio module not available — silent no-op
    }
}

/**
 * AppBoot handler dependencies. Passed to createAppBootHandlers()
 * so the handlers can close over reactive state without runes
 * escaping the .svelte file.
 */
export interface AppBootDeps {
    /** Toggle the weather widget visibility. */
    toggleWeather: () => void;
    /** Set the semantic-dive contract-forced flag. */
    setContractForced: (forced: boolean) => void;
}

/**
 * AppBoot component handler callbacks.
 */
export interface AppBootHandlers {
    toggleWeather: () => void;
    toggleAudioMute: () => void;
    onContractSurfaceForced: () => void;
}

/**
 * Create the handler callbacks for the AppBoot component.
 * The actual state mutations stay in App.svelte (where $state lives);
 * this factory wires the pure handler functions to the reactive setters.
 */
export function createAppBootHandlers(deps: AppBootDeps): AppBootHandlers {
    return {
        toggleWeather: deps.toggleWeather,
        toggleAudioMute,
        onContractSurfaceForced: () => deps.setContractForced(true),
    };
}
