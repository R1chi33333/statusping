import { Activity } from 'lucide-react';

export default function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6">
      <header className="flex items-center justify-between border-b border-border py-4">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-up" strokeWidth={1.5} />
          <span className="text-sm font-semibold">StatusPing</span>
        </div>
        <a
          href="https://github.com/R1chi33333/statusping"
          className="text-sm text-fg-muted transition-colors hover:text-fg"
        >
          GitHub
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
        <h1 className="max-w-xl text-3xl font-semibold tracking-tight">
          Uptime monitoring you can self-host in one container
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-fg-muted">
          Probe any URL every minute, track latency, get webhook alerts, and share a public status
          page. Dashboard under construction.
        </p>
      </main>

      <footer className="border-t border-border py-4 text-xs text-fg-muted">
        MIT licensed. Fastify, SQLite and one Dockerfile.
      </footer>
    </div>
  );
}
