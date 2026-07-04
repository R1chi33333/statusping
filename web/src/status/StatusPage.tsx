import { useEffect, useState } from 'react';

interface DayCell {
  date: string;
  state: 'up' | 'degraded' | 'down' | 'empty';
  okRatio?: number;
}

interface StatusMonitor {
  name: string;
  currentOk: boolean | null;
  uptimePct: number | null;
  days: DayCell[];
  openIncidentSince: string | null;
}

interface StatusData {
  generatedAt: string;
  windowDays: number;
  monitors: StatusMonitor[];
}

const CELL_COLOURS: Record<DayCell['state'], string> = {
  up: 'bg-up',
  degraded: 'bg-up/40',
  down: 'bg-down',
  empty: 'bg-surface-2',
};

function Pill({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return (
      <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-fg-muted">
        pending
      </span>
    );
  }
  return ok ? (
    <span className="rounded-full bg-up/15 px-2.5 py-0.5 text-xs font-medium text-up">
      Operational
    </span>
  ) : (
    <span className="rounded-full bg-down/15 px-2.5 py-0.5 text-xs font-medium text-down">
      Down
    </span>
  );
}

function AvailabilityBars({ days }: { days: DayCell[] }) {
  return (
    <div className="flex h-8 items-stretch gap-px" role="img" aria-label="Daily availability">
      {days.map((day) => (
        <span
          key={day.date}
          title={`${day.date}: ${day.state}${
            day.okRatio !== undefined ? ` (${String(Math.round(day.okRatio * 100))}% ok)` : ''
          }`}
          className={`min-w-0 flex-1 rounded-[1px] ${CELL_COLOURS[day.state]}`}
        />
      ))}
    </div>
  );
}

export function StatusPage({ slug }: { slug: string }) {
  const [data, setData] = useState<StatusData>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const load = () => {
      fetch(`/api/status/${slug}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(response.status === 404 ? 'status page not found' : 'failed to load');
          }
          setData((await response.json()) as StatusData);
          setError(undefined);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'failed to load');
        });
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, [slug]);

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center py-16 text-sm text-fg-muted">
        {error}
      </main>
    );
  }
  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center py-16 text-sm text-fg-muted">
        Loading...
      </main>
    );
  }

  const allUp = data.monitors.every((monitor) => monitor.currentOk !== false);

  return (
    <main className="flex flex-1 flex-col gap-6 py-10">
      <div className="flex items-center gap-3">
        <span className={`size-3 rounded-full ${allUp ? 'bg-up' : 'bg-down'}`} aria-hidden="true" />
        <h1 className="text-xl font-semibold">
          {allUp ? 'All systems operational' : 'Some systems are down'}
        </h1>
      </div>

      <div className="flex flex-col gap-4">
        {data.monitors.map((monitor) => (
          <section key={monitor.name} className="rounded-lg border border-border bg-surface-1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{monitor.name}</h2>
              <div className="flex items-center gap-3">
                {monitor.uptimePct !== null && (
                  <span className="font-mono text-xs text-fg-muted">
                    {monitor.uptimePct.toFixed(2)}% uptime
                  </span>
                )}
                <Pill ok={monitor.currentOk} />
              </div>
            </div>
            <div className="mt-3">
              <AvailabilityBars days={monitor.days} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-fg-muted">
              <span>{data.windowDays} days ago</span>
              <span>today</span>
            </div>
          </section>
        ))}
        {data.monitors.length === 0 && (
          <p className="text-sm text-fg-muted">No monitors on this page yet.</p>
        )}
      </div>

      <p className="text-xs text-fg-muted">
        Updated {new Date(data.generatedAt).toLocaleString()}. Powered by StatusPing.
      </p>
    </main>
  );
}
