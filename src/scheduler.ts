/**
 * Probe scheduling and the incident state machine.
 *
 * The scheduler is tick-driven: the server calls tick() on a short
 * interval and every enabled monitor whose own interval has elapsed
 * gets probed. Ticks are cheap when nothing is due, and tests drive
 * time explicitly instead of faking timers.
 *
 * Incident policy: an incident opens after FAILURE_THRESHOLD
 * consecutive failed checks (one flaky request should not page
 * anyone) and resolves on the first successful check.
 */

import type { Db } from './db.ts';
import { probe, type ProbeResult } from './probe.ts';
import {
  failureStreak,
  insertCheck,
  lastCheckTs,
  listMonitors,
  nthLastCheckTs,
  openIncident,
  resolveIncident,
  startIncident,
  type Incident,
  type Monitor,
} from './store.ts';

export const FAILURE_THRESHOLD = 2;

export interface StatusEvent {
  type: 'down' | 'recovery';
  monitor: Monitor;
  incident: Incident;
  result: ProbeResult;
}

export type Notifier = (event: StatusEvent) => Promise<void>;

interface SchedulerOptions {
  db: Db;
  notify?: Notifier;
  probeImpl?: typeof probe;
  now?: () => Date;
}

/**
 * Record one probe result and advance the incident state machine.
 * Returns the event to notify about, if the state changed.
 */
export function recordResult(
  db: Db,
  monitor: Monitor,
  result: ProbeResult,
  ts: string,
): StatusEvent | undefined {
  insertCheck(db, monitor.id, ts, result);
  const current = openIncident(db, monitor.id);

  if (result.ok) {
    if (current) {
      resolveIncident(db, current.id, ts);
      return {
        type: 'recovery',
        monitor,
        incident: { ...current, resolvedAt: ts },
        result,
      };
    }
    return undefined;
  }

  const streak = failureStreak(db, monitor.id);
  if (!current && streak >= FAILURE_THRESHOLD) {
    // The outage began at the first failure of the streak, not at the
    // check that crossed the alert threshold.
    const startedAt = nthLastCheckTs(db, monitor.id, streak) ?? ts;
    const incident = startIncident(db, monitor.id, startedAt, result.error ?? 'check failed');
    return { type: 'down', monitor, incident, result };
  }
  return undefined;
}

export class Scheduler {
  private readonly db: Db;
  private readonly notify: Notifier;
  private readonly probeImpl: typeof probe;
  private readonly now: () => Date;
  private running = false;

  constructor(options: SchedulerOptions) {
    this.db = options.db;
    this.notify = options.notify ?? (() => Promise.resolve());
    this.probeImpl = options.probeImpl ?? probe;
    this.now = options.now ?? (() => new Date());
  }

  /** Probe every enabled monitor whose interval has elapsed. */
  async tick(): Promise<void> {
    if (this.running) {
      return; // a slow previous tick is still probing
    }
    this.running = true;
    try {
      const nowDate = this.now();
      const due = listMonitors(this.db, true).filter((monitor) => {
        const last = lastCheckTs(this.db, monitor.id);
        if (!last) {
          return true;
        }
        return nowDate.getTime() - Date.parse(last) >= monitor.intervalS * 1000;
      });

      await Promise.all(
        due.map(async (monitor) => {
          const result = await this.probeImpl({ url: monitor.url, keyword: monitor.keyword });
          const event = recordResult(this.db, monitor, result, this.now().toISOString());
          if (event) {
            try {
              await this.notify(event);
            } catch {
              // Notification failures must never take the scheduler down.
            }
          }
        }),
      );
    } finally {
      this.running = false;
    }
  }
}
