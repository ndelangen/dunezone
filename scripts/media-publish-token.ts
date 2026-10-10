/** Waits for a rotated bearer to reach the live Worker before any media write. */
export async function waitForMediaPublishToken(
  { origin, token, release }: { origin: string; token: string; release: string },
  { timeoutMs = 60_000, intervalMs = 1000 } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let observation = 'No response';
  while (Date.now() < deadline) {
    let response: Response | undefined;
    try {
      response = await fetch(`${origin}/__media/releases/${release}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        /* Authentication runs before JSON validation; this body cannot create a ledger object. */
        body: '{',
        signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now()))),
      });
      if (response.status === 400) {
        const body = (await response.json()) as { error?: string };
        if (body.error === 'The record is not valid JSON') {
          console.log('The installed media publish token is ready.');
          return;
        }
      }
      observation = `HTTP ${response.status}`;
    } catch {
      observation = 'Request did not complete';
    } finally {
      await response?.body?.cancel().catch(() => {});
    }
    if (response && response.status !== 401 && response.status !== 429 && response.status < 500) {
      throw new Error(`Media publish token readiness refused: ${observation}`);
    }
    console.error(`Media publish token is not ready: ${observation}; waiting for the installed bearer.`);
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
    }
  }
  throw new Error(`Media publish token did not become ready within ${timeoutMs / 1000}s; last: ${observation}`);
}
