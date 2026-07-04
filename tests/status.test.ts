import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.ts';
import { computeStatusPage, dayState, WINDOW_DAYS } from '../src/status.ts';
import { createMonitor, insertCheck } from '../src/store.ts';
import { recordResult } from '../src/scheduler.ts';

const NOW = new Date('2026-07-04T12:00:00Z');
const UP = { ok: true, statusCode: 200, latencyMs: 40 };
const DOWN = { ok: false, statusCode: 503, latencyMs: 90, error: 'HTTP 503' };

describe('dayState', () => {
  it('classifies days by failure share', () => {
    expect(dayState(0, 0)).toBe('empty');
    expect(dayState(10, 0)).toBe('up');
    expect(dayState(9, 1)).toBe('degraded');
    expect(dayState(5, 5)).toBe('degraded');
    expect(dayState(1, 9)).toBe('down');
    expect(dayState(0, 3)).toBe('down');
  });
});

describe('computeStatusPage', () => {
  it('builds a 90 day window with uptime percentage', () => {
    const db = openDb(':memory:');
    const monitor = createMonitor(db, { name: 'Demo', url: 'https://demo.test' });

    insertCheck(db, monitor.id, '2026-07-03T10:00:00Z', UP);
    insertCheck(db, monitor.id, '2026-07-03T10:01:00Z', UP);
    insertCheck(db, monitor.id, '2026-07-03T10:02:00Z', DOWN);
    insertCheck(db, monitor.id, '2026-07-04T09:00:00Z', UP);

    const page = computeStatusPage(db, NOW);
    const entry = page.monitors[0];

    expect(page.windowDays).toBe(WINDOW_DAYS);
    expect(entry?.days).toHaveLength(WINDOW_DAYS);
    expect(entry?.days.at(-1)).toMatchObject({ date: '2026-07-04', state: 'up' });
    expect(entry?.days.at(-2)).toMatchObject({ date: '2026-07-03', state: 'degraded' });
    expect(entry?.days.at(-3)?.state).toBe('empty');
    expect(entry?.uptimePct).toBe(75);
    expect(entry?.currentOk).toBe(true);
  });

  it('marks the open incident and current down state', () => {
    const db = openDb(':memory:');
    const monitor = createMonitor(db, { name: 'Down', url: 'https://down.test' });
    recordResult(db, monitor, DOWN, '2026-07-04T10:00:00Z');
    recordResult(db, monitor, DOWN, '2026-07-04T10:01:00Z');

    const entry = computeStatusPage(db, NOW).monitors[0];
    expect(entry?.currentOk).toBe(false);
    expect(entry?.openIncidentSince).toBe('2026-07-04T10:00:00Z');
    expect(entry?.days.at(-1)?.state).toBe('down');
  });

  it('excludes disabled monitors and handles the empty database', () => {
    const db = openDb(':memory:');
    const monitor = createMonitor(db, { name: 'Paused', url: 'https://x.test' });
    db.prepare('UPDATE monitors SET enabled = 0 WHERE id = ?').run(monitor.id);

    const page = computeStatusPage(db, NOW);
    expect(page.monitors).toHaveLength(0);
  });

  it('reports null uptime for a monitor with no checks yet', () => {
    const db = openDb(':memory:');
    createMonitor(db, { name: 'Fresh', url: 'https://fresh.test' });

    const entry = computeStatusPage(db, NOW).monitors[0];
    expect(entry?.uptimePct).toBeNull();
    expect(entry?.currentOk).toBeNull();
    expect(entry?.days.every((day) => day.state === 'empty')).toBe(true);
  });
});
