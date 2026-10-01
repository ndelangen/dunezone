/*
 * Relays Cloudflare Workers Issues to email (#1094 monitoring): an Issues automation posts its generic webhook here, and the
 * Worker emails a short summary to the inbox Email Routing verified for alerts. Cloudflare offers Issues no email destination,
 * and sending to a verified destination is free on every plan.
 * Until both secrets are set the path answers like any other reserved path, so nothing is exposed before it is configured.
 */
export const ALERT_WEBHOOK_PATH = '/__alerts/issues';

const ALERT_SENDER = 'alerting@dune.zone';
const MAX_BODY_BYTES = 65_536;
const MAX_DETAIL_CHARS = 8000;
const MAX_SUBJECT_CHARS = 120;

export type AlertEnv = {
  ALERT_EMAIL: SendEmail;
  /* The value the automation sends in `cf-webhook-auth`. */
  ALERT_WEBHOOK_SECRET?: string;
  /* A destination address verified in Email Routing; kept as a secret so the address is not published. */
  ALERT_EMAIL_TO?: string;
};

function noStore(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function digest(value: string): Promise<ArrayBuffer> {
  return await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
}

/* Hashing first gives both sides the same length, so the comparison takes the same time whatever was sent. */
async function secretMatches(sent: string | null, expected: string): Promise<boolean> {
  if (sent === null) {
    return false;
  }
  const [a, b] = await Promise.all([digest(sent), digest(expected)]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function oneLine(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim() : undefined;
}

/** The email for one webhook payload. The payload shape varies by alert type, so only `name`, `text` and the rest as JSON are used. */
export function alertEmail(payload: unknown): { subject: string; text: string } {
  const fields = payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const title = oneLine(fields.name) ?? oneLine(fields.alert_type) ?? 'Workers issue';
  const summary = typeof fields.text === 'string' ? fields.text : '';
  const detail = JSON.stringify(payload, null, 2).slice(0, MAX_DETAIL_CHARS);
  return {
    subject: `[dune.zone] ${title}`.slice(0, MAX_SUBJECT_CHARS),
    text: [summary, 'Full payload:', detail, 'Runbook: docs/technical/play-operations.md'].filter(Boolean).join('\n\n'),
  };
}

export async function handleAlertWebhook(request: Request, env: AlertEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== ALERT_WEBHOOK_PATH) {
    return null;
  }
  const secret = env.ALERT_WEBHOOK_SECRET;
  const to = env.ALERT_EMAIL_TO;
  if (!secret || !to) {
    return noStore({ error: 'Not found' }, 404);
  }
  if (request.method !== 'POST') {
    return noStore({ error: 'Method not allowed' }, 405);
  }
  if (!(await secretMatches(request.headers.get('cf-webhook-auth'), secret))) {
    return noStore({ error: 'Unauthorized' }, 401);
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return noStore({ error: 'Payload too large' }, 413);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = { text: body };
  }
  const email = alertEmail(payload);
  await env.ALERT_EMAIL.send({ from: { name: 'dune.zone alerts', email: ALERT_SENDER }, to, ...email });
  return noStore({ ok: true }, 200);
}
