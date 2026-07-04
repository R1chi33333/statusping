import { useState } from 'react';
import type { MonitorInput, MonitorRow } from '@web/lib/api';

interface MonitorFormProps {
  initial?: MonitorRow;
  onSubmit: (input: MonitorInput) => Promise<void>;
  onCancel: () => void;
}

const inputClass =
  'rounded-md border border-border bg-surface-0 px-3 py-2 text-sm focus:border-fg-muted focus:outline-none';

export function MonitorForm({ initial, onSubmit, onCancel }: MonitorFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [keyword, setKeyword] = useState(initial?.keyword ?? '');
  const [intervalS, setIntervalS] = useState(initial?.intervalS ?? 60);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function submit(event: { preventDefault: () => void }): void {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    onSubmit({
      name: name.trim(),
      url: url.trim(),
      keyword: keyword.trim() === '' ? null : keyword.trim(),
      intervalS,
      enabled: initial?.enabled ?? true,
    })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'request failed');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          Name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            required
            maxLength={60}
            placeholder="Playground"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          URL
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
            required
            type="url"
            placeholder="https://example.com/health"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          Keyword assertion (optional)
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
            }}
            maxLength={100}
            placeholder="expected text in the response"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          Interval (seconds)
          <input
            value={intervalS}
            onChange={(e) => {
              setIntervalS(Number(e.target.value));
            }}
            type="number"
            min={30}
            max={3600}
            step={30}
            className={`${inputClass} font-mono`}
          />
        </label>
      </div>

      {error && <p className="text-xs text-down">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-surface-2 px-4 py-2 text-sm font-medium transition-colors hover:bg-border disabled:opacity-60"
        >
          {busy ? 'Saving...' : initial ? 'Save changes' : 'Add monitor'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
