import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** Gap #10 — JSONL telemetry line shape. */
export interface TelemetryLine {
  uuid: string;                    // crypto.randomUUID()
  utcTimestamp: string;            // ISO-8601 UTC string
  attemptedModelId: string;
  attemptedCarrier: string;
  attemptedRoute: string;
  attemptIndex: number;
  success: boolean;
  shapeClass: string | null;
  error: string | null;            // truncated at 500 chars
  usage: { input: number; output: number; reasoning: number; totalTokens: number; };
  costUsd: number;
  wallMs: number;
}

/** Gap #10 — daily rollup summary shape. */
export interface DaySummary {
  dateUtc: string;
  dispatchesCount: number;
  successCount: number;
  failureCount: number;
  breakdownByShape: Record<string, number>;
  avgWallMs: number;
  avgWallMsPerCarrier: Record<string, number>;
  brokenCombosSeen: Array<{ carrier: string; modelId: string; shape: string; reason: string; }>;
  distinctModelsAttempted: number;
  distinctCarriersAttempted: number;
  totalCostUsd: number;
}

const TELEMETRY_DIR = path.resolve('tmp', 'v2-telemetry');
const MAX_ERROR_LEN = 500;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Gap #10 — return current UTC date bucket as YYYY-MM-DD. */
export function getUtcDayBucket(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = pad2(now.getUTCMonth() + 1);
  const d = pad2(now.getUTCDate());
  return `${y}-${m}-${d}`;
}

function telemetryPath(dateUtc: string): string {
  return path.join(TELEMETRY_DIR, `${dateUtc}.jsonl`);
}

function summaryPath(dateUtc: string): string {
  return path.join(TELEMETRY_DIR, `${dateUtc}-summary.json`);
}

function truncateError(err: string | null): string | null {
  if (err == null) return null;
  if (err.length <= MAX_ERROR_LEN) return err;
  return err.slice(0, MAX_ERROR_LEN);
}

/**
 * Gap #10 — append one JSON line to the daily JSONL file.
 * Creates parent directories if necessary.
 */
export async function writeTelemetryLine(line: TelemetryLine): Promise<void> {
  const bucket = getUtcDayBucket(new Date(line.utcTimestamp));
  const filePath = telemetryPath(bucket);
  await fs.mkdir(TELEMETRY_DIR, { recursive: true });

  const safeLine: TelemetryLine = {
    ...line,
    error: truncateError(line.error),
  };

  const payload = JSON.stringify(safeLine) + '\n';
  await fs.appendFile(filePath, payload, 'utf8');
}

/** Parse a single JSONL line; returns null on parse failure so one bad line doesn't kill the rollup. */
function parseLine(raw: string): TelemetryLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as TelemetryLine;
    // minimal validation
    if (!parsed.uuid || typeof parsed.success !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Internal rollup over an array of already-parsed lines. */
function computeSummary(dateUtc: string, lines: TelemetryLine[]): DaySummary | null {
  if (lines.length === 0) return null;

  let successCount = 0;
  let failureCount = 0;
  let totalWallMs = 0;
  let totalCostUsd = 0;

  const breakdownByShape: Record<string, number> = {};
  const carrierWallMs: Record<string, { sum: number; count: number }> = {};
  const models = new Set<string>();
  const carriers = new Set<string>();
  const brokenComboKey = new Set<string>();
  const brokenCombosSeen: DaySummary['brokenCombosSeen'] = [];

  for (const line of lines) {
    if (line.success) {
      successCount += 1;
    } else {
      failureCount += 1;
    }

    totalWallMs += line.wallMs ?? 0;
    totalCostUsd += line.costUsd ?? 0;
    models.add(line.attemptedModelId);
    carriers.add(line.attemptedCarrier);

    const shape = line.shapeClass ?? 'unknown';
    breakdownByShape[shape] = (breakdownByShape[shape] ?? 0) + 1;

    const c = line.attemptedCarrier;
    if (!carrierWallMs[c]) carrierWallMs[c] = { sum: 0, count: 0 };
    carrierWallMs[c].sum += line.wallMs ?? 0;
    carrierWallMs[c].count += 1;

    if (!line.success && line.shapeClass) {
      const key = `${line.attemptedCarrier}|${line.attemptedModelId}|${line.shapeClass}`;
      if (!brokenComboKey.has(key)) {
        brokenComboKey.add(key);
        brokenCombosSeen.push({
          carrier: line.attemptedCarrier,
          modelId: line.attemptedModelId,
          shape: line.shapeClass,
          reason: line.error ?? 'no-error-string',
        });
      }
    }
  }

  const avgWallMs = lines.length ? totalWallMs / lines.length : 0;
  const avgWallMsPerCarrier: Record<string, number> = {};
  for (const [c, stats] of Object.entries(carrierWallMs)) {
    avgWallMsPerCarrier[c] = stats.count ? stats.sum / stats.count : 0;
  }

  return {
    dateUtc,
    dispatchesCount: lines.length,
    successCount,
    failureCount,
    breakdownByShape,
    avgWallMs,
    avgWallMsPerCarrier,
    brokenCombosSeen,
    distinctModelsAttempted: models.size,
    distinctCarriersAttempted: carriers.size,
    totalCostUsd,
  };
}

/**
 * Gap #10 — read the previous UTC day's JSONL, compute DaySummary, write summary JSON.
 * Returns null if the daily file is missing or empty.
 */
export async function rollupYesterday(): Promise<DaySummary | null> {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const dateUtc = getUtcDayBucket(prev);
  return rollupDay(dateUtc);
}

/**
 * Gap #10 — generic rollup for an arbitrary UTC date bucket.
 * Reads `tmp/v2-telemetry/YYYY-MM-DD.jsonl`, parses every line,
 * computes a `DaySummary`, writes `tmp/v2-telemetry/YYYY-MM-DD-summary.json`,
 * and returns the summary.
 * If the file is missing or contains no valid lines, returns null.
 */
export async function rollupDay(dateUtc: string): Promise<DaySummary | null> {
  const filePath = telemetryPath(dateUtc);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }

  const lines = raw
    .split('\n')
    .map(parseLine)
    .filter((l): l is TelemetryLine => l !== null);

  const summary = computeSummary(dateUtc, lines);
  if (!summary) return null;

  await fs.mkdir(TELEMETRY_DIR, { recursive: true });
  await fs.writeFile(summaryPath(dateUtc), JSON.stringify(summary, null, 2) + '\n', 'utf8');

  return summary;
}
