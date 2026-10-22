import assert from 'node:assert/strict';

import { ConvexHttpClient } from 'convex/browser';

/** Pauses only the launcher's disposable backend while an uncached read exercises native initialization. */
export async function verifyColdPlayRead({
  url,
  backendPid,
  activeMs,
  pauseMs,
  read,
}: {
  url: string;
  backendPid: number | undefined;
  activeMs: number;
  pauseMs: number;
  read: (client: ConvexHttpClient) => Promise<void>;
}) {
  const periodMs = activeMs + pauseMs;
  assert.equal(new URL(url).hostname, '127.0.0.1');
  assert.ok(backendPid !== undefined && Number.isSafeInteger(backendPid) && backendPid > 0);
  assert.ok(Number.isSafeInteger(activeMs) && activeMs > 0);
  assert.ok(Number.isSafeInteger(pauseMs) && pauseMs > 0);
  const cancellation = new AbortController();
  const requestSignal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(30_000)]);
  const signalBackend = (signal: NodeJS.Signals) => {
    try {
      process.kill(backendPid, signal);
      return true;
    } catch (error) {
      cancellation.abort(error);
      return false;
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let holds = 0;
  const hold = () => {
    if (!signalBackend('SIGSTOP')) {
      return;
    }
    holds += 1;
    timer = setTimeout(() => {
      if (!signalBackend('SIGCONT')) {
        return;
      }
      timer = setTimeout(hold, activeMs);
    }, pauseMs);
  };
  const client = new ConvexHttpClient(url, {
    fetch: Object.assign(
      (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) =>
        fetch(input, { ...init, signal: requestSignal }),
      { preconnect: fetch.preconnect }
    ),
  });
  const startedAt = performance.now();
  try {
    hold();
    await read(client);
    assert.ok(holds > 0);
    return { elapsedMs: Math.round(performance.now() - startedAt), holds, activeMs, periodMs };
  } finally {
    clearTimeout(timer);
    signalBackend('SIGCONT');
  }
}
