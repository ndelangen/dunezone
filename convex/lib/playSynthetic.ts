function isLoopback(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function requireSyntheticBackend() {
  const enabled = process.env.IS_TEST === 'true' && process.env.E2E_LOCAL_AUTH === 'true';
  const loopback = isLoopback(process.env.CONVEX_CLOUD_URL) && isLoopback(process.env.SITE_URL);
  if (!enabled || !loopback) {
    throw new Error('Play test controls require an isolated loopback backend');
  }
}
