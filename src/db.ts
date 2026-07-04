import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

/** Open (and migrate) the SQLite database. */
export function openDb(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      keyword TEXT,
      interval_s INTEGER NOT NULL DEFAULT 60,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      ts TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status_code INTEGER,
      latency_ms INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS checks_monitor_ts ON checks(monitor_id, ts);

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      resolved_at TEXT,
      reason TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS incidents_monitor ON incidents(monitor_id, started_at);
  `);
}
