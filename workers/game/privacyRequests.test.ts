import { describe, expect, test, vi } from 'vitest';

import { forwardPrivacyRequest } from './privacyRequests';

const destination = 'private-inbox@example.com';
const message = (to = 'requests@dune.zone') => ({
  to,
  forward: vi.fn(async () => ({ messageId: 'forwarded' })),
  setReject: vi.fn(),
});

describe('privacy request forwarding', () => {
  test('uses the existing secret destination for the privacy address', async () => {
    const email = message('Requests@dune.zone');
    await forwardPrivacyRequest(email, { ALERT_EMAIL_TO: destination });
    expect(email.forward).toHaveBeenCalledExactlyOnceWith(destination);
    expect(email.setReject).not.toHaveBeenCalled();
  });

  test('rejects other recipients and a missing destination without forwarding', async () => {
    for (const [to, env] of [
      ['other@dune.zone', { ALERT_EMAIL_TO: destination }],
      ['requests@dune.zone', {}],
    ] as const) {
      const email = message(to);
      await forwardPrivacyRequest(email, env);
      expect(email.setReject).toHaveBeenCalledOnce();
      expect(email.forward).not.toHaveBeenCalled();
    }
  });

  test('propagates forwarding failures instead of acknowledging a lost request', async () => {
    const email = message();
    email.forward.mockRejectedValue(new Error('Forwarding failed'));
    await expect(forwardPrivacyRequest(email, { ALERT_EMAIL_TO: destination })).rejects.toThrow('Forwarding failed');
  });
});
