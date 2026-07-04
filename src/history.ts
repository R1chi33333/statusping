/**
 * Latency history for the admin charts, bucketed so every window
 * returns a similar number of points regardless of check frequency.
 */

import type { Db } from './db.ts';

export type HistoryWindow = '24h' | '7d' | '30d';

export interface HistoryBucket {
  /** Bucket start, ISO. */
  ts: string;
  avgLatencyMs: number | null;
  /** Share of successful checks in the bucket. */
  okRatio: number;
  checks: number;
}

const WINDOWS: Record<HistoryWindow, { spanMs: number; bucketMs: number }> = {
  '24h': { spanMs: 24 * 3600_000, bucketMs: 15 * 60_000 }, // 96 buckets
  '7d': { spanMs: 7 * 86400_000, bucketMs: 2 * 3600_000 }, // 84 buckets
  '30d': { spanMs: 30 * 86400_000, bucketMs: 8 * 3600_000 }, // 90 buckets
};

export function isHistoryWindow(value: string): value is HistoryWindow {
  return value in WINDOWS;
}

export function latencyHistory(
  db: Db,
  monitorId: number,
  window: HistoryWindow,
  now: Date = new Date(),
): HistoryBucket[] {
  const { spanMs, bucketMs } = WINDOWS[window];
  const sinceMs = now.getTime() - spanMs;

  const rows = db
    .prepare(
      `SELECT ts, ok, latency_ms FROM checks
       WHERE monitor_id = ? AND ts >= ?
       ORDER BY ts`,
    )
    .all(monitorId, new Date(sinceMs).toISOString()) as {
    ts: string;
    ok: number;
    latency_ms: number | null;
  }[];

  const buckets: HistoryBucket[] = [];
  for (let start = sinceMs; start < now.getTime(); start += bucketMs) {
    buckets.push({ ts: new Date(start).toISOString(), avgLatencyMs: null, okRatio: 1, checks: 0 });
  }

  const sums = new Map<
    number,
    { latency: number; latencyCount: number; ok: number; total: number }
  >();
  for (const row of rows) {
    const index = Math.floor((Date.parse(row.ts) - sinceMs) / bucketMs);
    if (index < 0 || index >= buckets.length) {
      continue;
    }
    const sum = sums.get(index) ?? { latency: 0, latencyCount: 0, ok: 0, total: 0 };
    if (row.latency_ms != null) {
      sum.latency += row.latency_ms;
      sum.latencyCount++;
    }
    sum.ok += row.ok;
    sum.total++;
    sums.set(index, sum);
  }

  for (const [index, sum] of sums) {
    const bucket = buckets[index];
    if (!bucket) {
      continue;
    }
    bucket.checks = sum.total;
    bucket.okRatio = sum.total === 0 ? 1 : sum.ok / sum.total;
    bucket.avgLatencyMs =
      sum.latencyCount === 0 ? null : Math.round(sum.latency / sum.latencyCount);
  }

  return buckets;
}

export interface IncidentRow {
  id: number;
  startedAt: string;
  resolvedAt: string | null;
  reason: string;
}

export function recentIncidents(db: Db, monitorId: number, limit = 20): IncidentRow[] {
  const rows = db
    .prepare(
      `SELECT id, started_at, resolved_at, reason FROM incidents
       WHERE monitor_id = ? ORDER BY started_at DESC LIMIT ?`,
    )
    .all(monitorId, limit) as {
    id: number;
    started_at: string;
    resolved_at: string | null;
    reason: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    reason: row.reason,
  }));
}
