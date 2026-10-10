import { createFileRoute, redirect } from '@tanstack/react-router';

import { safeAuthDestination } from './oauthDestination';

export const Route = createFileRoute('/auth/oauth')({
  preload: false,
  validateSearch: (search: Record<string, unknown>) => ({ next: typeof search.next === 'string' ? search.next : '/' }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => {
    throw redirect({ href: safeAuthDestination(deps.next) });
  },
});
