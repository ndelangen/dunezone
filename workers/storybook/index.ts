/**
 * The public Storybook's one piece of code: it answers raster URLs from the application Worker instead of from copies (#1888).
 *
 * `storybook-static` would otherwise carry `public/m`, `public/image` and `public/web`, about 260 MB and 4,400 files the build copies from `public/`.
 * `.storybook/static/.assetsignore` leaves them out of the upload, and `run_worker_first` sends only those prefixes here.
 * Each GET or HEAD is fetched from https://dune.zone, which answers them from R2 at the same paths, so stories keep loading images from their own origin and the CSP stays `img-src 'self'`.
 * A fetch from one Custom Domain Worker to another on the same zone invokes that Worker without a service binding.
 * A connection that drops is retried once, including a raster body interrupted after its headers arrive.
 * An interrupted raster resumes only from an unencoded response with the same media digest, so bytes from different releases cannot be joined.
 * The tutorial's `/published/` art is forwarded the same way, so its chapters show the site's live cards and tokens;
 * board faces and the story database's round tokens there are not.
 * Every other path never reaches this code, and anything that does is handed back to the static assets.
 */
const MEDIA_ORIGIN = 'https://dune.zone';
/* `/published/` is the tutorial's live art (`src/app/routes/_app/tutorial/setup`); board faces there stay the build's own fixture. */
const MEDIA_PREFIXES = ['/m/', '/image/', '/web/', '/published/'];
const OWN_BOARD_FACES = '/published/boards/';
/* Round tokens the story database seeds, whose ids no production asset has; the build answers them with its Karama fixture. */
const OWN_ROUND_TOKENS = '/published/round-tokens/00000000000000000000';

type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> } };

async function fetchMedia(target: string, method: string): Promise<Response> {
  let attempts = 0;
  const fetchNextResponse = async () => {
    attempts += 1;
    try {
      return await fetch(target, { method });
    } catch (error) {
      console.warn({
        event: 'storybook-media-fetch-error',
        path: new URL(target).pathname,
        method,
        attempt: attempts,
        maxAttempts: 2,
        willRetry: attempts < 2,
      });
      throw error;
    }
  };
  let response: Response;
  try {
    response = await fetchNextResponse();
  } catch {
    response = await fetchNextResponse();
  }
  const digest = response.headers.get('X-Media-SHA256');
  if (method === 'HEAD' || !response.ok || !response.body || !digest || response.headers.has('Content-Encoding')) {
    return response;
  }

  let reader = response.body.getReader();
  let bytesSent = 0;
  let bytesToSkip = 0;
  let cancelled = false;
  async function readRemainingChunk(): Promise<ReadableStreamReadResult<Uint8Array>> {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error) {
        if (cancelled || attempts >= 2) {
          throw error;
        }
        await resumeTransfer();
        continue;
      }
      if (result.done || cancelled) {
        return result;
      }
      const chunk = result.value.subarray(Math.min(bytesToSkip, result.value.byteLength));
      bytesToSkip = Math.max(0, bytesToSkip - result.value.byteLength);
      if (chunk.byteLength > 0) {
        return { done: false, value: chunk };
      }
    }
  }
  async function resumeTransfer() {
    console.warn({
      event: 'storybook-media-transfer-retry',
      attempt: 2,
      maxAttempts: 2,
      bytesSent,
      path: new URL(target).pathname,
    });
    const replacement = await fetchNextResponse();
    if (cancelled) {
      await replacement.body?.cancel();
      return;
    }
    if (
      replacement.status !== response.status ||
      replacement.headers.get('X-Media-SHA256') !== digest ||
      replacement.headers.get('Content-Type') !== response.headers.get('Content-Type') ||
      replacement.headers.has('Content-Encoding') ||
      !replacement.body
    ) {
      await replacement.body?.cancel().catch(() => undefined);
      throw new Error('Storybook raster changed during transfer');
    }
    reader.releaseLock();
    reader = replacement.body.getReader();
    bytesToSkip = bytesSent;
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await readRemainingChunk();
        if (cancelled) {
          return;
        }
        if (done) {
          if (bytesToSkip > 0) {
            throw new Error('Storybook raster ended before the resumed byte offset');
          }
          controller.close();
          return;
        }
        bytesSent += value.byteLength;
        controller.enqueue(value);
      } catch (error) {
        if (!cancelled) {
          controller.error(error);
        }
      }
    },
    async cancel(reason) {
      cancelled = true;
      await reader.cancel(reason).catch(() => undefined);
    },
  });
  return new Response(body, response);
}

export function isMediaPath(pathname: string): boolean {
  return (
    MEDIA_PREFIXES.some((prefix) => pathname.startsWith(prefix)) &&
    !pathname.startsWith(OWN_BOARD_FACES) &&
    !pathname.startsWith(OWN_ROUND_TOKENS)
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!isMediaPath(url.pathname)) {
      return await env.ASSETS.fetch(request);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    /* Only the path and query cross over: Storybook sends no credentials, and the application Worker needs none. */
    const target = `${MEDIA_ORIGIN}${url.pathname}${url.search}`;
    return await fetchMedia(target, request.method);
  },
};
