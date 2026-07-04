import { useEffect, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getToken, type MonitorRow } from '@web/lib/api';

type HistoryWindow = '24h' | '7d' | '30d';

interface HistoryBucket {
  ts: string;
  avgLatencyMs: number | null;
  okRatio: number;
  checks: number;
}

interface IncidentRow {
  id: number;
  startedAt: string;
  resolvedAt: string | null;
  reason: string;
}

interface HistoryResponse {
  window: HistoryWindow;
  buckets: HistoryBucket[];
  incidents: IncidentRow[];
}

const WINDOWS: HistoryWindow[] = ['24h', '7d', '30d'];

function formatTick(ts: string, window: HistoryWindow): string {
  const date = new Date(ts);
  return window === '24h'
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function MonitorDetail({ monitor }: { monitor: MonitorRow }) {
  const [window, setWindow] = useState<HistoryWindow>('24h');
  const [data, setData] = useState<HistoryResponse>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetch(`/api/monitors/${String(monitor.id)}/history?window=${window}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('failed to load history');
        }
        setData((await response.json()) as HistoryResponse);
        setError(undefined);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'failed to load history');
      });
  }, [monitor.id, window]);

  return (
    <div className="flex flex-col gap-4 border-t border-border bg-surface-0/40 px-4 py-4">
      <div className="flex items-center gap-1">
        {WINDOWS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setWindow(option);
            }}
            className={`rounded-md px-2.5 py-1 font-mono text-xs transition-colors ${
              window === option
                ? 'bg-surface-2 text-fg'
                : 'text-fg-muted hover:bg-surface-1 hover:text-fg'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-down">{error}</p>}

      <div className="h-40">
        {data && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.buckets} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="latency" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="ts"
                tick={{ fill: '#a1a1aa', fontSize: 10 }}
                tickFormatter={(ts: string) => formatTick(ts, data.window)}
                minTickGap={60}
                axisLine={{ stroke: '#27272a' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#a1a1aa', fontSize: 10 }}
                tickFormatter={(value: number) => `${String(value)}ms`}
                width={52}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#a1a1aa' }}
                labelFormatter={(ts) => new Date(String(ts)).toLocaleString()}
                formatter={(value) => [`${String(value)}ms`, 'avg latency']}
              />
              <Area
                type="monotone"
                dataKey="avgLatencyMs"
                stroke="#22c55e"
                strokeWidth={1.5}
                fill="url(#latency)"
                connectNulls
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div>
        <h3 className="text-xs font-medium text-fg-muted">Incidents</h3>
        {data?.incidents.length === 0 && (
          <p className="mt-2 text-xs text-fg-muted">No incidents recorded.</p>
        )}
        <ul className="mt-2 flex flex-col gap-1.5">
          {data?.incidents.map((incident) => (
            <li key={incident.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`size-2 rounded-full ${incident.resolvedAt ? 'bg-up' : 'bg-down'}`}
                aria-hidden="true"
              />
              <span className="font-mono text-fg-muted">
                {new Date(incident.startedAt).toLocaleString()}
              </span>
              <span>{incident.reason}</span>
              <span className="text-fg-muted">
                {incident.resolvedAt
                  ? `resolved ${new Date(incident.resolvedAt).toLocaleString()}`
                  : 'ongoing'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
