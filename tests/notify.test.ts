import { describe, expect, it, vi } from 'vitest';
import {
  buildPayload,
  formatDuration,
  formatMessage,
  sendWebhooks,
  webhookTargets,
} from '../src/notify.ts';
import type { StatusEvent } from '../src/scheduler.ts';

const MONITOR = {
  id: 1,
  name: 'Playground',
  url: 'https://nz-bank-parser.vercel.app',
  keyword: null,
  intervalS: 60,
  enabled: true,
  createdAt: '2026-07-04T00:00:00Z',
};

const DOWN_EVENT: StatusEvent = {
  type: 'down',
  monitor: MONITOR,
  incident: {
    id: 7,
    monitorId: 1,
    startedAt: '2026-07-04T01:00:00Z',
    resolvedAt: null,
    reason: 'HTTP 503',
  },
  result: { ok: false, statusCode: 503, latencyMs: 120, error: 'HTTP 503' },
};

const RECOVERY_EVENT: StatusEvent = {
  ...DOWN_EVENT,
  type: 'recovery',
  incident: { ...DOWN_EVENT.incident, resolvedAt: '2026-07-04T02:05:00Z' },
  result: { ok: true, statusCode: 200, latencyMs: 90 },
};

describe('webhookTargets', () => {
  it('reads configured webhooks and skips missing ones', () => {
    expect(webhookTargets({})).toEqual([]);
    expect(
      webhookTargets({
        WEBHOOK_DISCORD_URL: 'https://d.test',
        WEBHOOK_SLACK_URL: 'https://s.test',
      }),
    ).toEqual([
      { kind: 'discord', url: 'https://d.test' },
      { kind: 'slack', url: 'https://s.test' },
    ]);
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration('2026-07-04T01:00:00Z', '2026-07-04T01:13:00Z')).toBe('13m');
    expect(formatDuration('2026-07-04T01:00:00Z', '2026-07-04T03:05:00Z')).toBe('2h 05m');
  });
});

describe('formatMessage', () => {
  it('names the monitor and reason when down', () => {
    expect(formatMessage(DOWN_EVENT)).toBe(
      'DOWN: Playground (https://nz-bank-parser.vercel.app) — HTTP 503',
    );
  });

  it('includes the outage duration on recovery', () => {
    expect(formatMessage(RECOVERY_EVENT)).toBe(
      'RECOVERED: Playground (https://nz-bank-parser.vercel.app) — down for 1h 05m',
    );
  });
});

describe('buildPayload', () => {
  it('shapes payloads per service', () => {
    expect(buildPayload('discord', 'hello')).toEqual({ content: 'hello' });
    expect(buildPayload('slack', 'hello')).toEqual({ text: 'hello' });
  });
});

describe('sendWebhooks', () => {
  it('posts JSON to every target', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    await sendWebhooks(
      [
        { kind: 'discord', url: 'https://d.test' },
        { kind: 'slack', url: 'https://s.test' },
      ],
      DOWN_EVENT,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const discordInit = fetchImpl.mock.calls[0]?.[1];
    const body = typeof discordInit?.body === 'string' ? discordInit.body : '{}';
    expect(JSON.parse(body)).toEqual({
      content: formatMessage(DOWN_EVENT),
    });
  });

  it('keeps going when one webhook fails', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(new Response('ok'));

    await expect(
      sendWebhooks(
        [
          { kind: 'discord', url: 'https://d.test' },
          { kind: 'slack', url: 'https://s.test' },
        ],
        RECOVERY_EVENT,
        fetchImpl,
      ),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
