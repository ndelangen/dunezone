import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api';

/**
 * Checks the real read-only module before a regular browser flow warms it.
 * Unique arguments prevent a cached result from replacing execution.
 * Only this launcher's disposable backend is paused, for 46 ms of each 50 ms cycle.
 * The native UDF deadline stays unchanged;
 * the separate wall deadline also covers HTTP scheduling.
 */
export async function verifyColdNameRead(
  url: string,
  backendPid: number | undefined,
  availability = api.playGameNameAvailability.nameAvailability
) {
  assert.equal(new URL(url).hostname, '127.0.0.1');
  assert.ok(backendPid !== undefined && Number.isSafeInteger(backendPid) && backendPid > 0);
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
      timer = setTimeout(hold, 4);
    }, 46);
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
    const result = await client.query(availability, { name: `Cold read ${randomUUID()}` });
    assert.equal(result, null, 'An unsigned availability read must remain refused.');
    assert.ok(holds > 0);
    return { elapsedMs: Math.round(performance.now() - startedAt), holds, activeMs: 4, periodMs: 50 };
  } finally {
    clearTimeout(timer);
    signalBackend('SIGCONT');
  }
}
