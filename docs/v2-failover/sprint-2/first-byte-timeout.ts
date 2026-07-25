export const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 5000;

/**
 * Discriminated union of post-to-upstream outcomes:
 *   received   → first byte arrived in time; caller can stream the remaining body
 *   timeout    → no first byte within firstByteTimeoutMs; caller treats as transient carrier shape
 *                → triggers horizontal descent per gap #11 ζ-sniffer "transient_upstream_stream_failed_before_output"
 *   canceled   → caller aborted via the provided AbortSignal (e.g. clean shutdown)
 *   networkErr → fetch itself rejected (Connection error, DNS, .etc); similar shape to transient_unknown_connection
 *   abortErr   → AbortController fired but externally (caller controlled signal)
 */
export type FirstByteResult =
  | { status: "received"; response: Response; firstChunk: Uint8Array | null; waitedMs: number }
  | { status: "timeout"; routeId: string; modelId: string; waitedMs: number }
  | { status: "canceled"; waitedMs: number }
  | { status: "networkErr"; url: string; error: Error; waitedMs: number }
  | { status: "abortErr"; url: string; error: Error; waitedMs: number };

export interface WithFirstByteOptions extends RequestInit {
  firstByteTimeoutMs?: number;       // default DEFAULT_FIRST_BYTE_TIMEOUT_MS
  routeId?: string;                  // for diagnostic surfacing
  modelId?: string;                  // for diagnostic surfacing
  externalAbortSignal?: AbortSignal; // optional caller-controlled AbortSignal; cancellation always honored over timeout
}

/**
 * Initiates the upstream POST request with AbortController that fires after
 * firstByteTimeoutMs if no first byte received yet.
 *
 * Mechanism:
 *   1. start = Date.now()
 *   2. fetch(url, {signal: timeoutController.signal, ...init})
 *   3. reader = response.body.getReader()
 *   4. firstChunk = await reader.read() — STREAM-AWARE; once reader.read() resolves, first byte is in
 *      (or `{done:true, value:Uint8Array(0)}` means stream ended empty)
 *   5. Race: firstChunk resolves → status="received"; timeoutController aborts → status="timeout"
 */
export async function postWithFirstByteTimeout(
  url: string,
  options: WithFirstByteOptions,
): Promise<FirstByteResult> {
  const {
    firstByteTimeoutMs = DEFAULT_FIRST_BYTE_TIMEOUT_MS,
    routeId = "",
    modelId = "",
    externalAbortSignal,
    ...fetchInit
  } = options;

  const startTs = Date.now();
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), firstByteTimeoutMs);

  // If caller provides an external signal, forward abort to our timeout controller.
  let externalCleanup: (() => void) | undefined;
  if (externalAbortSignal) {
    const onExternalAbort = () => {
      timeoutController.abort();
    };
    externalAbortSignal.addEventListener("abort", onExternalAbort);
    externalCleanup = () => externalAbortSignal.removeEventListener("abort", onExternalAbort);
  }

  try {
    const fetchPromise = fetch(url, {
      ...fetchInit,
      signal: timeoutController.signal,
    });

    const result = await streamFirstByteRace(
      fetchPromise,
      timeoutController,
      externalAbortSignal,
      url,
      routeId,
      modelId,
      startTs,
    );

    clearTimeout(timeoutId);
    externalCleanup?.();
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    externalCleanup?.();
    // Any synchronous throw from fetch setup is treated as networkErr.
    const error = err instanceof Error ? err : new Error(String(err));
    const waitedMs = Date.now() - startTs;
    if (error.name === "AbortError" || (externalAbortSignal && externalAbortSignal.aborted)) {
      return { status: "canceled", waitedMs };
    }
    return { status: "networkErr", url, error, waitedMs };
  }
}

/** Helper: race the reader.read() against the AbortController timeout signal; resolves `FirstByteResult`. */
async function streamFirstByteRace(
  fetchPromise: Promise<Response>,
  timeoutController: AbortController,
  externalAbortSignal: AbortSignal | undefined,
  url: string,
  routeId: string | undefined,
  modelId: string | undefined,
  startTs: number,
): Promise<FirstByteResult> {
  let response: Response;

  try {
    response = await fetchPromise;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const waitedMs = Date.now() - startTs;

    if (externalAbortSignal && externalAbortSignal.aborted) {
      return { status: "canceled", waitedMs };
    }

    if (error.name === "AbortError") {
      // Determine whether timeoutController caused the abort.
      if (timeoutController.signal.aborted) {
        // If external was already aborted, prioritize canceled.
        if (externalAbortSignal && externalAbortSignal.aborted) {
          return { status: "canceled", waitedMs };
        }
        return {
          status: "timeout",
          routeId: routeId ?? "",
          modelId: modelId ?? "",
          waitedMs,
        };
      }
      return { status: "abortErr", url, error, waitedMs };
    }

    return { status: "networkErr", url, error, waitedMs };
  }

  // Fetch succeeded. Now race the first byte from the body reader.
  if (!response.body) {
    // No body at all: treat as empty stream (received with null firstChunk).
    return { status: "received", response, firstChunk: null, waitedMs: Date.now() - startTs };
  }

  const reader = response.body.getReader();

  try {
    const readResult = await reader.read();
    const waitedMs = Date.now() - startTs;

    if (readResult.done) {
      // Empty body (done immediately with no value, or Uint8Array(0) value).
      return { status: "received", response, firstChunk: null, waitedMs };
    }

    return {
      status: "received",
      response,
      firstChunk: readResult.value instanceof Uint8Array ? readResult.value : null,
      waitedMs,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const waitedMs = Date.now() - startTs;

    if (externalAbortSignal && externalAbortSignal.aborted) {
      return { status: "canceled", waitedMs };
    }

    if (error.name === "AbortError") {
      if (timeoutController.signal.aborted) {
        if (externalAbortSignal && externalAbortSignal.aborted) {
          return { status: "canceled", waitedMs };
        }
        return {
          status: "timeout",
          routeId: routeId ?? "",
          modelId: modelId ?? "",
          waitedMs,
        };
      }
      return { status: "abortErr", url, error, waitedMs };
    }

    // Reader threw for some other reason; map to networkErr.
    return { status: "networkErr", url, error, waitedMs };
  } finally {
    // Do NOT release the lock here on success — caller may still want to read the rest of the body.
    // On error paths the stream is already broken; no need to release.
  }
}

/** Activated on `received` of size 0 from a ReadableStreamByteRecord — collect remaining stream to Uint8Array. */
export async function collectStreamingResponse(
  response: Response,
  firstChunk: Uint8Array | null,
): Promise<Uint8Array> {
  if (!response.body) {
    return firstChunk ?? new Uint8Array(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  if (firstChunk && firstChunk.byteLength > 0) {
    chunks.push(firstChunk);
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength > 0) {
      chunks.push(value);
    }
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

/** Build URL-encoded JSON diagnostic header value for hung-first-byte attempts (surfaces via `X-Router-Diagnostic` per gap #8). */
export function buildTimeoutDiagnosticHeader(result: FirstByteResult): string {
  const base = {
    shape: result.status,
    routeId: "routeId" in result ? result.routeId : undefined,
    modelId: "modelId" in result ? result.modelId : undefined,
    waitedMs: result.waitedMs,
  };

  const payload: Record<string, unknown> = { ...base };

  if (result.status === "networkErr" || result.status === "abortErr") {
    payload.error = result.error.message;
  }

  // Remove undefined keys for a cleaner JSON string.
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  }

  return encodeURIComponent(JSON.stringify(payload));
}
