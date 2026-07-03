/**
 * @lib/utils/error-messages.ts — Convert technical error messages into user-friendly copy
 *
 * Different failure paths (LoadingOverlay, MapView, SearchResults, toasts)
 * previously surfaced raw `error.message` strings like "Failed to fetch",
 * "NetworkError when attempting to fetch resource", or "Unexpected token
 * < in JSON at position 0". These are incomprehensible to non-technical
 * users and don't tell them what to do next.
 *
 * This utility normalizes common error patterns into short, actionable
 * copy. The raw message is preserved in the returned object so callers
 * can surface it in a <details> block or for diagnostic logging.
 *
 * Usage:
 *   const friendly = friendlyErrorMessage(err)
 *   <p>{friendly.title}</p>
 *   <p>{friendly.detail}</p>
 *   {#if friendly.technical}<details>...</details>{/if}
 */

export interface FriendlyError {
    /** Short headline (e.g. "Can't reach the server") */
    title: string
    /** One-sentence explanation with what to do next */
    detail: string
    /** Original technical message, when available */
    technical: string | null
}

/**
 * Extract a raw message from an unknown thrown value.
 */
function rawMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    return String(err)
}

/**
 * Classify a raw error message into a friendly category and return
 * user-appropriate copy.
 */
export function friendlyErrorMessage(err: unknown): FriendlyError {
    const raw = rawMessage(err)
    const lower = raw.toLowerCase()

    // ── Network / fetch failures ──────────────────────────────────────────────
    if (
        lower.includes('failed to fetch') ||
        lower.includes('networkerror') ||
        lower.includes('err_internet_disconnected') ||
        lower.includes('err_network_changed') ||
        lower.includes('err_connection_refused') ||
        lower.includes('err_connection_reset') ||
        lower.includes('err_name_not_resolved') ||
        lower.includes('err_internet') ||
        lower.includes('net::err_')
    ) {
        return {
            title: "Can't reach the server",
            detail:
                'Check your network connection, then try again. If you’re on Wi-Fi, switching to a different network can help.',
            technical: raw
        }
    }

    // ── DNS / host resolution ────────────────────────────────────────────────
    if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
        return {
            title: "Can't find the server",
            detail:
                'The address couldn’t be resolved. Check the URL or your DNS settings, then try again.',
            technical: raw
        }
    }

    // ── Timeouts (HTTP, fetch, socket) ───────────────────────────────────────
    if (
        lower.includes('timeout') ||
        lower.includes('etimedout') ||
        lower.includes('esocket') ||
        lower.includes('aborted')
    ) {
        return {
            title: 'The request took too long',
            detail:
                'The server didn’t respond in time. Try again — if it keeps happening, the service may be slow right now.',
            technical: raw
        }
    }

    // ── HTTP status codes embedded in the message ───────────────────────────
    const httpStatus = lower.match(/\b(4\d\d|5\d\d)\b/)?.[1]
    if (httpStatus) {
        const code = Number(httpStatus)
        if (code >= 500) {
            return {
                title: 'The server is having trouble',
                detail: `The service returned an error (HTTP ${code}). Please try again in a moment.`,
                technical: raw
            }
        }
        if (code === 404) {
            return {
                title: 'Not found',
                detail: 'The requested resource was not found. It may have been moved or removed.',
                technical: raw
            }
        }
        if (code === 403) {
            return {
                title: 'Access denied',
                detail: 'You don’t have permission to access this resource.',
                technical: raw
            }
        }
        if (code === 401) {
            return {
                title: 'Sign-in required',
                detail: 'Please sign in and try again.',
                technical: raw
            }
        }
        if (code === 429) {
            return {
                title: 'Too many requests',
                detail: 'You’re sending requests too quickly. Wait a moment, then try again.',
                technical: raw
            }
        }
        if (code >= 400) {
            return {
                title: 'Request was rejected',
                detail: `The service rejected the request (HTTP ${code}). Please review your input and try again.`,
                technical: raw
            }
        }
    }

    // ── JSON / parse errors ─────────────────────────────────────────────────
    if (
        lower.includes('json') ||
        lower.includes('unexpected token') ||
        lower.includes('unexpected end of json')
    ) {
        return {
            title: 'Got an unexpected response',
            detail:
                'The server replied with something we couldn’t read. Please try again in a moment.',
            technical: raw
        }
    }

    // ── Leaflet / map-specific ──────────────────────────────────────────────
    if (
        lower.includes('tile') ||
        lower.includes('leaflet') ||
        lower.includes('mapbox')
    ) {
        return {
            title: "Couldn't load the map",
            detail: 'The map tiles failed to load. Check your network connection and try again.',
            technical: raw
        }
    }

    // ── Catch-all: a sensible generic message ───────────────────────────────
    return {
        title: 'Something went wrong',
        detail: 'An unexpected error occurred. Please try again.',
        technical: raw
    }
}
