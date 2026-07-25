// gap #15 — StreamQualityMeter computes rolling inter-chunk delta P95 + last
// chunk latency and derives a `streamingSmooth` boolean. A downstream consumer
// (matrix builder) auto-evolves `streamingSafe` based on >=5 consecutive
// `streamingSmooth=false` events.

export const ROLLING_WINDOW_SIZE = 64;
export const INTER_CHUNK_DELTA_P95_MS_THRESHOLD = 250;
export const LAST_CHUNK_LATENCY_MS_THRESHOLD = 1500;
export const PERFORMANCE_DEGRADATION_CONSECUTIVE_THRESHOLD = 5;

export interface StreamQualitySnapshot {
  interChunkDeltaP95Ms: number;
  lastChunkLatencyMs: number;
  sampleCount: number;
  streamingSmooth: boolean;
}

/** Pure-P95 estimator over an array of numbers using nearest-rank method. */
export function computeP95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const idx = Math.max(0, Math.min(n - 1, Math.ceil(0.95 * n) - 1));
  return sorted[idx];
}

/** Combine a delta p95 and last-chunk-latency into the boolean streamingSmooth. */
export function deriveStreamingSmooth(
  interChunkDeltaP95Ms: number,
  lastChunkLatencyMs: number,
): boolean {
  return !(interChunkDeltaP95Ms > INTER_CHUNK_DELTA_P95_MS_THRESHOLD && lastChunkLatencyMs > LAST_CHUNK_LATENCY_MS_THRESHOLD);
}

/**
 * Cheap ring-buffer-backed streaming quality meter.
 * Each `observe(timestampMs)` call records one chunk arrival and updates the
 * rolling window of inter-chunk deltas (last 64 deltas by default).
 */
export class StreamQualityMeter {
  private windowSize: number;
  private deltas: number[];
  private head: number;
  private count: number;
  private previousTimestampMs: number | undefined;
  private firstChunkTimestampMs: number | undefined;
  private lastChunkLatencyMs: number;
  private consecutiveDegradedDispatches: number;

  constructor(windowSize: number = ROLLING_WINDOW_SIZE) {
    this.windowSize = windowSize;
    this.deltas = new Array(windowSize).fill(0);
    this.head = 0;
    this.count = 0;
    this.previousTimestampMs = undefined;
    this.firstChunkTimestampMs = undefined;
    this.lastChunkLatencyMs = 0;
    this.consecutiveDegradedDispatches = 0;
  }

  /** Called on every chunk arrival. Computes delta vs previous chunk; pushes
   *  into the ring buffer (overwriting oldest entry when full). */
  observe(timestampMs: number): void {
    if (this.previousTimestampMs === undefined) {
      this.firstChunkTimestampMs = timestampMs;
    } else {
      const delta = timestampMs - this.previousTimestampMs;
      this.deltas[this.head] = delta;
      this.head = (this.head + 1) % this.windowSize;
      if (this.count < this.windowSize) {
        this.count += 1;
      }
    }
    this.previousTimestampMs = timestampMs;
  }

  /** Called when the stream terminates; records `lastChunkLatencyMs` as
   *  (timestampMs - firstChunkObservedAtMs) — overall duration the producer's
   *  total chunk latency budget consumed. */
  observeEnd(timestampMs: number): void {
    if (this.firstChunkTimestampMs === undefined) {
      this.lastChunkLatencyMs = 0;
    } else {
      this.lastChunkLatencyMs = timestampMs - this.firstChunkTimestampMs;
    }
  }

  /** Returns the current snapshot: P95 over deltas, last-chunk-latency, sample count,
   *  and the derived `streamingSmooth` boolean. */
  snapshot(): StreamQualitySnapshot {
    const activeSamples: number[] = [];
    if (this.count > 0) {
      for (let i = 0; i < this.count; i++) {
        const ringIdx = (this.head - this.count + i + this.windowSize) % this.windowSize;
        activeSamples.push(this.deltas[ringIdx]);
      }
    } else {
      // No observations yet: empty array -> computeP95 returns 0
    }
    const interChunkDeltaP95Ms = computeP95(activeSamples);
    const streamingSmooth = deriveStreamingSmooth(
      interChunkDeltaP95Ms,
      this.lastChunkLatencyMs,
    );
    return {
      interChunkDeltaP95Ms,
      lastChunkLatencyMs: this.lastChunkLatencyMs,
      sampleCount: this.count,
      streamingSmooth,
    };
  }

  /** Returns TRUE when the past >=5 consecutive dispatches returned streamingSmooth=false.
   *  Used by auto-evolve matrix code to demote `streamingSafe` axis. */
  isPerformanceDegraded(): boolean {
    return this.consecutiveDegradedDispatches >= PERFORMANCE_DEGRADATION_CONSECUTIVE_THRESHOLD;
  }

  /** Reset meter for reuse (test-mode helper). Clears ring buffer + state. */
  reset(): void {
    this.deltas = new Array(this.windowSize).fill(0);
    this.head = 0;
    this.count = 0;
    this.previousTimestampMs = undefined;
    this.firstChunkTimestampMs = undefined;
    this.lastChunkLatencyMs = 0;
    this.consecutiveDegradedDispatches = 0;
  }

  /** External caller passes the most recent `streamingSmooth` value of THIS-dispatch
   *  to update the consecutive-degradation counter (atomic). */
  recordDispatchEnd(streamingSmooth: boolean): void {
    if (!streamingSmooth) {
      this.consecutiveDegradedDispatches += 1;
    } else {
      this.consecutiveDegradedDispatches = 0;
    }
  }
}
