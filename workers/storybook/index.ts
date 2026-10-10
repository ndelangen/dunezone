/**
 * The public Storybook's one piece of code: it answers raster URLs from the application Worker instead of from copies (#1888).
 *
 * `storybook-static` would otherwise carry `public/m`, `public/image` and `public/web`, about 260 MB and 4,400 files the build copies from `public/`.
 * `.storybook/static/.assetsignore` leaves them out of the upload, and `run_worker_first` sends only those prefixes here.
 * Each GET or HEAD is fetched from https://dune.zone, which answers them from R2 at the same paths, so stories keep loading images from their own origin and the CSP stays `img-src 'self'`.
 * A fetch from one Custom Domain Worker to another on the same zone invokes that Worker without a service binding.
 * Every other path never reaches this code, and anything that does is handed back to the static assets.
 */
const MEDIA_ORIGIN = 'https://dune.zone';
const MEDIA_PREFIXES = ['/m/', '/image/', '/web/'];

type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> } };

export function isMediaPath(pathname: string): boolean {
  return MEDIA_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
    return await fetch(`${MEDIA_ORIGIN}${url.pathname}${url.search}`, { method: request.method });
  },
};
