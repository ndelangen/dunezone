import { describe, expect, test, vi } from 'vitest';

import type { AlertEnv, AlertMarkers } from './alerts';
import {
  ALERT_EMAIL_TEXT,
  ALERT_INTERVAL_SECONDS,
  ALERT_MARKER,
  ALERT_WEBHOOK_PATH,
  handleAlertWebhook,
} from './alerts';

const TO = 'alerts-inbox@example.com';
const INTERVAL_MS = ALERT_INTERVAL_SECONDS * 1000;
/* The isolate guard is module state, so each test starts well past the previous test's window. */
let clock = 0;
function laterWindow() {
  clock += INTERVAL_MS * 10;
  return clock;
}

function relay(overrides: Partial<AlertEnv> = {}) {
  const send = vi.fn(async () => ({ messageId: 'sent' }));
  const stored = new Map<string, Response>();
  const markers: AlertMarkers = {
    match: vi.fn(async (key: RequestInfo | URL) => stored.get(String(key))),
    put: vi.fn(async (key: RequestInfo | URL, value: Response) => {
      stored.set(String(key), value);
    }),
  } as unknown as AlertMarkers;
  const env: AlertEnv = { ALERT_EMAIL: { send } as unknown as SendEmail, ALERT_EMAIL_TO: TO, ...overrides };
  return { env, send, markers, stored };
}

const webhook = (body = '{"name":"New issue"}') =>
  new Request(`https://dune.zone${ALERT_WEBHOOK_PATH}`, { method: 'POST', body });

describe('alert webhook relay', () => {
  test('leaves other paths and the unconfigured route to the game router', async () => {
    const { env, markers } = relay();
    expect(await handleAlertWebhook(webhook(), '/__play/health', env, { markers, now: laterWindow() })).toBeNull();
    const unconfigured = relay({ ALERT_EMAIL_TO: undefined });
    expect(
      await handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, unconfigured.env, {
        markers: unconfigured.markers,
        now: laterWindow(),
      })
    ).toBeNull();
    expect(unconfigured.send).not.toHaveBeenCalled();
  });

  test('refuses anything but POST', async () => {
    const { env, send, markers } = relay();
    const response = await handleAlertWebhook(
      new Request(`https://dune.zone${ALERT_WEBHOOK_PATH}`),
      ALERT_WEBHOOK_PATH,
      env,
      { markers, now: laterWindow() }
    );
    expect(response?.status).toBe(405);
    expect(response?.headers.get('Allow')).toBe('POST');
    expect(send).not.toHaveBeenCalled();
  });

  test('emails a fixed nudge that carries nothing from the request', async () => {
    const { env, send, markers } = relay();
    const response = await handleAlertWebhook(
      webhook('{"name":"<a href=https://phish.example>click</a>"}'),
      ALERT_WEBHOOK_PATH,
      env,
      { markers, now: laterWindow() }
    );
    expect(response?.status).toBe(202);
    expect(send).toHaveBeenCalledWith({
      from: { name: 'dune.zone alerts', email: 'alerting@dune.zone' },
      to: TO,
      subject: '[dune.zone] Worker issue reported',
      text: ALERT_EMAIL_TEXT,
    });
    expect(ALERT_EMAIL_TEXT).not.toContain('phish');
  });

  test('sends at most one email per interval in an isolate', async () => {
    const { env, send, markers, stored } = relay();
    const start = laterWindow();
    await handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, env, { markers, now: start });
    stored.clear();
    const repeat = await handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, env, {
      markers,
      now: start + INTERVAL_MS - 1,
    });
    expect(repeat?.status).toBe(202);
    expect(send).toHaveBeenCalledTimes(1);
    await handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, env, { markers, now: start + INTERVAL_MS });
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('honours a marker another isolate left in the cache', async () => {
    const { env, send, markers } = relay();
    await markers.put(ALERT_MARKER, new Response(null));
    const response = await handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, env, { markers, now: laterWindow() });
    expect(response?.status).toBe(202);
    expect(send).not.toHaveBeenCalled();
  });

  test('logs a failed send as a warning without the address and still answers 202', async () => {
    const { env, markers } = relay({
      ALERT_EMAIL: { send: vi.fn(async () => Promise.reject(new TypeError('unverified'))) } as unknown as SendEmail,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, env, { markers, now: laterWindow() });
    expect(response?.status).toBe(202);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ event: 'alert-email-failed', error: 'TypeError' }));
    warn.mockRestore();
  });

  test('sends once when two requests arrive together', async () => {
    const { env, send, markers } = relay();
    const now = laterWindow();
    await Promise.all([
      handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, env, { markers, now }),
      handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, env, { markers, now }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('keeps the isolate guard when the cache throws', async () => {
    const { env, send } = relay();
    const broken = {
      match: vi.fn(async () => Promise.reject(new Error('no cache'))),
      put: vi.fn(),
    } as unknown as AlertMarkers;
    const now = laterWindow();
    await handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, env, { markers: broken, now });
    await handleAlertWebhook(webhook(), ALERT_WEBHOOK_PATH, env, { markers: broken, now: now + 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
