import { describe, expect, test, vi } from 'vitest';

import type { AlertEnv } from './alerts';
import { ALERT_WEBHOOK_PATH, alertEmail, handleAlertWebhook } from './alerts';

const SECRET = 'webhook-secret-not-shared';
const TO = 'alerts-inbox@example.com';

function alertEnv(overrides: Partial<AlertEnv> = {}) {
  const send = vi.fn(async () => ({ messageId: 'sent' }));
  const env: AlertEnv = {
    ALERT_EMAIL: { send } as unknown as SendEmail,
    ALERT_WEBHOOK_SECRET: SECRET,
    ALERT_EMAIL_TO: TO,
    ...overrides,
  };
  return { env, send };
}

function webhook(body: string, headers: Record<string, string> = { 'cf-webhook-auth': SECRET }) {
  return new Request(`https://dune.zone${ALERT_WEBHOOK_PATH}`, { method: 'POST', headers, body });
}

describe('alert webhook relay', () => {
  test('ignores other paths', async () => {
    const { env } = alertEnv();
    expect(
      await handleAlertWebhook(new Request('https://dune.zone/__alerts/other', { method: 'POST' }), env)
    ).toBeNull();
  });

  test('answers not found until both secrets are set', async () => {
    for (const overrides of [{ ALERT_WEBHOOK_SECRET: undefined }, { ALERT_EMAIL_TO: undefined }]) {
      const { env, send } = alertEnv(overrides);
      const response = await handleAlertWebhook(webhook('{}'), env);
      expect(response?.status).toBe(404);
      expect(send).not.toHaveBeenCalled();
    }
  });

  test('refuses a missing or wrong secret without sending', async () => {
    for (const headers of [{}, { 'cf-webhook-auth': 'wrong' }] as Record<string, string>[]) {
      const { env, send } = alertEnv();
      const response = await handleAlertWebhook(webhook('{}', headers), env);
      expect(response?.status).toBe(401);
      expect(send).not.toHaveBeenCalled();
    }
  });

  test('refuses anything but POST', async () => {
    const { env, send } = alertEnv();
    const request = new Request(`https://dune.zone${ALERT_WEBHOOK_PATH}`, { headers: { 'cf-webhook-auth': SECRET } });
    const response = await handleAlertWebhook(request, env);
    expect(response?.status).toBe(405);
    expect(send).not.toHaveBeenCalled();
  });

  test('emails the issue to the verified inbox from the alerting address', async () => {
    const { env, send } = alertEnv();
    const payload = { name: 'New issue in dunezone-game', text: 'TypeError in command', data: { count: 12 } };
    const response = await handleAlertWebhook(webhook(JSON.stringify(payload)), env);
    expect(response?.status).toBe(200);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'dune.zone alerts', email: 'alerting@dune.zone' },
        to: TO,
        subject: '[dune.zone] New issue in dunezone-game',
      })
    );
    const [{ text }] = send.mock.calls[0] as unknown as [{ text: string }];
    expect(text).toContain('TypeError in command');
    expect(text).toContain('"count": 12');
  });

  test('still sends a body that is not JSON', async () => {
    const { env, send } = alertEnv();
    const response = await handleAlertWebhook(webhook('plain words'), env);
    expect(response?.status).toBe(200);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: '[dune.zone] Workers issue' }));
  });

  test('refuses an oversized payload', async () => {
    const { env, send } = alertEnv();
    const response = await handleAlertWebhook(webhook('x'.repeat(65_537)), env);
    expect(response?.status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('alertEmail', () => {
  test('keeps the subject to one bounded line', () => {
    const { subject } = alertEmail({ name: `line one\nline two ${'x'.repeat(300)}` });
    expect(subject.startsWith('[dune.zone] line one line two')).toBe(true);
    expect(subject.length).toBeLessThanOrEqual(120);
  });
});
