import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.ts';
import { isHistoryWindow, latencyHistory, recentIncidents } from '../src/history.ts';
import { createMonitor, insertCheck, startIncident, resolveIncident } from '../src/store.ts';

const NOW = new Date('2026-07-04T12:00:00Z');

describe('isHistoryWindow', () => {
  it('accepts known windows only', () => {
    expect(isHistoryWindow('24h')).toBe(true);
    expect(isHistoryWindow('7d')).toBe(true);
    expect(isHistoryWindow('30d')).toBe(true);
    expect(isHistoryWindow('90d')).toBe(false);
  });
});

describe('latencyHistory', () => {
  it('buckets checks with average latency and ok ratio', () => {
    const db = openDb(':memory:');
    const monitor = createMonitor(db, { name: 'Demo', url: 'https://demo.test' });

    // Two checks in the same 15 minute bucket, one failing.
    insertCheck(db, monitor.id, '2026-07-04T11:31:00Z', {
      ok: true,
      latencyMs: 100,
      statusCode: 200,
    });
    insertCheck(db, monitor.id, '2026-07-04T11:40:00Z', {
      ok: false,
      latencyMs: 300,
      statusCode: 503,
      error: 'HTTP 503',
    });

    const buckets = latencyHistory(db, monitor.id, '24h', NOW);
    expect(buckets).toHaveLength(96);

    const filled = buckets.filter((bucket) => bucket.checks > 0);
    expect(filled).toHaveLength(1);
    expect(filled[0]).toMatchObject({ avgLatencyMs: 200, okRatio: 0.5, checks: 2 });
  });

  it('ignores checks outside the window and handles empty history', () => {
    const db = openDb(':memory:');
    const monitor = createMonitor(db, { name: 'Demo', url: 'https://demo.test' });
    insertCheck(db, monitor.id, '2026-06-01T00:00:00Z', {
      ok: true,
      latencyMs: 50,
      statusCode: 200,
    });

    const buckets = latencyHistory(db, monitor.id, '24h', NOW);
    expect(buckets.every((bucket) => bucket.checks === 0)).toBe(true);
  });

  it('produces stable bucket counts for longer windows', () => {
    const db = openDb(':memory:');
    const monitor = createMonitor(db, { name: 'Demo', url: 'https://demo.test' });
    expect(latencyHistory(db, monitor.id, '7d', NOW)).toHaveLength(84);
    expect(latencyHistory(db, monitor.id, '30d', NOW)).toHaveLength(90);
  });
});

describe('recentIncidents', () => {
  it('lists incidents newest first with resolution state', () => {
    const db = openDb(':memory:');
    const monitor = createMonitor(db, { name: 'Demo', url: 'https://demo.test' });
    const first = startIncident(db, monitor.id, '2026-07-01T00:00:00Z', 'HTTP 500');
    resolveIncident(db, first.id, '2026-07-01T00:30:00Z');
    startIncident(db, monitor.id, '2026-07-03T00:00:00Z', 'timeout after 10000ms');

    const incidents = recentIncidents(db, monitor.id);
    expect(incidents).toHaveLength(2);
    expect(incidents[0]).toMatchObject({ reason: 'timeout after 10000ms', resolvedAt: null });
    expect(incidents[1]).toMatchObject({ reason: 'HTTP 500', resolvedAt: '2026-07-01T00:30:00Z' });
  });
});
