const authPath = /^\/auth\/(signin|callback)\/(google|discord)$/;

function authError(status: number, message: string): Response {
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
  );
}

/** The Worker owns the public address; Convex Auth owns the OAuth exchange and its cookies. */
export async function handleAuthRequest(
  request: Request,
  env: Pick<Env, 'PUBLIC_BASE_URL' | 'CONVEX_AUTH_BASE_URL'>
): Promise<Response | null> {
  const url = new URL(request.url);
  const reserved = /^\/auth\/(signin|callback)(?:\/|$)/.test(url.pathname);
  if (!reserved) {
    return null;
  }
  const match = authPath.exec(url.pathname);
  if (url.origin !== env.PUBLIC_BASE_URL || !match) {
    return authError(404, 'Not found');
  }
  const [, operation, provider] = match;
  if (request.method !== 'GET' && !(operation === 'callback' && request.method === 'POST')) {
    const response = authError(405, 'Method not allowed');
    response.headers.set('Allow', operation === 'callback' ? 'GET, POST' : 'GET');
    return response;
  }

  const upstreamUrl = new URL(env.CONVEX_AUTH_BASE_URL);
  upstreamUrl.pathname = `/api/auth/${operation}/${provider}`;
  upstreamUrl.search = url.search;
  const headers = new Headers();
  const contentType = request.headers.get('Content-Type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }
  const allowedCookies = new Set([
    `__Host-${provider}OAuthstate`,
    `__Host-${provider}OAuthpkce`,
    `__Host-${provider}OAuthnonce`,
    `__Host-${provider}RedirectTo`,
  ]);
  const cookies = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((cookie) => cookie.trim())
    .filter((cookie) => allowedCookies.has(cookie.slice(0, cookie.indexOf('='))));
  if (cookies.length) {
    headers.set('Cookie', cookies.join('; '));
  }
  const upstreamRequest = new Request(new Request(upstreamUrl, request), {
    headers,
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  try {
    const upstream = await fetch(upstreamRequest);
    const response = new Response(upstream.body, upstream);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    return authError(502, 'Sign-in is temporarily unavailable. Please try again.');
  }
}
