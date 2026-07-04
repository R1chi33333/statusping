/**
 * A single HTTP probe. Pure with respect to its inputs: the fetch
 * implementation is injected so tests never touch the network.
 */

export interface ProbeTarget {
  url: string;
  /** When set, the response body must contain this string. */
  keyword?: string | null;
  timeoutMs?: number;
}

export interface ProbeResult {
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  /** Human-readable reason when not ok. */
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function probe(
  target: ProbeTarget,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const timeoutMs = target.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);

  try {
    const response = await fetchImpl(target.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'statusping/1.0 (+https://github.com/R1chi33333/statusping)' },
      redirect: 'follow',
    });
    const latencyMs = elapsed();

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        latencyMs,
        error: `HTTP ${String(response.status)}`,
      };
    }

    if (target.keyword) {
      const body = await response.text();
      if (!body.includes(target.keyword)) {
        return {
          ok: false,
          statusCode: response.status,
          latencyMs: elapsed(),
          error: `keyword "${target.keyword}" not found in response`,
        };
      }
    }

    return { ok: true, statusCode: response.status, latencyMs };
  } catch (error) {
    const latencyMs = elapsed();
    if (controller.signal.aborted) {
      return { ok: false, latencyMs, error: `timeout after ${String(timeoutMs)}ms` };
    }
    return {
      ok: false,
      latencyMs,
      error: error instanceof Error ? error.message : 'request failed',
    };
  } finally {
    clearTimeout(timer);
  }
}
