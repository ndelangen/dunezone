/** Browser resources used by the application. Keep the origin inventory in docs/content-security-policy.md. */
export function applicationContentSecurityPolicy(
  convexUrl: string,
  scripts: readonly string[],
  documentUrl = 'https://dune.zone'
): string {
  const backend = new URL(convexUrl);
  if (!['https:', 'http:'].includes(backend.protocol)) {
    throw new Error('CSP requires an HTTP Convex origin');
  }
  if (backend.username || backend.password) {
    throw new Error('CSP Convex origins cannot contain credentials');
  }
  const socket = new URL(backend.origin);
  socket.protocol = backend.protocol === 'https:' ? 'wss:' : 'ws:';
  const applicationSocket = new URL(documentUrl);
  applicationSocket.protocol = applicationSocket.protocol === 'https:' ? 'wss:' : 'ws:';
  return [
    "default-src 'self'",
    `script-src 'self' https://static.cloudflareinsights.com ${scripts.join(' ')}`.trim(),
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${backend.origin} ${socket.origin} ${applicationSocket.origin} https://cloudflareinsights.com`,
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "frame-src 'self' https://www.youtube-nocookie.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
}

/** Only the edge cache sees the render nonce. Every delivery substitutes a fresh nonce before streaming. */
export const CACHED_NONCE_HEADER = 'X-Application-Render-Nonce';

export function secureApplicationResponse(response: Response, convexUrl: string, documentUrl: string): Response {
  const renderedNonce = response.headers.get(CACHED_NONCE_HEADER);
  if (!renderedNonce) {
    throw new Error('Application response is missing its render nonce');
  }
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const headers = new Headers(response.headers);
  headers.delete(CACHED_NONCE_HEADER);
  headers.delete('Content-Length');
  headers.set(
    'Content-Security-Policy',
    applicationContentSecurityPolicy(convexUrl, [`'nonce-${nonce}'`], documentUrl)
  );
  const secured = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  if (!response.body || !response.headers.get('Content-Type')?.includes('text/html')) {
    return secured;
  }
  return new HTMLRewriter()
    .on('script[nonce], style[nonce]', {
      element(element) {
        if (element.getAttribute('nonce') === renderedNonce) {
          element.setAttribute('nonce', nonce);
        }
      },
    })
    .on('meta[property="csp-nonce"]', {
      element(element) {
        if (element.getAttribute('content') === renderedNonce) {
          element.setAttribute('content', nonce);
        }
      },
    })
    .transform(secured);
}
