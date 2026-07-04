import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, validateMonitorInput } from '../src/app.ts';
import { openDb, type Db } from '../src/db.ts';
import { createMonitor, insertCheck } from '../src/store.ts';
import { recordResult } from '../src/scheduler.ts';

const CONFIG = {
  port: 0,
  host: '127.0.0.1',
  databasePath: ':memory:',
  adminToken: 'test-token',
  statusSlug: 'status',
};

const AUTH = { authorization: 'Bearer test-token' };

let db: Db;
let app: FastifyInstance;

beforeEach(() => {
  db = openDb(':memory:');
  app = buildApp(db, CONFIG);
});

afterEach(async () => {
  await app.close();
  db.close();
});

describe('validateMonitorInput', () => {
  it('accepts a sane monitor', () => {
    expect(
      validateMonitorInput({ name: 'Demo', url: 'https://demo.test', intervalS: 60 }),
    ).toBeNull();
  });

  it('rejects bad names, urls, intervals and keywords', () => {
    expect(validateMonitorInput({ name: '', url: 'https://x.test' })).toContain('name');
    expect(validateMonitorInput({ name: 'x'.repeat(61), url: 'https://x.test' })).toContain('name');
    expect(validateMonitorInput({ name: 'ok' })).toContain('url is required');
    expect(validateMonitorInput({ name: 'ok', url: 'not a url' })).toContain('not valid');
    expect(validateMonitorInput({ name: 'ok', url: 'ftp://x.test' })).toContain('http');
    expect(validateMonitorInput({ name: 'ok', url: 'https://x.test', intervalS: 10 })).toContain(
      'intervalS',
    );
    expect(
      validateMonitorInput({ name: 'ok', url: 'https://x.test', keyword: 'k'.repeat(101) }),
    ).toContain('keyword');
  });
});

describe('auth', () => {
  it('rejects missing and wrong tokens', async () => {
    const noToken = await app.inject({ method: 'GET', url: '/api/monitors' });
    expect(noToken.statusCode).toBe(401);

    const wrong = await app.inject({
      method: 'GET',
      url: '/api/monitors',
      headers: { authorization: 'Bearer nope' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('reports 503 when no admin token is configured', async () => {
    const openApp = buildApp(db, { ...CONFIG, adminToken: '' });
    const response = await openApp.inject({ method: 'GET', url: '/api/monitors' });
    expect(response.statusCode).toBe(503);
    await openApp.close();
  });

  it('verifies a valid token', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/verify', headers: AUTH });
    expect(response.statusCode).toBe(200);
  });
});

describe('monitor CRUD', () => {
  it('creates, lists, updates and deletes monitors', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/monitors',
      headers: AUTH,
      payload: { name: 'Playground', url: 'https://nz-bank-parser.vercel.app' },
    });
    expect(created.statusCode).toBe(201);
    const monitor = created.json<{ id: number; intervalS: number }>();
    expect(monitor.intervalS).toBe(60);

    const listed = await app.inject({ method: 'GET', url: '/api/monitors', headers: AUTH });
    expect(listed.json<unknown[]>()).toHaveLength(1);

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/monitors/${String(monitor.id)}`,
      headers: AUTH,
      payload: {
        name: 'Playground',
        url: 'https://nz-bank-parser.vercel.app',
        intervalS: 120,
        enabled: false,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<{ intervalS: number; enabled: boolean }>()).toMatchObject({
      intervalS: 120,
      enabled: false,
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/monitors/${String(monitor.id)}`,
      headers: AUTH,
    });
    expect(deleted.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: '/api/monitors', headers: AUTH });
    expect(after.json<unknown[]>()).toHaveLength(0);
  });

  it('rejects invalid input with 400 and unknown ids with 404', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/monitors',
      headers: AUTH,
      payload: { name: 'x', url: 'nope' },
    });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'PUT',
      url: '/api/monitors/999',
      headers: AUTH,
      payload: { name: 'x', url: 'https://x.test' },
    });
    expect(missing.statusCode).toBe(404);

    const missingDelete = await app.inject({
      method: 'DELETE',
      url: '/api/monitors/999',
      headers: AUTH,
    });
    expect(missingDelete.statusCode).toBe(404);
  });

  it('includes the latest check and open incident in the list', async () => {
    const monitor = createMonitor(db, { name: 'Demo', url: 'https://demo.test' });
    insertCheck(db, monitor.id, '2026-07-04T00:00:00Z', {
      ok: true,
      statusCode: 200,
      latencyMs: 55,
    });
    const down = { ok: false, latencyMs: 10, error: 'HTTP 503', statusCode: 503 };
    recordResult(db, monitor, down, '2026-07-04T00:01:00Z');
    recordResult(db, monitor, down, '2026-07-04T00:02:00Z');

    const listed = await app.inject({ method: 'GET', url: '/api/monitors', headers: AUTH });
    const [entry] =
      listed.json<
        { lastCheck: { ok: boolean; error: string }; openIncident: { reason: string } }[]
      >();
    expect(entry?.lastCheck).toMatchObject({ ok: false, error: 'HTTP 503' });
    expect(entry?.openIncident).toMatchObject({ reason: 'HTTP 503' });
  });
});
