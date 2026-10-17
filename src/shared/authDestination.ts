/** Sign-in destinations stay within the app, never another origin. */
export function safeAuthDestination(next: string): string {
  const site = new URL('https://dune.zone');
  try {
    const destination = new URL(next, site);
    if (destination.origin !== site.origin) {
      return '/';
    }
    if (destination.username) {
      return '/';
    }
    if (destination.password) {
      return '/';
    }
    if (destination.pathname.startsWith('//')) {
      return '/';
    }
    return destination.pathname + destination.search + destination.hash;
  } catch {
    /* Malformed destinations return to the home page. */
  }
  return '/';
}

/** The page a reader signs in from, as the sign-in page's `redirect` search; nothing for the home page or the sign-in pages themselves. */
export interface SignInReturn {
  redirect?: string;
}

/**
 * Where a link to the sign-in page should send the reader back to, from the page they are on.
 * The home page needs no return, since it is where sign-in lands anyway, and returning to a sign-in page would only loop.
 */
export function signInReturnFrom(href: unknown): SignInReturn {
  if (typeof href !== 'string') {
    return {};
  }
  const destination = safeAuthDestination(href);
  if (needsNoReturn(new URL(destination, 'https://dune.zone').pathname)) {
    return {};
  }
  return { redirect: destination };
}

const NO_RETURN_PATHS = new Set(['/', '/auth']);

function needsNoReturn(pathname: string): boolean {
  return NO_RETURN_PATHS.has(pathname) || pathname.startsWith('/auth/');
}
