import type { AlertEnv } from './alerts';

/** Forwards privacy requests to the existing alert inbox without reading or logging their contents. */
export async function forwardPrivacyRequest(
  message: Pick<ForwardableEmailMessage, 'to' | 'forward' | 'setReject'>,
  env: Pick<AlertEnv, 'ALERT_EMAIL_TO'>
): Promise<void> {
  if (message.to.toLowerCase() !== 'requests@dune.zone') {
    message.setReject('Unknown recipient.');
    return;
  }
  if (!env.ALERT_EMAIL_TO) {
    message.setReject('Privacy request forwarding is unavailable.');
    return;
  }
  await message.forward(env.ALERT_EMAIL_TO);
}
