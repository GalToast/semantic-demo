<script lang="ts">
    import { errorStore } from './index'
    let latest = $derived(errorStore.latest)
    let visible = $derived(latest != null)
    function handleDismiss(): void {
        if (latest) errorStore.dismiss(latest.id)
    }
</script>

{#if visible && latest}
    <div
        class="error-fallback"
        role="alert"
        aria-live="assertive"
        tabindex="-1"
    >
        <div class="error-fallback-inner">
            <svg
                class="error-fallback-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span class="error-fallback-message">{latest.message}</span>
            <button
                class="error-fallback-dismiss"
                aria-label="Dismiss error"
                type="button"
                onclick={handleDismiss}
            >×</button>
        </div>
    </div>
{/if}

<style>
    .error-fallback {
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        z-index: var(--z-toast, 1200);
        max-width: min(560px, 90vw);
        background: rgba(7, 16, 24, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--status-danger, #ff6b6b);
        border-radius: 0.5rem;
        padding: 0.75rem 1rem;
        font-family: 'Nunito Sans', system-ui, sans-serif;
        pointer-events: auto;
    }
    .error-fallback-inner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .error-fallback-icon {
        color: var(--status-danger, #ff6b6b);
        flex-shrink: 0;
        display: inline-flex;
    }
    .error-fallback-message {
        flex: 1;
        font-size: 0.875rem;
        color: #e0f0f0;
        word-break: break-word;
        min-width: 0;
    }
    .error-fallback-dismiss {
        background: none;
        border: none;
        color: rgba(224, 240, 240, 0.5);
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 1.25rem;
        line-height: 1;
        flex-shrink: 0;
    }
    .error-fallback-dismiss:hover {
        color: #e0f0f0;
    }
    .error-fallback-dismiss:focus-visible {
        outline: 2px solid var(--status-danger, #ff6b6b);
        outline-offset: 2px;
    }
</style>
