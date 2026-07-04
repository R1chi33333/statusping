/**
 * Public status page data: per-monitor daily availability over the
 * last 90 days, GitHub-contribution style, plus an uptime percentage.
 */

import type { Db } from './db.ts';
import { listMonitors, openIncident } from './store.ts';

export type DayState = 'up' | 'degraded' | 'down' | 'empty';

export interface DayCell {
  date: string;
  state: DayState;
  /** Fraction of successful checks, absent for empty days. */
  okRatio?: number;
}

export interface StatusMonitor {
  name: string;
  currentOk: boolean | null;
  /** Percentage of successful checks over the window, e.g. 99.98. */
  uptimePct: number | null;
  days: DayCell[];
  openIncidentSince: string | null;
}

export interface StatusPage {
  generatedAt: string;
  windowDays: number;
  monitors: StatusMonitor[];
}

export const WINDOW_DAYS = 90;

/** Day is degraded until more than half its checks fail. */
export function dayState(okCount: number, failCount: number): DayState {
  const total = okCount + failCount;
  if (total === 0) {
    return 'empty';
  }
  if (failCount === 0) {
    return 'up';
  }
  return failCount / total > 0.5 ? 'down' : 'degraded';
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeStatusPage(db: Db, now: Date = new Date()): StatusPage {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000);
  const sinceIso = since.toISOString();

  const rows = db
    .prepare(
      `SELECT monitor_id, substr(ts, 1, 10) AS day,
              SUM(ok) AS ok_count, COUNT(*) - SUM(ok) AS fail_count
       FROM checks WHERE ts >= ?
       GROUP BY monitor_id, day`,
    )
    .all(sinceIso) as { monitor_id: number; day: string; ok_count: number; fail_count: number }[];

  const byMonitor = new Map<number, Map<string, { ok: number; fail: number }>>();
  for (const row of rows) {
    const days = byMonitor.get(row.monitor_id) ?? new Map<string, { ok: number; fail: number }>();
    days.set(row.day, { ok: row.ok_count, fail: row.fail_count });
    byMonitor.set(row.monitor_id, days);
  }

  const latest = db
    .prepare(
      `SELECT c.monitor_id, c.ok FROM checks c
       JOIN (SELECT monitor_id, MAX(id) AS max_id FROM checks GROUP BY monitor_id) m
         ON m.max_id = c.id`,
    )
    .all() as { monitor_id: number; ok: number }[];
  const latestOk = new Map(latest.map((row) => [row.monitor_id, row.ok === 1]));

  const dayList: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    dayList.push(isoDay(new Date(now.getTime() - i * 86400000)));
  }

  const monitors = listMonitors(db, true).map((monitor): StatusMonitor => {
    const days = byMonitor.get(monitor.id);
    let okTotal = 0;
    let checkTotal = 0;
    const cells = dayList.map((date): DayCell => {
      const counts = days?.get(date);
      if (!counts) {
        return { date, state: 'empty' };
      }
      okTotal += counts.ok;
      checkTotal += counts.ok + counts.fail;
      return {
        date,
        state: dayState(counts.ok, counts.fail),
        okRatio: counts.ok / (counts.ok + counts.fail),
      };
    });

    return {
      name: monitor.name,
      currentOk: latestOk.get(monitor.id) ?? null,
      uptimePct: checkTotal === 0 ? null : Math.round((okTotal / checkTotal) * 10000) / 100,
      days: cells,
      openIncidentSince: openIncident(db, monitor.id)?.startedAt ?? null,
    };
  });

  return { generatedAt: now.toISOString(), windowDays: WINDOW_DAYS, monitors };
}
