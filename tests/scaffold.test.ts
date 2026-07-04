import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';

describe('loadConfig', () => {
  it('uses defaults for an empty environment', () => {
    const config = loadConfig({});
    expect(config).toEqual({
      port: 3000,
      host: '0.0.0.0',
      databasePath: './data/statusping.db',
      adminToken: '',
      statusSlug: 'status',
    });
  });

  it('reads every value from the environment', () => {
    const config = loadConfig({
      PORT: '4100',
      HOST: '127.0.0.1',
      DATABASE_PATH: '/tmp/x.db',
      ADMIN_TOKEN: 'secret',
      STATUS_SLUG: 'portfolio',
    });
    expect(config).toEqual({
      port: 4100,
      host: '127.0.0.1',
      databasePath: '/tmp/x.db',
      adminToken: 'secret',
      statusSlug: 'portfolio',
    });
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
