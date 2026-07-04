/** Typed data access over the SQLite schema. */

import type { Db } from './db.ts';
import type { ProbeResult } from './probe.ts';

export interface Monitor {
  id: number;
  name: string;
  url: string;
  keyword: string | null;
  intervalS: number;
  enabled: boolean;
  createdAt: string;
}

export interface Incident {
  id: number;
  monitorId: number;
  startedAt: string;
  resolvedAt: string | null;
  reason: string;
}

interface MonitorRow {
  id: number;
  name: string;
  url: string;
  keyword: string | null;
  interval_s: number;
  enabled: number;
  created_at: string;
}

function toMonitor(row: MonitorRow): Monitor {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    keyword: row.keyword,
    intervalS: row.interval_s,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

export function listMonitors(db: Db, onlyEnabled = false): Monitor[] {
  const rows = db
    .prepare(`SELECT * FROM monitors ${onlyEnabled ? 'WHERE enabled = 1' : ''} ORDER BY id`)
    .all() as MonitorRow[];
  return rows.map(toMonitor);
}

export function getMonitor(db: Db, id: number): Monitor | undefined {
  const row = db.prepare('SELECT * FROM monitors WHERE id = ?').get(id) as MonitorRow | undefined;
  return row ? toMonitor(row) : undefined;
}

export function createMonitor(
  db: Db,
  input: { name: string; url: string; keyword?: string | null; intervalS?: number },
): Monitor {
  const info = db
    .prepare('INSERT INTO monitors (name, url, keyword, interval_s) VALUES (?, ?, ?, ?)')
    .run(input.name, input.url, input.keyword ?? null, input.intervalS ?? 60);
  const monitor = getMonitor(db, Number(info.lastInsertRowid));
  if (!monitor) {
    throw new Error('monitor insert failed');
  }
  return monitor;
}

export function updateMonitor(
  db: Db,
  id: number,
  input: {
    name: string;
    url: string;
    keyword?: string | null;
    intervalS?: number;
    enabled?: boolean;
  },
): Monitor | undefined {
  const existing = getMonitor(db, id);
  if (!existing) {
    return undefined;
  }
  db.prepare(
    'UPDATE monitors SET name = ?, url = ?, keyword = ?, interval_s = ?, enabled = ? WHERE id = ?',
  ).run(
    input.name,
    input.url,
    input.keyword ?? null,
    input.intervalS ?? existing.intervalS,
    (input.enabled ?? existing.enabled) ? 1 : 0,
    id,
  );
  return getMonitor(db, id);
}

export function deleteMonitor(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM monitors WHERE id = ?').run(id).changes > 0;
}

export function insertCheck(db: Db, monitorId: number, ts: string, result: ProbeResult): void {
  db.prepare(
    'INSERT INTO checks (monitor_id, ts, ok, status_code, latency_ms, error) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    monitorId,
    ts,
    result.ok ? 1 : 0,
    result.statusCode ?? null,
    result.latencyMs,
    result.error ?? null,
  );
}

export function lastCheckTs(db: Db, monitorId: number): string | undefined {
  const row = db
    .prepare('SELECT ts FROM checks WHERE monitor_id = ? ORDER BY ts DESC LIMIT 1')
    .get(monitorId) as { ts: string } | undefined;
  return row?.ts;
}

/** The most recent consecutive failure streak length, newest first. */
export function failureStreak(db: Db, monitorId: number, limit = 10): number {
  const rows = db
    .prepare('SELECT ok FROM checks WHERE monitor_id = ? ORDER BY ts DESC, id DESC LIMIT ?')
    .all(monitorId, limit) as { ok: number }[];
  let streak = 0;
  for (const row of rows) {
    if (row.ok === 1) {
      break;
    }
    streak++;
  }
  return streak;
}

export function openIncident(db: Db, monitorId: number): Incident | undefined {
  const row = db
    .prepare('SELECT * FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL')
    .get(monitorId) as
    | {
        id: number;
        monitor_id: number;
        started_at: string;
        resolved_at: string | null;
        reason: string;
      }
    | undefined;
  return row
    ? {
        id: row.id,
        monitorId: row.monitor_id,
        startedAt: row.started_at,
        resolvedAt: row.resolved_at,
        reason: row.reason,
      }
    : undefined;
}

export function startIncident(db: Db, monitorId: number, ts: string, reason: string): Incident {
  const info = db
    .prepare('INSERT INTO incidents (monitor_id, started_at, reason) VALUES (?, ?, ?)')
    .run(monitorId, ts, reason);
  return { id: Number(info.lastInsertRowid), monitorId, startedAt: ts, resolvedAt: null, reason };
}

export function resolveIncident(db: Db, incidentId: number, ts: string): void {
  db.prepare('UPDATE incidents SET resolved_at = ? WHERE id = ?').run(ts, incidentId);
}
