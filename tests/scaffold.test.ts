import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';

describe('loadConfig', () => {
  it('reads values from the environment with defaults', () => {
    const config = loadConfig({ PORT: '4100', ADMIN_TOKEN: 'secret' });
    expect(config.port).toBe(4100);
    expect(config.adminToken).toBe('secret');
    expect(config.statusSlug).toBe('status');
    expect(config.databasePath).toContain('statusping.db');
  });
});

describe('openDb', () => {
  it('creates the schema in memory', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['monitors', 'checks', 'incidents']),
    );
    db.close();
  });
});
