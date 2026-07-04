/**
 * The Fastify application, separated from the listening entrypoint so
 * tests can drive it with inject() against an in-memory database.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import { computeStatusPage } from './status.ts';
import { isHistoryWindow, latencyHistory, recentIncidents } from './history.ts';
import {
  createMonitor,
  deleteMonitor,
  getMonitor,
  listMonitors,
  openIncident,
  updateMonitor,
} from './store.ts';

export interface MonitorInput {
  name: string;
  url: string;
  keyword?: string | null;
  intervalS?: number;
  enabled?: boolean;
}

/** Validate monitor input; returns an error message or null. */
export function validateMonitorInput(input: Partial<MonitorInput>): string | null {
  if (!input.name || input.name.trim().length < 1 || input.name.length > 60) {
    return 'name must be between 1 and 60 characters';
  }
  if (!input.url) {
    return 'url is required';
  }
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return 'url is not valid';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'url must be http or https';
  }
  if (input.intervalS !== undefined) {
    if (!Number.isInteger(input.intervalS) || input.intervalS < 30 || input.intervalS > 3600) {
      return 'intervalS must be an integer between 30 and 3600';
    }
  }
  if (input.keyword != null && input.keyword.length > 100) {
    return 'keyword must be at most 100 characters';
  }
  return null;
}

interface LatestCheckRow {
  monitor_id: number;
  ts: string;
  ok: number;
  latency_ms: number | null;
  error: string | null;
}

/** Latest check per monitor in one query. */
function latestChecks(db: Db): Map<number, LatestCheckRow> {
  const rows = db
    .prepare(
      `SELECT c.monitor_id, c.ts, c.ok, c.latency_ms, c.error
       FROM checks c
       JOIN (SELECT monitor_id, MAX(id) AS max_id FROM checks GROUP BY monitor_id) latest
         ON latest.max_id = c.id`,
    )
    .all() as LatestCheckRow[];
  return new Map(rows.map((row) => [row.monitor_id, row]));
}

export function buildApp(db: Db, config: Config): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV === 'production' });

  const requireAdmin = (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (!config.adminToken) {
      void reply.code(503).send({ error: 'admin API disabled: set ADMIN_TOKEN' });
      return false;
    }
    const header = request.headers.authorization ?? '';
    if (header !== `Bearer ${config.adminToken}`) {
      void reply.code(401).send({ error: 'invalid token' });
      return false;
    }
    return true;
  };

  app.get('/api/health', () => ({
    ok: true,
    monitors: (db.prepare('SELECT COUNT(*) AS n FROM monitors').get() as { n: number }).n,
  }));

  // The public status page data: no auth, but only under the
  // configured slug so the page stays unguessable if wanted.
  app.get('/api/status/:slug', (request, reply) => {
    const { slug } = request.params as { slug: string };
    if (slug !== config.statusSlug) {
      return reply.code(404).send({ error: 'not found' });
    }
    return computeStatusPage(db);
  });

  app.post('/api/auth/verify', (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }
    return { ok: true };
  });

  app.get('/api/monitors', (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }
    const latest = latestChecks(db);
    return listMonitors(db).map((monitor) => {
      const check = latest.get(monitor.id);
      return {
        ...monitor,
        lastCheck: check
          ? {
              ts: check.ts,
              ok: check.ok === 1,
              latencyMs: check.latency_ms,
              error: check.error,
            }
          : null,
        openIncident: openIncident(db, monitor.id) ?? null,
      };
    });
  });

  app.get('/api/monitors/:id/history', (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }
    const id = Number((request.params as { id: string }).id);
    if (!getMonitor(db, id)) {
      return reply.code(404).send({ error: 'monitor not found' });
    }
    const window = (request.query as { window?: string }).window ?? '24h';
    if (!isHistoryWindow(window)) {
      return reply.code(400).send({ error: 'window must be 24h, 7d or 30d' });
    }
    return {
      window,
      buckets: latencyHistory(db, id, window),
      incidents: recentIncidents(db, id),
    };
  });

  app.post('/api/monitors', (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }
    const input = request.body as Partial<MonitorInput>;
    const error = validateMonitorInput(input);
    if (error) {
      return reply.code(400).send({ error });
    }
    return reply.code(201).send(
      createMonitor(db, {
        name: (input.name ?? '').trim(),
        url: input.url ?? '',
        keyword: input.keyword ?? null,
        intervalS: input.intervalS ?? 60,
      }),
    );
  });

  app.put('/api/monitors/:id', (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }
    const id = Number((request.params as { id: string }).id);
    const input = request.body as Partial<MonitorInput>;
    const error = validateMonitorInput(input);
    if (error) {
      return reply.code(400).send({ error });
    }
    const updated = updateMonitor(db, id, {
      name: (input.name ?? '').trim(),
      url: input.url ?? '',
      keyword: input.keyword ?? null,
      intervalS: input.intervalS,
      enabled: input.enabled,
    });
    if (!updated) {
      return reply.code(404).send({ error: 'monitor not found' });
    }
    return updated;
  });

  app.delete('/api/monitors/:id', (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }
    const id = Number((request.params as { id: string }).id);
    if (!getMonitor(db, id)) {
      return reply.code(404).send({ error: 'monitor not found' });
    }
    deleteMonitor(db, id);
    return reply.code(204).send();
  });

  // Serve the built web app when present (production image).
  const here = dirname(fileURLToPath(import.meta.url));
  const webDist = join(here, '..', 'web', 'dist');
  if (existsSync(webDist)) {
    void app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not found' });
    });
  }

  return app;
}
