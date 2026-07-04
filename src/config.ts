/** Runtime configuration, entirely from environment variables. */

export interface Config {
  port: number;
  host: string;
  /** Path to the SQLite file. */
  databasePath: string;
  /** Bearer token protecting the admin API. Empty disables admin writes. */
  adminToken: string;
  /** Slug of the public status page. */
  statusSlug: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    databasePath: env.DATABASE_PATH ?? './data/statusping.db',
    adminToken: env.ADMIN_TOKEN ?? '',
    statusSlug: env.STATUS_SLUG ?? 'status',
  };
}
