import { safeAuthDestination } from '@shared/authDestination';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/oauth')({
  preload: false,
  validateSearch: (search: Record<string, unknown>) => ({ next: typeof search.next === 'string' ? search.next : '/' }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => {
    throw redirect({ href: safeAuthDestination(deps.next) });
  },
});
