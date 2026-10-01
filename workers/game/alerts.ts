/*
 * Turns a Cloudflare Workers Issues webhook into an email (#1094 monitoring). Issues offers no email destination, so its
 * automation posts here and the Worker emails the inbox Email Routing verified for alerts; sending to a verified destination
 * is free on every plan. The route takes no credential: anyone can call it, so the email carries none of the request and only
 * says to look at the dashboard. At most one is sent per ten minutes: a marker in the Cache API holds that per Cloudflare
 * location, and a timestamp in the isolate holds it even where the cache keeps nothing.
 * The recipient is the one Worker secret, `ALERT_EMAIL_TO`, which keeps the address out of the public repository; until it
 * is set the route is refused like any unknown path.
 */
export const ALERT_WEBHOOK_PATH = '/__play/alerts/issues';
export const ALERT_INTERVAL_SECONDS = 600;

const ALERT_SENDER = 'alerting@dune.zone';
const ALERT_MARKER = 'https://alerts.invalid/last-sent';
let lastSentAt = Number.NEGATIVE_INFINITY;

export type AlertEnv = {
  ALERT_EMAIL: SendEmail;
  ALERT_EMAIL_TO?: string;
};

/** The marker cache: only `match` and `put` are used, so tests can pass a plain object. */
export type AlertMarkers = Pick<Cache, 'match' | 'put'>;

export const ALERT_EMAIL_TEXT = [
  'Cloudflare reported a new or rising issue in a dune.zone Worker.',
  'Open Workers & Pages > Observability > Issues in the Cloudflare dashboard for the details.',
  `Further reports within ${ALERT_INTERVAL_SECONDS / 60} minutes are not emailed.`,
  'Runbook: https://github.com/ndelangen/dunezone/blob/main/docs/technical/play-operations.md',
].join('\n\n');

const answer = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/** Handles the webhook route, or returns null for every other request. */
export async function handleAlertWebhook(
  request: Request,
  pathname: string,
  env: AlertEnv,
  markers: AlertMarkers,
  now = Date.now()
): Promise<Response | null> {
  if (pathname !== ALERT_WEBHOOK_PATH || !env.ALERT_EMAIL_TO) {
    return null;
  }
  if (request.method !== 'POST') {
    return answer(405, { Allow: 'POST' });
  }
  await request.body?.cancel();
  if (now - lastSentAt < ALERT_INTERVAL_SECONDS * 1000 || (await markers.match(ALERT_MARKER))) {
    return answer(202);
  }
  lastSentAt = now;
  await markers.put(
    ALERT_MARKER,
    new Response(null, { headers: { 'Cache-Control': `max-age=${ALERT_INTERVAL_SECONDS}` } })
  );
  try {
    await env.ALERT_EMAIL.send({
      from: { name: 'dune.zone alerts', email: ALERT_SENDER },
      to: env.ALERT_EMAIL_TO,
      subject: '[dune.zone] Worker issue reported',
      text: ALERT_EMAIL_TEXT,
    });
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'alert-email-failed', error: error instanceof Error ? error.name : 'unknown' })
    );
    return answer(502);
  }
  return answer(202);
}
