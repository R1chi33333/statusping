/** Tiny typed client for the admin API. */

export interface LastCheck {
  ts: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

export interface OpenIncident {
  id: number;
  startedAt: string;
  reason: string;
}

export interface MonitorRow {
  id: number;
  name: string;
  url: string;
  keyword: string | null;
  intervalS: number;
  enabled: boolean;
  lastCheck: LastCheck | null;
  openIncident: OpenIncident | null;
}

export interface MonitorInput {
  name: string;
  url: string;
  keyword: string | null;
  intervalS: number;
  enabled?: boolean;
}

const TOKEN_KEY = 'statusping-token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${getToken()}`);
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `request failed: ${String(response.status)}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function verifyToken(token: string): Promise<{ ok: boolean }> {
  return request('/api/auth/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function listMonitors(): Promise<MonitorRow[]> {
  return request('/api/monitors');
}

export function createMonitor(input: MonitorInput): Promise<MonitorRow> {
  return request('/api/monitors', { method: 'POST', body: JSON.stringify(input) });
}

export function updateMonitor(id: number, input: MonitorInput): Promise<MonitorRow> {
  return request(`/api/monitors/${String(id)}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteMonitor(id: number): Promise<void> {
  return request(`/api/monitors/${String(id)}`, { method: 'DELETE' });
}
