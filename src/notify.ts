/**
 * Webhook notifications: one message when a monitor goes down, one
 * when it recovers. Discord and Slack accept nearly identical
 * minimal payloads, so both are supported with one formatter.
 */

import type { StatusEvent } from './scheduler.ts';

export interface WebhookTarget {
  kind: 'discord' | 'slack';
  url: string;
}

/** Read webhook targets from the environment. */
export function webhookTargets(env: NodeJS.ProcessEnv = process.env): WebhookTarget[] {
  const targets: WebhookTarget[] = [];
  if (env.WEBHOOK_DISCORD_URL) {
    targets.push({ kind: 'discord', url: env.WEBHOOK_DISCORD_URL });
  }
  if (env.WEBHOOK_SLACK_URL) {
    targets.push({ kind: 'slack', url: env.WEBHOOK_SLACK_URL });
  }
  return targets;
}

/** "13m" / "2h 05m" durations for recovery messages. */
export function formatDuration(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  if (minutes < 60) {
    return `${String(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  return `${String(hours)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function formatMessage(event: StatusEvent): string {
  if (event.type === 'down') {
    return `DOWN: ${event.monitor.name} (${event.monitor.url}) — ${event.incident.reason}`;
  }
  const duration = event.incident.resolvedAt
    ? formatDuration(event.incident.startedAt, event.incident.resolvedAt)
    : 'unknown duration';
  return `RECOVERED: ${event.monitor.name} (${event.monitor.url}) — down for ${duration}`;
}

export function buildPayload(kind: WebhookTarget['kind'], message: string): Record<string, string> {
  return kind === 'discord' ? { content: message } : { text: message };
}

/** Post the event to every configured webhook; failures are isolated. */
export async function sendWebhooks(
  targets: readonly WebhookTarget[],
  event: StatusEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const message = formatMessage(event);
  await Promise.all(
    targets.map(async (target) => {
      try {
        await fetchImpl(target.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(target.kind, message)),
        });
      } catch {
        // One unreachable webhook must not affect the others.
      }
    }),
  );
}
