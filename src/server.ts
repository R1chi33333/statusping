import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';

const config = loadConfig();
const db = openDb(config.databasePath);

const app = Fastify({ logger: true });

app.get('/api/health', () => ({
  ok: true,
  monitors: (db.prepare('SELECT COUNT(*) AS n FROM monitors').get() as { n: number }).n,
}));

// Serve the built web app when present (production image).
const here = dirname(fileURLToPath(import.meta.url));
const webDist = join(here, '..', 'web', 'dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not found' });
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
