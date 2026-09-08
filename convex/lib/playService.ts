import { PLAY_REQUEST_TIMEOUT_MS } from '../../src/shared/play/admission';

/** The callback host comes from deployment configuration, never from a request or game record. */
function playServiceOrigin(): string {
  const service = new URL(process.env.PLAY_SERVICE_URL ?? '');
  const site = new URL(process.env.SITE_URL ?? '');
  const local = process.env.IS_TEST === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(service.hostname);
  if (
    service.origin !== site.origin ||
    (service.protocol !== 'https:' && !local) ||
    service.username ||
    service.password ||
    service.pathname !== '/' ||
    service.search ||
    service.hash
  ) {
    throw new Error('Play service is not configured for this site');
  }
  return service.origin;
}

export async function postPlayService(gameId: string, operation: 'provision' | 'account-deletion', body: unknown) {
  const response = await fetch(`${playServiceOrigin()}/__play/games/${encodeURIComponent(gameId)}/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(PLAY_REQUEST_TIMEOUT_MS),
  });
  await response.body?.cancel();
  return response.ok;
}
