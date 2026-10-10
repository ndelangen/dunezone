/** The legacy callback accepts destinations within the app, never another origin. */
export function safeAuthDestination(next: string): string {
  const site = new URL('https://dune.zone');
  try {
    const destination = new URL(next, site);
    if (destination.origin === site.origin && !destination.username && !destination.password) {
      return destination.pathname + destination.search + destination.hash;
    }
  } catch {
    /* Malformed destinations return to the home page. */
  }
  return '/';
}
