/**
 * Generic webhook notifier. Kept English/generic on purpose — the CLI layer
 * is responsible for composing human-facing (Turkish) message text and
 * passing it in here.
 */

const CONSOLE_PREFIX = "[ssl-watch]";

/** Logs a notification to the console. Always succeeds, never throws. */
export function sendConsoleNotification(message: string): void {
  console.log(`${CONSOLE_PREFIX} ${message}`);
}

export type WebhookFormat = "discord" | "slack";

export interface WebhookResult {
  ok: true;
  status: number;
}

/**
 * POSTs `message` to a Discord or Slack incoming webhook URL.
 *
 * Discord webhooks expect `{ "content": string }`; Slack incoming webhooks
 * expect `{ "text": string }` — `format` picks which JSON key is used.
 *
 * Throws on a non-2xx response or network failure rather than swallowing
 * it, so callers can decide how to handle/report the failure.
 */
export async function sendWebhookNotification(
  webhookUrl: string,
  message: string,
  format: WebhookFormat = "discord",
  fetchImpl: typeof fetch = fetch
): Promise<WebhookResult> {
  const bodyKey = format === "slack" ? "text" : "content";
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ [bodyKey]: message }),
  });

  if (!response.ok) {
    throw new Error(
      `Webhook request to ${webhookUrl} failed with status ${response.status} ${response.statusText}`
    );
  }

  return { ok: true, status: response.status };
}

export interface NotifyTargets {
  discordWebhookUrl?: string;
  slackWebhookUrl?: string;
}

/**
 * Always logs `message` to the console, and additionally POSTs it to
 * whichever webhook URLs are configured in `targets` (skipping any that are
 * undefined/empty). A failure on one webhook is logged and does not stop
 * the others from being attempted.
 */
export async function notifyAll(
  message: string,
  targets: NotifyTargets = {},
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  sendConsoleNotification(message);

  const jobs: Promise<void>[] = [];

  if (targets.discordWebhookUrl) {
    jobs.push(
      sendWebhookNotification(targets.discordWebhookUrl, message, "discord", fetchImpl)
        .then(() => undefined)
        .catch((err: unknown) => {
          console.error(
            `${CONSOLE_PREFIX} Discord webhook notification failed: ${err instanceof Error ? err.message : String(err)}`
          );
        })
    );
  }

  if (targets.slackWebhookUrl) {
    jobs.push(
      sendWebhookNotification(targets.slackWebhookUrl, message, "slack", fetchImpl)
        .then(() => undefined)
        .catch((err: unknown) => {
          console.error(
            `${CONSOLE_PREFIX} Slack webhook notification failed: ${err instanceof Error ? err.message : String(err)}`
          );
        })
    );
  }

  await Promise.all(jobs);
}
