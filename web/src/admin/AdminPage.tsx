import { useCallback, useEffect, useState } from 'react';
import { Activity, LogOut, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  clearToken,
  createMonitor,
  deleteMonitor,
  getToken,
  listMonitors,
  setToken,
  updateMonitor,
  verifyToken,
  type MonitorInput,
  type MonitorRow,
} from '@web/lib/api';
import { MonitorForm } from './MonitorForm';

const REFRESH_MS = 15_000;

function StatusDot({ monitor }: { monitor: MonitorRow }) {
  const colour = !monitor.enabled
    ? 'bg-border'
    : monitor.lastCheck === null
      ? 'bg-fg-muted'
      : monitor.lastCheck.ok
        ? 'bg-up'
        : 'bg-down';
  const label = !monitor.enabled
    ? 'paused'
    : monitor.lastCheck === null
      ? 'pending'
      : monitor.lastCheck.ok
        ? 'up'
        : 'down';
  return (
    <span className="flex items-center gap-2">
      <span className={`size-2.5 rounded-full ${colour}`} aria-hidden="true" />
      <span className="text-xs text-fg-muted">{label}</span>
    </span>
  );
}

function TokenGate({ onReady }: { onReady: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();

  return (
    <main className="flex flex-1 items-center justify-center py-16">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          verifyToken(value)
            .then(() => {
              setToken(value);
              onReady();
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'invalid token');
            });
        }}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface-1 p-8"
      >
        <h1 className="text-lg font-semibold">Admin sign in</h1>
        <p className="text-sm leading-relaxed text-fg-muted">
          Enter the ADMIN_TOKEN this instance was started with.
        </p>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          placeholder="admin token"
          aria-label="Admin token"
          className="rounded-md border border-border bg-surface-0 px-3 py-2 font-mono text-sm focus:border-fg-muted focus:outline-none"
        />
        {error && <p className="text-xs text-down">{error}</p>}
        <button
          type="submit"
          className="rounded-md bg-surface-2 px-4 py-2 text-sm font-medium transition-colors hover:bg-border"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}

export function AdminPage() {
  const [authed, setAuthed] = useState(() => getToken() !== '');
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
  const [editing, setEditing] = useState<MonitorRow | 'new' | null>(null);
  const [error, setError] = useState<string>();

  const refresh = useCallback(() => {
    listMonitors()
      .then((rows) => {
        setMonitors(rows);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === 'invalid token') {
          clearToken();
          setAuthed(false);
        } else {
          setError(err instanceof Error ? err.message : 'failed to load');
        }
      });
  }, []);

  useEffect(() => {
    if (!authed) {
      return;
    }
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [authed, refresh]);

  if (!authed) {
    return (
      <TokenGate
        onReady={() => {
          setAuthed(true);
        }}
      />
    );
  }

  async function submit(input: MonitorInput): Promise<void> {
    if (editing === 'new' || editing === null) {
      await createMonitor(input);
    } else {
      await updateMonitor(editing.id, input);
    }
    setEditing(null);
    refresh();
  }

  return (
    <main className="flex flex-1 flex-col gap-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Activity className="size-5 text-up" strokeWidth={1.5} />
          Monitors
        </h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setEditing('new');
            }}
            className="flex items-center gap-1.5 rounded-md bg-surface-2 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-border"
          >
            <Plus className="size-4" strokeWidth={2} />
            Add monitor
          </button>
          <button
            type="button"
            onClick={() => {
              clearToken();
              setAuthed(false);
            }}
            className="flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
            aria-label="Sign out"
          >
            <LogOut className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {editing !== null && (
        <MonitorForm
          initial={editing === 'new' ? undefined : editing}
          onSubmit={submit}
          onCancel={() => {
            setEditing(null);
          }}
        />
      )}

      {error && <p className="text-sm text-down">{error}</p>}

      {monitors.length === 0 && editing === null ? (
        <div className="rounded-lg border border-border bg-surface-1 p-10 text-center">
          <p className="text-sm">No monitors yet</p>
          <p className="mt-1 text-xs text-fg-muted">Add your first URL to start probing.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-1 text-xs text-fg-muted">
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">URL</th>
                <th className="px-4 py-2.5 text-right font-medium">Latency</th>
                <th className="px-4 py-2.5 text-right font-medium">Interval</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {monitors.map((monitor) => (
                <tr key={monitor.id} className="hover:bg-surface-1">
                  <td className="px-4 py-3">
                    <StatusDot monitor={monitor} />
                  </td>
                  <td className="px-4 py-3">{monitor.name}</td>
                  <td className="max-w-64 truncate px-4 py-3 font-mono text-xs text-fg-muted">
                    {monitor.url}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {monitor.lastCheck?.latencyMs != null
                      ? `${String(monitor.lastCheck.latencyMs)}ms`
                      : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-fg-muted">
                    {monitor.intervalS}s
                  </td>
                  <td className="px-2 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(monitor);
                        }}
                        className="rounded p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                        aria-label={`Edit ${monitor.name}`}
                      >
                        <Pencil className="size-4" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void deleteMonitor(monitor.id).then(refresh);
                        }}
                        className="rounded p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-down"
                        aria-label={`Delete ${monitor.name}`}
                      >
                        <Trash2 className="size-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
