function isLoopback(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Whether this backend is an isolated loopback test backend: test mode and local Password sign-in are on, and both its own URL and its site are on a loopback host.
 * A cloud deployment's own URL is never on a loopback host, so this is false on every hosted deployment whatever its settings.
 * The hosted load backend's copy replaces `playSynthetic.ts`, which delegates here, but never this module, so code that calls this directly stays loopback-only there too.
 */
export function isIsolatedLoopbackBackend() {
  const enabled = process.env.IS_TEST === 'true' && process.env.E2E_LOCAL_AUTH === 'true';
  return enabled && isLoopback(process.env.CONVEX_CLOUD_URL) && isLoopback(process.env.SITE_URL);
}
