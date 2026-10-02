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
export const ALERT_MARKER = 'https://alerts.invalid/last-sent';
let lastSentAt = Number.NEGATIVE_INFINITY;

export type AlertEnv = {
  ALERT_EMAIL: SendEmail;
  ALERT_EMAIL_TO?: string;
};

/** The marker cache: only `match` and `put` are used, so tests can pass a plain object. */
export type AlertMarkers = Pick<Cache, 'match' | 'put'>;

export const ALERT_EMAIL_TEXT = [
  'Cloudflare reported a new or rising issue in a dune.zone Worker.',
  'Open Workers & Pages > dunezone-game > Issues in the Cloudflare dashboard for the details.',
  `Further reports within ${ALERT_INTERVAL_SECONDS / 60} minutes are not emailed.`,
  'Runbook: https://github.com/ndelangen/dunezone/blob/main/docs/technical/play-operations.md',
].join('\n\n');

const answer = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/**
 * Whether an email went out within the interval.
 * The isolate claims the slot before its first await, so two requests arriving together cannot both send;
 * the cache then carries the claim to other isolates in the location.
 * A cache that throws leaves the isolate guard in force.
 */
async function alreadySent(markers: AlertMarkers, now: number): Promise<boolean> {
  if (now - lastSentAt < ALERT_INTERVAL_SECONDS * 1000) {
    return true;
  }
  const previous = lastSentAt;
  lastSentAt = now;
  try {
    if (await markers.match(ALERT_MARKER)) {
      /* Another isolate sent; its marker holds the interval, so this isolate gives its claim back rather than extend it. */
      lastSentAt = previous;
      return true;
    }
    await markers.put(
      ALERT_MARKER,
      new Response(null, { headers: { 'Cache-Control': `max-age=${ALERT_INTERVAL_SECONDS}` } })
    );
  } catch {
    /* The isolate guard above still holds. */
  }
  return false;
}

/**
 * Sends the fixed email.
 * A failure is logged as a warning and still answered 202: an error or a 5xx would itself become a
 * Workers issue and post here again, and the interval already bounds that to one attempt per ten minutes.
 */
async function sendAlert(binding: SendEmail, to: string): Promise<void> {
  try {
    await binding.send({
      from: { name: 'dune.zone alerts', email: ALERT_SENDER },
      to,
      subject: '[dune.zone] Worker issue reported',
      text: ALERT_EMAIL_TEXT,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({ event: 'alert-email-failed', error: error instanceof Error ? error.name : 'unknown' })
    );
  }
}

/** Handles the webhook route, or returns null for every other request. */
export async function handleAlertWebhook(
  request: Request,
  pathname: string,
  env: AlertEnv,
  context: { markers: AlertMarkers; now?: number }
): Promise<Response | null> {
  if (pathname !== ALERT_WEBHOOK_PATH || !env.ALERT_EMAIL_TO) {
    return null;
  }
  if (request.method !== 'POST') {
    return answer(405, { Allow: 'POST' });
  }
  await request.body?.cancel();
  if (!(await alreadySent(context.markers, context.now ?? Date.now()))) {
    await sendAlert(env.ALERT_EMAIL, env.ALERT_EMAIL_TO);
  }
  return answer(202);
}
