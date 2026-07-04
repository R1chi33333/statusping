import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/db.ts';
import { FAILURE_THRESHOLD, recordResult, Scheduler, type StatusEvent } from '../src/scheduler.ts';
import { createMonitor, openIncident, type Monitor } from '../src/store.ts';
import type { ProbeResult } from '../src/probe.ts';

const UP: ProbeResult = { ok: true, statusCode: 200, latencyMs: 42 };
const DOWN: ProbeResult = { ok: false, statusCode: 503, latencyMs: 87, error: 'HTTP 503' };

function setup(): { db: ReturnType<typeof openDb>; monitor: Monitor } {
  const db = openDb(':memory:');
  const monitor = createMonitor(db, { name: 'Demo', url: 'https://demo.test', intervalS: 60 });
  return { db, monitor };
}

describe('recordResult incident state machine', () => {
  it('opens an incident only after consecutive failures reach the threshold', () => {
    const { db, monitor } = setup();

    const first = recordResult(db, monitor, DOWN, '2026-07-04T00:00:00Z');
    expect(first).toBeUndefined();
    expect(openIncident(db, monitor.id)).toBeUndefined();

    const second = recordResult(db, monitor, DOWN, '2026-07-04T00:01:00Z');
    expect(second?.type).toBe('down');
    expect(second?.incident.reason).toBe('HTTP 503');
    expect(openIncident(db, monitor.id)).toBeDefined();
  });

  it('does not open a second incident while one is active', () => {
    const { db, monitor } = setup();
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      recordResult(db, monitor, DOWN, `2026-07-04T00:0${String(i)}:00Z`);
    }
    const again = recordResult(db, monitor, DOWN, '2026-07-04T00:05:00Z');
    expect(again).toBeUndefined();
  });

  it('a lone failure between successes never alerts', () => {
    const { db, monitor } = setup();
    recordResult(db, monitor, UP, '2026-07-04T00:00:00Z');
    const blip = recordResult(db, monitor, DOWN, '2026-07-04T00:01:00Z');
    const back = recordResult(db, monitor, UP, '2026-07-04T00:02:00Z');
    expect(blip).toBeUndefined();
    expect(back).toBeUndefined();
  });

  it('resolves the incident and emits recovery on the first success', () => {
    const { db, monitor } = setup();
    recordResult(db, monitor, DOWN, '2026-07-04T00:00:00Z');
    recordResult(db, monitor, DOWN, '2026-07-04T00:01:00Z');

    const recovery = recordResult(db, monitor, UP, '2026-07-04T00:02:00Z');
    expect(recovery?.type).toBe('recovery');
    expect(recovery?.incident.resolvedAt).toBe('2026-07-04T00:02:00Z');
    expect(openIncident(db, monitor.id)).toBeUndefined();
  });
});

describe('Scheduler.tick', () => {
  it('probes monitors that are due and skips ones that are not', async () => {
    const { db, monitor } = setup();
    createMonitor(db, { name: 'Slow', url: 'https://slow.test', intervalS: 3600 });

    let clock = Date.parse('2026-07-04T00:00:00Z');
    const probeImpl = vi.fn().mockResolvedValue(UP);
    const scheduler = new Scheduler({ db, probeImpl, now: () => new Date(clock) });

    await scheduler.tick(); // both never checked: both probed
    expect(probeImpl).toHaveBeenCalledTimes(2);

    clock += 61_000;
    await scheduler.tick(); // only the 60s monitor is due again
    expect(probeImpl).toHaveBeenCalledTimes(3);
    expect(probeImpl.mock.calls[2]?.[0]).toMatchObject({ url: monitor.url });
  });

  it('skips disabled monitors', async () => {
    const { db, monitor } = setup();
    db.prepare('UPDATE monitors SET enabled = 0 WHERE id = ?').run(monitor.id);
    const probeImpl = vi.fn().mockResolvedValue(UP);
    const scheduler = new Scheduler({ db, probeImpl });

    await scheduler.tick();
    expect(probeImpl).not.toHaveBeenCalled();
  });

  it('notifies on state changes and survives notifier failures', async () => {
    const { db } = setup();
    const events: StatusEvent[] = [];
    const notify = vi.fn((event: StatusEvent) => {
      events.push(event);
      return Promise.reject(new Error('webhook exploded'));
    });

    let clock = Date.parse('2026-07-04T00:00:00Z');
    const probeImpl = vi.fn().mockResolvedValue(DOWN);
    const scheduler = new Scheduler({ db, probeImpl, notify, now: () => new Date(clock) });

    await scheduler.tick();
    clock += 61_000;
    await scheduler.tick(); // second failure: incident opens, notify throws

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('down');

    clock += 61_000;
    await expect(scheduler.tick()).resolves.toBeUndefined();
  });
});
