/*
 * The time a prediction is locked at, from the server that serves this page and never from the phone's clock (Norbert, 2026-11-09).
 * Every response carries a Date header that the server sets, so a fresh request for the page itself is enough: no backend function.
 * The header counts whole seconds, which is all the lock time shows.
 */

/** The server's time from a response's Date header, in milliseconds since 1970. */
export function timeFromResponse(response: Pick<Response, 'ok' | 'headers'>): number {
  const date = response.headers.get('date');
  const time = date ? Date.parse(date) : Number.NaN;
  if (!response.ok || Number.isNaN(time)) {
    throw new Error('The server did not say the time');
  }
  return time;
}

/** Asks the server for the time now: a HEAD request for this page, past every cache, so the Date header is the server's present. */
export async function readServerTime(): Promise<number> {
  const response = await fetch(globalThis.location.pathname, { method: 'HEAD', cache: 'no-store' });
  return timeFromResponse(response);
}
