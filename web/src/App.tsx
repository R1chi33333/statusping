import { Activity } from 'lucide-react';
import { AdminPage } from './admin/AdminPage';

export default function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6">
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

      <AdminPage />

      <footer className="border-t border-border py-4 text-xs text-fg-muted">
        MIT licensed. Fastify, SQLite and one Dockerfile.
      </footer>
    </div>
  );
}
