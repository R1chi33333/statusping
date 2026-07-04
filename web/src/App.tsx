import { Activity } from 'lucide-react';
import { AdminPage } from './admin/AdminPage';
import { StatusPage } from './status/StatusPage';

/** Path-based routing: /status/:slug is public, everything else is admin. */
function route(): { page: 'status'; slug: string } | { page: 'admin' } {
  const match = /^\/status\/([\w-]+)\/?$/.exec(window.location.pathname);
  return match?.[1] ? { page: 'status', slug: match[1] } : { page: 'admin' };
}

export default function App() {
  const current = route();

  return (
    <div className="mx-auto flex min-h-screen max-w-[1000px] flex-col px-6">
      <header className="flex items-center justify-between border-b border-border py-4">
        <a href="/" className="flex items-center gap-2">
          <Activity className="size-5 text-up" strokeWidth={1.5} />
          <span className="text-sm font-semibold">StatusPing</span>
        </a>
        <a
          href="https://github.com/R1chi33333/statusping"
          className="text-sm text-fg-muted transition-colors hover:text-fg"
        >
          GitHub
        </a>
      </header>

      {current.page === 'status' ? <StatusPage slug={current.slug} /> : <AdminPage />}

      <footer className="border-t border-border py-4 text-xs text-fg-muted">
        MIT licensed. Fastify, SQLite and one Dockerfile.
      </footer>
    </div>
  );
}
