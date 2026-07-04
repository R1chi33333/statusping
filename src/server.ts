import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { sendWebhooks, webhookTargets } from './notify.ts';
import { Scheduler } from './scheduler.ts';

const TICK_MS = 15_000;

const config = loadConfig();
const db = openDb(config.databasePath);
const app = buildApp(db, config);

const targets = webhookTargets();
const scheduler = new Scheduler({
  db,
  notify: (event) => sendWebhooks(targets, event),
});

try {
  await app.listen({ port: config.port, host: config.host });
  void scheduler.tick();
  setInterval(() => {
    void scheduler.tick();
  }, TICK_MS);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
