import { fetchMedia } from './lib/media-fetch';

type InstalledToken = { origin: string; token: string; release: string };

/** Probes authentication with a body that validation rejects before any ledger write. */
async function probeInstalledToken(url: string, token: string, timeoutMs: number) {
  let response: Response | undefined;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{',
      signal: AbortSignal.timeout(Math.max(1, Math.min(5000, timeoutMs))),
    });
    const body =
      response.status === 400
        ? ((await response.json().catch(() => undefined)) as { error?: string } | undefined)
        : undefined;
    return {
      ready: body?.error === 'The record is not valid JSON',
      retryable: [401, 429].includes(response.status) || response.status >= 500,
      description: `HTTP ${response.status}`,
    };
  } catch {
    return { ready: false, retryable: true, description: 'Request did not complete' };
  } finally {
    await response?.body?.cancel().catch(() => {});
  }
}

/** Waits for a rotated bearer to reach the live Worker before any media write. */
export async function waitForMediaPublishToken(
  { origin, token, release }: InstalledToken,
  { timeoutMs = 60_000, intervalMs = 1000 } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = `${origin}/__media/releases/${release}`;
  let lastObservation = 'No response';
  while (Date.now() < deadline) {
    const observation = await probeInstalledToken(url, token, deadline - Date.now());
    lastObservation = observation.description;
    if (observation.ready) {
      console.log('The installed media publish token is ready.');
      return;
    }
    if (!observation.retryable) {
      throw new Error(`Media publish token readiness refused: ${lastObservation}`);
    }
    console.error(`Media publish token is not ready: ${lastObservation}; waiting for the installed bearer.`);
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
    }
  }
  throw new Error(`Media publish token did not become ready within ${timeoutMs / 1000}s; last: ${lastObservation}`);
}

/** Rechecks a fresh rotation when a later write reaches an instance still using the previous bearer. */
export async function fetchMediaAfterTokenRotation(
  installed: InstalledToken & { deadline: number },
  ...request: Parameters<typeof fetchMedia>
): Promise<Awaited<ReturnType<typeof fetchMedia>>> {
  for (;;) {
    const response = await fetchMedia(...request);
    const remaining = installed.deadline - Date.now();
    if (response.status !== 401 || remaining <= 0) {
      return response;
    }
    await waitForMediaPublishToken(installed, { timeoutMs: remaining });
  }
}
