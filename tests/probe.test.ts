import { describe, expect, it, vi } from 'vitest';
import { probe } from '../src/probe.ts';

function fetchReturning(response: Response): typeof fetch {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

describe('probe', () => {
  it('reports ok with latency for a 2xx response', async () => {
    const result = await probe({ url: 'https://example.test' }, fetchReturning(new Response('hi')));
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('reports the status code for HTTP errors', async () => {
    const result = await probe(
      { url: 'https://example.test' },
      fetchReturning(new Response('down', { status: 503 })),
    );
    expect(result).toMatchObject({ ok: false, statusCode: 503, error: 'HTTP 503' });
  });

  it('passes when the keyword is present and fails when missing', async () => {
    const hit = await probe(
      { url: 'https://example.test', keyword: 'healthy' },
      fetchReturning(new Response('all healthy here')),
    );
    expect(hit.ok).toBe(true);

    const miss = await probe(
      { url: 'https://example.test', keyword: 'healthy' },
      fetchReturning(new Response('error page')),
    );
    expect(miss.ok).toBe(false);
    expect(miss.error).toContain('keyword');
  });

  it('does not read the body when no keyword is set', async () => {
    const response = new Response('x');
    const spy = vi.spyOn(response, 'text');
    await probe({ url: 'https://example.test' }, fetchReturning(response));
    expect(spy).not.toHaveBeenCalled();
  });

  it('times out slow responses', async () => {
    const never: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });

    const result = await probe({ url: 'https://slow.test', timeoutMs: 20 }, never);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('timeout after 20ms');
  });

  it('reports network errors', async () => {
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await probe({ url: 'https://refused.test' }, failing);
    expect(result).toMatchObject({ ok: false, error: 'ECONNREFUSED' });
  });

  it('sends an identifying user agent', async () => {
    const impl = fetchReturning(new Response('ok'));
    await probe({ url: 'https://example.test' }, impl);
    const init = (impl as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('user-agent')).toContain('statusping');
  });
});
