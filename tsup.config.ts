import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  sourcemap: true,
  clean: true,
  // better-sqlite3 is a native module and must stay external.
  external: ['better-sqlite3'],
});
