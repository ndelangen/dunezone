import { PLAY_REQUEST_TIMEOUT_MS } from '../../src/shared/play/admission';

function isOriginOnly(url: URL) {
  const extra = [url.username, url.password, url.search, url.hash];
  return url.pathname === '/' && extra.every((value) => value === '');
}

function allowsServiceTransport(url: URL) {
  if (url.protocol === 'https:') {
    return true;
  }
  return process.env.IS_TEST === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/** The callback host comes from deployment configuration, never from a request or game record. */
function playServiceOrigin(): string {
  const service = new URL(process.env.PLAY_SERVICE_URL ?? '');
  const site = new URL(process.env.SITE_URL ?? '');
  const validOrigin = service.origin === site.origin && isOriginOnly(service);
  if (!validOrigin || !allowsServiceTransport(service)) {
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
